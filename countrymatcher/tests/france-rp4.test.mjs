import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const france = JSON.parse(await readFile(new URL('../data/FR-research-v4.0.json', import.meta.url), 'utf8'));
const active = JSON.parse(await readFile(new URL('../data/active-countries.json', import.meta.url), 'utf8'));
const qualityOfLife = JSON.parse(await readFile(new URL('../data/quality-of-life-ru.json', import.meta.url), 'utf8'));
const context = { fx: { base_currency: 'USD', rates: { USD: 1, EUR: 0.85, RUB: 80 }, source: 'test', as_of: '2026-09-04' } };

const income = (amount, type = 'PASSIVE_INCOME') => ({
  owner: 'APPLICANT',
  type,
  source_geography: 'SINGLE_COUNTRY',
  country_id: 'RU',
  monthly_total: { amount, currency: 'EUR' },
  monthly_provable: { amount, currency: 'EUR' },
});

const profile = ({ amount = 0, savings = 0, type = 'PASSIVE_INCOME' } = {}) => ({
  citizenships: ['RU'],
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: { adults_count: 1, adult_ages: [35], partner_included: false, relationship_type: null, children: [], school_needed: false },
  lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
  income: { primary: income(amount, type), additional_sources: [], partner: { has_income: false, sources: [] }, savings: { amount: savings, currency: 'EUR' } },
  investment_capital: null,
  goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  special_circumstances: ['NONE'],
  route_specific_answers: {},
});

const calculation = (options = {}) => calculateActiveCountry(profile(options), france, context);
const result = (options, id) => calculation(options).routes.find(({ routeId }) => routeId === id);
const route = (id) => france.routes.find(({ route_id }) => route_id === id);

test('France is activated with full Canon coverage and its Quality of Life entry', () => {
  assert.equal(active.some(({ code, name }) => code === 'FR' && name === 'Франция'), true);
  assert.equal(france.route_coverage.length, 13);
  assert.equal(france.routes.length, 17);
  assert.equal(france.routes.filter(({ publishable }) => publishable).length, 12);
  assert.equal(france.routes.filter(({ publishable }) => !publishable).length, 5);
  assert.equal(france.completeness.country_ready_status, 'READY');
  assert.equal(france.completeness.blocks.some(({ status }) => status === 'BLOCKING_GAP'), false);
  assert.equal(
    france.open_items.some(({ blocks_publication, related_route_id }) => blocks_publication === true && related_route_id == null),
    false,
  );
  assert.equal(qualityOfLife.countries.FR.score, 8.5);
  assert.ok(qualityOfLife.countries.FR.narrative_ru.length >= 6);
});

test('visitor own income and savings pass only at their exact thresholds', () => {
  assert.equal(result({ amount: 1477.92 }, 'FR_VISITOR').routeStatus, 'UNSUITABLE');
  assert.equal(result({ amount: 1477.93 }, 'FR_VISITOR').routeStatus, 'SUITABLE');
  assert.equal(result({ savings: 17735.18 }, 'FR_VISITOR').routeStatus, 'UNSUITABLE');
  assert.equal(result({ savings: 17735.19 }, 'FR_VISITOR').routeStatus, 'SUITABLE');
});

test('visitor third-party support remains a separate unasked financial branch when own resources fail', () => {
  const below = calculation({ amount: 1000, savings: 1000 });
  assert.equal(below.routes.find(({ routeId }) => routeId === 'FR_VISITOR').routeStatus, 'UNSUITABLE');
  assert.equal(below.routes.find(({ routeId }) => routeId === 'FR_VISITOR_SPONSOR').routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(route('FR_VISITOR_SPONSOR').name_ru, 'Visitor — средства третьего лица');
  const sponsor = route('FR_VISITOR_SPONSOR').requirements.find(({ requirement_id }) => requirement_id === 'FR_VISITOR_SPONSOR_FUNDS');
  assert.match(sponsor.condition_ru, /третьего лица/);
  assert.equal(sponsor.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(sponsor.financial.alternatives[0].kind, 'SPONSOR');
  assert.equal(sponsor.financial.alternatives[0].asked_in_questionnaire, false);
});


test('French routes with an unasked qualifying basis are presented as requiring a separate basis', () => {
  const expected = {
    FR_EMPLOYEE: 'FR_EMPLOYEE_CONTRACT',
    FR_BLUE_CARD: 'FR_BC_CONTRACT',
    FR_SELF_EMPLOYED: 'FR_SELF_ACTIVITY',
    FR_TALENT_INVESTOR: 'FR_INV_CONTROL',
    FR_STUDENT: 'FR_STUDENT_ADMISSION',
    FR_TALENT_QUALIFIED: 'FR_TQ_CONTRACT',
    FR_TALENT_INNOVATIVE_EMP: 'FR_TI_COMPANY',
    FR_TALENT_RESEARCHER: 'FR_TR_HOST',
    FR_TALENT_BUSINESS: 'FR_TB_PROJECT',
    FR_TALENT_MEDICAL: 'FR_TM_LICENSE',
  };
  const evaluated = calculation();
  for (const [routeId, requirementId] of Object.entries(expected)) {
    const requirement = route(routeId).requirements.find(({ requirement_id }) => requirement_id === requirementId);
    assert.equal(requirement.requires_separate_basis, true, `${routeId}/${requirementId}`);
    assert.equal(evaluated.routes.find(({ routeId: id }) => id === routeId).presentationGroup, 'REQUIRES_SEPARATE_BASIS', routeId);
  }
  assert.notEqual(evaluated.routes.find(({ routeId }) => routeId === 'FR_VISITOR').presentationGroup, 'REQUIRES_SEPARATE_BASIS');
  assert.notEqual(evaluated.routes.find(({ routeId }) => routeId === 'FR_VISITOR_SPONSOR').presentationGroup, 'REQUIRES_SEPARATE_BASIS');
});

test('France explains first-category dog restrictions with recognizable examples', () => {
  assert.match(france.pets.import_restrictions.explanation_ru, /American Staffordshire Terrier/);
  assert.match(france.pets.import_restrictions.explanation_ru, /pit bull/i);
  assert.match(france.pets.import_restrictions.explanation_ru, /Mastiff\/boerbull/);
  assert.match(france.pets.import_restrictions.explanation_ru, /Tosa/);
});

test('future French employment salary never consumes current foreign income', () => {
  const highForeignSalary = { amount: 20000, type: 'REMOTE_EMPLOYMENT' };
  assert.equal(result(highForeignSalary, 'FR_EMPLOYEE').routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(result(highForeignSalary, 'FR_BLUE_CARD').routeStatus, 'SUITABLE_WITH_CONDITIONS');
  const employeeContract = route('FR_EMPLOYEE').requirements.find(({ requirement_id }) => requirement_id === 'FR_EMPLOYEE_CONTRACT');
  const blueCardSalary = route('FR_BLUE_CARD').requirements.find(({ requirement_id }) => requirement_id === 'FR_BC_SALARY');
  assert.equal(employeeContract.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(blueCardSalary.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(blueCardSalary.financial.alternatives[0].asked_in_questionnaire, false);
});

test('investment and student financial alternatives preserve their distinct semantics', () => {
  const capital = route('FR_TALENT_INVESTOR').requirements.find(({ requirement_id }) => requirement_id === 'FR_INV_AMOUNT');
  const capitalAlternative = capital.financial.alternatives[0];
  assert.equal(capitalAlternative.kind, 'CAPITAL');
  assert.equal(capitalAlternative.amount, 300000);
  assert.equal(capitalAlternative.currency, 'EUR');
  assert.equal(capitalAlternative.period, 'ONE_TIME');

  const studentFunds = route('FR_STUDENT').requirements.find(({ requirement_id }) => requirement_id === 'FR_STUDENT_FUNDS');
  assert.deepEqual(studentFunds.financial.alternatives.map(({ kind }) => kind), ['INCOME', 'SAVINGS', 'SPONSOR', 'SCHOLARSHIP']);
  assert.equal(result({}, 'FR_STUDENT').routeStatus, 'SUITABLE_WITH_CONDITIONS');
});

test('specialized routes stay hidden by the product publication boundary', () => {
  for (const id of ['FR_ICT', 'FR_FAMILY_REUNIFICATION', 'FR_ASYLUM', 'FR_STUDENT_TRAINEE', 'FR_VOLUNTEER']) {
    assert.equal(route(id).publishable, false, id);
    assert.equal(calculation().routes.some(({ routeId }) => routeId === id), false, id);
  }
});

test('each French comparison city has canonical roles and the complete one-person basket', () => {
  assert.deepEqual(france.cities.map(({ city_id }) => city_id), ['FR_PARIS', 'FR_LYON', 'FR_NANTES', 'FR_DIJON']);
  assert.deepEqual(france.cities.map(({ structural_roles }) => structural_roles), [['CAPITAL', 'LARGE'], ['LARGE'], ['MEDIUM'], ['SMALL']]);
  for (const city of france.cities) {
    assert.deepEqual(city.cost_components.map(({ component }) => component).sort(), ['GROCERIES', 'RENT_STANDARD', 'TRANSPORT', 'UTILITIES']);
  }
});

test('student residence requires a change of basis while preserving partial EU long-term-resident counting', () => {
  const path = route('FR_STUDENT').long_term_path;
  assert.equal(path.pr_path_status, 'REQUIRES_CHANGE_OF_BASIS');
  assert.equal(path.years_to_pr, null);
  assert.equal(path.residence_counts_for_pr, 'PARTIAL');
});

test('visitor citizenship keeps the five-year minimum but exposes the professional-integration conflict', () => {
  const path = route('FR_VISITOR').long_term_path;
  assert.equal(path.citizenship_path_status, 'CONDITIONAL');
  assert.equal(path.years_to_citizenship, 5);
  assert.match(path.citizenship_path_ru, /профессиональн/);
  assert.match(path.citizenship_path_ru, /статус visiteur запрещает профессиональную деятельность/);
  assert.ok(path.source_ids.includes('FR_SRC_NATURALIZATION_INSERTION'));
});

test('an adult child no longer causes a France data-contract failure', () => {
  const p = profile({ amount: 2000 });
  p.family = {
    adults_count: 2,
    adult_ages: [35, 35],
    partner_included: true,
    relationship_type: 'MARRIED',
    children: [{ age_years: 19 }],
    school_needed: false,
  };
  const calculationWithAdultChild = calculateActiveCountry(p, france, context);
  assert.equal(calculationWithAdultChild.routes.length, 12);
  for (const evaluated of calculationWithAdultChild.routes) {
    assert.notEqual(evaluated.routeStatus, 'DATA_CONTRACT_PROBLEM', evaluated.routeId);
  }
  const visitor = calculationWithAdultChild.routes.find(({ routeId }) => routeId === 'FR_VISITOR');
  assert.ok(visitor.conditions.some((condition) => condition.includes('собственное основание')));
});

test('registered partnership is not silently treated as marriage for ordinary or talent family mechanisms', () => {
  const p = profile({ amount: 2000 });
  p.family = {
    adults_count: 2,
    adult_ages: [35, 35],
    partner_included: true,
    relationship_type: 'REGISTERED_PARTNERSHIP',
    children: [],
    school_needed: false,
  };
  const calculationWithPartnership = calculateActiveCountry(p, france, context);
  for (const id of ['FR_VISITOR', 'FR_BLUE_CARD', 'FR_TALENT_QUALIFIED']) {
    const evaluated = calculationWithPartnership.routes.find(({ routeId }) => routeId === id);
    assert.ok(evaluated.conditions.some((condition) => condition.includes('признаваемый брак')), id);
  }
});

test('France LGBT copy has no unresolved-research language and no Ruglish publication-boundary phrases', () => {
  assert.equal(france.lgbt.registered_partnership_rule_ru.includes('требуют дополнительной проверки'), false);
  assert.equal(france.lgbt.assessment_basis_ru.includes('нуждается в дополнительной проверке'), false);
  const serialized = JSON.stringify(france);
  for (const term of ['statutory inventory', 'statutory основание', 'product publication boundary']) {
    assert.equal(serialized.includes(term), false, term);
  }
});

test('student threshold uses the specialized source even though mixed known/unknown financing stays unasked in the current contract', () => {
  const studentFunds = route('FR_STUDENT').requirements.find(({ requirement_id }) => requirement_id === 'FR_STUDENT_FUNDS');
  assert.ok(studentFunds.source_ids.includes('FR_SRC_STUDENT_FUNDS'));
  assert.ok(studentFunds.source_ids.includes('FR_SRC_STUDENT_RESOURCES'));
});

test('hidden asylum inventory is fully researched for family timing and the six-month employment rule', () => {
  const asylum = route('FR_ASYLUM');
  assert.equal(asylum.family_scenarios.some(({ join_stage }) => join_stage === 'NOT_RESEARCHED'), false);
  const partner = asylum.family_scenarios.find(({ applies_to }) => applies_to === 'PARTNER');
  assert.deepEqual(partner.relationship_types, ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']);
  const child = asylum.family_scenarios.find(({ scenario_id }) => scenario_id === 'FR_ASYLUM_CHILD_UP_TO_19_AFTER_PROTECTION');
  assert.equal(child.child_age_max, 19);
  const adultChild = asylum.family_scenarios.find(({ scenario_id }) => scenario_id === 'FR_ASYLUM_CHILD_20_PLUS_INDEPENDENT_BASIS');
  assert.equal(adultChild.child_age_min, 20);
  assert.equal(asylum.applicant_work_rights.employment.available_after_months, 6);
  assert.ok(asylum.applicant_work_rights.employment.source_ids.includes('FR_SRC_ASYLUM_WORK'));
});
