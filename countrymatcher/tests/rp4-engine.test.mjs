import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ACTIVE_CANON_REVISION,
  ACTIVE_RESEARCH_SCHEMA_VERSION,
  APPLICATION_METHOD_LABELS_RU,
  assertActiveResearchPackage,
  calculateActiveCountry,
  calculateActiveMatcher,
  calculateFamilyThreshold,
  combineFinancialAlternatives,
  compareFinancialAmount,
  evaluateEngineRule,
  evaluateFinancialRequirement,
  evaluateFamilyScenarios,
  evaluateLongTermGoal,
  evaluateRoute,
  FINANCIAL_KIND_LABELS_RU,
  LGBT_LEGAL_LABELS_RU,
  LGBT_PRACTICAL_LABELS_RU,
} from '../js/engine/rp4-engine.js';
import { sortCountriesForDisplay } from '../matcher/profile.js';

const FIXTURE_SHA256 = '7b07859dfd5bd88c6ff92446ece8f1d90f75fd8846f0a17c94a7de6bc02b23ae';
const AR_FIXTURE_SHA256 = 'd7f3d31b218e0e904f8a452182fd2eddb0eef858c24153ccfcc9bfbeef516e90';
const fixtureBytes = await readFile(new URL('./fixtures/ES_REGRESSION_EXPECTATIONS_v4.0.json', import.meta.url));
const fixture = JSON.parse(fixtureBytes);
const arFixtureBytes = await readFile(new URL('./fixtures/AR_REGRESSION_EXPECTATIONS_v4.0.json', import.meta.url));
const arFixture = JSON.parse(arFixtureBytes);
const spain = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));
const argentina = JSON.parse(await readFile(new URL('../data/AR-research-v4.0.json', import.meta.url), 'utf8'));
const uruguay = JSON.parse(await readFile(new URL('../data/UY-research-v4.0.json', import.meta.url), 'utf8'));
const context = { fx: { base_currency: 'USD', rates: { EUR: 0.9, ARS: 1500, UYU: 40, USD: 1 }, as_of: '2026-08-09', source: 'test' } };

const canonicalCase = (caseId) => {
  const value = fixture.cases.find(({ case_id }) => case_id === caseId);
  assert.ok(value, `canonical fixture case ${caseId}`);
  return value;
};
const argentinaCase = (caseId) => {
  const value = arFixture.cases.find(({ case_id }) => case_id === caseId);
  assert.ok(value, `Argentina fixture case ${caseId}`);
  return value;
};
const incomeSource = (owner, type, amount, currency = 'EUR', countryId = 'US', geography = 'SINGLE_COUNTRY') => ({
  owner, type, source_geography: geography, country_id: geography === 'SINGLE_COUNTRY' ? countryId : null,
  monthly_total: { amount, currency },
  monthly_provable: { amount, currency },
});
const profile = ({ applicantAmount = 4000, applicantCurrency = 'EUR', applicantType = 'REMOTE_EMPLOYMENT',
  applicantCountryId = 'US', applicantGeography = 'SINGLE_COUNTRY', additionalSources = [],
  partnerAmount = null, savings = null, capital = null, adults = 1, children = 0, childAges = null,
  partnerIncluded = adults === 2, relationshipType = partnerIncluded ? 'MARRIED' : null, schoolNeeded = null,
  pets = false, longTerm = 'TEMPORARY_RESIDENCE_SUFFICIENT' } = {}) => ({
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
  goal: { long_term: longTerm, keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: pets ? ['DOG', 'CAT'] : ['NONE'], dogs: [], other_pet_notes: null },
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
  assert.equal(createHash('sha256').update(arFixtureBytes).digest('hex'), AR_FIXTURE_SHA256);
  assert.equal(arFixture.country_id, 'AR');
  assert.equal(arFixture.rules_version, '4.0');
  assert.equal(arFixture.canonical_version, ACTIVE_RESEARCH_SCHEMA_VERSION);
  assert.equal(arFixture.canon_revision, ACTIVE_CANON_REVISION);
});

test('long-term goal evaluator follows Final Lock reachability semantics', () => {
  const base = structuredClone(spain.routes.find(({ route_id }) => route_id === 'ES_DNV'));
  const setPath = (values) => ({ ...base, long_term_path: { ...base.long_term_path, ...values } });

  assert.equal(evaluateLongTermGoal(base, profile()).fit, 'MEETS');
  assert.equal(evaluateLongTermGoal(setPath({ pr_path_status: 'DIRECT' }), profile({ longTerm: 'PR_REQUIRED' })).fit, 'MEETS');
  assert.equal(evaluateLongTermGoal(setPath({ pr_path_status: 'AVAILABLE_AFTER_RESIDENCE' }), profile({ longTerm: 'PR_REQUIRED' })).fit, 'MEETS');
  assert.equal(evaluateLongTermGoal(setPath({ pr_path_status: 'REQUIRES_CHANGE_OF_BASIS' }), profile({ longTerm: 'PR_REQUIRED' })).fit, 'UNKNOWN');
  assert.equal(evaluateLongTermGoal(setPath({ pr_path_status: 'NOT_RESEARCHED' }), profile({ longTerm: 'PR_REQUIRED' })).fit, 'UNKNOWN');
  assert.equal(evaluateLongTermGoal(setPath({ pr_path_status: 'NOT_AVAILABLE' }), profile({ longTerm: 'PR_REQUIRED' })).fit, 'DOES_NOT_MEET');

  assert.equal(evaluateLongTermGoal(setPath({ citizenship_path_status: 'AVAILABLE' }), profile({ longTerm: 'CITIZENSHIP_REQUIRED' })).fit, 'MEETS');
  assert.equal(evaluateLongTermGoal(setPath({ citizenship_path_status: 'CONDITIONAL' }), profile({ longTerm: 'CITIZENSHIP_REQUIRED' })).fit, 'UNKNOWN');
  assert.equal(evaluateLongTermGoal(setPath({ citizenship_path_status: 'NOT_RESEARCHED' }), profile({ longTerm: 'CITIZENSHIP_REQUIRED' })).fit, 'UNKNOWN');
  assert.equal(evaluateLongTermGoal(setPath({ citizenship_path_status: 'NOT_AVAILABLE' }), profile({ longTerm: 'CITIZENSHIP_REQUIRED' })).fit, 'DOES_NOT_MEET');
});

test('an explicitly unreachable mandatory long-term goal makes the route unsuitable', () => {
  const base = structuredClone(spain.routes.find(({ route_id }) => route_id === 'ES_DNV'));
  const noPr = {
    ...base,
    route_id: 'NO_PR',
    long_term_path: {
      ...base.long_term_path,
      pr_path_status: 'NOT_AVAILABLE',
      pr_path_ru: 'ПМЖ по этому пути недоступен.',
    },
  };
  const noCitizenship = {
    ...base,
    route_id: 'NO_CITIZENSHIP',
    long_term_path: {
      ...base.long_term_path,
      citizenship_path_status: 'NOT_AVAILABLE',
      citizenship_path_ru: 'Гражданство по этому пути недоступно.',
    },
  };

  const prResult = evaluateRoute(noPr, profile({ applicantAmount: 6000, longTerm: 'PR_REQUIRED' }), context, 'ES');
  assert.equal(prResult.goalFit, 'DOES_NOT_MEET');
  assert.equal(prResult.routeStatus, 'UNSUITABLE');
  assert.deepEqual(prResult.blockers, ['ПМЖ по этому пути недоступен.']);

  const citizenshipResult = evaluateRoute(noCitizenship, profile({ applicantAmount: 6000, longTerm: 'CITIZENSHIP_REQUIRED' }), context, 'ES');
  assert.equal(citizenshipResult.goalFit, 'DOES_NOT_MEET');
  assert.equal(citizenshipResult.routeStatus, 'UNSUITABLE');
  assert.deepEqual(citizenshipResult.blockers, ['Гражданство по этому пути недоступно.']);
});

test('best-route selection prefers a route that closes the mandatory long-term goal', () => {
  const base = structuredClone(spain.routes.find(({ route_id }) => route_id === 'ES_DNV'));
  const unknown = {
    ...base,
    route_id: 'UNKNOWN_PR',
    long_term_path: { ...base.long_term_path, pr_path_status: 'REQUIRES_CHANGE_OF_BASIS' },
  };
  const meets = {
    ...base,
    route_id: 'MEETS_PR',
    long_term_path: { ...base.long_term_path, pr_path_status: 'AVAILABLE_AFTER_RESIDENCE' },
  };
  const pkg = { ...spain, routes: [unknown, meets] };
  const result = calculateActiveCountry(profile({ applicantAmount: 6000, longTerm: 'PR_REQUIRED' }), pkg, context);

  assert.deepEqual(result.routes.map(({ routeId, goalFit }) => [routeId, goalFit]), [
    ['UNKNOWN_PR', 'UNKNOWN'],
    ['MEETS_PR', 'MEETS'],
  ]);
  assert.equal(result.bestRoute.routeId, 'MEETS_PR');
});

test('active contract accepts only Final Lock Research Package 4.0 without fallback', () => {
  assert.equal(ACTIVE_RESEARCH_SCHEMA_VERSION, '4.0');
  assert.equal(ACTIVE_CANON_REVISION, '2026-08-08-final-lock');
  assert.doesNotThrow(() => assertActiveResearchPackage(spain));
  assert.doesNotThrow(() => assertActiveResearchPackage(argentina));
  assert.throws(() => assertActiveResearchPackage({ ...spain, schema_version: '3.0' }), /schema_version 4\.0/);
  assert.throws(() => assertActiveResearchPackage({ ...spain, canon_revision: 'draft' }), /2026-08-08-final-lock/);
});

test('one missing country FX rate produces a country-scoped error while other countries still calculate', () => {
  const input = profile({ applicantAmount: 6000, applicantCurrency: 'USD' });
  const partialContext = { fx: { base_currency: 'USD', rates: { EUR: 0.9 }, as_of: '2026-08-09', source: 'test' } };
  const calculation = calculateActiveMatcher(input, [spain, uruguay], partialContext);
  assert.deepEqual(calculation.results.map(({ country }) => country.countryId), ['ES']);
  assert.deepEqual(calculation.errors, [{
    countryId: 'UY',
    countryName: 'Уругвай',
    code: 'FX_RATE_MISSING',
    currencies: ['UYU'],
    message: 'Расчёт для страны «Уругвай» временно недоступен: нет курса UYU.',
  }]);
});

test('country result records only FX currencies actually used by that country calculation', () => {
  const input = profile({ applicantAmount: 6000, applicantCurrency: 'RUB' });
  const usageContext = { fx: { ...context.fx, rates: { ...context.fx.rates, RUB: 80 } } };
  const calculation = calculateActiveMatcher(input, [spain, uruguay], usageContext);
  const byCountry = new Map(calculation.results.map((result) => [result.country.countryId, result]));
  assert.deepEqual(byCountry.get('ES').fxUsedCurrencies, ['EUR', 'RUB']);
  assert.deepEqual(byCountry.get('UY').fxUsedCurrencies, ['RUB', 'UYU']);
  assert.equal(byCountry.get('ES').fxUsedCurrencies.includes('UYU'), false);
  assert.equal(byCountry.get('UY').fxUsedCurrencies.includes('EUR'), false);
});

test('active matcher calculates real Spain, Argentina, and Uruguay packages through the same country pipeline', () => {
  const input = profile({ applicantAmount: 6000, applicantCurrency: 'USD' });
  const threeCountryContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const one = calculateActiveMatcher(input, [spain], context);
  assert.equal(one.results.length, 1);
  assert.equal(one.results[0].country.countryId, 'ES');
  const three = calculateActiveMatcher(input, [spain, argentina, uruguay], threeCountryContext);
  assert.deepEqual(three.results.map(({ country }) => country.countryId), ['ES', 'AR', 'UY']);
  assert.deepEqual(three.results.map(({ routes }) => routes.length), [11, 8, 7]);
  assert.ok(three.results[2].routes.every(({ routeName }) => typeof routeName === 'string' && routeName.length > 0));
  assert.deepEqual(sortCountriesForDisplay(three.results).map(({ country }) => country.countryId).sort(), ['AR', 'ES', 'UY']);
  assert.throws(() => calculateActiveMatcher(input, spain, context), /must be an array/);
});

test('current public route policy hides narrow supporting routes without hiding broad specialist routes', () => {
  const publication = (pkg, routeId) => pkg.routes.find(({ route_id }) => route_id === routeId)?.publishable;
  for (const routeId of ['ES_FAM_SP', 'ES_REUN', 'ES_ICT']) assert.equal(publication(spain, routeId), false);
  assert.equal(publication(argentina, 'AR_FAMILY'), false);
  assert.equal(publication(uruguay, 'UY_PERMANENT_URUGUAYAN_LINK'), false);
  assert.equal(publication(argentina, 'AR_SPECIALIST_TRANSFER'), true);
  assert.equal(publication(uruguay, 'UY_TEMP_SPECIALIST'), true);
});

test('every active AFTER_APPROVAL display-only fact remains represented without preparation duplication', () => {
  const audited = [spain, argentina, uruguay].flatMap((pkg) => pkg.routes.flatMap((item) =>
    (item.requirements || []).filter(({ evaluation_mode, timing }) => evaluation_mode === 'DISPLAY_ONLY' && timing === 'AFTER_APPROVAL')
      .map((requirement) => ({ pkg, route: item, requirement }))));
  assert.deepEqual(audited.map(({ route, requirement }) => [route.route_id, requirement.requirement_id]), [['ES_NLV', 'ES_NLV_NOWORK']]);
  const { route } = audited[0];
  for (const subject of [route.applicant_work_rights, route.partner_work_rights]) {
    assert.deepEqual(['employment', 'self_employment', 'remote_foreign_work'].map((key) => subject[key].status), ['NOT_ALLOWED', 'NOT_ALLOWED', 'NOT_ALLOWED']);
  }
  const pkg = structuredClone(spain);
  const nlv = calculateActiveCountry(profile({ adults: 2 }), pkg, context).routes.find(({ routeId }) => routeId === 'ES_NLV');
  assert.equal(nlv.displayOnlyRequirements.some(({ requirement_id }) => requirement_id === 'ES_NLV_NOWORK'), false);
  assert.equal(nlv.workRights.applicant.length, 3);
  assert.equal(nlv.workRights.partner.length, 3);
});

test('Argentina SMVM presentation is data-driven from the structured 5 SMVM threshold', () => {
  const arContext = { fx: { ...context.fx, rates: { ...context.fx.rates, ARS: 1500 } } };
  const result = calculateActiveCountry(profile({ applicantType: 'PASSIVE_INCOME', applicantAmount: 1000, applicantCurrency: 'USD' }), argentina, arContext);
  for (const routeId of ['AR_RENTISTA', 'AR_PENSIONADO']) {
    const source = argentina.routes.find(({ route_id }) => route_id === routeId);
    assert.doesNotMatch(source.basis_ru, /1 SMVM\s*=\s*376.?600 ARS/);
    const route = result.routes.find((item) => item.routeId === routeId);
    const item = route.financialSummary.alternatives[0];
    assert.equal(item.requirementLabel, '5 SMVM (МРОТ)');
    assert.deepEqual({ threshold: item.threshold, currency: item.currency, period: item.period }, { threshold: 1883000, currency: 'ARS', period: 'MONTHLY' });
    assert.ok(Number.isFinite(item.thresholdUsd));
  }
});

test('Argentina rentista geography and pensionado substantive basis preserve distinct 5 SMVM semantics', () => {
  const routeById = (result, routeId) => result.routes.find((route) => route.routeId === routeId);
  const threshold = 1883000;
  const at = (applicantType, applicantAmount, applicantCountryId = 'US', adults = 1, children = 0) =>
    calculateActiveCountry(profile({ applicantType, applicantAmount, applicantCurrency: 'ARS', applicantCountryId, adults, children }), argentina, context);

  const rentistaRequirement = argentina.routes.find(({ route_id }) => route_id === 'AR_RENTISTA').requirements[0];
  const pensionadoRoute = argentina.routes.find(({ route_id }) => route_id === 'AR_PENSIONADO');
  const pensionadoRequirement = pensionadoRoute.requirements[0];
  assert.equal(rentistaRequirement.financial.alternatives[0].source_geography, 'FOREIGN');
  assert.equal(pensionadoRequirement.financial.alternatives[0].source_geography, 'ANY');
  assert.equal(pensionadoRoute.requirements[1].evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(pensionadoRoute.requirements[1].unmet_effect, 'BECOMES_CONDITION');

  assert.equal(routeById(at('PASSIVE_INCOME', threshold), 'AR_RENTISTA').routeStatus, 'SUITABLE');
  assert.equal(routeById(at('PASSIVE_INCOME', threshold - 1), 'AR_RENTISTA').routeStatus, 'UNSUITABLE');
  assert.equal(routeById(at('PASSIVE_INCOME', threshold, 'AR'), 'AR_RENTISTA').routeStatus, 'UNSUITABLE');

  for (const payerCountry of ['AR', 'US']) {
    const pensionado = routeById(at('PENSION', threshold, payerCountry), 'AR_PENSIONADO');
    assert.equal(pensionado.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.equal(pensionado.financialSummary.state, 'PASS');
    assert.ok(pensionado.conditions.some((text) => text.includes('за услуги, оказанные за рубежом')));
  }
  assert.equal(routeById(at('PENSION', threshold - 1), 'AR_PENSIONADO').routeStatus, 'UNSUITABLE');
  assert.equal(routeById(at('PASSIVE_INCOME', threshold), 'AR_PENSIONADO').routeStatus, 'UNSUITABLE');

  const solo = routeById(at('PENSION', threshold), 'AR_PENSIONADO').financialSummary.alternatives[0];
  const family = routeById(at('PENSION', threshold, 'US', 2, 2), 'AR_PENSIONADO').financialSummary.alternatives[0];
  for (const item of [solo, family]) {
    assert.equal(item.requirementLabel, '5 SMVM (МРОТ)');
    assert.deepEqual({ threshold: item.threshold, currency: item.currency, period: item.period }, { threshold, currency: 'ARS', period: 'MONTHLY' });
    assert.ok(Number.isFinite(item.thresholdUsd));
  }
  assert.doesNotMatch(pensionadoRoute.basis_ru, /1 SMVM\s*=\s*376.?600 ARS/);
});

test('real Uruguay runtime converts applicant income, Colonia costs, and future salary generically', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const input = profile({ applicantAmount: 6000, applicantCurrency: 'USD' });
  const result = calculateActiveCountry(input, uruguay, uyuContext);
  assert.deepEqual(result.applicantProvableIncome, { amount: 240000, currency: 'UYU', amountUsd: 6000, conversions: [] });

  const colonia = result.cities.find(({ cityId }) => cityId === 'UY_COLONIA');
  assert.deepEqual(colonia.costOriginal, { amount: 30919, currency: 'UYU' });
  assert.ok(Number.isFinite(colonia.comparisonCostUsd));

  const work = result.routes.find(({ routeId }) => routeId === 'UY_TEMP_WORK');
  const salary = work.financialSummary.alternatives[0];
  assert.equal(work.requirementResults.find(({ requirement }) => requirement.requirement_id === 'UY_WORK_FUTURE_SALARY').requirement.evaluation_mode, 'UNASKED_CONDITION');
  assert.deepEqual({ threshold: salary.threshold, currency: salary.currency, period: salary.period }, { threshold: 25383, currency: 'UYU', period: 'MONTHLY' });
  assert.ok(Number.isFinite(salary.thresholdUsd));
});

test('Uruguay general residence family paths stay separate from applicant-only finance', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const routeIds = ['UY_PERMANENT_COMMON', 'UY_TEMP_WORK', 'UY_TEMP_STUDY', 'UY_TEMP_SPECIALIST'];
  const routeById = (result, routeId) => result.routes.find((route) => route.routeId === routeId);
  const member = (route, memberId) => route.familyEvaluation.memberResults.find((item) => item.memberId === memberId);

  const married = calculateActiveCountry(profile({ adults: 2, childAges: [7], relationshipType: 'MARRIED' }), uruguay, uyuContext);
  for (const routeId of routeIds) {
    const route = routeById(married, routeId);
    assert.ok(route, routeId);
    assert.notEqual(route.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM');
    assert.deepEqual(member(route, 'PARTNER').applicableScenarioIds, [`${routeId}_PARTNER`]);
    assert.deepEqual(member(route, 'CHILD_1').applicableScenarioIds, [`${routeId}_CHILD`]);
    assert.equal(member(route, 'CHILD_1').conditions.some((text) => /брак|партн[её]рств/u.test(text)), false);
  }

  const unregistered = calculateActiveCountry(profile({ adults: 2, childAges: [7], relationshipType: 'UNREGISTERED_PARTNERSHIP' }), uruguay, uyuContext);
  for (const routeId of routeIds) {
    const route = routeById(unregistered, routeId);
    const partner = member(route, 'PARTNER');
    const child = member(route, 'CHILD_1');
    assert.notEqual(route.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM');
    assert.ok(partner.conditions.some((text) => text.includes('брак или зарегистрированное партнёрство')));
    assert.equal(child.conditions.some((text) => text.includes('брак или зарегистрированное партнёрство')), false);
    assert.deepEqual(child.applicableScenarioIds, [`${routeId}_CHILD`]);
  }

  const registered = calculateActiveCountry(profile({ adults: 2, relationshipType: 'REGISTERED_PARTNERSHIP' }), uruguay, uyuContext);
  assert.equal(member(routeById(registered, 'UY_PERMANENT_COMMON'), 'PARTNER').state, 'PASS');
  for (const routeId of routeIds.filter((routeId) => routeId !== 'UY_PERMANENT_COMMON')) {
    const partner = member(routeById(registered, routeId), 'PARTNER');
    assert.ok(partner.conditions.some((text) => text.includes('документальное и правовое признание проверяется')));
  }

  const permanentData = uruguay.routes.find(({ route_id }) => route_id === 'UY_PERMANENT_COMMON');
  const permanentAlternative = permanentData.requirements[0].financial.alternatives[0];
  assert.equal(permanentAlternative.comparison, 'NO_FIXED_THRESHOLD');
  assert.equal(permanentAlternative.amount, null);
  assert.equal(permanentAlternative.currency, null);
  assert.equal(permanentAlternative.family_formula_ru, null);
  assert.equal('family_formula' in permanentAlternative, false);
  assert.deepEqual(permanentAlternative.income_owners, ['APPLICANT']);

  const soloPermanent = routeById(calculateActiveCountry(profile(), uruguay, uyuContext), 'UY_PERMANENT_COMMON').financialSummary.alternatives[0];
  const familyPermanent = routeById(married, 'UY_PERMANENT_COMMON').financialSummary.alternatives[0];
  assert.deepEqual({ threshold: soloPermanent.threshold, currency: soloPermanent.currency }, { threshold: null, currency: null });
  assert.deepEqual({ threshold: familyPermanent.threshold, currency: familyPermanent.currency }, { threshold: null, currency: null });

  const guidanceOnly = structuredClone(uruguay);
  guidanceOnly.routes.find(({ route_id }) => route_id === 'UY_PERMANENT_COMMON').requirements[0]
    .financial.alternatives[0].practical_financial_guidance.figures.forEach((figure) => { figure.amount *= 1000; });
  const originalPermanent = routeById(calculateActiveCountry(profile(), uruguay, uyuContext), 'UY_PERMANENT_COMMON');
  const changedGuidancePermanent = routeById(calculateActiveCountry(profile(), guidanceOnly, uyuContext), 'UY_PERMANENT_COMMON');
  assert.equal(changedGuidancePermanent.routeStatus, originalPermanent.routeStatus);
  assert.equal(changedGuidancePermanent.financialSummary.state, originalPermanent.financialSummary.state);

  const workData = uruguay.routes.find(({ route_id }) => route_id === 'UY_TEMP_WORK');
  const workAlternative = workData.requirements.find(({ requirement_id }) => requirement_id === 'UY_WORK_FUTURE_SALARY').financial.alternatives[0];
  assert.deepEqual({ amount: workAlternative.amount, currency: workAlternative.currency, familyFormula: workAlternative.family_formula_ru, owners: workAlternative.income_owners }, {
    amount: 25383, currency: 'UYU', familyFormula: null, owners: ['APPLICANT'],
  });
  const soloWork = routeById(calculateActiveCountry(profile(), uruguay, uyuContext), 'UY_TEMP_WORK').financialSummary.alternatives[0];
  const familyWork = routeById(married, 'UY_TEMP_WORK').financialSummary.alternatives[0];
  assert.equal(soloWork.threshold, 25383);
  assert.equal(familyWork.threshold, 25383);

  const partnerOnlyIncome = calculateActiveCountry(profile({ applicantAmount: 0, applicantType: 'NO_REGULAR_INCOME', adults: 2, partnerAmount: 10000 }), uruguay, uyuContext);
  assert.equal(routeById(partnerOnlyIncome, 'UY_PERMANENT_COMMON').financialSummary.state, 'FAIL');

  const untouchedRoutes = ['UY_DIGITAL_NOMAD', 'UY_PROTECTION', 'UY_HUMANITARIAN'];
  assert.deepEqual(untouchedRoutes.map((routeId) => {
    const item = uruguay.routes.find(({ route_id }) => route_id === routeId).family_scenarios[0];
    return [routeId, item.scenario_id, item.applies_to, item.relationship_types];
  }), [
    ['UY_DIGITAL_NOMAD', 'UY_DIGITAL_NOMAD_FAM', 'PARTNER_AND_CHILDREN', ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']],
    ['UY_PROTECTION', 'UY_PROTECTION_FAM', 'PARTNER_AND_CHILDREN', ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']],
    ['UY_HUMANITARIAN', 'UY_HUMANITARIAN_FAM', 'PARTNER_AND_CHILDREN', ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']],
  ]);
});

test('country entry facts reach calculation without changing route statuses', () => {
  const input = profile({ applicantAmount: 6000, applicantCurrency: 'USD' });
  const es = calculateActiveCountry(input, spain, context);
  assert.deepEqual(es.entryForRussianCitizen, {
    visaRequired: true,
    maximumStayDays: 90,
    processingTime: null,
    rule: spain.entry_for_russian_citizen.rule_ru,
  });
  const ar = calculateActiveCountry(input, argentina, context);
  assert.deepEqual(ar.entryForRussianCitizen, {
    visaRequired: false, maximumStayDays: 90, processingTime: null,
    rule: argentina.entry_for_russian_citizen.rule_ru,
  });
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const uy = calculateActiveCountry(input, uruguay, uyuContext);
  assert.deepEqual(uy.entryForRussianCitizen, {
    visaRequired: false, maximumStayDays: 90, processingTime: null,
    rule: uruguay.entry_for_russian_citizen.rule_ru,
  });
  const unknownVisa = structuredClone(spain);
  unknownVisa.entry_for_russian_citizen.visa_required = null;
  const unknown = calculateActiveCountry(input, unknownVisa, context);
  assert.equal(unknown.entryForRussianCitizen.visaRequired, null);
  assert.deepEqual(unknown.routes.map(({ routeStatus }) => routeStatus), es.routes.map(({ routeStatus }) => routeStatus));
});

test('living-cost budget fields are ignored while legal income matching remains unchanged', () => {
  const input = profile({ applicantAmount: 6000 });
  input.preferences = { monthly_budget: { amount: 900, currency: 'EUR' } };
  const withLegacyBudget = calculateActiveCountry(input, spain, context);
  const withoutBudget = calculateActiveCountry({ ...input, preferences: { monthly_budget: null } }, spain, context);
  assert.equal('monthlyBudgetUsd' in withLegacyBudget.profile, false);
  assert.equal('budgetDerivedFromIncome' in withLegacyBudget.profile, false);
  assert.deepEqual(withLegacyBudget.routes.map(({ routeStatus }) => routeStatus), withoutBudget.routes.map(({ routeStatus }) => routeStatus));
});

test('generic engine converts live RUB questionnaire income when the context supplies RUB', () => {
  const rubContext = { fx: { ...context.fx, rates: { ...context.fx.rates, RUB: 90 } } };
  const result = calculateActiveCountry(profile({ applicantAmount: 9000, applicantCurrency: 'RUB' }), spain, rubContext);
  assert.deepEqual(result.applicantProvableIncome, { amount: 90, currency: 'EUR', amountUsd: 100, conversions: [] });
});

test('generic engine converts applicant income to UYU for active Uruguay', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const result = calculateActiveCountry(profile({ applicantAmount: 100, applicantCurrency: 'USD' }), uruguay, uyuContext);
  assert.deepEqual(result.applicantProvableIncome, { amount: 4000, currency: 'UYU', amountUsd: 100, conversions: [] });
  assert.equal(result.country.countryId, 'UY');
});

test('practical financial figures are presentation-only and cannot change matching', () => {
  const input = profile({ applicantAmount: 4000, applicantCurrency: 'USD' });
  const outcomes = [500, 1500, 10000].map((amount) => {
    const pkg = structuredClone(argentina);
    const nomad = pkg.routes.find(({ route_id }) => route_id === 'AR_NOMAD');
    const item = nomad.requirements.find(({ type }) => type === 'FINANCIAL').financial.alternatives
      .find(({ comparison }) => comparison === 'NO_FIXED_THRESHOLD');
    item.practical_financial_guidance = {
      evaluation_mode: 'DISPLAY_ONLY', status: 'FOUND', summary_ru: 'Практический ориентир.',
      figures: [{ amount, currency: 'USD', period: 'MONTHLY', family_context_ru: 'Один заявитель', evidence: [{ source_id: item.source_ids[0], source_date: '2026-08-10', evidence_type: 'REPORTED_PRACTICE' }], note_ru: 'Тестовый ориентир.' }],
      disclaimer_ru: 'Это не обязательный минимум.',
    };
    const result = calculateActiveCountry(input, pkg, context).routes.find(({ routeId }) => routeId === 'AR_NOMAD');
    const financial = result.financialSummary.alternatives.find(({ kind }) => kind === 'INCOME');
    return { routeStatus: result.routeStatus, financialState: result.financialSummary.state, alternativeState: financial.state, practicalGuidance: financial.practicalGuidance };
  });
  assert.deepEqual(outcomes.map(({ practicalGuidance, ...matching }) => matching), Array(3).fill({
    routeStatus: outcomes[0].routeStatus,
    financialState: outcomes[0].financialState,
    alternativeState: outcomes[0].alternativeState,
  }));
  assert.deepEqual(outcomes.map((x) => x.practicalGuidance.figures[0].amount), [500, 1500, 10000]);
  const unchanged = calculateActiveCountry(input, argentina, context).routes.find(({ routeId }) => routeId === 'AR_NOMAD');
  assert.equal(unchanged.financialSummary.alternatives.find(({ kind }) => kind === 'INCOME').practicalGuidance.evaluation_mode, 'DISPLAY_ONLY');
});

test('UY practical screening uses approved 1500 + 500 adult + 500 child formula independently of guidance', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const permanent = (input, pkg = uruguay) => calculateActiveCountry(input, pkg, uyuContext).routes.find(({ routeId }) => routeId === 'UY_PERMANENT_COMMON');
  for (const [input, expectedStatus, expectedThreshold] of [
    [profile({ applicantAmount: 200, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED' }), 'UNSUITABLE', 1500],
    [profile({ applicantAmount: 1499, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED' }), 'UNSUITABLE', 1500],
    [profile({ applicantAmount: 1500, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED' }), 'SUITABLE', 1500],
    [profile({ applicantAmount: 1800, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED' }), 'SUITABLE', 1500],
    [profile({ applicantAmount: 1999, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', children: 1 }), 'UNSUITABLE', 2000],
    [profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', children: 1 }), 'SUITABLE', 2000],
    [profile({ applicantAmount: 1999, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2 }), 'UNSUITABLE', 2000],
    [profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2 }), 'SUITABLE', 2000],
    [profile({ applicantAmount: 2499, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2, children: 1 }), 'UNSUITABLE', 2500],
    [profile({ applicantAmount: 2500, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2, children: 1 }), 'SUITABLE', 2500],
  ]) {
    const result = permanent(input);
    assert.equal(result.routeStatus, expectedStatus);
    const income = result.financialSummary.alternatives[0];
    assert.equal(income.practicalScreeningThreshold, expectedThreshold);
    assert.equal(income.threshold, null);
    assert.equal(income.currency, null);
  }
  const noIncome = permanent(profile({ applicantAmount: 0, applicantCurrency: 'USD', applicantType: 'NO_REGULAR_INCOME' }));
  assert.equal(noIncome.routeStatus, 'UNSUITABLE');
  assert.match(noIncome.blockers[0], /регулярного дохода сейчас нет/u);

  const changedGuidance = structuredClone(uruguay);
  const alternative = changedGuidance.routes.find(({ route_id }) => route_id === 'UY_PERMANENT_COMMON')
    .requirements.find(({ requirement_id }) => requirement_id === 'UY_PERM_MEANS').financial.alternatives[0];
  alternative.practical_financial_guidance.figures.find(({ family_context_ru }) => family_context_ru === 'Пара').amount = 999999;
  const couple = permanent(profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2 }), changedGuidance);
  assert.notEqual(couple.routeStatus, 'UNSUITABLE');
  assert.equal(couple.financialSummary.alternatives[0].practicalScreeningThreshold, 2000);
  assert.deepEqual(alternative.practical_financial_guidance.figures.map(({ amount }) => amount), [1500, 999999, 2500, 500]);
});

test('savings cannot replace a structurally required DNV income source', () => {
  const dnv = (input) => calculateActiveCountry(input, spain, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  for (const savings of [0, 50000, 500000]) {
    const result = dnv(profile({ applicantAmount: 0, applicantType: 'NO_REGULAR_INCOME', savings: { amount: savings, currency: 'USD' } }));
    assert.equal(result.routeStatus, 'UNSUITABLE');
    assert.match(result.blockers[0], /Накопления не заменяют требуемый источник дохода/u);
  }
  const incompatible = dnv(profile({ applicantAmount: 10000, applicantType: 'PENSION', savings: { amount: 500000, currency: 'USD' } }));
  assert.equal(incompatible.routeStatus, 'UNSUITABLE');
  assert.match(incompatible.blockers[0], /тип дохода не принимается/u);
  const insufficient = dnv(profile({ applicantAmount: 200, applicantCurrency: 'USD', applicantCountryId: 'US', savings: { amount: 0, currency: 'EUR' } }));
  assert.equal(insufficient.routeStatus, 'UNSUITABLE');
  assert.equal(insufficient.financialSummary.state, 'FAIL');
  assert.match(insufficient.blockers[0], /финансовое требование DNV не выполнено/u);

  const threshold = dnv(profile({ applicantAmount: 2442, savings: { amount: 0, currency: 'EUR' } }));
  assert.equal(threshold.financialSummary.state, 'PASS');
  const genuineShortfall = dnv(profile({ applicantAmount: 2200, savings: { amount: 8712, currency: 'EUR' } }));
  assert.equal(genuineShortfall.financialSummary.state, 'PASS');
  assert.equal(genuineShortfall.financialSummary.alternatives[0].shortfall, 8712);
});

test('AR and UY digital nomads use separate practical screening while official thresholds remain null', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const nomad = (pkg, routeId, amount, calculationContext = context) => calculateActiveCountry(profile({
    applicantAmount: amount, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantCountryId: 'US',
  }), pkg, calculationContext).routes.find((route) => route.routeId === routeId);
  for (const [amount, expected] of [[200, 'UNSUITABLE'], [1499, 'UNSUITABLE'], [1500, 'SUITABLE'], [1800, 'SUITABLE']]) {
    const route = nomad(uruguay, 'UY_DIGITAL_NOMAD', amount, uyuContext);
    assert.equal(route.routeStatus, expected);
    const income = route.financialSummary.alternatives[0];
    assert.deepEqual({ officialThreshold: income.threshold, officialCurrency: income.currency, screening: income.practicalScreeningThreshold }, { officialThreshold: null, officialCurrency: null, screening: 1500 });
    if (amount === 200) assert.equal(route.blockers[0], 'Подтверждаемый доход ниже практического ориентира для этого маршрута: около 1 500 USD в месяц. Вы указали 200 USD в месяц.');
  }
  for (const [amount, expected] of [[200, 'UNSUITABLE'], [1999, 'UNSUITABLE'], [2000, 'SUITABLE'], [2500, 'SUITABLE']]) {
    const route = nomad(argentina, 'AR_NOMAD', amount);
    assert.equal(route.routeStatus, expected);
    const income = route.financialSummary.alternatives[0];
    assert.deepEqual({ officialThreshold: income.threshold, officialCurrency: income.currency, screening: income.practicalScreeningThreshold }, { officialThreshold: null, officialCurrency: null, screening: 2000 });
    if (amount === 200) assert.equal(route.blockers[0], 'Подтверждаемый доход ниже практического ориентира для этого маршрута: около 2 000 USD в месяц. Вы указали 200 USD в месяц.');
  }
  for (const [pkg, routeId] of [[uruguay, 'UY_DIGITAL_NOMAD'], [argentina, 'AR_NOMAD']]) {
    const route = nomad(pkg, routeId, 2500, pkg === uruguay ? uyuContext : context);
    const guidance = route.financialSummary.alternatives[0].practicalGuidance;
    assert.equal(guidance.evaluation_mode, 'DISPLAY_ONLY');
    assert.ok(guidance.figures.flatMap(({ evidence }) => evidence).every(({ sourceUrl }) => /^https:\/\//u.test(sourceUrl)));
  }
  assert.deepEqual(nomad(argentina, 'AR_NOMAD', 2500).financialSummary.alternatives[0].practicalGuidance.figures.map((figure) => [figure.amount ?? null, figure.amount_min ?? null, figure.amount_max ?? null]), [[null, 2000, 2500], [2000, null, null]]);
});

test('known NLV savings below threshold produce a concrete savings blocker', () => {
  const nlv = calculateActiveCountry(profile({ adults: 2, savings: { amount: 34600, currency: 'EUR' } }), spain, context)
    .routes.find(({ routeId }) => routeId === 'ES_NLV');
  assert.equal(nlv.routeStatus, 'UNSUITABLE');
  assert.equal(nlv.blockers[0], 'Для вашего состава семьи требуется 36 000 EUR подтверждаемых средств. Ваши подтверждаемые накопления — около 34 600 EUR.');
  assert.doesNotMatch(nlv.blockers.join(' '), /если накопления не подтверждены|доход/u);
});

test('administrative family filing alone does not downgrade UY permanent residence', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const permanent = (input) => calculateActiveCountry(input, uruguay, uyuContext).routes.find(({ routeId }) => routeId === 'UY_PERMANENT_COMMON');
  for (const input of [
    profile({ applicantAmount: 1500, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED' }),
    profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2 }),
    profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', children: 1 }),
  ]) assert.equal(permanent(input).routeStatus, 'SUITABLE');
  const couple = permanent(profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2 }));
  assert.equal(couple.familyEvaluation.conditions.length, 0);
  assert.ok(couple.family.some(({ description }) => description === 'Каждый взрослый оформляет отдельное заявление.'));
  const unregistered = permanent(profile({ applicantAmount: 2000, applicantCurrency: 'USD', applicantType: 'FREELANCE_OR_SELF_EMPLOYED', adults: 2, relationshipType: 'UNREGISTERED_PARTNERSHIP' }));
  assert.equal(unregistered.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.match(unregistered.conditions.join(' '), /брак или зарегистрированное партнёрство/u);
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

test('unasked financial requirements preserve family-adjusted presentation without evaluating user finance', () => {
  const unasked = finance('INCOME_ONLY', [alternative('INCOME', false, {
    amount: 1000,
    family_formula_ordered: {
      base_applicant_amount: 1000,
      first_additional_member_amount: 500,
      each_further_member_amount: 250,
    },
  })], {}, { evaluation_mode: 'UNASKED_CONDITION', unmet_effect: 'BECOMES_CONDITION' });
  const evaluate = (applicantAmount) => evaluateRoute(route([unasked]), profile({ applicantAmount, adults: 2 }), context, 'ES');
  for (const result of [evaluate(1), evaluate(999999)]) {
    assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    const financial = result.requirementResults[0];
    assert.equal(financial.state, 'UNKNOWN');
    assert.equal(financial.model, 'INCOME_ONLY');
    assert.equal(financial.alternatives.length, 1);
    assert.equal(financial.alternatives[0].state, 'UNKNOWN');
    assert.equal(financial.alternatives[0].threshold, 1500);
    assert.equal(financial.alternatives[0].currency, 'EUR');
  }
  const engine = finance('INCOME_ONLY', [alternative('INCOME', true, { amount: 1000 })]);
  assert.equal(evaluateRoute(route([engine]), profile({ applicantAmount: 2000 }), context, 'ES').routeStatus, 'SUITABLE');
  assert.equal(evaluateRoute(route([engine]), profile({ applicantAmount: 500 }), context, 'ES').routeStatus, 'UNSUITABLE');
});

test('ENGINE operators are generic and unknown is distinct from failure', () => {
  assert.equal(evaluateEngineRule({ operator: 'EQUALS', value: 'RU' }, 'RU'), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'IN', values: ['RU', 'AR'] }, 'RU'), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'AT_LEAST', value: 18 }, 20), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'AT_MOST', value: 65 }, 20), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'NON_EMPTY' }, ['RU']), 'PASS');
  assert.equal(evaluateEngineRule({ operator: 'EQUALS', value: 'RU' }, undefined), 'UNKNOWN');
});

test('ordinary route status ignores legacy contributors and research gaps when the long-term goal is temporary', () => {
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
  const missingIncome = finance('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: 5000 })], { shortfall_coverage: { coverage_months: 6 } }, { unmet_effect: 'BECOMES_CONDITION' });
  const missingIncomeResult = evaluateRoute(route([missingIncome]), profile({ applicantAmount: 0, applicantType: 'NO_REGULAR_INCOME', savings: { amount: 100000, currency: 'EUR' } }), context, 'ES');
  assert.equal(missingIncomeResult.requirementResults[0].state, 'FAIL');
  assert.equal(missingIncomeResult.routeStatus, 'SUITABLE_WITH_CONDITIONS');
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

test('NO_FIXED_THRESHOLD checks income type and geography without inventing a numeric threshold', () => {
  const noThreshold = alternative('INCOME', true, {
    amount: null, currency: null, comparison: 'NO_FIXED_THRESHOLD',
    allowed_income_types: ['REMOTE_EMPLOYMENT'], source_geography: 'FOREIGN',
  });
  assert.equal(financialState('INCOME_ONLY', [noThreshold], profile({ applicantAmount: 0, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantCountryId: 'US' })).state, 'PASS');
  assert.equal(financialState('INCOME_ONLY', [noThreshold], profile({ applicantAmount: 999999, applicantCurrency: 'USD', applicantType: 'PENSION', applicantCountryId: 'US' })).state, 'FAIL');
  assert.equal(financialState('INCOME_ONLY', [noThreshold], profile({ applicantAmount: 999999, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantCountryId: 'ES' })).state, 'FAIL');
  const unknown = financialState('INCOME_ONLY', [noThreshold], profile({ applicantAmount: 999999, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantGeography: 'MULTIPLE_COUNTRIES', applicantCountryId: null }));
  assert.equal(unknown.state, 'UNKNOWN');
  assert.match(unknown.condition, /предел/);
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
  const unknownOnly = financialState('INCOME_WITH_SAVINGS_SHORTFALL', [alternative('INCOME', true, { amount: 5000 })], profile({
    applicantAmount: 0, applicantType: 'NO_REGULAR_INCOME', savings: { amount: 100000, currency: 'EUR' },
    additionalSources: [incomeSource('APPLICANT', 'REMOTE_EMPLOYMENT', 6000, 'EUR', null, 'MULTIPLE_COUNTRIES')],
  }), { shortfall_coverage: { coverage_months: 6 } });
  assert.equal(unknownOnly.state, 'UNKNOWN');
  assert.equal('minimumShortfall' in unknownOnly.alternatives[0], false);
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
  const spanishSource = dnv(profile({ applicantAmount: 10000, applicantCountryId: 'ES', savings: { amount: 1000000, currency: 'EUR' } }));
  assert.equal(spanishSource.routeStatus, 'UNSUITABLE');
  assert.match(spanishSource.blockers[0], /нужен допустимый удалённый доход от источников вне Испании/u);
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

test('Spain NLV uses the asked general savings fact at exact data-driven thresholds', () => {
  const nlv = (input) => calculateActiveCountry(input, spain, context).routes.find(({ routeId }) => routeId === 'ES_NLV');
  const noIncome = { applicantAmount: 0, applicantType: 'NO_REGULAR_INCOME', applicantCountryId: null, applicantGeography: 'NO_STABLE_PAYER' };
  const exact = nlv(profile({ ...noIncome, savings: { amount: 28800, currency: 'EUR' } }));
  assert.equal(exact.routeStatus, 'SUITABLE');
  assert.equal(exact.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ES_NLV_FIN').state, 'PASS');
  const below = nlv(profile({ ...noIncome, savings: { amount: 28799, currency: 'EUR' } }));
  assert.equal(below.routeStatus, 'UNSUITABLE');
  assert.equal(below.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ES_NLV_FIN').state, 'FAIL');
  const family = nlv(profile({ ...noIncome, adults: 2, children: 1, savings: { amount: 43200, currency: 'EUR' } }));
  assert.equal(family.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ES_NLV_FIN').state, 'PASS');
  const unknown = nlv(profile({ ...noIncome, savings: null }));
  assert.equal(unknown.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ES_NLV_FIN').state, 'UNKNOWN');
  const nlvSavings = spain.routes.find(({ route_id }) => route_id === 'ES_NLV').requirements.find(({ requirement_id }) => requirement_id === 'ES_NLV_FIN').financial.alternatives.find(({ kind }) => kind === 'SAVINGS');
  const studySavings = spain.routes.find(({ route_id }) => route_id === 'ES_STUDY').requirements.find(({ requirement_id }) => requirement_id === 'ES_STUDY_FIN').financial.alternatives.find(({ kind }) => kind === 'SAVINGS');
  assert.equal(nlvSavings.asked_in_questionnaire, true);
  assert.equal(studySavings.asked_in_questionnaire, false);
});

test('tax presentation is package-specific information and cannot affect routes or ordering', () => {
  for (const pkg of [spain, argentina, uruguay]) {
    const withTaxes = calculateActiveCountry(profile(), pkg, context);
    const withoutTaxes = calculateActiveCountry(profile(), { ...pkg, taxes: { ...pkg.taxes, tax_residency_rule_ru: 'Изменённый справочный текст.' } }, context);
    assert.equal(withTaxes.taxPresentation.checkedAt, pkg.taxes.checked_at);
    assert.equal(withTaxes.taxPresentation.taxResidencyRule, pkg.taxes.tax_residency_rule_ru);
    assert.deepEqual(withTaxes.routes.map(({ routeId, routeStatus }) => [routeId, routeStatus]), withoutTaxes.routes.map(({ routeId, routeStatus }) => [routeId, routeStatus]));
    assert.equal(withTaxes.bestRoute.routeId, withoutTaxes.bestRoute.routeId);
  }
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

  const administrativeLater = evaluateFamilyScenarios({ family_scenarios: [familyScenario({
    applies_to: 'PARTNER',
    relationship_types: ['MARRIED'],
    simultaneous_move: 'CONDITIONAL',
    administrative_separate_filing: true,
    join_stage: 'AFTER_PR',
    condition_ru: 'Присоединение возможно после ПМЖ.',
  })] }, profile({ adults: 2, relationshipType: 'MARRIED' }), []);
  assert.equal(administrativeLater.state, 'CONDITION');
  assert.match(administrativeLater.conditions.join(' '), /после ПМЖ/u);
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

test('synthetic profile helper can exercise legacy school-needed values', () => {
  assert.equal(profile({ children: 1 }).family.school_needed, false);
  assert.equal(profile({ children: 1, schoolNeeded: false }).family.school_needed, false);
  assert.equal(profile({ children: 1, schoolNeeded: true }).family.school_needed, true);
  assert.equal(profile({ children: 0, schoolNeeded: true }).family.school_needed, false);
});

test('school presentation is absent without children and combines both blocks with every public rule', () => {
  assert.equal(calculateActiveCountry(profile(), spain, context).schoolPresentation, null);
  const pkg = structuredClone(spain);
  pkg.schools.public_school_rules.push({
    ...structuredClone(pkg.schools.public_school_rules[0]),
    jurisdiction_ru: 'Вторая применимая юрисдикция',
    language_ru: 'Второй язык обучения',
  });
  const result = calculateActiveCountry(profile({ children: 1, schoolNeeded: false }), pkg, context);
  assert.equal(result.schoolPresentation.public.rules.length, 2);
  assert.deepEqual(result.schoolPresentation.public.rules.map(({ jurisdiction }) => jurisdiction), [
    'Испания (общегосударственные правила; администрирование — автономные сообщества)',
    'Вторая применимая юрисдикция',
  ]);
  assert.equal(result.schoolPresentation.international.status, 'AVAILABLE');
  assert.deepEqual(result.schoolPresentation.international.cities, ['Мадрид', 'Сан-Себастьян']);
  const legacyToggle = calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), pkg, context);
  assert.deepEqual(legacyToggle.schoolPresentation, result.schoolPresentation);
});

test('new country-wide school cities take priority over legacy school records', () => {
  const pkg = structuredClone(spain);
  pkg.schools.international_school_cities = [
    { city_name_ru: 'Школьный город вне city cards', source_ids: ['ES_ICS'] },
    { city_name_ru: 'Ещё один школьный город', source_ids: ['ES_STPATRICK'] },
  ];
  const result = calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), pkg, context);
  assert.deepEqual(result.schoolPresentation.international, {
    status: 'AVAILABLE', cities: ['Школьный город вне city cards', 'Ещё один школьный город'],
  });
  assert.equal(result.cities.some(({ cityName }) => cityName === 'Школьный город вне city cards'), false);
});

test('legacy and researched-none international school presentation remain supported', () => {
  const legacy = calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), spain, context);
  assert.deepEqual(legacy.schoolPresentation.international, {
    status: 'AVAILABLE', cities: ['Мадрид', 'Сан-Себастьян'],
  });
  const arLegacy = calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), argentina, context);
  assert.deepEqual(arLegacy.schoolPresentation.international.cities, ['Буэнос-Айрес']);
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const uyLegacy = calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), uruguay, uyuContext);
  assert.deepEqual(uyLegacy.schoolPresentation.international.cities, ['Монтевидео', 'Мальдонадо']);
  const none = structuredClone(spain);
  none.schools.international_school_status = 'RESEARCHED_NONE_FOUND';
  none.schools.international_schools = [];
  const result = calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), none, context);
  assert.deepEqual(result.schoolPresentation.international, {
    status: 'RESEARCHED_NONE_FOUND', cities: [],
  });
});

test('international tuition range uses minimum first grade and maximum final grade only when complete', () => {
  const pkg = structuredClone(spain);
  pkg.schools.international_school_tuition_observations = [
    { school_name_ru: 'A', grade_stage: 'FIRST_GRADE', tuition: { amount: 12000, currency: 'USD', period: 'ANNUAL', price_date: '2026-08-14' }, source_ids: ['ES_ICS'] },
    { school_name_ru: 'B', grade_stage: 'FIRST_GRADE', tuition: { amount: 9000, currency: 'USD', period: 'ACADEMIC_YEAR', price_date: '2026-08-14' }, source_ids: ['ES_STPATRICK'] },
    { school_name_ru: 'C', grade_stage: 'FINAL_GRADE', tuition: { amount: 18000, currency: 'USD', period: 'ANNUAL', price_date: '2026-08-14' }, source_ids: ['ES_ICS'] },
    { school_name_ru: 'D', grade_stage: 'FINAL_GRADE', tuition: { amount: 20000, currency: 'USD', period: 'ACADEMIC_YEAR', price_date: '2026-08-14' }, source_ids: ['ES_STPATRICK'] },
  ];
  const baseline = calculateActiveCountry(profile({ children: 1 }), spain, context);
  const result = calculateActiveCountry(profile({ children: 1, schoolNeeded: false }), pkg, context);
  assert.deepEqual(result.schoolPresentation.international.tuitionRangeUsd, { minimum: 9000, maximum: 20000 });
  assert.deepEqual(calculateActiveCountry(profile({ children: 1, schoolNeeded: true }), pkg, context).schoolPresentation, result.schoolPresentation);
  assert.deepEqual(result.routes.map(({ routeId, routeStatus }) => [routeId, routeStatus]), baseline.routes.map(({ routeId, routeStatus }) => [routeId, routeStatus]));
  assert.equal(result.bestRoute.routeId, baseline.bestRoute.routeId);
  assert.deepEqual(result.cities, baseline.cities);
  const argentinaResult = calculateActiveCountry(profile({ children: 1 }), argentina, context);
  assert.deepEqual(
    sortCountriesForDisplay([result, argentinaResult]).map(({ country }) => country.countryId),
    sortCountriesForDisplay([baseline, argentinaResult]).map(({ country }) => country.countryId),
  );

  const missingFirst = structuredClone(pkg);
  missingFirst.schools.international_school_tuition_observations = missingFirst.schools.international_school_tuition_observations.filter(({ grade_stage }) => grade_stage !== 'FIRST_GRADE');
  assert.equal(calculateActiveCountry(profile({ children: 1 }), missingFirst, context).schoolPresentation.international.tuitionRangeUsd, undefined);
  const missingFinal = structuredClone(pkg);
  missingFinal.schools.international_school_tuition_observations = missingFinal.schools.international_school_tuition_observations.filter(({ grade_stage }) => grade_stage !== 'FINAL_GRADE');
  assert.equal(calculateActiveCountry(profile({ children: 1 }), missingFinal, context).schoolPresentation.international.tuitionRangeUsd, undefined);
  assert.equal(calculateActiveCountry(profile(), pkg, context).schoolPresentation, null);
});

test('international tuition range is status-gated, coherent, and converted through real FX', () => {
  const pkg = structuredClone(spain);
  pkg.schools.international_school_tuition_observations = [
    { school_name_ru: 'A', grade_stage: 'FIRST_GRADE', tuition: { amount: 50000, currency: 'BRL', period: 'ANNUAL', price_date: '2026-08-14' }, source_ids: ['ES_ICS'] },
    { school_name_ru: 'B', grade_stage: 'FINAL_GRADE', tuition: { amount: 100000, currency: 'BRL', period: 'ACADEMIC_YEAR', price_date: '2026-08-14' }, source_ids: ['ES_STPATRICK'] },
  ];
  const brlContext = { fx: { ...context.fx, rates: { ...context.fx.rates, BRL: 5 } } };
  const available = calculateActiveCountry(profile({ children: 1 }), pkg, brlContext).schoolPresentation.international;
  assert.deepEqual(available.tuitionRangeUsd, { minimum: 10000, maximum: 20000 });

  const missingFx = calculateActiveCountry(profile({ children: 1 }), pkg, context).schoolPresentation.international;
  assert.equal(missingFx.tuitionRangeUsd, undefined);
  assert.equal(missingFx.status, available.status);
  assert.deepEqual(missingFx.cities, available.cities);

  for (const status of ['RESEARCHED_NONE_FOUND', 'NOT_RESEARCHED']) {
    const contradictory = structuredClone(pkg);
    contradictory.schools.international_school_status = status;
    const presentation = calculateActiveCountry(profile({ children: 1 }), contradictory, brlContext).schoolPresentation.international;
    assert.equal(presentation.status, status);
    assert.equal(presentation.tuitionRangeUsd, undefined);
  }

  const inverted = structuredClone(pkg);
  inverted.schools.international_school_tuition_observations[0].tuition.amount = 150000;
  const invertedPresentation = calculateActiveCountry(profile({ children: 1 }), inverted, brlContext).schoolPresentation.international;
  assert.equal(invertedPresentation.tuitionRangeUsd, undefined);
  assert.equal(invertedPresentation.status, 'AVAILABLE');
  assert.deepEqual(invertedPresentation.cities, available.cities);
});

test('school presentation is isolated from routes, city costs, extrema, and country ordering', () => {
  const withoutChildren = calculateActiveCountry(profile(), spain, context);
  const withChildren = calculateActiveCountry(profile({ children: 1 }), spain, context);
  assert.deepEqual(withChildren.routes.map(({ routeId, routeStatus }) => [routeId, routeStatus]), withoutChildren.routes.map(({ routeId, routeStatus }) => [routeId, routeStatus]));
  assert.equal(withChildren.bestRoute.routeId, withoutChildren.bestRoute.routeId);
  assert.deepEqual(withChildren.cities.map(({ comparisonCostUsd, labels }) => [comparisonCostUsd, labels]), withoutChildren.cities.map(({ comparisonCostUsd, labels }) => [comparisonCostUsd, labels]));
});

test('pets presentation distinguishes no pets, import findings, and unknown research', () => {
  assert.equal(calculateActiveCountry(profile(), spain, context).petPresentation, null);
  const pkg = structuredClone(spain);
  const evaluate = () => calculateActiveCountry(profile({ pets: true }), pkg, context).petPresentation;
  assert.equal(evaluate().importText, 'Ограничений на ввоз домашних животных не выявлено.');
  assert.match(evaluate().afterEntryText, /Pit Bull Terrier/);

  pkg.pets.import_restrictions = {
    status: 'RESTRICTIONS_FOUND', explanation_ru: 'Конкретное ограничение ввоза.', source_ids: ['ES_PET'],
  };
  assert.equal(evaluate().importText, 'Конкретное ограничение ввоза.');
  for (const status of ['NOT_RESEARCHED', 'RESEARCHED_NO_RELIABLE_DATA']) {
    pkg.pets.import_restrictions = { status, explanation_ru: 'Не превращать в отсутствие ограничений.', source_ids: status === 'NOT_RESEARCHED' ? [] : ['ES_PET'] };
    assert.equal(evaluate().importText, null);
  }
});

test('after-entry pets text appears only for restrictions found', () => {
  const pkg = structuredClone(spain);
  const evaluate = () => calculateActiveCountry(profile({ pets: true }), pkg, context).petPresentation;
  for (const status of ['RESEARCHED_NONE_FOUND', 'NOT_RESEARCHED', 'RESEARCHED_NO_RELIABLE_DATA']) {
    pkg.pets.after_entry_restrictions = { status, explanation_ru: 'Не показывать.', source_ids: status === 'NOT_RESEARCHED' ? [] : ['ES_DOG'] };
    assert.equal(evaluate().afterEntryText, null);
  }
  pkg.pets.after_entry_restrictions = { status: 'RESTRICTIONS_FOUND', explanation_ru: 'Конкретное правило после въезда.', source_ids: ['ES_DOG'] };
  assert.equal(evaluate().afterEntryText, 'Конкретное правило после въезда.');
});

test('real ES, AR, and UY pets use the generic presentation without changing route status', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  for (const [pkg, fx] of [[spain, context], [argentina, context], [uruguay, uyuContext]]) {
    const withoutPets = calculateActiveCountry(profile(), pkg, fx);
    const withPets = calculateActiveCountry(profile({ pets: true }), pkg, fx);
    assert.equal(withPets.petPresentation.importText, 'Ограничений на ввоз домашних животных не выявлено.');
    assert.ok(withPets.petPresentation.afterEntryText);
    assert.deepEqual(withPets.routes.map(({ routeStatus }) => routeStatus), withoutPets.routes.map(({ routeStatus }) => routeStatus));
  }
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
  assert.equal(familyResult.routes.length, 11);
  assert.equal(familyResult.excludedRoutes.length, 0);
  assert.deepEqual(byState('PASS'), ['ES_AUDIOVISUAL', 'ES_DNV', 'ES_ENT', 'ES_HQP_BLUE', 'ES_HQP_NATIONAL', 'ES_NLV', 'ES_RESEARCHER'].sort());
  assert.deepEqual(byState('CONDITION'), ['ES_EMP', 'ES_PROTECTION', 'ES_SELF', 'ES_STUDY'].sort());
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
  assert.equal(dnvPresentation.routeStatus, 'SUITABLE');
  assert.deepEqual(dnvPresentation.conditions, []);

  const soloResult = calculateActiveCountry(profile({ applicantAmount: 6000 }), spain, context);
  assert.equal(soloResult.routes.length, 11);
  assert.equal(soloResult.excludedRoutes.length, 0);
  assert.equal(soloResult.routes.every(({ familyEvaluation }) => familyEvaluation.state === 'NOT_APPLICABLE'), true);
  assert.equal(soloResult.routes.every(({ familyEvaluation }) => familyEvaluation.conditions.length === 0), true);
});

test('Argentina RP4 regression fixture matches real route, family, city, and publication behavior', () => {
  const routeById = (result, routeId) => result.routes.find((route) => route.routeId === routeId);

  let canonical = argentinaCase('NOMAD_REMOTE_FOREIGN_SOLO');
  let result = calculateActiveCountry(profile({ applicantAmount: 3000, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantCountryId: 'US' }), argentina, context);
  assert.equal(routeById(result, 'AR_NOMAD').routeStatus, canonical.expected.AR_NOMAD);

  canonical = argentinaCase('NOMAD_NON_REMOTE_INCOME_REJECTED');
  result = calculateActiveCountry(profile({ applicantAmount: 3000, applicantCurrency: 'USD', applicantType: 'PENSION', applicantCountryId: 'US' }), argentina, context);
  assert.equal(routeById(result, 'AR_NOMAD').routeStatus, canonical.expected.AR_NOMAD);

  canonical = argentinaCase('NOMAD_DESTINATION_SOURCE_REJECTED');
  result = calculateActiveCountry(profile({ applicantAmount: 3000, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantCountryId: 'AR' }), argentina, context);
  assert.equal(routeById(result, 'AR_NOMAD').routeStatus, canonical.expected.AR_NOMAD);

  canonical = argentinaCase('NOMAD_UNKNOWN_GEOGRAPHY_IS_CONDITION');
  result = calculateActiveCountry(profile({ applicantAmount: 3000, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantGeography: 'MULTIPLE_COUNTRIES', applicantCountryId: null }), argentina, context);
  const nomadUnknown = routeById(result, 'AR_NOMAD');
  assert.equal(nomadUnknown.routeStatus, canonical.expected.AR_NOMAD);
  assert.ok(nomadUnknown.conditions.some((text) => text.includes(canonical.condition_must_reference)));

  canonical = argentinaCase('RENTISTA_THRESHOLD_BOUNDARY');
  result = calculateActiveCountry(profile({ applicantAmount: canonical.threshold.amount, applicantCurrency: 'ARS', applicantType: 'PASSIVE_INCOME', applicantCountryId: 'US' }), argentina, context);
  assert.equal(routeById(result, 'AR_RENTISTA').routeStatus, canonical.expected_at_threshold.AR_RENTISTA);
  result = calculateActiveCountry(profile({ applicantAmount: canonical.threshold.amount - 1, applicantCurrency: 'ARS', applicantType: 'PASSIVE_INCOME', applicantCountryId: 'US' }), argentina, context);
  assert.equal(routeById(result, 'AR_RENTISTA').routeStatus, canonical.expected_below_threshold.AR_RENTISTA);

  canonical = argentinaCase('PENSIONADO_THRESHOLD_BOUNDARY');
  result = calculateActiveCountry(profile({ applicantAmount: canonical.threshold.amount, applicantCurrency: 'ARS', applicantType: 'PENSION', applicantCountryId: 'US' }), argentina, context);
  assert.equal(routeById(result, 'AR_PENSIONADO').routeStatus, canonical.expected_at_threshold.AR_PENSIONADO);
  result = calculateActiveCountry(profile({ applicantAmount: canonical.threshold.amount - 1, applicantCurrency: 'ARS', applicantType: 'PENSION', applicantCountryId: 'US' }), argentina, context);
  assert.equal(routeById(result, 'AR_PENSIONADO').routeStatus, canonical.expected_below_threshold.AR_PENSIONADO);

  canonical = argentinaCase('NOMAD_FAMILY_REQUIRES_SEPARATE_BASIS');
  result = calculateActiveCountry(profile({ applicantAmount: 3000, applicantCurrency: 'USD', applicantType: 'REMOTE_EMPLOYMENT', applicantCountryId: 'US', adults: 2, childAges: [13] }), argentina, context);
  const familyNomad = routeById(result, 'AR_NOMAD');
  assert.equal(familyNomad.routeStatus, canonical.expected.AR_NOMAD);
  assert.equal(familyNomad.familyEvaluation.classification, canonical.family_classification);

  canonical = argentinaCase('INVESTOR_BLOCKING_GAP_NOT_PUBLISHED');
  const investor = argentina.routes.find(({ route_id }) => route_id === 'AR_INVESTOR_HIDDEN');
  assert.equal(investor.publishable, canonical.expected_publishable.AR_INVESTOR_HIDDEN);
  assert.equal(result.routes.some(({ routeId }) => routeId === 'AR_INVESTOR_HIDDEN'), false);

  assert.equal(argentina.cities.length, arFixture.country_invariants.displayed_cities);
  assert.ok(argentina.cities.every((city) => city.cost_components.length >= arFixture.country_invariants.minimum_cost_components_per_city));
  const lgbtCompleteness = argentina.completeness.blocks.find(({ block }) => block === 'LGBT');
  assert.equal(lgbtCompleteness.status, arFixture.country_invariants.lgbt_completeness);
  assert.deepEqual(argentina.lgbt.friendly_cities, []);
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
  const pkg = structuredClone(spain);
  pkg.routes.find(({ route_id }) => route_id === 'ES_ICT').publishable = true;
  const result = calculateActiveCountry(profile({ applicantAmount: 2500 }), pkg, context).routes.find(({ routeId }) => routeId === 'ES_ICT');
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

test('canonical CASE 6 treats failing income plus missing asked savings as condition', () => {
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

test('real Blue Card keeps future salary unknown while exposing its annual threshold', () => {
  const blue = calculateActiveCountry(profile({ applicantAmount: 99999 }), spain, context).routes
    .find(({ routeId }) => routeId === 'ES_HQP_BLUE');
  assert.equal(blue.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(blue.conditions.some((text) => /договор|firm.offer/iu.test(text)));
  assert.ok(blue.conditions.some((text) => /зарплат|порог.*Голуб/iu.test(text)));
  assert.equal(blue.financialSummary.state, 'UNKNOWN');
  assert.equal(blue.financialSummary.model, 'INCOME_ONLY');
  assert.equal(blue.financialSummary.alternatives.length, 1);
  assert.deepEqual(blue.financialSummary.alternatives[0], {
    requirementLabel: 'Будущая зарплата по договору должна достигать действующего порога Голубой карты ЕС.',
    kind: 'INCOME', kindLabel: 'Доход', state: 'UNKNOWN', amount: null,
    threshold: 41356.36, currency: 'EUR', period: 'ANNUAL', practicalGuidance: null,
    thresholdUsd: 45950, shortfall: null,
  });
});

test('real unasked Study finance preserves four alternatives and ordered family thresholds', () => {
  const getStudy = (input) => calculateActiveCountry(input, spain, context).routes.find(({ routeId }) => routeId === 'ES_STUDY');
  const solo = getStudy(profile());
  assert.equal(solo.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(solo.financialSummary.state, 'UNKNOWN');
  assert.equal(solo.financialSummary.model, 'SPONSOR_OR_SCHOLARSHIP');
  assert.deepEqual(solo.financialSummary.alternatives.map(({ kind }) => kind), ['INCOME', 'SAVINGS', 'SPONSOR', 'SCHOLARSHIP']);
  assert.ok(solo.financialSummary.alternatives.every(({ state }) => state === 'UNKNOWN'));
  assert.deepEqual(solo.financialSummary.alternatives.map(({ threshold, currency, period }) => ({ threshold, currency, period })), [
    { threshold: 600, currency: 'EUR', period: 'MONTHLY' },
    { threshold: 7200, currency: 'EUR', period: 'ANNUAL' },
    { threshold: null, currency: null, period: 'OTHER' },
    { threshold: null, currency: null, period: 'ACADEMIC_YEAR' },
  ]);
  const couple = getStudy(profile({ adults: 2 }));
  assert.deepEqual(couple.financialSummary.alternatives.slice(0, 2).map(({ threshold, currency, period }) => ({ threshold, currency, period })), [
    { threshold: 1050, currency: 'EUR', period: 'MONTHLY' },
    { threshold: 12600, currency: 'EUR', period: 'ANNUAL' },
  ]);
});

test('real unasked family-reunification finance uses its ordered child increment', () => {
  const pkg = structuredClone(spain);
  pkg.routes.find(({ route_id }) => route_id === 'ES_REUN').publishable = true;
  const getReun = (input) => calculateActiveCountry(input, pkg, context).routes.find(({ routeId }) => routeId === 'ES_REUN');
  const solo = getReun(profile({ applicantAmount: 99999 }));
  assert.equal(solo.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(solo.financialSummary.state, 'UNKNOWN');
  assert.equal(solo.financialSummary.model, 'INCOME_ONLY');
  assert.deepEqual(solo.financialSummary.alternatives.map(({ kind, state, threshold, currency, period }) => ({ kind, state, threshold, currency, period })), [
    { kind: 'INCOME', state: 'UNKNOWN', threshold: 900, currency: 'EUR', period: 'MONTHLY' },
  ]);
  const family = getReun(profile({ applicantAmount: 99999, adults: 2, children: 1 }));
  assert.equal(family.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.deepEqual(family.financialSummary.alternatives.map(({ state, threshold, currency, period }) => ({ state, threshold, currency, period })), [
    { state: 'UNKNOWN', threshold: 1200, currency: 'EUR', period: 'MONTHLY' },
  ]);
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

test('NLV route description excludes financial glossary while requirement identity reaches presentation', () => {
  const nlv = calculateActiveCountry(profile({ adults: 2, applicantType: 'REMOTE_EMPLOYMENT' }), spain, context).routes
    .find(({ routeId }) => routeId === 'ES_NLV');
  assert.equal(nlv.description, 'Проживание в Испании без трудовой или профессиональной деятельности при достаточных средствах.');
  assert.doesNotMatch(nlv.description, /IPREM|600 EUR|2 400 EUR/u);
  assert.equal(nlv.financialRequirements.length, 1);
  assert.equal(nlv.financialRequirements[0].requirementId, 'ES_NLV_FIN');
  assert.equal(nlv.financialRequirements[0].effect, 'CONDITION');
  const action = nlv.conditionActions.find(({ requirementId }) => requirementId === 'ES_NLV_FIN');
  assert.ok(action);
  assert.equal(action.requirementType, 'FINANCIAL');
  assert.deepEqual(action.financialSummary.alternatives.map(({ threshold, thresholdUsd }) => ({ threshold, thresholdUsd })),
    nlv.financialSummary.alternatives.map(({ threshold, thresholdUsd }) => ({ threshold, thresholdUsd })));
});

test('financial presentation identity supports one conditional and one satisfied requirement', () => {
  const pkg = structuredClone(spain);
  const route = pkg.routes.find(({ route_id }) => route_id === 'ES_DNV');
  const satisfied = route.requirements.find(({ requirement_id }) => requirement_id === 'ES_DNV_FIN');
  const conditional = structuredClone(satisfied);
  conditional.requirement_id = 'ES_DNV_SECOND_FIN';
  conditional.evaluation_mode = 'UNASKED_CONDITION';
  conditional.unmet_effect = 'BECOMES_CONDITION';
  conditional.condition_ru = 'Подтвердить второе финансовое требование.';
  route.requirements.push(conditional);
  const result = calculateActiveCountry(profile({ applicantAmount: 6000 }), pkg, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.deepEqual(result.financialRequirements.map(({ requirementId, effect }) => ({ requirementId, effect })), [
    { requirementId: 'ES_DNV_FIN', effect: 'NONE' },
    { requirementId: 'ES_DNV_SECOND_FIN', effect: 'CONDITION' },
  ]);
  assert.equal(result.conditionActions.some(({ requirementId }) => requirementId === 'ES_DNV_FIN'), false);
  assert.ok(result.conditionActions.some(({ requirementId, financialSummary }) => requirementId === 'ES_DNV_SECOND_FIN' && financialSummary.alternatives.length));
});

test('identical financial condition text preserves every requirement identity and summary', () => {
  const pkg = structuredClone(spain);
  const route = pkg.routes.find(({ route_id }) => route_id === 'ES_DNV');
  const original = route.requirements.find(({ requirement_id }) => requirement_id === 'ES_DNV_FIN');
  const sharedText = 'Подтвердить одинаково сформулированное финансовое условие.';
  const conditional = (id, amount) => ({
    ...structuredClone(original),
    requirement_id: id,
    evaluation_mode: 'UNASKED_CONDITION',
    unmet_effect: 'BECOMES_CONDITION',
    condition_ru: sharedText,
    financial: {
      ...structuredClone(original.financial),
      alternatives: original.financial.alternatives.map((item) => ({
        ...structuredClone(item), amount, family_formula: null, family_formula_ordered: null,
      })),
    },
  });
  route.requirements = [conditional('FIN_A', 1000), conditional('FIN_B', 2000)];
  const result = calculateActiveCountry(profile(), pkg, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.deepEqual(result.conditions, [sharedText]);
  assert.deepEqual(result.conditionActions.map(({ requirementId }) => requirementId), ['FIN_A', 'FIN_B']);
  assert.deepEqual(result.financialRequirements.map(({ requirementId, effect }) => ({ requirementId, effect })), [
    { requirementId: 'FIN_A', effect: 'CONDITION' },
    { requirementId: 'FIN_B', effect: 'CONDITION' },
  ]);
  assert.deepEqual(result.conditionActions.map(({ financialSummary }) => financialSummary.alternatives[0].threshold), [1000, 2000]);
});

test('identical financial and non-financial condition text preserves both identities', () => {
  const pkg = structuredClone(spain);
  const route = pkg.routes.find(({ route_id }) => route_id === 'ES_DNV');
  const financial = structuredClone(route.requirements.find(({ requirement_id }) => requirement_id === 'ES_DNV_FIN'));
  const nonFinancial = structuredClone(route.requirements.find(({ type }) => type !== 'FINANCIAL' && type !== 'DISPLAY_ONLY'));
  const sharedText = 'Выполнить одинаково сформулированное условие.';
  Object.assign(financial, {
    requirement_id: 'FIN_SHARED', evaluation_mode: 'UNASKED_CONDITION',
    unmet_effect: 'BECOMES_CONDITION', condition_ru: sharedText,
  });
  Object.assign(nonFinancial, {
    requirement_id: 'NON_FIN_SHARED', evaluation_mode: 'UNASKED_CONDITION',
    unmet_effect: 'BECOMES_CONDITION', condition_ru: sharedText,
  });
  route.requirements = [financial, nonFinancial];
  const result = calculateActiveCountry(profile(), pkg, context).routes.find(({ routeId }) => routeId === 'ES_DNV');
  assert.deepEqual(result.conditions, [sharedText]);
  assert.deepEqual(result.conditionActions.map(({ requirementId, requirementType }) => ({ requirementId, requirementType })), [
    { requirementId: 'FIN_SHARED', requirementType: 'FINANCIAL' },
    { requirementId: 'NON_FIN_SHARED', requirementType: nonFinancial.type },
  ]);
  assert.ok(result.conditionActions.find(({ requirementId }) => requirementId === 'FIN_SHARED').financialSummary.alternatives.length);
  assert.equal(result.conditionActions.find(({ requirementId }) => requirementId === 'NON_FIN_SHARED').financialSummary, null);
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
  assert.equal(cities.find(({ cityId }) => cityId === 'ES_UNKNOWN').comparisonCostUsd, null);
  assert.equal(cities.every(({ comparisonCostUsd }) => comparisonCostUsd === null), true);
});

test('LGBT presentation follows the profile toggle and contains only RP4 fields', () => {
  assert.equal(calculateActiveCountry({ ...profile(), lgbt: { enabled: false } }, spain, context).lgbt, null);
  const visible = calculateActiveCountry({ ...profile(), lgbt: { enabled: true } }, spain, context).lgbt;
  assert.ok(visible);
  assert.equal(visible.practicalExplanation, spain.lgbt.assessment_basis_ru);
  assert.ok(visible.rows.some(([title, text]) => title === 'Однополый брак' && text === spain.lgbt.same_sex_marriage_rule_ru));
});

test('RP4 presentation mappings exhaustively localize financial kinds and application methods', () => {
  assert.deepEqual(FINANCIAL_KIND_LABELS_RU, {
    INCOME: 'Доход', SAVINGS: 'Накопления', CAPITAL: 'Инвестиционный капитал',
    SPONSOR: 'Спонсорское финансирование', SCHOLARSHIP: 'Стипендия',
  });
  assert.deepEqual(APPLICATION_METHOD_LABELS_RU, {
    ORIGIN_COUNTRY: 'В стране гражданства',
    CURRENT_LEGAL_RESIDENCE: 'В стране законного проживания',
    IN_COUNTRY: 'Внутри страны назначения',
    THIRD_COUNTRY: 'В подтверждённой третьей стране',
    ONLINE: 'Электронная подача или электронный этап процедуры',
  });
  assert.doesNotMatch(APPLICATION_METHOD_LABELS_RU.ONLINE, /полностью|без въезда|дистанционно/u);
  const esRoutes = calculateActiveCountry(profile(), spain, context).routes;
  assert.ok(esRoutes.flatMap(({ application }) => application).some(({ method, methodLabel }) => method === 'ORIGIN_COUNTRY' && methodLabel === APPLICATION_METHOD_LABELS_RU.ORIGIN_COUNTRY));
  assert.ok(esRoutes.flatMap(({ application }) => application).some(({ method, methodLabel }) => method === 'CURRENT_LEGAL_RESIDENCE' && methodLabel === APPLICATION_METHOD_LABELS_RU.CURRENT_LEGAL_RESIDENCE));
  assert.ok(esRoutes.flatMap(({ application }) => application).some(({ method, methodLabel }) => method === 'ONLINE' && methodLabel === APPLICATION_METHOD_LABELS_RU.ONLINE));
  const arRoutes = calculateActiveCountry(profile(), argentina, context).routes;
  assert.ok(arRoutes.flatMap(({ application }) => application).some(({ method, methodLabel }) => method === 'IN_COUNTRY' && methodLabel === APPLICATION_METHOD_LABELS_RU.IN_COUNTRY));
  assert.ok(arRoutes.flatMap(({ application }) => application).some(({ method, methodLabel }) => method === 'ONLINE' && methodLabel === APPLICATION_METHOD_LABELS_RU.ONLINE));
  assert.ok(arRoutes.flatMap(({ application }) => application).some(({ entryGuidance }) => entryGuidance?.trim()));
});

test('numeric financial kinds and first-permit duration survive generic presentation', () => {
  const es = calculateActiveCountry(profile(), spain, context);
  const visibleKinds = es.routes.flatMap(({ financialSummary }) => financialSummary?.alternatives || []).filter(({ threshold }) => threshold != null);
  assert.ok(visibleKinds.some(({ kind, kindLabel }) => kind === 'INCOME' && kindLabel === 'Доход'));
  assert.ok(visibleKinds.some(({ kind, kindLabel }) => kind === 'SAVINGS' && kindLabel === 'Накопления'));
  const worker = calculateActiveCountry(profile(), argentina, context).routes.find(({ routeId }) => routeId === 'AR_WORKER');
  assert.equal(worker.firstPermit.months, 12);
  assert.match(worker.firstPermit.description, /Временная резиденция/u);
});

test('RP4 LGBT assessments are localized and friendly cities expose names only', () => {
  assert.deepEqual(LGBT_LEGAL_LABELS_RU, {
    FULL_RECOGNITION: 'Полное признание', PARTIAL_RECOGNITION: 'Частичное признание',
    SIGNIFICANT_LEGAL_RESTRICTIONS: 'Существенные правовые ограничения', CRIMINALIZATION: 'Криминализация',
    INSUFFICIENT_RELIABLE_DATA: 'Недостаточно надёжных данных',
  });
  assert.deepEqual(LGBT_PRACTICAL_LABELS_RU, {
    OPEN: 'Открытая', HETEROGENEOUS: 'Неоднородная', RESTRICTED: 'Ограниченная',
    STATE_PRESSURE: 'Государственное давление', INSUFFICIENT_RELIABLE_DATA: 'Недостаточно надёжных данных',
  });
  for (const pkg of [spain, argentina]) {
    const visible = calculateActiveCountry({ ...profile(), lgbt: { enabled: true } }, pkg, context).lgbt;
    assert.equal(visible.legalPosition, LGBT_LEGAL_LABELS_RU[pkg.lgbt.legal_assessment]);
    assert.equal(visible.practicalEnvironment, LGBT_PRACTICAL_LABELS_RU[pkg.lgbt.practical_assessment]);
    assert.deepEqual(visible.loyalCities, []);
  }
});

test('current common baskets drive only valid within-country extrema', () => {
  const arCities = calculateActiveCountry(profile(), argentina, context).cities;
  assert.deepEqual(arCities[0].comparisonComponents, ['RENT_STANDARD', 'UTILITIES', 'TRANSPORT']);
  assert.ok(arCities.some(({ labels }) => labels.includes('Самый дорогой')));
  assert.ok(arCities.some(({ labels }) => labels.includes('Самый недорогой')));
  const esCities = calculateActiveCountry(profile(), spain, context).cities;
  assert.deepEqual(esCities[0].comparisonComponents, ['RENT_STANDARD', 'UTILITIES']);
  assert.equal(esCities.every(({ comparisonCostUsd }) => Number.isFinite(comparisonCostUsd)), true);
  assert.ok(esCities.some(({ labels }) => labels.includes('Самый дорогой')));
  assert.ok(esCities.some(({ labels }) => labels.includes('Самый недорогой')));
  const uyCities = calculateActiveCountry(profile(), uruguay, { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } }).cities;
  assert.deepEqual(uyCities[0].comparisonComponents, ['RENT_STANDARD']);
  assert.ok(uyCities.find(({ cityId }) => cityId === 'UY_MONTEVIDEO').labels.includes('Самый дорогой'));
  assert.ok(uyCities.find(({ cityId }) => cityId === 'UY_MALDONADO').labels.includes('Самый недорогой'));
});

test('city baskets normalize recurring periods and mixed FX without household scaling', () => {
  const city = (cityId, costs) => ({
    city_id: cityId, name_ru: cityId, structural_roles: ['SMALL'], climate: null,
    cost_components: costs,
  });
  const cost = (component, amount, currency, period, householdBasis) => ({
    component, amount, currency, period, household_basis: householdBasis,
    condition_ru: component === 'RENT_STANDARD' ? 'Одна спальня в центре.' : 'Условие.',
  });
  const recurring = [
    cost('RENT_STANDARD', 100, 'USD', 'MONTHLY', 'PER_HOUSEHOLD'),
    cost('GROCERIES', 10, 'USD', 'MONTHLY', 'PER_ADULT'),
    cost('UTILITIES', 1200, 'EUR', 'ANNUAL', 'PER_HOUSEHOLD'),
    cost('TRANSPORT', 5, 'USD', 'MONTHLY', 'PER_PERSON'),
    cost('HEALTHCARE', 7, 'USD', 'MONTHLY', 'PER_CHILD'),
    cost('OTHER_CORE', 999, 'USD', 'ONE_TIME', 'PER_HOUSEHOLD'),
  ];
  const pkg = { ...spain, cities: [city('A', recurring), city('B', recurring.map((item) => ({
    ...item, currency: item.currency === 'USD' ? 'EUR' : 'USD', amount: item.currency === 'USD' ? item.amount * 0.9 : item.amount / 0.9,
  })))] };
  const cities = calculateActiveCountry(profile({ adults: 2, children: 1 }), pkg, context).cities;
  const expected = 100 + 10 + (1200 / 0.9 / 12) + 5;
  assert.ok(Math.abs(cities[0].comparisonCostUsd - expected) < 0.001);
  assert.equal(cities[0].costOriginal, null);
  assert.deepEqual(cities[0].comparisonComponents, ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT']);
  assert.equal('costUsd' in cities[0], false);
  assert.equal('baseCostUsd' in cities[0], false);
  assert.ok(cities.some(({ labels }) => labels.includes('Самый дорогой')));
  assert.ok(cities.some(({ labels }) => labels.includes('Самый недорогой')));
});

test('common basket is the ordered intersection of compatible recurring scenarios', () => {
  const component = (name, basis = 'PER_HOUSEHOLD') => ({
    component: name, amount: 10, currency: 'USD', period: 'MONTHLY', household_basis: basis, condition_ru: 'Условие.',
  });
  const city = (id, components) => ({ city_id: id, name_ru: id, structural_roles: ['SMALL'], climate: null, cost_components: components });
  const base = ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT'].map((name) => component(name));
  const calculate = (cities) => calculateActiveCountry(profile(), { ...spain, cities }, context).cities;
  const intersection = calculate([city('A', base), city('B', base.slice(0, 3))]);
  assert.deepEqual(intersection[0].comparisonComponents, ['RENT_STANDARD', 'UTILITIES', 'GROCERIES']);
  assert.deepEqual(intersection[1].comparisonComponents, intersection[0].comparisonComponents);
  assert.ok(intersection.every(({ comparisonCostUsd }) => Number.isFinite(comparisonCostUsd)));
  assert.ok(intersection.some(({ labels }) => labels.includes('Самый дорогой')));

  const basisMismatch = calculate([city('A', base), city('B', base.map((item) => item.component === 'TRANSPORT' ? { ...item, household_basis: 'PER_PERSON' } : item))]);
  assert.deepEqual(basisMismatch[0].comparisonComponents, ['RENT_STANDARD', 'UTILITIES', 'GROCERIES']);

  const scenarioMismatch = calculate([city('A', base), city('B', base.map((item) => item.component === 'RENT_STANDARD' ? { ...item, condition_ru: 'Другой сценарий аренды.' } : item))]);
  assert.equal(scenarioMismatch[0].comparisonComponents.includes('RENT_STANDARD'), false);
  assert.equal(scenarioMismatch.every(({ comparisonCostUsd }) => comparisonCostUsd === null), true);
});

test('rent-only comparison renders extrema while missing rent suppresses numeric comparison', () => {
  const component = (name, amount, currency = 'USD') => ({
    component: name, amount, currency, period: 'MONTHLY', household_basis: 'PER_HOUSEHOLD', condition_ru: 'Одинаковый сценарий.',
  });
  const city = (id, components) => ({ city_id: id, name_ru: id, structural_roles: ['SMALL'], climate: null, cost_components: components });
  const calculate = (cities, fx = context) => calculateActiveCountry(profile(), { ...spain, cities }, fx).cities;
  const rentOnly = calculate([city('A', [component('RENT_STANDARD', 100)]), city('B', [component('RENT_STANDARD', 90, 'EUR')])]);
  assert.deepEqual(rentOnly[0].comparisonComponents, ['RENT_STANDARD']);
  assert.ok(rentOnly.every(({ comparisonCostUsd }) => Number.isFinite(comparisonCostUsd)));
  assert.ok(rentOnly.some(({ labels }) => labels.includes('Самый дорогой')));

  const noRent = calculate([city('A', [component('UTILITIES', 100)]), city('B', [component('UTILITIES', 90)])]);
  assert.deepEqual(noRent[0].comparisonComponents, ['UTILITIES']);
  assert.equal(noRent.every(({ comparisonCostUsd }) => comparisonCostUsd === null), true);
  assert.equal(noRent.some(({ labels }) => labels.includes('Самый дорогой') || labels.includes('Самый недорогой')), false);
});

test('one unusable optional component is excluded country-wide without blocking rent comparison', () => {
  const component = (name, amount, currency = 'USD') => ({
    component: name, amount, currency, period: 'MONTHLY', household_basis: 'PER_HOUSEHOLD', condition_ru: 'Одинаковый сценарий.',
  });
  const city = (id, transport) => ({
    city_id: id, name_ru: id, structural_roles: ['SMALL'], climate: null,
    cost_components: [component('RENT_STANDARD', 100), component('UTILITIES', 10), transport],
  });
  const cities = calculateActiveCountry(profile(), { ...spain, cities: [
    city('A', component('TRANSPORT', 5)),
    city('B', component('TRANSPORT', 5, 'ZZZ')),
  ] }, context).cities;
  assert.deepEqual(cities[0].comparisonComponents, ['RENT_STANDARD', 'UTILITIES']);
  assert.ok(cities.every(({ comparisonCostUsd }) => Number.isFinite(comparisonCostUsd)));
});

test('HEALTHCARE and OTHER_CORE never affect comparison totals or extrema', () => {
  const component = (name, amount) => ({
    component: name, amount, currency: 'USD', period: 'MONTHLY', household_basis: 'PER_HOUSEHOLD', condition_ru: 'Условие.',
  });
  const city = (id, baseAmount, healthcare) => ({
    city_id: id, name_ru: id, structural_roles: ['SMALL'], climate: null,
    cost_components: [
      component('RENT_STANDARD', baseAmount),
      component('GROCERIES', baseAmount),
      component('UTILITIES', baseAmount),
      component('TRANSPORT', baseAmount),
      component('HEALTHCARE', healthcare),
    ],
  });
  const withoutOptional = calculateActiveCountry(profile(), {
    ...spain,
    cities: [city('HIGH_BASE', 100, 0), city('LOW_BASE', 50, 0)].map((item) => ({ ...item, cost_components: item.cost_components.slice(0, 4) })),
  }, context).cities;
  const cities = calculateActiveCountry(profile(), {
    ...spain,
    cities: [city('HIGH_BASE', 100, 1), {
      ...city('LOW_BASE', 50, 1000),
      cost_components: [...city('LOW_BASE', 50, 1000).cost_components, component('OTHER_CORE', 5000)],
    }],
  }, context).cities;
  const highBase = cities.find(({ cityId }) => cityId === 'HIGH_BASE');
  const lowBase = cities.find(({ cityId }) => cityId === 'LOW_BASE');
  assert.equal(highBase.comparisonCostUsd, 400);
  assert.equal(lowBase.comparisonCostUsd, 200);
  assert.deepEqual(cities.map(({ comparisonCostUsd }) => comparisonCostUsd), withoutOptional.map(({ comparisonCostUsd }) => comparisonCostUsd));
  assert.ok(highBase.labels.includes('Самый дорогой'));
  assert.ok(lowBase.labels.includes('Самый недорогой'));
});

test('city comparison is identical for solo and family profiles', () => {
  const uyuContext = { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } };
  const soloUy = calculateActiveCountry(profile(), uruguay, uyuContext).cities;
  const familyUy = calculateActiveCountry(profile({ adults: 2, children: 1 }), uruguay, uyuContext).cities;
  assert.deepEqual(familyUy.map(({ comparisonCostUsd }) => comparisonCostUsd), soloUy.map(({ comparisonCostUsd }) => comparisonCostUsd));
  const soloAr = calculateActiveCountry(profile(), argentina, context).cities;
  const familyAr = calculateActiveCountry(profile({ adults: 2, children: 1 }), argentina, context).cities;
  assert.deepEqual(familyAr.map(({ comparisonCostUsd }) => comparisonCostUsd), soloAr.map(({ comparisonCostUsd }) => comparisonCostUsd));
});

test('UY user-facing rent conditions omit source-maintenance metadata', () => {
  for (const cityId of ['UY_MONTEVIDEO', 'UY_SALTO', 'UY_MALDONADO', 'UY_COLONIA']) {
    const city = calculateActiveCountry(profile(), uruguay, { fx: { ...context.fx, rates: { ...context.fx.rates, UYU: 40 } } })
      .cities.find(({ cityId: id }) => id === cityId);
    const rent = city.comparisonScenarios.find(({ component }) => component === 'RENT_STANDARD');
    assert.equal(rent.condition, 'Однокомнатная квартира в центре.');
    assert.doesNotMatch(rent.condition, /research observation|price_date|exact source update date|Livingcost/i);
  }
});

test('ES rent scenarios expose one compatible user-facing scenario without source metadata', () => {
  const cities = calculateActiveCountry(profile(), spain, context).cities;
  for (const city of cities) {
    assert.deepEqual(city.comparisonComponents, ['RENT_STANDARD', 'UTILITIES']);
    assert.ok(Number.isFinite(city.comparisonCostUsd));
    const rent = city.comparisonScenarios.find(({ component }) => component === 'RENT_STANDARD');
    assert.equal(rent.condition, '1 спальня в центре.');
    assert.doesNotMatch(rent.condition, /Numbeo/u);
  }
});

test('SUITABLE_WITH_CONDITIONS always carries at least one condition', () => {
  for (const item of calculateActiveCountry(profile(), spain, context).routes) {
    if (item.routeStatus === 'SUITABLE_WITH_CONDITIONS') assert.ok(item.conditions.length > 0, item.routeId);
    if (item.conditions.length === 0) assert.notEqual(item.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  }
});
