import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  additionalCountriesText,
  countryCount,
  countryLocative,
  deriveFunnelPresentation,
  FUNNEL_STATES,
  summarizeCalculation,
  teaserPresentation,
  usesSingularVerb,
} from '../matcher/funnel.js';
import { sortCountriesForDisplay } from '../matcher/profile.js';
import { selectWorstSuitableCountry } from '../matcher/free-country-selection.js';
import { countryOptions, parseCountryCode } from '../matcher/countries.js';

import {
  ACCESS_STATES,
  accessPresentationState,
  resolveAccessState,
} from '../matcher/access-gate.js';

import {
  MANUAL_ACCESS_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
} from '../payment-config.js';

const PUBLIC_LOCATION = {
  protocol: 'https:',
  hostname: 'sankhipkate.github.io',
  port: '',
};

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function syntheticCalculation() {
  return {
    results: [
      {
        country: { name: 'Country A' },
        bestRoute: { routeStatus: 'SUITABLE', routeName: 'Route Alpha' },
        routes: [
          { routeStatus: 'SUITABLE', routeName: 'Route Alpha' },
          { routeStatus: 'SUITABLE_WITH_CONDITIONS', routeName: 'Route Beta' },
          { routeStatus: 'UNSUITABLE', routeName: 'Route Gamma' },
        ],
      },
      {
        country: { name: 'Country B' },
        bestRoute: { routeStatus: 'SUITABLE_WITH_CONDITIONS', routeName: 'Route Delta' },
        routes: [
          { routeStatus: 'SUITABLE_WITH_CONDITIONS', routeName: 'Route Delta' },
          { routeStatus: 'UNSUITABLE', routeName: 'Route Epsilon' },
        ],
      },
      {
        country: { name: 'Country C' },
        bestRoute: { routeStatus: 'UNSUITABLE', routeName: 'Route Zeta' },
        routes: [
          { routeStatus: 'UNSUITABLE', routeName: 'Route Zeta' },
        ],
      },
    ],
  };
}

function noEvaluableCountry(name = 'Country without routes') {
  return {
    country: { name, group: null },
    evaluationState: 'NO_EVALUABLE_ROUTES',
    bestRoute: null,
    routes: [],
  };
}

test('aggregate teaser counts every evaluated route while retaining matched country count', () => {
  assert.deepEqual(summarizeCalculation(syntheticCalculation()), {
    countries: 2,
    routes: 3,
    suitableRoutes: 1,
    conditionalRoutes: 2,
    separateBasisRoutes: 0,
    unsuitableRoutes: 3,
    totalEvaluatedRoutes: 6,
  });
});

test('country locative uses correct Russian forms', () => {
  assert.deepEqual([1, 2, 5, 21].map(countryLocative), ['1 стране', '2 странах', '5 странах', '21 стране']);
});

test('result summary combines every potential route into the second card and exposes no names', () => {
  const teaser = teaserPresentation(syntheticCalculation());
  assert.equal(teaser.routes, 3);
  assert.equal(teaser.suitableRoutes, 1);
  assert.equal(teaser.conditionalRoutes, 2);
  assert.equal(teaser.totalEvaluatedRoutes, 6);
  assert.equal(teaser.heading, 'Результат расчёта');
  assert.deepEqual(teaser.countryCounts, { suitable: 1, conditional: 2, separateBasis: 0 });
  assert.deepEqual(teaser.breakdown, [
    '1 страна:и 1 маршрут, который уже вам подходит',
    '3 страны:и 2 маршрута, в которых необходимо выполнить условие, либо по основанию, которое, возможно, у вас уже есть',
  ]);
  assert.equal(teaser.routes, teaser.suitableRoutes + teaser.conditionalRoutes);
  const summaryCopy = [teaser.heading, teaser.text, ...teaser.breakdown].join(' ');
  assert.doesNotMatch(summaryCopy, /Мы нашли|Нашли варианты|Исследовано .* стран/);
  for (const leaked of ['Country A', 'Country B', 'Country C', 'Route Alpha', 'Route Beta', 'Route Delta']) {
    assert.equal(summaryCopy.includes(leaked), false, leaked);
  }
});

test('result summary uses route counts from all evaluated routes', () => {
  const calculationWithCount = (count, status = 'SUITABLE') => ({
    results: Array.from({ length: count }, () => ({
      bestRoute: { routeStatus: status },
      routes: [{ routeStatus: status }],
    })),
  });

  assert.match(teaserPresentation(calculationWithCount(1)).breakdown[0], /^1 страна:и 1 маршрут/);
  assert.match(teaserPresentation(calculationWithCount(2)).breakdown[0], /^2 страны:и 2 маршрута/);
  assert.match(teaserPresentation(calculationWithCount(5, 'SUITABLE_WITH_CONDITIONS')).breakdown[1], /^5 стран:и 5 маршрутов, в которых необходимо выполнить условие/);
  assert.deepEqual([1, 2, 5, 11, 21].map(usesSingularVerb), [true, false, false, false, true]);
  assert.deepEqual([1, 2, 5, 11, 21].map(countryCount), ['1 страна', '2 страны', '5 стран', '11 стран', '21 страна']);
  assert.deepEqual([1, 2, 5, 11, 21].map(additionalCountriesText), ['Ещё 1 страна', 'Ещё 2 страны', 'Ещё 5 стран', 'Ещё 11 стран', 'Ещё 21 страна']);
});

test('zero-match teaser stays neutral and never invents a positive result', () => {
  const teaser = teaserPresentation({
    results: [{
      bestRoute: { routeStatus: 'UNSUITABLE' },
      routes: [{ routeStatus: 'UNSUITABLE' }],
    }],
  });
  assert.deepEqual({ countries: teaser.countries, routes: teaser.routes }, { countries: 0, routes: 0 });
  assert.match(teaser.heading, /подходящих или потенциально подходящих вариантов нет/);
  assert.match(teaser.text, /Полный результат покажет причины/);
});

test('free preview selects the first eligible country using generic display sorting and exposes only results', () => {
  const calculation = syntheticCalculation();
  calculation.results = [calculation.results[1], calculation.results[2], calculation.results[0]];
  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);

  assert.equal(presentation.state, FUNNEL_STATES.FREE_COUNTRY);
  assert.deepEqual(Object.keys(presentation.previewCalculation), ['results']);
  assert.equal(presentation.previewCalculation.results.length, 1);
  assert.equal(presentation.previewCalculation.results[0].country.name, 'Country A');
  assert.notEqual(presentation.previewCalculation, calculation);
  assert.equal(presentation.freeCountryMessage, 'Одна страна открыта бесплатно — полный разбор ниже.');
  assert.equal(presentation.lockedCountryCount, 1);
  assert.deepEqual(presentation.lockedCountries.map(({ name }) => name), ['Country B']);
  assert.ok(presentation.lockedCountries.every((country) => (
    !('routes' in country) && !('bestRoute' in country)
  )));
  assert.deepEqual(Object.keys(presentation.lockedCountries[0]).sort(), ['countryId', 'name']);
});

test('free preview selects the suitable country with the worst combined citizenship and income rank', () => {
  const countries = [
    { country: { countryId: 'A' }, bestRoute: { routeStatus: 'SUITABLE' }, years: 2, income: 3000 },
    { country: { countryId: 'B' }, bestRoute: { routeStatus: 'SUITABLE' }, years: 10, income: 2000 },
    { country: { countryId: 'C' }, bestRoute: { routeStatus: 'SUITABLE' }, years: 5, income: 5000 },
    { country: { countryId: 'D' }, bestRoute: { routeStatus: 'SUITABLE_WITH_CONDITIONS' }, years: 20, income: 9000 },
  ];
  const selected = selectWorstSuitableCountry(countries, {
    citizenshipYears: (country) => country.years,
    incomeThreshold: (country) => country.income,
  });
  assert.equal(selected.country.countryId, 'C');
});

test('worst-country selection preserves current order on equal combined rank', () => {
  const countries = [
    { country: { countryId: 'A' }, bestRoute: { routeStatus: 'SUITABLE' }, years: 10, income: 1000 },
    { country: { countryId: 'B' }, bestRoute: { routeStatus: 'SUITABLE' }, years: 2, income: 5000 },
  ];
  const selected = selectWorstSuitableCountry(countries, {
    citizenshipYears: (country) => country.years,
    incomeThreshold: (country) => country.income,
  });
  assert.equal(selected.country.countryId, 'A');
});

test('a single suitable country remains free even when a conditional country precedes it', () => {
  const countries = [
    { country: { countryId: 'A' }, bestRoute: { routeStatus: 'SUITABLE_WITH_CONDITIONS' }, years: 10, income: 5000 },
    { country: { countryId: 'B' }, bestRoute: { routeStatus: 'SUITABLE' }, years: 2, income: 1000 },
  ];
  const selected = selectWorstSuitableCountry(countries, {
    citizenshipYears: (country) => country.years,
    incomeThreshold: (country) => country.income,
  });
  assert.equal(selected.country.countryId, 'B');
});

test('country-scoped FX errors survive the free preview without invalidating healthy country results', () => {
  const calculation = syntheticCalculation();
  calculation.errors = [{ countryId: 'CL', countryName: 'Чили', code: 'FX_RATE_MISSING', currencies: ['CLP'] }];
  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);
  assert.equal(presentation.state, FUNNEL_STATES.FREE_COUNTRY);
  assert.deepEqual(presentation.errors, calculation.errors);
  assert.deepEqual(presentation.previewCalculation.errors, calculation.errors);
  assert.equal(presentation.previewCalculation.results.length, 1);
});

test('an all-FX-failure calculation keeps its country errors in the ERROR state', () => {
  const errors = [{ countryId: 'CL', countryName: 'Чили', code: 'FX_RATE_MISSING', currencies: ['CLP'] }];
  assert.deepEqual(
    deriveFunnelPresentation({ results: [], errors }, sortCountriesForDisplay),
    { state: FUNNEL_STATES.ERROR, errors },
  );
});

test('partial calculation with no eligible healthy country and a country error is ERROR rather than ZERO_MATCH', () => {
  const calculation = syntheticCalculation();
  calculation.results.forEach((result) => {
    result.bestRoute.routeStatus = 'UNSUITABLE';
    result.routes.forEach((route) => { route.routeStatus = 'UNSUITABLE'; });
  });
  calculation.errors = [{ countryId: 'CL', countryName: 'Чили', code: 'FX_RATE_MISSING', currencies: ['CLP'] }];

  assert.deepEqual(
    deriveFunnelPresentation(calculation, sortCountriesForDisplay),
    { state: FUNNEL_STATES.ERROR, errors: calculation.errors },
  );
});

test('only suitable and suitable-with-conditions best routes are eligible for the free country', () => {
  const calculation = syntheticCalculation();
  calculation.results[0].bestRoute.routeStatus = 'UNSUITABLE';
  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);
  assert.equal(presentation.state, FUNNEL_STATES.FREE_COUNTRY);
  assert.equal(presentation.previewCalculation.results[0].country.name, 'Country B');
});

test('a valid NO_EVALUABLE_ROUTES country does not invalidate a mixed matched calculation', () => {
  const calculation = syntheticCalculation();
  calculation.results = [
    calculation.results[0],
    noEvaluableCountry('Country B'),
    calculation.results[2],
  ];

  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);
  assert.equal(presentation.state, FUNNEL_STATES.FREE_COUNTRY);
  assert.deepEqual(
    {
      countries: presentation.teaser.countries,
      routes: presentation.teaser.routes,
      suitableRoutes: presentation.teaser.suitableRoutes,
      conditionalRoutes: presentation.teaser.conditionalRoutes,
    },
    { countries: 1, routes: 2, suitableRoutes: 1, conditionalRoutes: 1 },
  );
  assert.deepEqual(Object.keys(presentation.previewCalculation), ['results']);
  assert.equal(presentation.previewCalculation.results.length, 1);
  assert.equal(presentation.previewCalculation.results[0].country.name, 'Country A');
});

test('all valid NO_EVALUABLE_ROUTES countries produce ZERO_MATCH rather than ERROR', () => {
  const presentation = deriveFunnelPresentation({
    results: [noEvaluableCountry('Country A'), noEvaluableCountry('Country B')],
  }, sortCountriesForDisplay);

  assert.equal(presentation.state, FUNNEL_STATES.ZERO_MATCH);
  assert.deepEqual(
    { countries: presentation.teaser.countries, routes: presentation.teaser.routes },
    { countries: 0, routes: 0 },
  );
  assert.equal('previewCalculation' in presentation, false);
  assert.equal('freeCountryMessage' in presentation, false);
  assert.match(presentation.teaser.heading, /вариантов нет/);
});

test('zero-match state has no preview calculation or unsuitable country teaser', () => {
  const calculation = syntheticCalculation();
  calculation.results.forEach((result) => { result.bestRoute.routeStatus = 'UNSUITABLE'; });
  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);
  assert.equal(presentation.state, FUNNEL_STATES.ZERO_MATCH);
  assert.deepEqual(
    { countries: presentation.teaser.countries, routes: presentation.teaser.routes },
    { countries: 0, routes: 0 },
  );
  assert.equal('previewCalculation' in presentation, false);
  assert.equal('freeCountryMessage' in presentation, false);
  assert.match(presentation.teaser.heading, /вариантов нет/);
  assert.doesNotMatch(presentation.teaser.text, /Одна страна открыта полностью|Остальные найденные страны/);
});

test('missing, malformed, and empty calculations produce ERROR without a teaser or paywall preview', () => {
  for (const calculation of [
    null,
    {},
    { results: [] },
    { results: [{}] },
    { results: [{ country: { name: 'Malformed' }, bestRoute: null, routes: [] }] },
  ]) {
    assert.deepEqual(
      deriveFunnelPresentation(calculation, sortCountriesForDisplay),
      { state: FUNNEL_STATES.ERROR },
    );
  }
});

test('a single active matched country produces a valid one-country preview', () => {
  const calculation = { results: [syntheticCalculation().results[0]] };
  const presentation = deriveFunnelPresentation(calculation, sortCountriesForDisplay);
  assert.equal(presentation.state, FUNNEL_STATES.FREE_COUNTRY);
  assert.equal(presentation.previewCalculation.results.length, 1);
  assert.equal(presentation.lockedCountryCount, 0);
});

test('matched result summary always contains exactly two cards', () => {
  const teaser = teaserPresentation({ results: [{ bestRoute: { routeStatus: 'SUITABLE' }, routes: [{ routeStatus: 'SUITABLE' }] }] });
  assert.equal(teaser.unsuitableRoutes, 0);
  assert.equal(teaser.breakdown.length, 2);
  assert.match(teaser.breakdown[0], /^1 страна:и 1 маршрут/);
  assert.match(teaser.breakdown[1], /^1 страна:и 0 маршрутов, в которых необходимо выполнить условие/);
});

test('route counters use mutually exclusive presentation groups', () => {
  const summary = summarizeCalculation({ results: [{
    bestRoute: { routeStatus: 'SUITABLE' },
    routes: [
      { routeStatus: 'SUITABLE', presentationGroup: 'SUITABLE' },
      { routeStatus: 'SUITABLE_WITH_CONDITIONS', presentationGroup: 'REQUIRES_SEPARATE_BASIS' },
      { routeStatus: 'SUITABLE_WITH_CONDITIONS', presentationGroup: 'INTERNATIONAL_PROTECTION' },
    ],
  }] });
  assert.deepEqual({ suitable: summary.suitableRoutes, conditional: summary.conditionalRoutes, separate: summary.separateBasisRoutes }, {
    suitable: 1,
    conditional: 0,
    separate: 2,
  });
});

test('questionnaire is free initially and the access gate starts hidden', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/access-gate.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /<section id="accessGate"[^>]*\bhidden>/);
  assert.match(html, /<form id="matcherForm"/);
  assert.doesNotMatch(html, /classList\.add\(["']access-locked["']\)/);
  assert.doesNotMatch(css, /\.access-locked body > :not\(#accessGate\)/);
});

test('result FAQ uses the approved question wording', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /Сколько времени занимает заполнение анкеты\?/);
  assert.match(html, /Нужно ли снова платить за доступ к новым странам\?/);
  assert.doesNotMatch(html, /Сколько занимает анкета\?/);
  assert.doesNotMatch(html, /Нужно ли снова платить за новые страны\?/);
});

test('free-result DOM order is compact gate, result with bottom CTA, then independent manual access', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const accessGate = html.indexOf('id="accessGate"');
  const resultView = html.indexOf('id="resultView"');
  const result = html.indexOf('id="result"', resultView);
  const bottomCta = html.indexOf('id="previewBottomCta"', resultView);
  const manualAccess = html.indexOf('id="manualAccess"');
  const accessForm = html.indexOf('id="accessForm"');
  const accessGateEnd = html.indexOf('</section>', accessGate);
  const bottomCtaEnd = html.indexOf('</aside>', bottomCta);

  assert.ok(accessGate < resultView);
  assert.ok(result < bottomCta);
  assert.ok(resultView < manualAccess);
  assert.ok(accessForm > accessGateEnd, 'manual form must not be inside accessGate');
  assert.ok(accessForm > bottomCtaEnd, 'manual form must not be inside previewBottomCta');
  assert.match(html, /id="manualAccessToggle"[^>]*aria-expanded="false"[^>]*>Уже есть код доступа\?/);
  assert.match(html, /<form id="accessForm" hidden>/);
});

test('funnel UI has no preliminary-result copy and separates questionnaire privacy from access persistence', async () => {
  const [html, app, funnel] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/funnel.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(`${html}\n${app}\n${funnel}`, /предварительн/iu);
  assert.doesNotMatch(html, /Ответы анкеты остаются в вашем браузере\./);
  assert.match(html, /id="headerSalesLink"[^>]*>Открыть все результаты<\/button>/);
  assert.match(app, /\$\('#headerSalesLink'\)\.addEventListener\('click', openPaymentDialog\)/);
  assert.doesNotMatch(html, /на вашем устройстве|Данные остаются в браузере/);
  assert.match(html, /После активации доступ сохранится в этом браузере\./);
  assert.match(html, /<button type="submit">Открыть результаты<\/button>/);
  assert.doesNotMatch(html, /Открыть Country Matcher/);
  assert.doesNotMatch(html, /class="access-label"/);
  assert.match(html, /id="accessFreeCountry"[^>]*hidden/);
  assert.match(app, /freeCountryMessage: presentation\.freeCountryMessage/);
  assert.match(app, /heroTitle'\)\.hidden = true/);
  assert.doesNotMatch(`${html}\n${app}`, /Расчёт выполнен по вашим ответам/);
});

test('locked countries expose names only through locked navigation without unpaid details', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const lockedTab = app.slice(app.indexOf('function renderLockedCountryTab'), app.indexOf('function citizenshipYears'));
  const resultRenderer = app.slice(app.indexOf('function renderResult'), app.indexOf('function switchToResult'));
  assert.match(lockedTab, /country-tab is-locked/);
  assert.match(lockedTab, /country\.name/);
  assert.doesNotMatch(lockedTab, /routeName|conditions|threshold|renderCountryResult/);
  assert.match(resultRenderer, /lockedCountries\.slice\(0, 2\)/);
  assert.match(resultRenderer, /visibleLockedCountries\.map\(renderLockedCountryTab\)/);
  assert.match(resultRenderer, /renderMoreLockedCountries\(remainingLockedCount\)/);
  assert.doesNotMatch(resultRenderer, /lockedCountries\.map\([^)]*renderCountryResult/);
  assert.match(lockedTab, /data-locked-country/);
  assert.doesNotMatch(lockedTab, /data-country-tab/);
});

test('country citizenship comparison falls back to the shortest numeric term from published routes', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const comparison = app.slice(app.indexOf('function citizenshipYears'), app.indexOf('function incomeThresholdUsd'));
  const resultComparison = app.slice(app.indexOf('function renderLossLine'), app.indexOf('function renderCountryResult'));
  assert.match(comparison, /function countryComparisonCitizenshipYears\(country\)/);
  assert.match(comparison, /const bestRouteYears = citizenshipYears\(country\?\.bestRoute\)/);
  assert.match(comparison, /\['трёх', 3\]/);
  assert.match(comparison, /if \(routeYears\.length\) return Math\.min\(\.\.\.routeYears\)/);
  assert.match(comparison, /countryComparisonEditorial\?\.countries\?\.\[countryId\]\?\.yearsToCitizenship/);
  assert.match(resultComparison, /const targetYears = countryComparisonCitizenshipYears\(freeCountry\)/);
  assert.match(resultComparison, /all\.map\(countryComparisonCitizenshipYears\)/);
  assert.doesNotMatch(resultComparison, /citizenshipYears\(country\.bestRoute\)/);
});

test('Paraguay-only result replaces comparison copy with a limitation explanation', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /Что вас сейчас ограничивает/);
  assert.match(app, /Парагвай — единственная страна, где маршрут подходит без дополнительных условий/);
  assert.match(app, /Ближайший подтверждённый порог — от \$1 000 в месяц/);
  assert.match(app, /в \$\{countryLocative\(currentThousandIncomeOpportunityCount\)\}/);
  assert.doesNotMatch(app, /в \$\{shorter\} странах путь к паспорту короче/);
});

test('one access-state owner controls payment, retry, and the complete bottom CTA', () => {
  assert.deepEqual(accessPresentationState(
    { state: ACCESS_STATES.INACTIVE },
    { hasFreeCountry: true },
  ), {
    paymentVisible: true,
    retryVisible: false,
    bottomCtaVisible: false,
  });
  assert.deepEqual(accessPresentationState(
    { state: ACCESS_STATES.UNAVAILABLE },
    { hasFreeCountry: true },
  ), {
    paymentVisible: false,
    retryVisible: true,
    bottomCtaVisible: false,
  });
  assert.equal(accessPresentationState(
    { state: ACCESS_STATES.INACTIVE },
    { hasFreeCountry: false },
  ).bottomCtaVisible, false);
  assert.deepEqual(accessPresentationState(
    { state: ACCESS_STATES.INACTIVE },
    { hasFreeCountry: true, paidResultsAvailable: false },
  ), { paymentVisible: false, retryVisible: false, bottomCtaVisible: false });
});

test('answers review renders applicable human values and suppresses absent conditional fields', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../matcher/access-gate.css', import.meta.url), 'utf8');
  const answers = app.slice(app.indexOf('const ANSWER_LABELS'), app.indexOf('function statusClass'));
  assert.match(answers, /Ваши ответы/);
  assert.match(answers, /Эти данные использованы для расчёта результатов/);
  assert.match(answers, /yesNo = \(answer\) => answer \? 'Да' : 'Нет'/);
  assert.match(answers, /answerMoney\([^)]*' \/ мес'/);
  assert.match(answers, /a\.partnerIncluded \?/);
  assert.match(answers, /a\.childAges\?\.length \?/);
  assert.match(answers, /presentRows = \(rows\) => rows\.filter\(\(\[, answer\]\) => answer !== '' && answer != null\)/);
  assert.doesNotMatch(answers, />\$\{html\(type\)\}</);
  assert.match(answers, /income\('primary', 'Основной доход'\)/);
  assert.match(answers, /\['Тип', ANSWER_LABELS\[type\]\]/);
  assert.match(answers, /\['География'/);
  assert.match(answers, /\['Страна источника', countryDisplayName/);
  assert.match(answers, /\['Подтверждение'/);
  assert.match(answers, /\['Сумма'/);
  assert.doesNotMatch(answers, /\$\{title\}: (?:тип|география|страна источника|подтверждение)/);
  assert.match(css, /\.answer-row span, \.answer-row b \{[^}]*text-align: left/s);
  assert.doesNotMatch(css, /\.answer-row b \{[^}]*text-align: right/s);
});

test('answers review uses generic year grammar and human country labels', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const answers = app.slice(app.indexOf('const ANSWER_LABELS'), app.indexOf('function statusClass'));
  assert.match(answers, /mod100 >= 11 && mod100 <= 14 \? 'лет'/);
  assert.match(answers, /mod10 === 1 \? 'год'/);
  assert.match(answers, /mod10 >= 2 && mod10 <= 4 \? 'года'/);
  assert.match(answers, /countryOptions\(\)\.find\(\(country\) => country\.code === code\)\?\.name/);
  assert.match(answers, /a\.childAges\.map\(russianYears\)/);
  const russianYears = Function(`return (${answers.match(/const russianYears = ([\s\S]*?);\nconst countryDisplayName/)[1]})`)();
  assert.deepEqual(
    [1, 2, 5, 11, 21, 22, 25].map(russianYears),
    ['1 год', '2 года', '5 лет', '11 лет', '21 год', '22 года', '25 лет'],
  );
  const countryDisplayName = Function('parseCountryCode', 'countryOptions', `return (${answers.match(/const countryDisplayName = ([\s\S]*?);\n\nfunction renderAnswersBlock/)[1]})`)(parseCountryCode, countryOptions);
  const selectedCountry = countryDisplayName('Филиппины / Philippines — PH');
  assert.equal(selectedCountry, new Intl.DisplayNames(['ru'], { type: 'region' }).of('PH'));
  assert.doesNotMatch(selectedCountry, /Philippines|\bPH\b|—|\//);
});

test('access-state rendering keeps manual form collapsed and explicit trigger owns expansion', async () => {
  const gate = await readFile(new URL('../matcher/access-gate.js', import.meta.url), 'utf8');
  const applyState = gate.slice(gate.indexOf('function applyAccessState'), gate.indexOf('export function showAccessTeaser'));
  const initialization = gate.slice(gate.indexOf('function initializeAccessGate'));
  assert.doesNotMatch(applyState, /setManualFormExpanded|form\.hidden/);
  assert.match(gate, /if \(elements\.manual\) elements\.manual\.hidden = lockedCountryCount === 0/);
  assert.match(gate, /setManualFormExpanded\(false\)/);
  assert.match(initialization, /manualToggle\.addEventListener\("click"/);
  assert.match(initialization, /setManualFormExpanded\(!expanded, \{ focus: !expanded \}\)/);
  assert.match(initialization, /form\.addEventListener\("submit"/);
});

test('valid unpaid submission calculates before access decision and renders only the allowlisted preview', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const submit = app.slice(app.indexOf("form.addEventListener('submit'"), app.indexOf("$('#saveDraft')"));
  const orchestrator = app.slice(app.indexOf('async function handleCalculatedResult'), app.indexOf('function returnToQuestionnaire'));
  const unpaid = app.slice(app.indexOf('function showUnpaidResult'), app.indexOf('function showCalculationFailure'));

  assert.ok(submit.indexOf('localStorage.setItem(DRAFT_KEY') < submit.indexOf('calculateActiveCountries()'));
  assert.ok(submit.indexOf('calculateActiveCountries()') < submit.indexOf('handleCalculatedResult(calculation)'));
  assert.match(orchestrator, /resolvedAccessState\.state === ACCESS_STATES\.ACTIVE[\s\S]*?switchToResult\(calculation, changed\)/);
  assert.match(orchestrator, /showUnpaidResult\(presentation, resolvedAccessState, changed\)/);
  assert.match(unpaid, /renderResult\(presentation\.previewCalculation, changed, presentation\.lockedCountries, currentAnswers, presentation\.fullCalculation\)/);
  assert.doesNotMatch(unpaid, /renderResult\(calculation|switchToResult/);
});

test('ERROR recovery hides paywall and ZERO_MATCH does not render an unsuitable preview', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const failure = app.slice(app.indexOf('function showCalculationFailure'), app.indexOf('async function accessStateForResult'));
  const unpaid = app.slice(app.indexOf('function showUnpaidResult'), app.indexOf('function showCalculationFailure'));
  assert.match(failure, /hideAccessGate\(\)/);
  assert.match(failure, /pendingCalculation = null/);
  assert.match(unpaid, /const hasFreeCountry = presentation\.state === FUNNEL_STATES\.FREE_COUNTRY/);
  assert.match(unpaid, /\$\('#resultView'\)\.hidden = !hasFreeCountry/);
});

test('same-tab access grant reveals the pending calculation without recalculating', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const listener = app.slice(app.indexOf('window.addEventListener(ACCESS_GRANTED_EVENT'), app.indexOf('function isSuccessfulPaymentReturn'));
  assert.match(listener, /if \(!pendingCalculation\) return/);
  assert.match(listener, /switchToResult\(pending\.calculation, pending\.changed\)/);
  assert.doesNotMatch(listener, /calculateActiveCountries/);
});

test('editing answers is absent before payment and remains available after verified access', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const edit = app.slice(app.indexOf('function returnToQuestionnaire'), app.indexOf('function showToast'));
  assert.match(edit, /pendingCalculation = null/);
  assert.match(edit, /\$\('#questionnaireView'\)\.hidden = false/);
  assert.doesNotMatch(app, /EDIT_ANSWERS_EVENT/);
  assert.match(app, /\$\('#editProfile'\)\.addEventListener\('click', returnToQuestionnaire\)/);
  assert.doesNotMatch(await readFile(new URL('../index.html', import.meta.url), 'utf8'), /id="accessEditAnswers"/);
});

test('payment return restores draft, resolves access, recalculates, and can reveal full result', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const paymentReturn = app.slice(app.indexOf('async function handlePaymentReturn'), app.indexOf('async function init'));
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\('payment'\) === 'success'/);
  assert.match(app, /const restoredDraft = restoreDraft\(\)/);
  assert.ok(paymentReturn.indexOf('resolveAccessState()') < paymentReturn.indexOf('currentAnswers = collectAnswers()'));
  assert.ok(paymentReturn.indexOf('currentProfile = buildUserProfile(currentAnswers)') < paymentReturn.indexOf('calculateActiveCountries()'));
  assert.match(paymentReturn, /handleCalculatedResult\(calculation, \{ accessState \}\)/);
  assert.ok(paymentReturn.indexOf("verifiedAccessActive = true") < paymentReturn.indexOf('if (!restoredDraft) return'));
});

test('access state preserves anti-double-payment semantics on temporary verification failure', async () => {
  const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'paid-token' });
  const state = await resolveAccessState({
    storage,
    locationLike: PUBLIC_LOCATION,
    fetchImpl: async () => { throw new Error('network down'); },
  });
  assert.equal(state.state, ACCESS_STATES.UNAVAILABLE);
  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), 'paid-token');

  const gate = await readFile(new URL('../matcher/access-gate.js', import.meta.url), 'utf8');
  assert.match(gate, /accessPresentationState\(state, \{ hasFreeCountry, paidResultsAvailable \}\)/);
  assert.match(gate, /bottomCta\.hidden = !presentation\.bottomCtaVisible/);
  assert.equal(accessPresentationState(state, { hasFreeCountry: true }).retryVisible, true);
});

test('invalid stored token follows current invalid-token semantics', async () => {
  const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'invalid-token' });
  const state = await resolveAccessState({
    storage,
    locationLike: PUBLIC_LOCATION,
    fetchImpl: async () => response(401, { error: 'invalid' }),
  });
  assert.equal(state.state, ACCESS_STATES.INACTIVE);
  assert.equal(storage.getItem(TOKEN_STORAGE_KEY), null);
});

test('manual access and verified permanent token both produce ACTIVE state', async () => {
  const manual = memoryStorage({ [MANUAL_ACCESS_STORAGE_KEY]: 'granted' });
  assert.equal((await resolveAccessState({ storage: manual, locationLike: PUBLIC_LOCATION })).state, ACCESS_STATES.ACTIVE);

  const token = memoryStorage({ [TOKEN_STORAGE_KEY]: 'valid-token' });
  const state = await resolveAccessState({
    storage: token,
    locationLike: PUBLIC_LOCATION,
    fetchImpl: async () => response(200, { active: true, permanent: true }),
  });
  assert.equal(state.state, ACCESS_STATES.ACTIVE);
});

test('landing primary CTAs open the free questionnaire while payment section remains intact', async () => {
  const landing = await readFile(new URL('../landing/index.html', import.meta.url), 'utf8');
  assert.match(landing, /<a class="nav-cta nav-cta-quiet" data-cta-location="nav" href="\.\.\/">[\s\S]*?Пройти анкету[\s\S]*?<\/a>/);
  assert.match(landing, /<div class="hero-actions">\s*<a class="button" data-cta-location="hero" href="\.\.\/">Пройти анкету<\/a>/);
  assert.match(landing, /<section class="section payment" id="payment">/);
  assert.match(landing, /id="paypal-checkout-container"/);
  assert.match(landing, /Другие способы оплаты/);

  const [matcher, gate] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/access-gate.js', import.meta.url), 'utf8'),
  ]);
  assert.match(matcher, /id="resultPayment"/);
  assert.match(matcher, /class="card-network-marks"/);
  assert.match(matcher, /class="paypal-payment-card paypal-live-card"/);
  assert.match(matcher, /цена только до 1 сентября <del>\$29<\/del> <span class="current-payment-price">\$9<\/span>/);
  assert.match(matcher, /class="paypal-button-wrap paypal-button-live-wrap"/);
  assert.match(matcher, /class="other-payments"/);
  assert.match(matcher, /class="other-payment-list"/);
  assert.match(matcher, /class="button other-payments-confirm"/);
  assert.match(matcher, /src="\.\/landing\/assets\/payment\/visa\.svg"/);
  assert.match(matcher, /src="\.\/landing\/assets\/payment\/mastercard\.svg"/);
  assert.match(matcher, /id="manualAccess"[\s\S]*Уже есть код доступа\?/);
  assert.match(matcher, /id="resultUpdates"/);
  assert.match(matcher, /id="resultFooter"/);
  assert.match(matcher, /id="previewBottomPaymentLink"[^>]*>Открыть<\/button>/);
  assert.match(gate, /EXPECTED_PRICE/);
  assert.match(gate, /elements\.payment\.textContent = `Открыть все результаты/);
  assert.doesNotMatch(matcher, /Ответы анкеты остаются в вашем браузере\./);
  assert.doesNotMatch(matcher, /Лучшая страна|Лучшая подходящая страна/);
});
