import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const nl = JSON.parse(await readFile(new URL('../data/NL-research-v4.0.json', import.meta.url), 'utf8'));
const route = (routeId) => nl.routes.find((item) => item.route_id === routeId);

function profile({ relationship = null, children = [] } = {}) {
  return {
    citizenships: ['RU'],
    residence: { current_country: 'RU', current_status: 'CITIZEN' },
    application_preferences: { methods: ['FROM_ABROAD'] },
    family: {
      adults_count: relationship ? 2 : 1,
      adult_ages: relationship ? [35, 35] : [35],
      partner_included: Boolean(relationship),
      relationship_type: relationship,
      children: children.map((age) => ({ age_years: age })),
      school_needed: children.length > 0,
    },
    lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
    income: {
      primary: {
        owner: 'APPLICANT', type: 'OTHER_REGULAR_INCOME', source_geography: 'SINGLE_COUNTRY', country_id: 'RU',
        monthly_total: { amount: 0, currency: 'EUR' }, monthly_provable: { amount: 0, currency: 'EUR' },
      },
      additional_sources: [], partner: { has_income: false, sources: [] }, savings: { amount: 0, currency: 'EUR' },
    },
    investment_capital: null,
    goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
    pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
    special_circumstances: ['NONE'],
    route_specific_answers: {},
  };
}

const context = { fx: { base_currency: 'EUR', rates: { EUR: 1, USD: 1.17 }, source: 'test', as_of: '2026-09-06' } };
const calculate = (options = {}) => calculateActiveCountry(profile(options), nl, context);

test('Netherlands package is READY with complete Canon inventory and ten publishable routes', () => {
  assert.equal(nl.country_id, 'NL');
  assert.equal(nl.schema_version, '4.0');
  assert.equal(nl.completeness.country_ready_status, 'READY');
  assert.equal(nl.route_coverage.length, 13);
  assert.equal(nl.routes.length, 44);
  assert.equal(nl.routes.filter(({ publishable }) => publishable).length, 10);
  assert.equal(nl.open_items.length, 0);
});

test('runtime publishes only the ten approved Netherlands routes', () => {
  const result = calculate();
  assert.equal(result.country.countryId, 'NL');
  assert.equal(result.routes.length, 10);
  assert.equal(result.routes.some(({ routeId }) => routeId === 'NL_ICT'), false);
  assert.equal(result.routes.some(({ routeId }) => routeId === 'NL_FAMILY_PARTNER'), false);
  assert.equal(result.routes.some(({ routeId }) => routeId === 'NL_ASYLUM_FAMILY_REUNIFICATION'), false);
});

test('June 2026 asylum reform is represented in permit and family semantics', () => {
  const asylum = route('NL_ASYLUM');
  assert.equal(asylum.long_term_path.first_permit_months, null);
  assert.equal(asylum.long_term_path.renewal_months, 36);
  assert.match(asylum.long_term_path.initial_status_ru, /карта ВНЖ действует 3 года/);
  assert.match(asylum.long_term_path.pr_path_ru, /долгосрочного резидента ЕС/);
  assert.equal(asylum.family_scenarios.find(({ scenario_id }) => scenario_id.endsWith('ADULT_CHILD')).join_stage, 'NOT_AVAILABLE');
  assert.deepEqual(
    asylum.family_scenarios.find(({ scenario_id }) => scenario_id.endsWith('NON_MARRIED_PARTNER')).relationship_types,
    ['REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'],
  );
});

test('adult child receives an explicit unavailable asylum-family outcome', () => {
  const asylum = calculate({ children: [19] }).routes.find(({ routeId }) => routeId === 'NL_ASYLUM');
  assert.equal(asylum.familyEvaluation.state, 'BLOCKER');
  assert.equal(asylum.familyEvaluation.classification, 'NOT_AVAILABLE');
  assert.deepEqual(asylum.familyEvaluation.applicableScenarioIds, ['NL_ASYLUM_FAMILY_ADULT_CHILD']);
});

test('registered partner is not silently treated as already married', () => {
  const asylum = calculate({ relationship: 'REGISTERED_PARTNERSHIP' }).routes.find(({ routeId }) => routeId === 'NL_ASYLUM');
  assert.equal(asylum.familyEvaluation.state, 'CONDITION');
  assert.match(asylum.familyEvaluation.relationshipConditions.join(' '), /оформить признаваемый брак/);
});

test('Netherlands salary and study amounts preserve the researched 2026 thresholds', () => {
  const amounts = (routeId) => route(routeId).requirements
    .filter(({ financial }) => financial)
    .flatMap(({ financial }) => financial.alternatives.map(({ amount }) => amount));
  assert.deepEqual(amounts('NL_HSM'), [3122, 4357, 5942]);
  assert.deepEqual(amounts('NL_BLUE_CARD'), [4754, 5942]);
  assert.deepEqual(amounts('NL_STUDY'), [1130.77, 1130.77, 1130.77, 3467.77, 2766.67]);
  assert.deepEqual(amounts('NL_VOCATIONAL_STUDY'), [928.58, 928.58, 928.58, 3265.58, 2564.48]);
  assert.ok(amounts('NL_RESEARCHER').every((amount) => amount === 1635.9));
});

test('application geography distinguishes origin, legal residence, online and in-country stages', () => {
  const methods = nl.routes.flatMap(({ application_methods }) => application_methods.map(({ method }) => method));
  for (const expected of ['ORIGIN_COUNTRY', 'CURRENT_LEGAL_RESIDENCE', 'ONLINE', 'IN_COUNTRY']) {
    assert.ok(methods.includes(expected), expected);
  }
  assert.ok(nl.routes.flatMap(({ application_methods }) => application_methods).every(({ country_id }) => country_id === null));
});

test('orientation year makes the foreign-degree eligibility limits explicit', () => {
  const orientation = route('NL_ORIENTATION_YEAR');
  assert.match(orientation.name_ru, /квалифицирующей учёбы/);
  assert.match(orientation.basis_ru, /master, PhD или post-master/);
  assert.match(orientation.basis_ru, /топ-200 минимум у 2 из 3/);
  assert.match(orientation.basis_ru, /Nuffic/);
  assert.match(orientation.basis_ru, /Обычный зарубежный бакалавриат сам по себе не даёт права/);
  const online = orientation.application_methods.find(({ method }) => method === 'ONLINE');
  assert.equal(online.availability, 'CONDITIONAL');
  assert.equal(online.applicant_status_requirement, 'LEGAL_RESIDENT');
  assert.match(online.condition_ru, /учёбы, докторантуры или исследования в Нидерландах/);
  assert.match(online.condition_ru, /BRP/);
  assert.match(online.condition_ru, /BSN/);
});

test('corrected filing, renewal and work-right semantics remain route-specific', () => {
  for (const routeId of ['NL_GVVA', 'NL_BLUE_CARD', 'NL_SEASONAL_WORK', 'NL_INTERN_APPRENTICE', 'NL_MBO4_PILOT']) {
    assert.equal(route(routeId).application_methods.some(({ method }) => method === 'ONLINE'), false, routeId);
  }

  assert.equal(route('NL_INTERNATIONAL_TRADE').long_term_path.renewal_status, 'CONDITIONAL');
  assert.equal(route('NL_CROSS_BORDER_SERVICE').long_term_path.renewal_status, 'CONDITIONAL');
  assert.equal(route('NL_INTERN_APPRENTICE').long_term_path.renewal_status, 'CONDITIONAL');

  const mbo4 = route('NL_MBO4_PILOT');
  assert.equal(mbo4.long_term_path.first_permit_months, 12);
  assert.equal(mbo4.long_term_path.renewal_status, 'NOT_AVAILABLE');
  assert.equal(mbo4.applicant_work_rights.self_employment.status, 'ALLOWED');
  assert.match(mbo4.application_methods[0].condition_ru, /Основное заявление подаёт только признанное IND учебное заведение/);

  assert.equal(route('NL_BLUE_CARD').applicant_work_rights.self_employment.status, 'ALLOWED');
});

test('all Netherlands source references resolve', () => {
  const sourceIds = new Set(nl.sources.map(({ source_id }) => source_id));
  const unresolved = [];
  const walk = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'source_ids' || key === 'official_source_ids') {
        for (const sourceId of item) if (!sourceIds.has(sourceId)) unresolved.push(`${path}.${key}:${sourceId}`);
      } else if (key === 'official_source_id') {
        if (!sourceIds.has(item)) unresolved.push(`${path}.${key}:${item}`);
      } else walk(item, `${path}.${key}`);
    }
  };
  walk(nl);
  assert.deepEqual(unresolved, []);
  assert.equal(nl.sources.length, 84);
});

test('audited Netherlands Russian fields contain none of the corrected defects', () => {
  const text = JSON.stringify(nl);
  assert.doesNotMatch(text, /gross SV|сам карта ВНЖ|оплачиваемой работы application|дополнительные требования дополнительная защита|пород пород/);
  assert.doesNotMatch(text, /Для статус беженца|Для дополнительная защита/);
});

test('Netherlands is active and has a complete Quality of Life entry', async () => {
  const [active, quality] = await Promise.all([
    readFile(new URL('../data/active-countries.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../data/quality-of-life-ru.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  assert.equal(active.some(({ code }) => code === 'NL'), true);
  assert.equal(quality.countries.NL.score, 8.6);
  assert.ok(quality.countries.NL.narrative_ru.length >= 6);
});
