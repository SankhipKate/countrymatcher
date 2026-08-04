import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateCountry } from '../js/engine/calculate-country.js';
import { argentinaAdapter } from '../js/countries/argentina-adapter.js';
import { sortRoutesForDisplay } from '../matcher/profile.js';

const argentina = JSON.parse(await readFile(new URL('../data/argentina-research-v3.0.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../data/schemas/user-profile-v1.schema.json', import.meta.url), 'utf8'));
const context = {
  calculation_date: '2026-07-24T12:00:00Z',
  engine_version: '2.2.0',
  fx: {
    base_currency: 'USD',
    rates: { EUR: 0.87, ARS: 1000 },
    source: 'test',
    as_of: '2026-07-24T00:00:00Z',
    max_age_hours: 96,
  },
};

function income(type, amount = 2500, sourceCountry = 'US') {
  return {
    owner: 'APPLICANT',
    type,
    source_country: sourceCountry,
    bank_country: 'GE',
    monthly_total: { amount, currency: 'USD' },
    monthly_provable: { amount, currency: 'USD' },
    evidence_level: 'FULL',
  };
}

function profile(type = 'REMOTE_EMPLOYMENT', amount = 2500, sourceCountry = 'US') {
  return {
    schema_version: 'user-profile-v1',
    citizenships: ['RU'],
    residence: { current_country: 'RU', current_status: 'CITIZENSHIP' },
    application_preferences: { methods: ['RUSSIA', 'IN_COUNTRY_AFTER_ENTRY'] },
    family: { adults_count: 1, partner_included: false, relationship_type: null, children: [], school_needed: false },
    lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
    income: {
      primary: income(type, amount, sourceCountry),
      has_additional_sources: false,
      additional_sources: [],
      partner: { has_income: false, sources: [] },
      savings: null,
    },
    goal: {
      long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
      keep_russian_citizenship: 'NOT_IMPORTANT',
    },
    preferences: { monthly_budget: { amount: 1800, currency: 'USD' }, city_size: 'ANY', climate: ['ANY'] },
    pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
    special_circumstances: ['NONE'],
    route_specific_answers: {},
  };
}

function calculate(candidate) {
  return calculateCountry(candidate, argentina, context, argentinaAdapter);
}

test('Argentina is calculated as a third country with six relevant Russian-citizen routes', () => {
  const result = calculate(profile());
  assert.equal(result.country.countryId, 'AR');
  assert.equal(result.country.name, 'Аргентина');
  assert.equal(result.country.resultCurrency, 'USD');
  assert.equal(result.routes.length, 6);
  assert.equal(result.routes.some((route) => route.routeId === 'AR_MERCOSUR_SECOND_NATIONALITY'), false);
  assert.equal(result.routes.some((route) => route.routeId === 'AR_INVESTOR_HIDDEN'), false);
  assert.equal(result.routes.some((route) => route.routeId === 'AR_FAMILY'), false);
  assert.deepEqual(new Set(result.routes.map((route) => route.routeStatus)), new Set(['SUITABLE', 'SUITABLE_WITH_CONDITIONS', 'UNSUITABLE']));
});

test('Argentina digital nomad uses existing universal remote-income answers and invents no numeric minimum', () => {
  const route = calculate(profile('REMOTE_EMPLOYMENT', 2500, 'US')).routes.find((item) => item.routeId === 'AR_NOMAD');
  assert.equal(route.routeStatus, 'SUITABLE');
  assert.equal(route.thresholdUsd, null);
  assert.equal(route.incomeUsd, 2500);
});

test('Argentina rentista compares passive income and the ARS threshold through USD', () => {
  const route = calculate(profile('PASSIVE_INCOME', 2000, 'US')).routes.find((item) => item.routeId === 'AR_RENTISTA');
  assert.equal(route.thresholdUsd, 1862);
  assert.equal(route.incomeUsd, 2000);
  assert.equal(route.routeStatus, 'SUITABLE');
  assert.equal(route.incomeRequirementConversion.originalCurrency, 'ARS');
  assert.equal(route.incomeRequirementConversion.targetCurrency, 'USD');
});

test('pension is a separate universal income type and controls the pension route', () => {
  const low = calculate(profile('PENSION', 1800, 'RU')).routes.find((item) => item.routeId === 'AR_PENSIONADO');
  const enough = calculate(profile('PENSION', 2000, 'RU')).routes.find((item) => item.routeId === 'AR_PENSIONADO');
  assert.equal(low.routeStatus, 'UNSUITABLE');
  assert.equal(enough.routeStatus, 'SUITABLE');
  const incomeTypeEnum = schema.$defs.incomeSource.properties.type.enum;
  assert.ok(incomeTypeEnum.includes('PENSION'));
});

test('Argentina routes needing a future local basis stay conditional without adding questionnaire answers', () => {
  const result = calculate(profile());
  for (const routeId of ['AR_WORKER', 'AR_SPECIALIST_TRANSFER', 'AR_STUDENT']) {
    const route = result.routes.find((item) => item.routeId === routeId);
    assert.equal(route.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.equal(route.basisMissing, true);
    assert.deepEqual(route.followUpQuestions, []);
  }
});

test('Argentina keeps 1 USD in the country KPI when the displayed best route does not use current income', () => {
  const candidate = profile('REMOTE_EMPLOYMENT', 1, 'US');
  candidate.family = {
    adults_count: 2,
    partner_included: true,
    relationship_type: 'MARRIAGE',
    children: [],
    school_needed: false,
  };
  const result = calculate(candidate);
  const displayedBestRoute = sortRoutesForDisplay(result.routes)[0];
  const nomad = result.routes.find((route) => route.routeId === 'AR_NOMAD');
  assert.equal(displayedBestRoute.routeId, 'AR_WORKER');
  assert.equal(nomad.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(nomad.conditions.some((condition) => condition.includes('два отдельных заявления')));
  assert.equal(displayedBestRoute.incomeTypeFit, 'NOT_APPLICABLE');
  assert.equal(displayedBestRoute.incomeFit, 'NOT_APPLICABLE');
  assert.equal(displayedBestRoute.thresholdUsd, null);
  assert.match(displayedBestRoute.incomeGuidance, /местный договор/i);
  assert.equal(result.applicantProvableIncome.amount, 1);
  assert.equal(result.applicantProvableIncome.currency, 'USD');
  assert.equal(nomad.incomeTypeFit, 'MEETS');
  assert.equal(nomad.incomeUsd, 1);
});

test('matcher adds pension and universal passive-income help but no Argentina-specific questions', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /value="PENSION">Пенсия</);
  assert.match(app, /value="PENSION">Пенсия</);
  assert.ok(app.includes('Доход от сдачи недвижимости в аренду, дивиденды, проценты по вкладам и облигациям, купонный доход, роялти'));
  assert.equal(/<[^>]+(?:id|name)="[^"]*(?:argentina|mercosur|transfer|familyLink)[^"]*"/i.test(html), false);
  assert.equal(/дополнительн(?:ое|ые) гражданств/i.test(html), false);
});

test('result uses the universal income label and country-group display currency', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('<span>Подтверждаемый доход</span>'));
  assert.equal(app.includes('Подтверждаемый доход после пересчёта'), false);
  assert.ok(app.includes("const incomeCurrency = calculation.country.resultCurrency || 'USD'"));
});


test('Argentina has no active-law text in pending changes', () => {
  assert.deepEqual(argentina.lgbt.pending_changes, []);
  assert.equal('recent_change_ru' in argentina.lgbt, false);
});
