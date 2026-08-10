import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ACTIVE_CANON_REVISION,
  ACTIVE_RESEARCH_SCHEMA_VERSION,
  assertActiveResearchPackage,
  calculateActiveCountry,
  calculateFamilyThreshold,
  combineFinancialAlternatives,
  compareFinancialAmount,
  evaluateEngineRule,
  evaluateFinancialRequirement,
  evaluateFamilyScenarios,
  evaluateRoute,
} from '../js/engine/rp4-engine.js';

const FIXTURE_SHA256 = '7b07859dfd5bd88c6ff92446ece8f1d90f75fd8846f0a17c94a7de6bc02b23ae';
const fixtureBytes = await readFile(new URL('./fixtures/ES_REGRESSION_EXPECTATIONS_v4.0.json', import.meta.url));
const fixture = JSON.parse(fixtureBytes);
const spain = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));
const context = { fx: { base_currency: 'USD', rates: { EUR: 0.9, USD: 1 }, as_of: '2026-08-09', source: 'test' } };

const canonicalCase = (caseId) => {
  const value = fixture.cases.find(({ case_id }) => case_id === caseId);
  assert.ok(value, `canonical fixture case ${caseId}`);
  return value;
};
const incomeSource = (owner, type, amount, currency = 'EUR', countryId = 'US', geography = 'SINGLE_COUNTRY') => ({
  owner, type, source_geography: geography, country_id: geography === 'SINGLE_COUNTRY' ? countryId : null,
  monthly_provable: { amount, currency },
});
const profile = ({ applicantAmount = 4000, applicantCurrency = 'EUR', applicantType = 'REMOTE_EMPLOYMENT',
  applicantCountryId = 'US', applicantGeography = 'SINGLE_COUNTRY', additionalSources = [],
  partnerAmount = null, savings = null, capital = null, adults = 1, children = 0, childAges = null,
  partnerIncluded = adults === 2, relationshipType = partnerIncluded ? 'MARRIED' : null, schoolNeeded = null } = {}) => ({
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  family: {
    adults_count: adults,
    adult_ages: Array(adults).fill(35),
    partner_included: partnerIncluded,
    relationship_type: partnerIncluded ? relationshipType : null,
    children: (childAges || Array(children).fill(7)).map((age) => ({ age_years: age })),
    school_needed: (childAges ? childAges.length : children) > 0 && Boolean(schoolNeeded),
  },
  income: {
    primary: incomeSource('APPLICANT', applicantType, applicantAmount, applicantCurrency, applicantCountryId, applicantGeography),
    additional_sources: additionalSources,
    partner: { has_income: partnerAmount != null, sources: partnerAmount == null ? [] : [incomeSource('PARTNER', 'REMOTE_EMPLOYMENT', partnerAmount)] },
    savings,
  },
  investment_capital: capital,
  goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
});
const route = (requirements, extra = {}) => ({ route_id: 'TEST', name_ru: 'Test', publishable: true, requirements, ...extra });
const familyScenario = (extra = {}) => ({
  scenario_id: 'FAM', applies_to: 'PARTNER_AND_CHILDREN',
  relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'],
  child_age_min: null, child_age_max: null, simultaneous_move: 'YES', separate_route_required: false,
  linked_route_id: null, join_stage: 'WITH_INITIAL_APPLICATION', separation_months_min: null,
  separation_months_max: null, member_long_term_path: null, condition_ru: 'Выполнить семейное условие.',
  source_ids: ['SRC'], ...extra,
});
const requirement = (extra = {}) => ({
  requirement_id: 'REQ', type: 'OTHER_BASIS', evaluation_mode: 'ENGINE', unmet_effect: 'BLOCKS',
  condition_ru: 'Выполнить требование.', met_ru: 'Выполнено.', unmet_ru: 'Не выполнено.',
  profile_path: 'CURRENT_COUNTRY', engine_rule: { operator: 'EQUALS', value: 'RU' }, ...extra,
});
const alternative = (kind, asked = true, extra = {}) => ({
  kind, asked_in_questionnaire: asked, amount: 1000, currency: 'EUR', period: 'MONTHLY', comparison: 'AT_LEAST',
  history_months: null, allowed_income_types: kind === 'INCOME' ? ['REMOTE_EMPLOYMENT'] : null,
  source_geography: kind === 'INCOME' ? 'FOREIGN' : 'NOT_APPLICABLE', family_formula_ru: null,
  source_ids: ['SRC'], confidence: 'HIGH', ...(kind === 'INCOME' ? { income_owners: ['APPLICANT'] } : {}), ...extra,
});
const finance = (model, alternatives, financialExtra = {}, requirementExtra = {}) => requirement({
  requirement_id: `FIN_${model}`, type: 'FINANCIAL', engine_rule: undefined,
  financial: { model, alternatives, ...financialExtra }, ...requirementExtra,
});
const financialState = (model, alternatives, input = profile(), financialExtra = {}) =>
  evaluateFinancialRequirement(finance(model, alternatives, financialExtra), input, context, 'ES');

test('repository regression fixture has pinned canonical provenance', () => {
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), FIXTURE_SHA256);
  assert.equal(fixture.rules_version, '4.0');
  assert.equal(fixture.canonical_version, ACTIVE_RESEARCH_SCHEMA_VERSION);
  assert.equal(fixture.canon_revision, ACTIVE_CANON_REVISION);
});

test('active contract accepts only Final Lock Research Package 4.0 without fallback', () => {
  assert.equal(ACTIVE_RESEARCH_SCHEMA_VERSION, '4.0');
  assert.equal(ACTIVE_CANON_REVISION, '2026-08-08-final-lock');
  assert.doesNotThrow(() => assertActiveResearchPackage(spain));
  assert.throws(() => assertActiveResearchPackage({ ...spain, schema_version: '3.0' }), /schema_version 4\.0/);
  assert.throws(() => assertActiveResearchPackage({ ...spain, canon_revision: 'draft' }), /2026-08-08-final-lock/);
});

test('DISPLAY_ONLY, UNASKED_CONDITION, and ENGINE keep their distinct status effects', () => {
  const display = evaluateRoute(route([requirement({ evaluation_mode: 'DISPLAY_ONLY', engine_rule: undefined })]), profile(), context, 'ES');
  assert.equal(display.routeStatus, 'SUITABLE');
  assert.equal(display.displayOnlyRequirements.length, 1);
  const unasked = evaluateRoute(route([requirement({ evaluation_mode: 'UNASKED_CONDITION', engine_rule: undefined, unmet_effect: 'BECOMES_CONDITION' })]), profile(), context, 'ES');
  assert.equal(unasked.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(unasked.conditions.length, 1);
  assert.equal(evaluateRoute(route([requirement()]), profile(), context, 'ES').routeStatus, 'SUITABLE');
});

test('ENGINE operators are generic and unknown is distinct from failure', () => {
  assert.equal(evaluateEngineRule({ operator: 'EQUALS', value: 'RU' }, 'RU'), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'IN', values: ['RU', 'AR'] }, 'RU'), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'AT_LEAST', value: 18 }, 20), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'AT_MOST', value: 65 }, 20), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'NON_EMPTY' }, ['RU']), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'EQUALS', value: 'RU' }, undefined), 'UNKNOWN');
});

test('requirements alone determine status; legacy contributors and research gaps are ignored', () => {
  const result = evaluateRoute(route([requirement()], {
    detail_tables: { applicationChecks: ['fail'], familyChecks: ['fail'], goalChecks: ['fail'] },
    open_items: ['gap'], completeness: { status: 'gap' },
  }), profile(), context, 'ES');
  assert.equal(result.routeStatus, 'SUITABLE');
  assert.equal(result.conditions.length, 0);
});

test('unmet_effect maps final FAIL to blocker, condition, or no effect', () => {
  const failing = { operator: 'EQUALS', value: 'ES' };
  assert.equal(evaluateRoute(route([requirement({ engine_rule: failing, unmet_effect: 'BLOCKS' })]), profile(), context, 'ES').routeStatus, 'UNSUITABLE');
  assert.equal(evaluateRoute(route([requirement({ engine_rule: failing, unmet_effect: 'BECOMES_CONDITION' })]), profile(), context, 'ES').routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(evaluateRoute(route([requirement({ engine_rule: failing, unmet_effect: 'NONE' })]), profile(), context, 'ES').routeStatus, 'SUITABLE');
});

test('comparison semantics are explicit and never silently default to AT_LEAST', () => {
  assert.equal(compareFinancialAmount('AT_LEAST', 1000, 1000), 'PASS');
  assert.equal(compareFinancialAmount('MORE_THAN', 1000, 1000), 'FAIL');
  assert.equal(compareFinancialAmount('MORE_THAN', 1001, 1000), 'PASS');
  assert.equal(compareFinancialAmount('EXACT', 1000, 1000), 'PASS');
  assert.equal(compareFinancialAmount('EXACT', 1000.01, 1000), 'FAIL');
  assert.equal(compareFinancialAmount('NO_FIXED_THRESHOLD', 1000, 1000), 'UNKNOWN');
  assert.equal(compareFinancialAmount('OFFICIAL_FORMULA', 1000, 1000), 'UNSUPPORTED');
  assert.equal(compareFinancialAmount('FUTURE_OPERATOR', 999999, 1), 'UNSUPPORTED');
  assert.equal(compareFinancialAmount('AT_LEAST', 1000, null), 'UNKNOWN');
});

test('unsupported financial kind is UNKNOWN even when marked asked', () => {
  const item = financialState('SPONSOR_OR_SCHOLARSHIP', [alternative('SPONSOR', true)]);
  assert.equal(item.state, 'UNKNOWN');
  assert.equal(item.alternatives[0].unsupported, true);
});

test('unsupported active ENGINE semantics raise a developer contract error, not a user status', () => {
  const unsupported = finance('SPONSOR_OR_SCHOLARSHIP', [alternative('SPONSOR', true)]);
  assert.throws(() => evaluateRoute(route([unsupported]), profile(), context, 'ES'), (error) => {
    assert.equal(error.code, 'RP4_EVALUATION_UNSUPPORTED');
    return true;
  });
});

test('INCOME_ONLY matrix covers PASS, FAIL, and UNKNOWN', () => {
  assert.equal(financialState('INCOME_ONLY', [alternative('INCOME')]).state, 'PASS');
  assert.equal(financialState('INCOME_ONLY', [alternative('INCOME', true, { amount: 5000 })]).state, 'FAIL');
  assert.equal(financialState('INCOME_ONLY', [alternative('INCOME', false)]).state, 'UNKNOWN');
});

test('SAVINGS_ONLY matrix covers PASS, FAIL, and UNKNOWN', () => {
  assert.equal(financialState('SAVINGS_ONLY', [alternative('SAVINGS')], profile({ savings: { amount: 2000, currency: 'EUR' } })).state, 'PASS');
  assert.equal(financialState('SAVINGS_ONLY', [alternative('SAVINGS')], profile({ savings: { amount: 500, currency: 'EUR' } })).state, 'FAIL');
  assert.equal(financialState('SAVINGS_ONLY', [alternative('SAVINGS')]).state, 'UNKNOWN');
});

test('INCOME_OR_SAVINGS implements complete OR matrix', () => {
  assert.equal(financialState('INCOME_OR_SAVINGS', [alternative('INCOME'), alternative('SAVINGS', false)]).state, 'PASS');
  assert.equal(financialState('INCOME_OR_SAVINGS', [alternative('INCOME', true, { amount: 5000 }), alternative('SAVINGS')], profile({ savings: { amount: 2000, currency: 'EUR' } })).state, 'PASS');
  assert.equal(financialState('INCOME_OR_SAVINGS', [alternative('INCOME', true, { amount: 5000 }), alternative('SAVINGS', false)]).state, 'UNKNOWN');
  assert.equal(financialState('INCOME_OR_SAVINGS', [alternative('INCOME', true, { amount: 5000 }), alternative('SAVINGS')], profile({ savings: { amount: 500, currency: 'EUR' } })).state, 'FAIL');
});

test('INCOME_AND_SAVINGS implements complete AND matrix', () => {
  const passSavings = profile({ savings: { amount: 2000, currency: 'EUR' } });
  const failSavings = profile({ savings: { amount: 500, currency: 'EUR' } });
  assert.equal(financialState('INCOME_AND_SAVINGS', [alternative('INCOME'), alternative('SAVINGS')], passSavings).state, 'PASS');
  assert.equal(financialState('INCOME_AND_SAVINGS', [alternative('INCOME'), alternative('SAVINGS', false)]).state, 'UNKNOWN');
  assert.equal(financialState('INCOME_AND_SAVINGS', [alternative('INCOME'), alternative('SAVINGS')], failSavings).state, 'FAIL');
  assert.equal(financialState('INCOME_AND_SAVINGS', [alternative('INCOME', true, { amount: 5000 }), alternative('SAVINGS')], passSavings).state, 'FAIL');
});

test('INCOME_WITH_SAVINGS_SHORTFALL implements full matrix and exact Canon formula', () => {
  const threshold = 5000;
  const coverageMonths = 36;
  assert.equal(financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: threshold })], profile({ applicantAmount: threshold }), { shortfall_coverage: { coverage_months: coverageMonths } }).state, 'PASS');
  const sufficient = financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: threshold })], profile({ applicantAmount: 4000, savings: { amount: 36000, currency: 'EUR' } }), { shortfall_coverage: { coverage_months: coverageMonths } });
  assert.equal(sufficient.alternatives[0].shortfall, Math.max(0, threshold - 4000) * coverageMonths);
  assert.equal(sufficient.state, 'PASS');
  assert.equal(financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: threshold })], profile({ applicantAmount: 4000, savings: { amount: 35999, currency: 'EUR' } }), { shortfall_coverage: { coverage_months: coverageMonths } }).state, 'FAIL');
  assert.equal(financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: threshold })], profile({ applicantAmount: 4000 }), { shortfall_coverage: { coverage_months: coverageMonths } }).state, 'UNKNOWN');
});

test('INVESTMENT_CAPITAL matrix covers PASS, FAIL, and UNKNOWN', () => {
  assert.equal(financialState('INVESTMENT_CAPITAL', [alternative('CAPITAL')], profile({ capital: { amount: 2000, currency: 'EUR' } })).state, 'PASS');
  assert.equal(financialState('INVESTMENT_CAPITAL', [alternative('CAPITAL')], profile({ capital: { amount: 500, currency: 'EUR' } })).state, 'FAIL');
  assert.equal(financialState('INVESTMENT_CAPITAL', [alternative('CAPITAL')]).state, 'UNKNOWN');
});

test('SPONSOR_OR_SCHOLARSHIP is OR and absent structured facts never become FAIL', () => {
  assert.equal(combineFinancialAlternatives([{ state: 'PASS' }, { state: 'UNKNOWN' }]), 'PASS');
  assert.equal(financialState('SPONSOR_OR_SCHOLARSHIP', [alternative('SPONSOR', false), alternative('SCHOLARSHIP', false)]).state, 'UNKNOWN');
  assert.equal(financialState('SPONSOR_OR_SCHOLARSHIP', [alternative('SPONSOR', true), alternative('SCHOLARSHIP', true)]).state, 'UNKNOWN');
});

test('asked_in_questionnaire=false ignores similar savings and sponsor data', () => {
  assert.equal(financialState('SAVINGS_ONLY', [alternative('SAVINGS', false)], profile({ savings: { amount: 999999, currency: 'EUR' } })).state, 'UNKNOWN');
  assert.equal(financialState('SPONSOR_OR_SCHOLARSHIP', [alternative('SPONSOR', false)], profile()).state, 'UNKNOWN');
});

test('income_owners isolate applicant, partner, and sponsor without automatic sums', () => {
  const mixed = profile({ applicantAmount: 500, partnerAmount: 5000 });
  assert.equal(financialState('INCOME_ONLY', [alternative('INCOME', true, { income_owners: ['APPLICANT'] })], mixed).state, 'FAIL');
  assert.equal(financialState('INCOME_ONLY', [alternative('INCOME', true, { income_owners: ['PARTNER'] })], mixed).state, 'PASS');
  assert.equal(financialState('INCOME_ONLY', [alternative('INCOME', true, { income_owners: ['SPONSOR'] })], mixed).state, 'UNKNOWN');
});

test('income geography matrix is explicit for all research values', () => {
  const state = (research, geography, countryId = 'US') => financialState('INCOME_ONLY', [alternative('INCOME', true, { amount: 1000, source_geography: research })],
    profile({ applicantAmount: 2000, applicantCountryId: countryId, applicantGeography: geography })).state;
  assert.equal(state('FOREIGN', 'SINGLE_COUNTRY', 'US'), 'PASS');
  assert.equal(state('FOREIGN', 'SINGLE_COUNTRY', 'ES'), 'FAIL');
  assert.equal(state('FOREIGN', 'MULTIPLE_COUNTRIES'), 'UNKNOWN');
  assert.equal(state('FOREIGN', 'NO_STABLE_PAYER'), 'UNKNOWN');
  assert.equal(state('DESTINATION_COUNTRY', 'SINGLE_COUNTRY', 'ES'), 'PASS');
  assert.equal(state('DESTINATION_COUNTRY', 'SINGLE_COUNTRY', 'US'), 'FAIL');
  assert.equal(state('DESTINATION_COUNTRY', 'MULTIPLE_COUNTRIES'), 'UNKNOWN');
  for (const research of ['MIXED_ALLOWED', 'ANY', 'NOT_APPLICABLE']) {
    for (const geography of ['SINGLE_COUNTRY', 'MULTIPLE_COUNTRIES', 'NO_STABLE_PAYER']) assert.equal(state(research, geography), 'PASS');
  }
  assert.equal(state('FOREIGN', 'UNRECOGNIZED'), 'UNKNOWN');
});

test('confirmed and unknown-geography income aggregate without false pass or fail', () => {
  const aggregate = (confirmed, unknown) => financialState('INCOME_ONLY', [alternative('INCOME', true, { amount: 5000 })], profile({
    applicantAmount: confirmed,
    additionalSources: [incomeSource('APPLICANT', 'REMOTE_EMPLOYMENT', unknown, 'EUR', null, 'MULTIPLE_COUNTRIES')],
  }));
  assert.equal(aggregate(6000, 2000).state, 'PASS');
  assert.equal(aggregate(4000, 2000).state, 'UNKNOWN');
  assert.equal(aggregate(3000, 1000).state, 'FAIL');
  const forbidden = financialState('INCOME_ONLY', [alternative('INCOME', true, { amount: 1 })], profile({
    applicantAmount: 0,
    additionalSources: [incomeSource('APPLICANT', 'PENSION', 9000, 'EUR', null, 'MULTIPLE_COUNTRIES')],
  }));
  assert.equal(forbidden.alternatives[0].confirmedAmount, 0);
  assert.equal(forbidden.alternatives[0].unknownGeographyAmount, 0);
  assert.equal(forbidden.state, 'FAIL');
});

test('unknown geography continues savings-shortfall evaluation with a numeric range', () => {
  const input = (confirmed, unknown, savings) => profile({
    applicantAmount: confirmed, savings: savings == null ? null : { amount: savings, currency: 'EUR' },
    additionalSources: [incomeSource('APPLICANT', 'REMOTE_EMPLOYMENT', unknown, 'EUR', null, 'MULTIPLE_COUNTRIES')],
  });
  const result = (confirmed, unknown, savings) => financialState('INCOME_WITH_SAVINGS_SHORTFALL',
    [alternative('INCOME', true, { amount: 5000 })], input(confirmed, unknown, savings), { shortfall_coverage: { coverage_months: 6 } });
  for (const [savings, expected] of [[7000, 'PASS'], [3000, 'UNKNOWN'], [null, 'UNKNOWN'], [6000, 'PASS'], [0, 'UNKNOWN']]) {
    assert.equal(result(4000, 2000, savings).state, expected);
  }
  const rangeA = result(4000, 2000, 3000).alternatives[0];
  assert.equal(rangeA.minimumShortfall, 0);
  assert.equal(rangeA.maximumShortfall, 6000);
  for (const [savings, expected] of [[13000, 'PASS'], [5000, 'FAIL'], [8000, 'UNKNOWN'], [12000, 'PASS'], [6000, 'UNKNOWN']]) {
    assert.equal(result(3000, 1000, savings).state, expected);
  }
  const rangeB = result(3000, 1000, 8000).alternatives[0];
  assert.equal(rangeB.minimumShortfall, 6000);
  assert.equal(rangeB.maximumShortfall, 12000);
  const otherUnknown = financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', false, { amount: 5000 })], profile(), { shortfall_coverage: { coverage_months: 6 } });
  assert.equal(otherUnknown.state, 'UNKNOWN');
  assert.equal('minimumShortfall' in otherUnknown.alternatives[0], false);
  const unsupported = financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: 5000, comparison: 'OFFICIAL_FORMULA' })], profile(), { shortfall_coverage: { coverage_months: 6 } });
  assert.equal(unsupported.state, 'UNKNOWN');
  assert.equal(unsupported.unsupported, true);
  assert.equal('minimumShortfall' in unsupported.alternatives[0], false);
});

test('route preserves requirement and evaluation conditions in order without duplicates', () => {
  const requirementCondition = 'Подтвердить собственное финансовое условие маршрута.';
  const geographyCondition = 'Подтвердить, что учитываемые для финансового требования выплаты поступают из-за пределов страны назначения.';
  const unknownGeography = profile({ applicantAmount: 6000, applicantGeography: 'MULTIPLE_COUNTRIES', applicantCountryId: null });
  const financial = finance('INCOME_ONLY', [alternative('INCOME', true, { amount: 5000 })], {}, { condition_ru: requirementCondition });
  const result = evaluateRoute(route([financial]), unknownGeography, context, 'ES');
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.deepEqual(result.conditions, [requirementCondition, geographyCondition]);
  assert.equal(result.conditions.filter((text) => text === requirementCondition).length, 1);
  assert.equal(result.conditions.filter((text) => text === geographyCondition).length, 1);

  const duplicate = evaluateRoute(route([finance('INCOME_ONLY', [alternative('INCOME', true, { amount: 5000 })], {}, { condition_ru: geographyCondition })]), unknownGeography, context, 'ES');
  assert.deepEqual(duplicate.conditions, [geographyCondition]);
});

test('Spain DNV distinguishes known and unknown income geography', () => {
  const dnv = (input) => calculateActiveCountry(input, spain, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.equal(dnv(profile({ applicantAmount: 6000, applicantCountryId: 'US' })).routeStatus, 'SUITABLE');
  assert.equal(dnv(profile({ applicantAmount: 6000, applicantCountryId: 'ES' })).routeStatus, 'SUITABLE_WITH_CONDITIONS');
  for (const geography of ['MULTIPLE_COUNTRIES', 'NO_STABLE_PAYER']) {
    const result = dnv(profile({ applicantAmount: 6000, applicantGeography: geography, applicantCountryId: null }));
    assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.ok(result.conditions.includes('Подтвердить, что учитываемые для финансового требования выплаты поступают из-за пределов страны назначения.'));
  }
  const materiallyUnknown = dnv(profile({
    applicantAmount: 1000,
    applicantCountryId: 'US',
    additionalSources: [incomeSource('APPLICANT', 'REMOTE_EMPLOYMENT', 5000, 'EUR', null, 'MULTIPLE_COUNTRIES')],
  }));
  assert.equal(materiallyUnknown.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.deepEqual(materiallyUnknown.conditions, [
    'Подтвердить семейный финансовый порог; дефицит можно покрыть ликвидными накоплениями за 36 месяцев.',
    'Подтвердить, что учитываемые для финансового требования выплаты поступают из-за пределов страны назначения.',
  ]);
  const sufficient = dnv(profile({
    applicantAmount: 6000,
    additionalSources: [incomeSource('APPLICANT', 'REMOTE_EMPLOYMENT', 1000, 'EUR', null, 'MULTIPLE_COUNTRIES')],
  }));
  assert.equal(sufficient.routeStatus, 'SUITABLE');
  assert.equal(sufficient.conditions.some((text) => text.includes('поступают из-за пределов')), false);
});

test('generic family evaluator covers solo, partner paths, timing, and linked routes', () => {
  const solo = evaluateFamilyScenarios({ family_scenarios: [familyScenario()] }, profile(), []);
  assert.equal(solo.state, 'NOT_APPLICABLE');
  assert.equal(solo.classification, 'SOLO');

  const partner = profile({ adults: 2 });
  assert.equal(evaluateFamilyScenarios({ family_scenarios: [familyScenario()] }, partner, []).state, 'PASS');
  const alternate = evaluateFamilyScenarios({ family_scenarios: [
    familyScenario({ scenario_id: 'FIRST', relationship_types: ['REGISTERED_PARTNERSHIP'] }),
    familyScenario({ scenario_id: 'SECOND' }),
  ] }, partner, []);
  assert.equal(alternate.state, 'PASS');
  assert.deepEqual(alternate.applicableScenarioIds, ['SECOND']);

  const relationship = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ relationship_types: ['REGISTERED_PARTNERSHIP'] })] }, partner, []);
  assert.equal(relationship.state, 'CONDITION');
  const conditional = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ simultaneous_move: 'CONDITIONAL' })] }, partner, []);
  assert.equal(conditional.classification, 'CONDITIONAL_SIMULTANEOUS');
  const later = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ simultaneous_move: 'NO', join_stage: 'AFTER_INITIAL_RESIDENCE' })] }, partner, []);
  assert.equal(later.state, 'CONDITION');
  assert.equal(later.classification, 'LATER_JOIN');
  const linked = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ separate_route_required: true, linked_route_id: 'LINKED', join_stage: 'SEPARATE_ROUTE' })] }, partner, [{ route_id: 'LINKED' }]);
  assert.equal(linked.state, 'CONDITION');
  assert.equal(linked.classification, 'SEPARATE_LINKED_ROUTE');
  assert.deepEqual(linked.linkedRouteIds, ['LINKED']);
});

test('reliable alternative family paths outrank damaged scenarios', () => {
  const partner = profile({ adults: 2 });
  const damaged = familyScenario({ scenario_id: 'DAMAGED', simultaneous_move: 'NOT_RESEARCHED' });
  const passing = familyScenario({ scenario_id: 'PASSING' });
  const conditional = familyScenario({ scenario_id: 'CONDITIONAL', simultaneous_move: 'CONDITIONAL' });
  const passResult = evaluateFamilyScenarios({ family_scenarios: [damaged, passing] }, partner, []);
  assert.equal(passResult.state, 'PASS');
  assert.deepEqual(passResult.applicableScenarioIds, ['PASSING']);
  const conditionResult = evaluateFamilyScenarios({ family_scenarios: [damaged, conditional] }, partner, []);
  assert.equal(conditionResult.state, 'CONDITION');
  assert.deepEqual(conditionResult.applicableScenarioIds, ['CONDITIONAL']);
  assert.equal(evaluateFamilyScenarios({ family_scenarios: [damaged] }, partner, []).state, 'DATA_CONTRACT_PROBLEM');
});

test('relationship mismatch creates only canonical formalization conditions', () => {
  const unregistered = profile({ adults: 2, relationshipType: 'UNREGISTERED_PARTNERSHIP' });
  const married = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ relationship_types: ['MARRIED'] })] }, unregistered, []);
  assert.equal(married.state, 'CONDITION');
  assert.equal(married.classification, 'SIMULTANEOUS');
  assert.deepEqual(married.conditions, ['Для этого маршрута потребуется оформить признаваемый брак.']);
  const registered = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ relationship_types: ['REGISTERED_PARTNERSHIP'] })] }, unregistered, []);
  assert.deepEqual(registered.conditions, ['Для этого маршрута потребуется оформить признаваемое зарегистрированное партнёрство.']);
  const either = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP'] })] }, unregistered, []);
  assert.deepEqual(either.conditions, ['Для этого маршрута потребуется оформить одну из признаваемых форм отношений: брак или зарегистрированное партнёрство.']);

  const mismatchOnlyUnregistered = familyScenario({ scenario_id: 'ONLY_UNREGISTERED', relationship_types: ['UNREGISTERED_PARTNERSHIP'] });
  assert.equal(evaluateFamilyScenarios({ family_scenarios: [mismatchOnlyUnregistered] }, profile({ adults: 2, relationshipType: 'MARRIED' }), []).state, 'DATA_CONTRACT_PROBLEM');
  const operational = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ relationship_types: ['MARRIED'], simultaneous_move: 'CONDITIONAL' })] }, unregistered, []);
  assert.deepEqual(operational.conditions, [
    'Для этого маршрута потребуется оформить признаваемый брак.',
    'Выполнить семейное условие.',
  ]);
  assert.equal(operational.classification, 'CONDITIONAL_SIMULTANEOUS');
});

test('synthetic profile helper follows production school-needed semantics', () => {
  assert.equal(profile({ children: 1 }).family.school_needed, false);
  assert.equal(profile({ children: 1, schoolNeeded: false }).family.school_needed, false);
  assert.equal(profile({ children: 1, schoolNeeded: true }).family.school_needed, true);
  assert.equal(profile({ children: 0, schoolNeeded: true }).family.school_needed, false);
});

test('generic family evaluator checks every child and exact scenario IDs', () => {
  const family = profile({ adults: 2, childAges: [5, 17] });
  const scenarios = [
    familyScenario({ scenario_id: 'YOUNG', applies_to: 'CHILD', relationship_types: null, child_age_min: 0, child_age_max: 10 }),
    familyScenario({ scenario_id: 'OLDER', applies_to: 'CHILD', relationship_types: null, child_age_min: 11, child_age_max: 20, simultaneous_move: 'CONDITIONAL' }),
    familyScenario({ scenario_id: 'PARTNER', applies_to: 'PARTNER' }),
    familyScenario({ scenario_id: 'OTHER', applies_to: 'OTHER_ADULT', relationship_types: null }),
  ];
  const result = evaluateFamilyScenarios({ family_scenarios: scenarios }, family, []);
  assert.equal(result.state, 'CONDITION');
  assert.deepEqual(result.applicableScenarioIds.sort(), ['OLDER', 'PARTNER', 'YOUNG']);
  assert.equal(result.memberResults.length, 3);
  assert.equal(result.memberResults.find(({ memberId }) => memberId === 'CHILD_1').state, 'PASS');
  assert.equal(result.memberResults.find(({ memberId }) => memberId === 'CHILD_2').state, 'CONDITION');

  const combined = evaluateFamilyScenarios({ family_scenarios: [familyScenario({ scenario_id: 'COMBINED' })] }, family, []);
  assert.equal(combined.state, 'PASS');
  assert.equal(combined.memberResults.length, 3);
  assert.deepEqual(combined.applicableScenarioIds, ['COMBINED']);
});

test('family data contract problems are route-local and never become public statuses', () => {
  const partner = profile({ adults: 2 });
  const problem = (scenario, packageRoutes = []) => evaluateFamilyScenarios({ family_scenarios: Array.isArray(scenario) ? scenario : [scenario] }, partner, packageRoutes);
  assert.equal(problem(familyScenario({ simultaneous_move: 'NOT_RESEARCHED' })).state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(problem(familyScenario({ join_stage: 'NOT_AVAILABLE' })).state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(problem(familyScenario({ separate_route_required: true, linked_route_id: 'MISSING', join_stage: 'SEPARATE_ROUTE' })).state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(problem(familyScenario({ applies_to: 'CHILD', relationship_types: null })).state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(problem([familyScenario({ scenario_id: 'DUP' }), familyScenario({ scenario_id: 'DUP' })]).state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(evaluateFamilyScenarios({ family_scenarios: [familyScenario({ scenario_id: 'DUP' }), familyScenario({ scenario_id: 'DUP' })] }, profile(), []).state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(evaluateFamilyScenarios({ family_scenarios: [familyScenario({ scenario_id: 'SAME' })] }, partner, []).state, 'PASS');
  assert.equal(evaluateFamilyScenarios({ family_scenarios: [familyScenario({ scenario_id: 'SAME' })] }, partner, []).state, 'PASS');

  const childGap = evaluateFamilyScenarios({ family_scenarios: [
    familyScenario({ applies_to: 'PARTNER' }),
    familyScenario({ scenario_id: 'BABY', applies_to: 'CHILD', relationship_types: null, child_age_min: 0, child_age_max: 5 }),
  ] }, profile({ adults: 2, childAges: [4, 13] }), []);
  assert.equal(childGap.state, 'DATA_CONTRACT_PROBLEM');
  assert.equal(childGap.memberResults.find(({ memberId }) => memberId === 'CHILD_2').state, 'DATA_CONTRACT_PROBLEM');
});

test('family exclusions happen before best-route selection and support zero evaluable routes', () => {
  const base = spain.routes.find(({ route_id }) => route_id === 'ES_DNV');
  const good = { ...base, route_id: 'GOOD', family_scenarios: [familyScenario({ scenario_id: 'GOOD_FAM' })] };
  const bad = { ...base, route_id: 'BAD', family_scenarios: [familyScenario({ scenario_id: 'DUP' }), familyScenario({ scenario_id: 'DUP' })] };
  const pkg = (routes) => ({ ...spain, routes });
  const mixed = calculateActiveCountry(profile({ adults: 2, applicantAmount: 6000 }), pkg([bad, good]), context);
  assert.deepEqual(mixed.routes.map(({ routeId }) => routeId), ['GOOD']);
  assert.equal(mixed.bestRoute.routeId, 'GOOD');
  assert.deepEqual(mixed.excludedRoutes.map(({ routeId }) => routeId), ['BAD']);

  const empty = calculateActiveCountry(profile({ adults: 2, applicantAmount: 6000 }), pkg([bad]), context);
  assert.deepEqual(empty.routes, []);
  assert.equal(empty.bestRoute, null);
  assert.equal(empty.evaluationState, 'NO_EVALUABLE_ROUTES');
  assert.equal(empty.country.group, null);

  const referencing = { ...good, route_id: 'REF', family_scenarios: [familyScenario({ scenario_id: 'REF_FAM', separate_route_required: true, linked_route_id: 'BAD', join_stage: 'SEPARATE_ROUTE' })] };
  const noCascade = calculateActiveCountry(profile({ adults: 2, applicantAmount: 6000 }), pkg([referencing, bad]), context);
  assert.deepEqual(noCascade.routes.map(({ routeId }) => routeId), ['REF']);
  assert.deepEqual(noCascade.routes[0].familyEvaluation.linkedRouteIds, ['BAD']);
});

test('family conditions extend existing conditions and deduplicate identical text', () => {
  const base = spain.routes.find(({ route_id }) => route_id === 'ES_DNV');
  const existingText = 'Существующее условие requirement.';
  const familyText = 'Отдельное семейное условие.';
  const source = {
    ...base,
    route_id: 'CONDITIONS',
    requirements: [requirement({ evaluation_mode: 'UNASKED_CONDITION', engine_rule: undefined, unmet_effect: 'BECOMES_CONDITION', condition_ru: existingText })],
    family_scenarios: [familyScenario({ simultaneous_move: 'CONDITIONAL', condition_ru: familyText })],
  };
  const result = calculateActiveCountry(profile({ adults: 2 }), { ...spain, routes: [source] }, context).routes[0];
  assert.deepEqual(result.conditions, [existingText, familyText]);
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  const duplicate = { ...source, family_scenarios: [familyScenario({ simultaneous_move: 'CONDITIONAL', condition_ru: existingText })] };
  assert.deepEqual(calculateActiveCountry(profile({ adults: 2 }), { ...spain, routes: [duplicate] }, context).routes[0].conditions, [existingText]);
});

test('Spain family acceptance matches Final Lock scenarios without family exclusions', () => {
  const familyResult = calculateActiveCountry(profile({ adults: 2, childAges: [13], applicantAmount: 6000 }), spain, context);
  const byState = (state) => familyResult.routes.filter(({ familyEvaluation }) => familyEvaluation.state === state).map(({ routeId }) => routeId).sort();
  assert.equal(familyResult.routes.length, 14);
  assert.equal(familyResult.excludedRoutes.length, 0);
  assert.deepEqual(byState('PASS'), ['ES_AUDIOVISUAL', 'ES_DNV', 'ES_ENT', 'ES_FAM_SP', 'ES_HQP_BLUE', 'ES_HQP_NATIONAL', 'ES_ICT', 'ES_NLV', 'ES_RESEARCHER'].sort());
  assert.deepEqual(byState('CONDITION'), ['ES_EMP', 'ES_PROTECTION', 'ES_REUN', 'ES_SELF', 'ES_STUDY'].sort());
  assert.equal(familyResult.routes.some(({ routeStatus }) => !['SUITABLE', 'SUITABLE_WITH_CONDITIONS', 'UNSUITABLE'].includes(routeStatus)), false);
  assert.deepEqual(familyResult.routes.find(({ routeId }) => routeId === 'ES_EMP').familyEvaluation.linkedRouteIds, ['ES_REUN']);
  const dnvPresentation = familyResult.routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.equal(dnvPresentation.family[0].scenarioId, 'ES_DNV_FAM');
  assert.deepEqual(dnvPresentation.familyEvaluation.applicableScenarioIds, ['ES_DNV_FAM']);
  assert.deepEqual(familyResult.routes.find(({ routeId }) => routeId === 'ES_SELF').familyEvaluation.linkedRouteIds, ['ES_REUN']);
  for (const [routeId, scenarioId] of [['ES_STUDY', 'ES_STUDY_FAM'], ['ES_PROTECTION', 'ES_PROT_FAM']]) {
    const item = familyResult.routes.find((routeResult) => routeResult.routeId === routeId);
    assert.deepEqual(item.familyEvaluation.applicableScenarioIds, [scenarioId]);
    assert.equal(item.family.find((scenario) => scenario.scenarioId === scenarioId).simultaneousMove, 'CONDITIONAL');
  }
  assert.ok(familyResult.routes.find(({ routeId }) => routeId === 'ES_REUN').familyEvaluation.joinStages.includes('AFTER_INITIAL_RESIDENCE'));
  assert.equal(dnvPresentation.routeStatus, 'SUITABLE');
  assert.deepEqual(dnvPresentation.conditions, []);

  const soloResult = calculateActiveCountry(profile({ applicantAmount: 6000 }), spain, context);
  assert.equal(soloResult.routes.length, 14);
  assert.equal(soloResult.excludedRoutes.length, 0);
  assert.equal(soloResult.routes.every(({ familyEvaluation }) => familyEvaluation.state === 'NOT_APPLICABLE'), true);
  assert.equal(soloResult.routes.every(({ familyEvaluation }) => familyEvaluation.conditions.length === 0), true);
});

test('FX conversion returns 5400 EUR for 6000 USD and preserves below/above threshold', () => {
  const threshold = alternative('INCOME', true, { amount: 5000 });
  const exact = financialState('INCOME_ONLY', [threshold], profile({ applicantAmount: 6000, applicantCurrency: 'USD' }));
  assert.equal(exact.alternatives[0].amount, 5400);
  assert.equal(exact.state, 'PASS');
  assert.equal(financialState('INCOME_ONLY', [threshold], profile({ applicantAmount: 5500, applicantCurrency: 'USD' })).state, 'FAIL');
  assert.equal(financialState('INCOME_ONLY', [threshold], profile({ applicantAmount: 5600, applicantCurrency: 'USD' })).state, 'PASS');
});

test('family-adjusted Spain DNV threshold uses only applicant foreign-currency income', () => {
  const family = profile({ applicantAmount: 4100, applicantCurrency: 'USD', partnerAmount: 10000, adults: 2, children: 1 });
  const result = calculateActiveCountry(family, spain, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  const financial = result.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ES_DNV_FIN');
  assert.equal(financial.alternatives[0].amount, 3690);
  assert.equal(financial.alternatives[0].threshold, 3663);
  assert.equal(result.routeStatus, 'SUITABLE');
});

test('canonical CASE 1 uses its own applicant-only profile and expected status', () => {
  const canonical = canonicalCase('DNV_EXISTING_REMOTE_WORK_ABOVE_FAMILY_THRESHOLD');
  const input = profile({ applicantAmount: 6000, applicantCurrency: 'USD', partnerAmount: 9000, adults: 2, children: 1 });
  const routeResult = calculateActiveCountry(input, spain, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.equal(routeResult.routeStatus, canonical.expected.ES_DNV);
  const evaluated = routeResult.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ES_DNV_FIN');
  assert.equal(evaluated.alternatives[0].amount, 5400);
  const basis = routeResult.displayOnlyRequirements.find(({ requirement_id }) => requirement_id === 'ES_DNV_BASIS');
  const qualification = routeResult.displayOnlyRequirements.find(({ requirement_id }) => requirement_id === 'ES_DNV_QUAL');
  assert.match(basis.condition_ru, /минимум год/);
  assert.match(basis.condition_ru, /минимум три месяца/);
  assert.match(qualification.condition_ru, /образован/);
  assert.match(qualification.condition_ru, /профессиональн.*опыт/);
});

test('canonical CASE 2 gets its condition from the unasked ICT transfer basis', () => {
  const canonical = canonicalCase('ICT_EXISTING_WORK_NO_TRANSFER_DECISION');
  const result = calculateActiveCountry(profile({ applicantAmount: 2500 }), spain, context).routes.find(({ routeId }) => routeId === 'ES_ICT');
  assert.equal(result.routeStatus, canonical.expected.ES_ICT);
  assert.ok(result.conditions.some((text) => text.includes('внутрикорпоративном переводе')));
});

test('canonical CASE 3 remains conditional without a Spanish offer', () => {
  const canonical = canonicalCase('BLUE_CARD_NO_SPANISH_OFFER');
  const result = calculateActiveCountry(profile({ applicantAmount: 5000 }), spain, context).routes.find(({ routeId }) => routeId === 'ES_HQP_BLUE');
  assert.equal(result.routeStatus, canonical.expected.ES_HQP_BLUE);
  assert.ok(result.conditions.some((text) => text.includes('договор или твёрдую оферту')));
});

test('canonical CASE 4 remains conditional because admission is unasked', () => {
  const canonical = canonicalCase('STUDY_ADMISSION_UNASKED');
  const result = calculateActiveCountry(profile({ applicantAmount: 1000 }), spain, context).routes.find(({ routeId }) => routeId === 'ES_STUDY');
  assert.equal(result.routeStatus, canonical.expected.ES_STUDY);
  assert.ok(result.conditions.some((text) => text.includes('Поступить')));
});

test('canonical CASE 5 excludes the non-publishable internship route', () => {
  const canonical = canonicalCase('INTERNSHIP_BLOCKING_FAMILY_GAP_NOT_PUBLISHED');
  assert.equal(canonical.expected_publishable.ES_INTERNSHIP, false);
  assert.equal(calculateActiveCountry(profile(), spain, context).routes.some(({ routeId }) => routeId === 'ES_INTERNSHIP'), false);
});

test('canonical CASE 6 treats failing active income plus unasked savings as condition', () => {
  const canonical = canonicalCase('NLV_ACTIVE_REMOTE_INCOME_WITH_UNASKED_SAVINGS');
  const result = calculateActiveCountry(profile({ applicantAmount: 5000, applicantType: 'REMOTE_EMPLOYMENT' }), spain, context).routes.find(({ routeId }) => routeId === 'ES_NLV');
  assert.equal(result.routeStatus, canonical.expected.ES_NLV);
  assert.notEqual(result.routeStatus, canonical.must_not_be);
});

test('canonical CASE 9 produces one consistent 43200 EUR family threshold', () => {
  const canonical = canonicalCase('NLV_FAMILY_THRESHOLD_TEXT_AND_CONVERSION_MATCH');
  const nlv = spain.routes.find(({ route_id }) => route_id === 'ES_NLV');
  const savings = nlv.requirements.find(({ requirement_id }) => requirement_id === 'ES_NLV_FIN').financial.alternatives[1];
  const amount = calculateFamilyThreshold(savings, profile({ adults: 2, children: 1 }));
  assert.deepEqual({ amount, currency: savings.currency }, canonical.expected_original_threshold);
});

test('generic route presentation exposes DNV label, official name, details, source, and family threshold', () => {
  const result = calculateActiveCountry(profile({ applicantAmount: 6000, applicantCurrency: 'USD', adults: 2, children: 1 }), spain, context);
  const dnv = result.routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.equal(dnv.routeName, 'Цифровой кочевник (DNV)');
  assert.equal(dnv.routeName.toLocaleLowerCase('ru').includes('виза'), false);
  assert.equal(dnv.routeName.toLocaleLowerCase('ru').includes('международного телеработника'), false);
  assert.equal(dnv.routeOfficialName, 'Autorización de residencia para teletrabajadores de carácter internacional');
  assert.ok(dnv.description.length > 20);
  assert.ok(dnv.application.length > 0);
  assert.ok(dnv.firstPermit.description);
  assert.ok(dnv.family.length > 0);
  assert.ok(dnv.workRights.applicant.length > 0);
  assert.ok(dnv.longTerm.permanentResidence);
  assert.equal(dnv.processing.officialDays, 20);
  assert.match(dnv.officialSource.url, /^https:/);
  const income = dnv.financialSummary.alternatives.find(({ kind }) => kind === 'INCOME');
  assert.equal(income.threshold, 3663);
  assert.equal(income.currency, 'EUR');
  assert.equal(income.thresholdUsd, 4070);
});

test('DISPLAY_ONLY is presentation-only and DNV remains suitable', () => {
  const dnv = calculateActiveCountry(profile({ applicantAmount: 6000, applicantCurrency: 'USD', adults: 2, children: 1 }), spain, context)
    .routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.equal(dnv.routeStatus, 'SUITABLE');
  assert.equal(dnv.conditions.length, 0);
  const text = dnv.displayOnlyRequirements.map(({ condition_ru }) => condition_ru).join(' ');
  assert.match(text, /минимум год/);
  assert.match(text, /минимум три месяца/);
  assert.match(text, /образован/);
  assert.match(text, /профессиональн.*опыт/);
});

test('NLV presentation preserves the same 43200 EUR original family threshold for conversion', () => {
  const nlv = calculateActiveCountry(profile({ adults: 2, children: 1 }), spain, context).routes.find(({ routeId }) => routeId === 'ES_NLV');
  const savings = nlv.financialSummary.alternatives.find(({ kind }) => kind === 'SAVINGS');
  assert.equal(savings.threshold, 43200);
  assert.equal(savings.currency, 'EUR');
  assert.equal(savings.thresholdUsd, 48000);
});

test('Spain cities come from RP4 with deterministic climate labels and no invented zero cost', () => {
  const pkg = { ...spain, cities: [...spain.cities, {
    city_id: 'ES_UNKNOWN', name_ru: 'Неизвестный город', structural_roles: ['SMALL'],
    cost_components: [{ component: 'RENT_STANDARD', amount: null, currency: 'EUR', period: 'MONTHLY', household_basis: 'PER_HOUSEHOLD' }],
    climate: null,
  }] };
  const cities = calculateActiveCountry(profile(), pkg, context).cities;
  assert.ok(cities.length > 0);
  assert.ok(cities.find(({ cityId }) => cityId === 'ES_BURGOS').labels.includes('Самый прохладный'));
  assert.ok(cities.find(({ cityId }) => cityId === 'ES_JAEN').labels.includes('Самый жаркий'));
  assert.equal(cities.find(({ cityId }) => cityId === 'ES_UNKNOWN').costUsd, null);
  assert.equal(cities.every(({ costComparable }) => costComparable === false), true);
});

test('LGBT presentation follows the profile toggle and contains only RP4 fields', () => {
  assert.equal(calculateActiveCountry({ ...profile(), lgbt: { enabled: false } }, spain, context).lgbt, null);
  const visible = calculateActiveCountry({ ...profile(), lgbt: { enabled: true } }, spain, context).lgbt;
  assert.ok(visible);
  assert.equal(visible.practicalExplanation, spain.lgbt.assessment_basis_ru);
  assert.ok(visible.rows.some(([title, text]) => title === 'Однополый брак' && text === spain.lgbt.same_sex_marriage_rule_ru));
});

test('SUITABLE_WITH_CONDITIONS always carries at least one condition', () => {
  for (const item of calculateActiveCountry(profile(), spain, context).routes) {
    if (item.routeStatus === 'SUITABLE_WITH_CONDITIONS') assert.ok(item.conditions.length > 0, item.routeId);
    if (item.conditions.length === 0) assert.notEqual(item.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  }
});
