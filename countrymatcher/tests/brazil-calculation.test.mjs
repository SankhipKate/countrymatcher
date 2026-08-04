import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateCountries } from '../js/engine/calculate-countries.js';
import { brazilAdapter } from '../js/countries/brazil-adapter.js';

const brazil = JSON.parse(await readFile(new URL('../data/brazil-research-v3.0.json', import.meta.url), 'utf8'));

const context = {
  calculation_date: '2026-08-01T08:00:00Z',
  engine_version: '7.1.1',
  fx: {
    base_currency: 'USD',
    rates: { EUR: 0.87, ARS: 1350, MXN: 18, BRL: 5.5, RUB: 80, UYU: 40 },
    source: 'test',
    as_of: '2026-08-01T00:00:00Z',
    max_age_hours: 96,
  },
};

function incomeSource({ type = 'REMOTE_EMPLOYMENT', sourceCountry = 'US', bankCountry = 'GE', amount = 2000, currency = 'USD' } = {}) {
  return {
    owner: 'APPLICANT',
    type,
    source_country: sourceCountry,
    bank_country: bankCountry,
    monthly_total: { amount, currency },
    monthly_provable: { amount, currency },
    evidence_level: 'FULL',
  };
}

function profile(overrides = {}) {
  const result = {
    schema_version: 'user-profile-v1',
    citizenships: ['RU'],
    residence: { current_country: 'RU', current_status: 'CITIZENSHIP' },
    application_preferences: { methods: ['RUSSIA', 'IN_COUNTRY_AFTER_ENTRY'] },
    family: { adults_count: 1, partner_included: false, relationship_type: null, children: [], school_needed: false },
    lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
    income: {
      primary: incomeSource(),
      has_additional_sources: false,
      additional_sources: [],
      partner: { has_income: false, sources: [] },
      savings: null,
    },
    goal: {
      long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
      keep_russian_citizenship: 'NOT_IMPORTANT',
    },
    preferences: { monthly_budget: { amount: 2500, currency: 'USD' }, city_size: 'ANY', climate: ['ANY'] },
    pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
    special_circumstances: ['NONE'],
    route_specific_answers: {},
  };
  return {
    ...result,
    ...overrides,
    residence: { ...result.residence, ...(overrides.residence || {}) },
    application_preferences: { ...result.application_preferences, ...(overrides.application_preferences || {}) },
    family: { ...result.family, ...(overrides.family || {}) },
    lgbt: { ...result.lgbt, ...(overrides.lgbt || {}) },
    income: { ...result.income, ...(overrides.income || {}) },
    goal: { ...result.goal, ...(overrides.goal || {}) },
    preferences: { ...result.preferences, ...(overrides.preferences || {}) },
    pets: { ...result.pets, ...(overrides.pets || {}) },
    route_specific_answers: { ...result.route_specific_answers, ...(overrides.route_specific_answers || {}) },
  };
}

function calculate(input = profile(), ctx = context) {
  const result = calculateCountries(input, [brazil], ctx, () => brazilAdapter);
  assert.deepEqual(result.errors, []);
  return result.results[0];
}

function route(result, routeId) {
  return result.routes.find(({ routeId: id }) => id === routeId);
}

test('Brazil calculation exposes all eight researched routes', () => {
  const result = calculate();
  assert.equal(result.country.countryId, 'BR');
  assert.equal(result.country.name, 'Бразилия');
  assert.deepEqual(result.routes.map(({ routeId }) => routeId), [
    'BR_DIGITAL_NOMAD',
    'BR_RETIREMENT',
    'BR_LOCAL_EMPLOYMENT',
    'BR_BRAZIL_GRADUATE_WORK',
    'BR_STUDY',
    'BR_FAMILY_REUNIFICATION',
    'BR_PRODUCTIVE_INVESTOR',
    'BR_REAL_ESTATE_INVESTOR',
  ]);
  assert.ok(result.routes.every(({ followUpQuestions }) => followUpQuestions.length === 0));
});

test('digital nomad is suitable for documented foreign remote income above 1,500 USD', () => {
  const result = calculate(profile({ income: { primary: incomeSource({ amount: 1700 }) } }));
  const nomad = route(result, 'BR_DIGITAL_NOMAD');
  assert.equal(nomad.routeStatus, 'SUITABLE');
  assert.equal(nomad.thresholdUsd, 1500);
  assert.equal(nomad.incomeUsd, 1700);
  assert.equal(result.bestRoute.routeId, 'BR_DIGITAL_NOMAD');
});

test('savings supplied outside the questionnaire remain an unverified nomad condition', () => {
  const input = profile({
    income: { primary: incomeSource({ amount: 800 }), savings: { amount: 20000, currency: 'USD' } },
  });
  const nomad = route(calculate(input), 'BR_DIGITAL_NOMAD');
  assert.equal(nomad.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(nomad.conditions.some((message) => message.includes('18 000 USD') || message.includes('18 000 USD')));
});

test('one-dollar income uses the unasked savings alternative and a future income plan does not improve it', () => {
  for (const routeSpecificAnswers of [
    {},
    { BR_DIGITAL_NOMAD: { ready_to_raise_income: true } },
  ]) {
    const input = profile({
      income: { primary: incomeSource({ amount: 1 }) },
      route_specific_answers: routeSpecificAnswers,
    });
    const nomad = route(calculate(input), 'BR_DIGITAL_NOMAD');
    assert.equal(nomad.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.ok(nomad.conditions.some((message) => message.includes('18 000 USD') || message.includes('18 000 USD')));
  }
});

test('digital nomad does not treat a Brazilian employer as a foreign remote basis', () => {
  const input = profile({ income: { primary: incomeSource({ sourceCountry: 'BR', amount: 2500 }) } });
  const nomad = route(calculate(input), 'BR_DIGITAL_NOMAD');
  assert.equal(nomad.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(nomad.incomeTypeFit, 'DOES_NOT_MEET');
  assert.ok(nomad.conditions.some((message) => message.includes('18 000 USD') || message.includes('18 000 USD')));
});

test('legacy bank-country data does not lower an otherwise qualifying nomad route', () => {
  const input = profile({ income: { primary: incomeSource({ bankCountry: 'RU', amount: 2000 }) } });
  const nomad = route(calculate(input), 'BR_DIGITAL_NOMAD');
  assert.equal(nomad.routeStatus, 'SUITABLE');
  assert.equal(nomad.actions.some((action) => /консульств/i.test(action)), false);
});

test('retirement route requires a pension basis and accepts regular top-up income', () => {
  const input = profile({
    income: {
      primary: incomeSource({ type: 'PENSION', sourceCountry: 'RU', amount: 1400 }),
      has_additional_sources: true,
      additional_sources: [incomeSource({ type: 'PASSIVE_INCOME', sourceCountry: 'RU', amount: 700 })],
    },
  });
  const retirement = route(calculate(input), 'BR_RETIREMENT');
  assert.equal(retirement.routeStatus, 'SUITABLE');
  assert.equal(retirement.incomeUsd, 2100);
});

test('local employment remains conditional because the questionnaire does not verify an offer', () => {
  const input = profile({ route_specific_answers: { BR_LOCAL_EMPLOYMENT: { local_job_offer_confirmed: true } } });
  const local = route(calculate(input), 'BR_LOCAL_EMPLOYMENT');
  assert.equal(local.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(local.basisMissing, true);
  assert.ok(local.conditions.some((condition) => condition.includes('работодателя')));
});

test('Brazil graduate work remains conditional because the questionnaire does not verify the degree', () => {
  const input = profile({
    residence: { current_country: 'BR', current_status: 'STUDENT_STATUS' },
    route_specific_answers: { BR_BRAZIL_GRADUATE_WORK: { brazil_degree_completed: true } },
  });
  const graduate = route(calculate(input), 'BR_BRAZIL_GRADUATE_WORK');
  assert.equal(graduate.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(graduate.conditions.some((condition) => condition.includes('Окончить')));
});

test('study route remains conditional because admission and means are not questionnaire facts', () => {
  const input = profile({
    route_specific_answers: { BR_STUDY: { admission_confirmed: true, study_funds_confirmed: true } },
  });
  const study = route(calculate(input), 'BR_STUDY');
  assert.equal(study.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(study.conditions.some((condition) => condition.includes('Поступить')));
});

test('same-sex family link remains available as a conditional family route', () => {
  const input = profile({
    family: { adults_count: 2, partner_included: true, relationship_type: 'MARRIAGE' },
    lgbt: { enabled: true, consent_for_personalization: true, family_recognition_relevant: true, safety_relevant: true },
    route_specific_answers: { BR_FAMILY_REUNIFICATION: { brazil_family_sponsor: true } },
  });
  const result = calculate(input);
  const family = route(result, 'BR_FAMILY_REUNIFICATION');
  assert.equal(family.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(family.conditions.some((condition) => condition.includes('семейную связь')));
  assert.equal(result.lgbt.enabled, true);
  assert.match(result.lgbt.rows[0][1], /однопол/i);
});

test('productive investment keeps official BRL capital as an unasked condition with dynamic USD context', () => {
  const input = profile({
    route_specific_answers: {
      BR_PRODUCTIVE_INVESTOR: { investment_capital_brl: 500000, investment_project_ready: true },
    },
  });
  const investor = route(calculate(input), 'BR_PRODUCTIVE_INVESTOR');
  assert.equal(investor.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(Math.abs(investor.thresholdUsd - 500000 / 5.5) < 0.001);
  assert.equal(investor.incomeRequirementConversion.originalCurrency, 'BRL');
  assert.equal(investor.incomeRequirementConversion.originalAmount, 500000);
  assert.ok(investor.conditions.some((condition) => /500 000 BRL \(ок\. [\d\s]+ USD\)/.test(condition)));
  assert.ok(investor.conditions.some((condition) => /150 000 BRL \(ок\. [\d\s]+ USD\)/.test(condition)));
  assert.equal(investor.conditions.some((condition) => condition.includes('Ориентир по текущему валютному контексту')), false);
});

test('productive investment ignores injected capital and preserves both researched alternatives', () => {
  const input = profile({
    route_specific_answers: {
      BR_PRODUCTIVE_INVESTOR: { investment_capital_brl: 200000, innovation_project: true },
    },
  });
  const investor = route(calculate(input), 'BR_PRODUCTIVE_INVESTOR');
  assert.equal(investor.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(investor.conditions.some((condition) => condition.includes('150 000 BRL')));
  assert.equal(investor.incomeUsd, null);
});

test('real-estate investment ignores injected region and preserves both official BRL thresholds', () => {
  const input = profile({
    route_specific_answers: {
      BR_REAL_ESTATE_INVESTOR: {
        real_estate_investment_brl: 700000,
        property_region: 'NORTHEAST',
        property_selected: true,
      },
    },
  });
  const investor = route(calculate(input), 'BR_REAL_ESTATE_INVESTOR');
  assert.equal(investor.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(Math.abs(investor.thresholdUsd - 1000000 / 5.5) < 0.001);
  assert.equal(investor.incomeRequirementConversion.originalAmount, 1000000);
  assert.ok(investor.conditions.some((condition) => condition.includes('700 000 BRL')));
});

test('a citizenship goal does not lower an otherwise available initial Brazil permit', () => {
  const input = profile({
    income: { primary: incomeSource({ amount: 1700 }) },
    goal: { long_term: 'CITIZENSHIP_REQUIRED' },
  });
  const nomad = route(calculate(input), 'BR_DIGITAL_NOMAD');
  assert.equal(nomad.routeStatus, 'SUITABLE');
  assert.equal(nomad.blockers.length, 0);
});

test('Brazil practical result includes five family-specific cities and a small city', () => {
  const input = profile({
    family: { adults_count: 2, partner_included: true, relationship_type: 'MARRIAGE', children: [{ age_years: 10 }], school_needed: true },
  });
  const result = calculate(input);
  assert.equal(result.cities.length, 5);
  assert.ok(result.cities.some(({ populationCategory }) => populationCategory === 'SMALL'));
  assert.ok(result.cities.every(({ costIsFamilySpecific, coldRange, hotRange }) => costIsFamilySpecific && coldRange && hotRange));
  assert.match(result.schoolSummary, /международн/i);
});

test('missing or stale BRL rate creates a typed country error', () => {
  const missing = structuredClone(context);
  delete missing.fx.rates.BRL;
  const missingResult = calculateCountries(profile(), [brazil], missing, () => brazilAdapter);
  assert.equal(missingResult.results.length, 0);
  assert.equal(missingResult.errors[0].code, 'CALCULATION_CONTEXT_INCOMPLETE');
  assert.match(missingResult.errors[0].message, /BRL/);

  const stale = structuredClone(context);
  stale.fx.as_of = '2026-07-01T00:00:00Z';
  const staleResult = calculateCountries(profile(), [brazil], stale, () => brazilAdapter);
  assert.equal(staleResult.results.length, 0);
  assert.equal(staleResult.errors[0].code, 'CALCULATION_CONTEXT_INCOMPLETE');
});

test('public matcher loads Brazil data, adapter, flag, cities and version 7.1.1', async () => {
  const [app, html, fx, packageJson, readme] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../pilot/fx-context.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /brazilAdapter/);
  assert.match(app, /brazil-research-v3\.0\.json\?v=7\.1\.1/);
  assert.match(app, /countryId === 'BR' \? '🇧🇷'/);
  assert.match(app, /enrichCityCategories/);
  assert.match(fx, /quotes=EUR,ARS,MXN,BRL/);
  assert.match(fx, /\['EUR', 'ARS', 'MXN', 'BRL'\]/);
  assert.equal(packageJson.version, '7.1.1');
  assert.match(html, /версия 7\.1\.1/);
  assert.match(readme, /Бразилии/);
  assert.match(readme, /семи стран/i);
});
