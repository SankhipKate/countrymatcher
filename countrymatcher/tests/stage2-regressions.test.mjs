import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateCountry } from '../js/engine/calculate-country.js';
import { loadCalculationContext } from '../pilot/fx-context.js';
import { selectBestVariant } from '../js/engine/select-best-route.js';

const context = { calculation_date: '2026-07-19T12:00:00Z', engine_version: '2.1.0', fx: { base_currency: 'USD', rates: { EUR: 0.87 }, source: 'test', as_of: '2026-07-19T00:00:00Z', max_age_hours: 96 } };
const variantAdapter = {
  normalizeProfile: (profile) => ({ ...profile }), validateContext() {}, buildIndexes: () => ({}),
  evaluateRoute: (route, indexes, profile) => ({ routeId: route.route_id, routeStatus: route.status[profile.applicationNationality], applicationNationality: profile.applicationNationality, viaSecondaryNationality: profile.applicationNationality !== 'RU', goalFit: 'MEETS', applicationFit: 'MEETS', familyFit: 'MEETS', incomeTypeFit: 'MEETS', incomeFit: 'MEETS', countryMissingCount: 0, clientMissingCount: 0, conditionsCount: 0 }),
  evaluatePractical: () => ({ cities: [], recommendedCity: null }), determineCountryGroup: () => 'SUITABLE', collectSources: () => [],
};
const pkg = { schema_version: 'test', country: { country_id: 'XX', name_ru: 'Test' }, routes: [{ route_id: 'R1', status: { RU: 'UNSUITABLE', AR: 'SUITABLE' } }, { route_id: 'R2', status: { RU: 'SUITABLE', AR: 'SUITABLE' } }] };

test('each route keeps one variant for every citizenship and secondary can win', () => {
  const result = calculateCountry({ citizenships: ['RU', 'AR'] }, pkg, context, variantAdapter);
  assert.equal(result.routes.every((route) => route.citizenshipVariants.length === 2), true);
  assert.equal(result.routes[0].applicationNationality, 'AR');
  assert.equal(result.routes[0].viaSecondaryNationality, true);
});

test('RU wins a fully equal citizenship tie', () => {
  const best = selectBestVariant([{ routeId: 'R', routeStatus: 'SUITABLE', applicationNationality: 'AR' }, { routeId: 'R', routeStatus: 'SUITABLE', applicationNationality: 'RU' }]);
  assert.equal(best.applicationNationality, 'RU');
});

test('strict profile without citizenships returns typed error', () => {
  assert.throws(() => calculateCountry({}, pkg, context, variantAdapter), { code: 'PROFILE_INCOMPLETE' });
});

test('valid mocked Frankfurter response creates a USD context with EUR, ARS, MXN, and BRL', async () => {
  const result = await loadCalculationContext({ now: new Date('2026-07-19T12:00:00Z'), fetchImpl: async () => ({ ok: true, json: async () => [
    { date: '2026-07-19', base: 'USD', quote: 'EUR', rate: 0.87 },
    { date: '2026-07-19', base: 'USD', quote: 'ARS', rate: 1250 },
    { date: '2026-07-19', base: 'USD', quote: 'MXN', rate: 18.75 },
    { date: '2026-07-19', base: 'USD', quote: 'BRL', rate: 5.5 },
  ] }) });
  assert.equal(result.fx.rates.EUR, 0.87);
  assert.equal(result.fx.rates.ARS, 1250);
  assert.equal(result.fx.rates.MXN, 18.75);
  assert.equal(result.fx.rates.BRL, 5.5);
  assert.equal(result.fx.source, 'Frankfurter');
});

test('network failure is typed as incomplete calculation context', async () => {
  await assert.rejects(loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); } }), { code: 'CALCULATION_CONTEXT_INCOMPLETE' });
});

test('stale online rate falls back to the last saved complete context', async () => {
  const rows = ['EUR', 'ARS', 'MXN', 'BRL'].map((quote, index) => ({ date: '2026-07-18', quote, rate: index + 1 }));
  const storage = { getItem: () => JSON.stringify({ source: 'Frankfurter', rows }), setItem() {} };
  const result = await loadCalculationContext({ storage, now: new Date('2026-07-19T12:00:00Z'), fetchImpl: async () => ({ ok: true, json: async () => rows.map((row) => ({ ...row, date: '2026-07-01' })) }) });
  assert.equal(result.fx.is_saved_fallback, true);
  assert.equal(result.fx.as_of, '2026-07-18');
});

test('runtime contains no removed constructs or user FX field', async () => {
  const files = ['../js/spain-calculator.js', '../js/countries/spain-adapter.js', '../js/engine/calculate-country.js', '../js/engine/select-best-route.js', '../matcher/app.js'];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');
  for (const token of ['BASIS' + '_ROUTE', 'basis' + '_mismatch', 'selection' + 'Score', 'eur' + 'UsdRate']) assert.equal(source.includes(token), false);
});

test('public matcher contains no social-security route-specific question', async () => {
  const source = `${await readFile(new URL('../matcher/index.html', import.meta.url), 'utf8')}\n${await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8')}`;
  assert.equal(source.includes('social' + 'SecurityPlan'), false);
  assert.equal(source.includes('Как планируете подтвердить социальное страхование'), false);
});

test('public matcher gates the questionnaire behind Russian citizenship confirmation', async () => {
  const html = await readFile(new URL('../matcher/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('У вас есть гражданство РФ?') < html.indexOf('id="matcherForm"'));
  assert.match(html, /id="questionnaireView"[^>]*hidden/);
  assert.ok(html.includes('Сейчас Country Matcher подбирает маршруты с учётом правил, действующих для граждан РФ.'));
  assert.ok(app.includes("$('#gateYes').addEventListener('click'"));
  assert.ok(app.includes("$('#gateNo').addEventListener('click'"));
  assert.equal(/дополнительн(?:ое|ые) гражданств/i.test(html), false);
});


test('result view uses the full page width and keeps edit action in the hero', async () => {
  const html = await readFile(new URL('../matcher/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="resultView" class="result-layout result-layout-single"/);
  assert.ok(html.indexOf('id="editProfile"') < html.indexOf('id="resultView"'));
  assert.equal(html.includes('Что дальше'), false);
  assert.ok(app.includes("$('#editProfile').hidden = false"));
  assert.ok(app.includes("$('#editProfile').hidden = true"));
});


test('matcher selects avoid the obsolete not-selected option and align income blocks', async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL('../matcher/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.equal(html.includes('Не выбрано'), false);
  assert.equal(app.includes('Не выбрано'), false);
  assert.ok(html.includes('disabled selected hidden>Выберите</option>'));
  assert.match(html, /id="additionalIncomeBlock" class="conditional-card income-block"/);
  assert.match(html, /id="partnerIncomeBlock" class="conditional-card income-block"/);
  assert.match(styles, /\.income-block \.field>span:first-child[^{]*\{[^}]*min-height:48px/);
});

test('pet question is only yes or no and does not ask species or breed', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../matcher/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /Переезжают домашние животные\?/);
  assert.equal(html.includes('id="dogBreed"'), false);
  assert.equal(html.includes('name="petType"'), false);
  assert.equal(app.includes('enhanceDogBreedSearch'), false);
  assert.equal(app.includes('searchDogBreeds'), false);
});

test('selects match input shape and country tabs reset the detail position', async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(styles, /\.field>select\{[^}]*appearance:none/);
  assert.match(styles, /\.country-workspace\{scroll-margin-top:16px\}/);
  assert.match(app, /scrollIntoView\(\{ block: 'start', behavior: 'smooth' \}\)/);
});

test('long-term route text is structured once without duplicated research notes', async () => {
  const [app, spain, uruguay] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../data/spain-research-v3.0.json', import.meta.url), 'utf8'),
    readFile(new URL('../data/uruguay-research-v3.0.json', import.meta.url), 'utf8'),
  ]);
  assert.equal(app.includes('items.push(rule.notes)'), false);
  assert.equal(app.includes('Срок до гражданства:'), false);
  assert.match(app, /Гражданство: обычно после/);
  assert.match(app, /Язык и экзамены: испанский/);
  assert.match(app, /Выезды: отсутствие более 6 месяцев подряд/);
  assert.equal(uruguay.includes('Требуется функциональный испанский'), false);
  assert.equal(spain.includes('фиксированный универсальный числовой лимит отсутствий'), false);
});
