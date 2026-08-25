import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';
import { formatCurrency } from '../matcher/format.js';

const chile = JSON.parse(
  await readFile(new URL('../data/CL-research-v4.0.json', import.meta.url), 'utf8'),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: { USD: 1, CLP: 900, CLF: 900 / 40865.87 },
    source: 'test',
    as_of: '2026-08-24',
  },
};

const profile = ({
  type = 'REMOTE_EMPLOYMENT',
  amount = 2000,
  children = [],
  savings = 50_000,
  routeSpecificAnswers = {},
} = {}) => ({
  citizenships: ['RU'],
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: {
    adults_count: 1,
    adult_ages: [35],
    partner_included: false,
    relationship_type: null,
    children: children.map((age) => ({ age_years: age })),
    school_needed: children.length > 0,
  },
  lgbt: {
    enabled: false,
    consent_for_personalization: false,
    family_recognition_relevant: null,
    safety_relevant: null,
  },
  income: {
    primary: {
      owner: 'APPLICANT',
      type,
      source_geography: 'SINGLE_COUNTRY',
      country_id: 'RU',
      monthly_total: { amount, currency: 'USD' },
      monthly_provable: { amount, currency: 'USD' },
    },
    additional_sources: [],
    partner: { has_income: false, sources: [] },
    savings: { amount: savings, currency: 'USD' },
  },
  investment_capital: null,
  goal: {
    long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
    keep_russian_citizenship: 'NOT_REQUIRED',
  },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  special_circumstances: ['NONE'],
  route_specific_answers: routeSpecificAnswers,
});

const routeData = (routeId) => chile.routes.find(({ route_id }) => route_id === routeId);
const requirementData = (routeId, requirementId) => routeData(routeId)
  ?.requirements.find(({ requirement_id }) => requirement_id === requirementId);
const routeResult = (result, routeId) => result.routes.find(({ routeId: id }) => id === routeId);

test('Chile RP4 pins the complete coverage map and publication boundary', () => {
  assert.equal(chile.schema_version, '4.0');
  assert.equal(chile.canon_revision, '2026-08-08-final-lock');
  assert.equal(chile.country_id, 'CL');
  assert.equal(chile.country_name_ru, 'Чили');
  assert.equal(chile.country_currency, 'CLP');
  assert.equal(chile.routes.length, 13);
  assert.equal(chile.routes.every(({ publishable }) => publishable), true);

  assert.deepEqual(
    chile.route_coverage.map(({ category, result }) => [category, result]),
    [
      ['DIGITAL_NOMAD_REMOTE_WORK', 'NO_ROUTE'],
      ['INCOME_FINANCIALLY_INDEPENDENT', 'ROUTE_EXISTS'],
      ['RETIREMENT', 'ROUTE_EXISTS'],
      ['LOCAL_EMPLOYMENT', 'ROUTE_EXISTS'],
      ['HIGHLY_QUALIFIED_SPECIALIST', 'ROUTE_EXISTS'],
      ['INTRA_COMPANY_TRANSFER', 'ROUTE_EXISTS'],
      ['ENTREPRENEURSHIP_SELF_EMPLOYMENT', 'ROUTE_EXISTS'],
      ['INVESTMENT', 'ROUTE_EXISTS'],
      ['STUDY', 'ROUTE_EXISTS'],
      ['FAMILY', 'ROUTE_EXISTS'],
      ['GENERAL_RESIDENCE', 'NO_ROUTE'],
      ['INTERNATIONAL_PROTECTION', 'ROUTE_EXISTS'],
      ['OTHER', 'ROUTE_EXISTS'],
    ],
  );

  assert.deepEqual(
    new Set(routeData('CL_PAID_ACTIVITIES').covers_categories),
    new Set(['LOCAL_EMPLOYMENT', 'ENTREPRENEURSHIP_SELF_EMPLOYMENT']),
  );
  assert.deepEqual(
    new Set(routeData('CL_INVESTOR_PERSONNEL').covers_categories),
    new Set(['INVESTMENT', 'HIGHLY_QUALIFIED_SPECIALIST', 'INTRA_COMPANY_TRANSFER']),
  );
});

test('Chile pensioner and rentista evaluate only the researched income semantics', () => {
  const pension = routeResult(
    calculateActiveCountry(profile({ type: 'PENSION', amount: 1 }), chile, context),
    'CL_PENSIONER',
  );
  assert.equal(pension.routeStatus, 'SUITABLE');

  const remotePension = routeResult(
    calculateActiveCountry(profile(), chile, context),
    'CL_PENSIONER',
  );
  assert.equal(remotePension.routeStatus, 'UNSUITABLE');

  const rentista = routeResult(
    calculateActiveCountry(profile({ type: 'PASSIVE_INCOME', amount: 1 }), chile, context),
    'CL_RENTISTA',
  );
  assert.equal(rentista.routeStatus, 'SUITABLE');

  const remoteRentista = routeResult(
    calculateActiveCountry(profile(), chile, context),
    'CL_RENTISTA',
  );
  assert.equal(remoteRentista.routeStatus, 'UNSUITABLE');

  for (const routeId of ['CL_PENSIONER', 'CL_RENTISTA']) {
    const financial = routeData(routeId).requirements[0].financial.alternatives[0];
    assert.equal(financial.comparison, 'NO_FIXED_THRESHOLD');
    assert.equal(financial.practical_screening_threshold, undefined);
    assert.equal(financial.practical_financial_guidance.evaluation_mode, 'DISPLAY_ONLY');
  }
});

test('Chile investment capital stays an unasked basis and savings do not prove it', () => {
  const requirement = requirementData('CL_INVESTOR_PERSONNEL', 'CL_INVESTMENT_CAPITAL');
  const capital = requirement.financial.alternatives[0];
  assert.equal(requirement.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(requirement.requires_separate_basis, true);
  assert.equal(capital.kind, 'CAPITAL');
  assert.equal(capital.asked_in_questionnaire, false);
  assert.equal(capital.amount, 500_000);
  assert.equal(capital.currency, 'USD');

  const result = calculateActiveCountry(profile({
    savings: 1_000_000,
    routeSpecificAnswers: {
      CL_INVESTOR_PERSONNEL: { investor_basis: 'INVESTMENT' },
    },
  }), chile, context);
  const investor = routeResult(result, 'CL_INVESTOR_PERSONNEL');
  assert.equal(investor.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.match(investor.conditions.join(' '), /сбережения .*не доказывают/u);
});

test('Chile student keeps admission separate and preserves the 30-hour work rule', () => {
  const student = routeData('CL_STUDENT');
  const admission = requirementData('CL_STUDENT', 'CL_STUDENT_ADMISSION');
  const maintenance = requirementData('CL_STUDENT', 'CL_STUDENT_MAINTENANCE');
  assert.equal(admission.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(admission.requires_separate_basis, true);
  assert.equal(maintenance.evaluation_mode, 'ENGINE');
  assert.deepEqual(
    maintenance.financial.alternatives.map(({ kind, comparison }) => [kind, comparison]),
    [['INCOME', 'NO_FIXED_THRESHOLD'], ['SAVINGS', 'NO_FIXED_THRESHOLD']],
  );
  assert.match(student.applicant_work_rights.employment.rule_ru, /30 часов в неделю/u);
  assert.equal(student.partner_work_rights.employment.status, 'ALLOWED');
});

test('Chile family and protection preserve same-sex partner semantics', () => {
  assert.equal(chile.lgbt.same_sex_marriage_recognized, 'YES');
  assert.equal(chile.lgbt.family_route_available, 'YES');
  assert.equal(chile.lgbt.anti_discrimination.applies_to_foreigners, 'YES');
  assert.equal(chile.lgbt.practical_assessment, 'HETEROGENEOUS');
  assert.deepEqual(chile.lgbt.friendly_cities, []);

  const expected = ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'];
  const studentPartner = routeData('CL_STUDENT').family_scenarios
    .find(({ applies_to }) => applies_to === 'PARTNER');
  const protectionFamily = routeData('CL_INTERNATIONAL_PROTECTION').family_scenarios
    .find(({ applies_to }) => applies_to === 'PARTNER_AND_CHILDREN');
  assert.deepEqual(studentPartner.relationship_types, expected);
  assert.deepEqual(protectionFamily.relationship_types, expected);
  assert.equal(routeData('CL_INTERNATIONAL_PROTECTION').partner_work_rights.employment.status, 'ALLOWED');
});

test('Chile entry, long-term path, cities and incomplete groceries are explicit', () => {
  assert.equal(chile.entry_for_russian_citizen.visa_required, false);
  assert.equal(chile.entry_for_russian_citizen.maximum_stay_days, 90);
  assert.equal(routeData('CL_PENSIONER').long_term_path.pr_path_status, 'AVAILABLE_AFTER_RESIDENCE');
  assert.equal(routeData('CL_PENSIONER').long_term_path.renunciation_required, false);

  assert.deepEqual(
    chile.cities.map(({ name_ru, structural_roles }) => [name_ru, structural_roles]),
    [
      ['Сантьяго', ['CAPITAL', 'LARGE']],
      ['Консепсьон', ['LARGE']],
      ['Ла-Серена', ['MEDIUM']],
      ['Пунта-Аренас', ['SMALL']],
    ],
  );
  for (const city of chile.cities) {
    const components = city.cost_components.map(({ component }) => component);
    assert.ok(components.includes('RENT_STANDARD'));
    assert.ok(components.includes('UTILITIES'));
    assert.ok(components.includes('TRANSPORT'));
    assert.equal(components.includes('GROCERIES'), false);
  }
});

test('Chile school tuition keeps source UF and converts it to USD through the indexed-unit FX rate', () => {
  assert.equal(chile.schools.international_school_status, 'AVAILABLE');
  assert.deepEqual(
    chile.schools.international_school_tuition_observations.map(({ grade_stage, tuition }) => [
      grade_stage, tuition.amount, tuition.currency, tuition.period,
    ]),
    [
      ['FIRST_GRADE', 514, 'CLF', 'ACADEMIC_YEAR'],
      ['FINAL_GRADE', 531, 'CLF', 'ACADEMIC_YEAR'],
    ],
  );

  const calculation = calculateActiveCountry(profile({ children: [12] }), chile, context);
  assert.ok(Math.abs(calculation.schoolPresentation.international.tuitionRangeUsd.minimum - (514 * 40865.87 / 900)) < 1e-9);
  assert.ok(Math.abs(calculation.schoolPresentation.international.tuitionRangeUsd.maximum - (531 * 40865.87 / 900)) < 1e-9);
  assert.deepEqual(calculation.schoolPresentation.international.tuitionRangeOriginal, {
    minimum: 514,
    maximum: 531,
    currency: 'CLF',
    period: 'ACADEMIC_YEAR',
  });
});

test('Chile school UI shows the converted USD range while preserving UF only as source data', async () => {
  const calculation = calculateActiveCountry(profile({ children: [12] }), chile, context);
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const schoolSource = app.slice(
    app.indexOf('const publicSchoolAccessLabel'),
    app.indexOf('function renderEntryPresentation'),
  );
  const renderSchool = Function(
    'currency',
    'html',
    `${schoolSource}; return renderSchoolPresentation;`,
  )(formatCurrency, (value) => String(value));

  const rendered = renderSchool(calculation);
  assert.match(rendered, /Стоимость обучения:/u);
  assert.match(rendered, /\$/u);
  assert.doesNotMatch(rendered, /\bCLF\b|\bUF\b/u);
});

test('Chile Russian presentation fields contain no untranslated English research jargon', () => {
  const forbidden = /\b(?:qualifying|residence|route|branch|subcategory|personnel|ordinary|legal|framework|basis|temporary|current|presence|naturalization|screening|guidance|maintenance|admission|contractor|employment|publishable|relocation|visitor|insurance|budget|observation|utilities|transport|ranking|availability|operational|matching)\b/iu;
  const violations = [];
  const visit = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === 'string' && key.endsWith('_ru') && forbidden.test(child)) violations.push([childPath, child]);
      else visit(child, childPath);
    }
  };
  visit(chile);
  assert.deepEqual(violations, []);
});

test('Chile keeps exactly the three audited non-blocking open items', () => {
  assert.equal(chile.completeness.country_ready_status, 'PARTIAL');
  assert.equal(chile.completeness.blocks.length, 14);
  assert.deepEqual(
    chile.open_items.map(({ item_id, blocks_publication }) => [item_id, blocks_publication]),
    [
      ['OI_CL_ROUTE_01', false],
      ['OI_CL_COST_01', false],
      ['OI_CL_SCHOOLS_01', false],
    ],
  );
  assert.deepEqual(chile.pending_changes, []);
});
