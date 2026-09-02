import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const greece = JSON.parse(
  await readFile(new URL('../data/GR-research-v4.0.json', import.meta.url), 'utf8'),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: { USD: 1, EUR: 0.9 },
    source: 'test',
    as_of: '2026-08-26',
  },
};

const profile = ({
  type = 'REMOTE_EMPLOYMENT',
  amount = 0,
  currency = 'EUR',
  savings = 0,
  partner = false,
  children = [],
} = {}) => ({
  citizenships: ['RU'],
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: {
    adults_count: partner ? 2 : 1,
    adult_ages: partner ? [35, 35] : [35],
    partner_included: partner,
    relationship_type: partner ? 'MARRIED' : null,
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
      monthly_total: { amount, currency },
      monthly_provable: { amount, currency },
    },
    additional_sources: [],
    partner: { has_income: false, sources: [] },
    savings: { amount: savings, currency },
  },
  investment_capital: null,
  goal: {
    long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
    keep_russian_citizenship: 'NOT_REQUIRED',
  },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  special_circumstances: ['NONE'],
  route_specific_answers: {},
});

const routeData = (routeId) => greece.routes.find(({ route_id }) => route_id === routeId);
const routeResult = (calculation, routeId) => calculation.routes.find(({ routeId: id }) => id === routeId);

function calculate(options = {}) {
  return calculateActiveCountry(profile(options), greece, context);
}

test('Greece RP4 keeps full Canon coverage while publishing only completed routes', () => {
  assert.equal(greece.schema_version, '4.0');
  assert.equal(greece.canon_revision, '2026-08-08-final-lock');
  assert.equal(greece.country_id, 'GR');
  assert.equal(greece.country_name_ru, 'Греция');
  assert.equal(greece.country_currency, 'EUR');
  assert.equal(greece.route_coverage.length, 13);
  assert.equal(greece.routes.length, 74);
  assert.equal(greece.routes.filter(({ publishable }) => publishable).length, 15);
  assert.equal(greece.completeness.country_ready_status, 'PARTIAL');
});

test('every unpublished Greek route has its own blocking open item and publishable routes do not', () => {
  const blockingByRoute = new Map();
  for (const item of greece.open_items.filter(({ blocks_publication }) => blocks_publication)) {
    assert.ok(item.related_route_id, item.open_item_id);
    blockingByRoute.set(item.related_route_id, (blockingByRoute.get(item.related_route_id) || 0) + 1);
  }

  const productHidden = new Set(['GR_E2_ICT', 'GR_O1_FAMILY', 'GR_O3_GREEK_FAMILY', 'GR_EU_CITIZEN_FAMILY']);
  for (const route of greece.routes) {
    if (route.publishable) assert.equal(blockingByRoute.has(route.route_id), false, route.route_id);
    else if (productHidden.has(route.route_id)) assert.equal(blockingByRoute.has(route.route_id), false, route.route_id);
    else assert.equal(blockingByRoute.has(route.route_id), true, route.route_id);
  }
});

test('Digital Nomad official income threshold is a blocker, not a condition', () => {
  const below = routeResult(calculate({ amount: 3499 }), 'GR_Z1_DIGITAL_NOMAD');
  const at = routeResult(calculate({ amount: 3500 }), 'GR_Z1_DIGITAL_NOMAD');
  const zero = routeResult(calculate({ amount: 0 }), 'GR_Z1_DIGITAL_NOMAD');

  assert.equal(below.routeStatus, 'UNSUITABLE');
  assert.equal(below.financialSummary.state, 'FAIL');
  assert.equal(zero.routeStatus, 'UNSUITABLE');
  assert.equal(at.routeStatus, 'SUITABLE');
  assert.equal(at.financialSummary.state, 'PASS');
});

test('Digital Nomad family formula applies 20% for partner and 15% for each child', () => {
  const below = routeResult(
    calculate({ amount: 4724, partner: true, children: [7] }),
    'GR_Z1_DIGITAL_NOMAD',
  );
  const at = routeResult(
    calculate({ amount: 4725, partner: true, children: [7] }),
    'GR_Z1_DIGITAL_NOMAD',
  );

  assert.equal(below.routeStatus, 'UNSUITABLE');
  assert.equal(at.routeStatus, 'SUITABLE');
  assert.equal(at.financialSummary.alternatives[0].threshold, 4725);
});

test('I.8 accepts researched annual savings alternative and blocks when both sources are below threshold', () => {
  const below = routeResult(
    calculate({ type: 'PASSIVE_INCOME', amount: 0, savings: 41999 }),
    'GR_I8_SUFFICIENT_RESOURCES',
  );
  const at = routeResult(
    calculate({ type: 'PASSIVE_INCOME', amount: 0, savings: 42000 }),
    'GR_I8_SUFFICIENT_RESOURCES',
  );
  const zero = routeResult(
    calculate({ type: 'PASSIVE_INCOME', amount: 0, savings: 0 }),
    'GR_I8_SUFFICIENT_RESOURCES',
  );

  assert.equal(below.routeStatus, 'UNSUITABLE');
  assert.equal(zero.routeStatus, 'UNSUITABLE');
  assert.equal(at.routeStatus, 'SUITABLE');
  assert.equal(at.financialSummary.state, 'PASS');
});

test('I.8 work-rights presentation preserves the prohibition on economic activity', () => {
  const route = routeData('GR_I8_SUFFICIENT_RESOURCES');
  assert.equal(route.applicant_work_rights.employment.status, 'NOT_ALLOWED');
  assert.equal(route.applicant_work_rights.self_employment.status, 'NOT_ALLOWED');
  assert.equal(route.applicant_work_rights.remote_foreign_work.status, 'NOT_ALLOWED');
  assert.equal(route.partner_work_rights.employment.status, 'NOT_ALLOWED');
});

test('future Greek employment salary stays an unasked condition rather than current-income screening', () => {
  const blueCard = routeData('GR_E1_BLUE_CARD');
  const salary = blueCard.requirements.find(({ requirement_id }) => requirement_id === 'GR_E1_SALARY');
  assert.equal(salary.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(salary.financial.alternatives[0].asked_in_questionnaire, false);
  assert.equal(salary.financial.alternatives[0].comparison, 'OFFICIAL_FORMULA');

  const result = routeResult(
    calculate({ type: 'LOCAL_EMPLOYMENT', amount: 100000 }),
    'GR_E1_BLUE_CARD',
  );
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
});

test('ICT keeps completed NO_FIXED_THRESHOLD practical research as NOT_FOUND', () => {
  const route = routeData('GR_E2_ICT');
  const pay = route.requirements.find(({ requirement_id }) => requirement_id === 'GR_E2_PAY');
  const alternative = pay.financial.alternatives[0];

  assert.equal(pay.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(alternative.comparison, 'NO_FIXED_THRESHOLD');
  assert.equal(alternative.asked_in_questionnaire, false);
  assert.equal(alternative.practical_financial_guidance.status, 'NOT_FOUND');
  assert.equal(alternative.practical_screening_threshold, undefined);
});

test('ordinary savings never prove that a Greek qualifying investment was already made', () => {
  const investmentRoutes = greece.routes.filter(
    ({ route_id }) => /^GR_B[456]_/.test(route_id) && routeData(route_id).publishable,
  );
  assert.ok(investmentRoutes.length >= 8);

  for (const route of investmentRoutes) {
    for (const requirement of route.requirements.filter(({ financial }) => financial)) {
      for (const alternative of requirement.financial.alternatives) {
        assert.equal(alternative.kind, 'CAPITAL');
        assert.equal(alternative.asked_in_questionnaire, false);
      }
    }
  }

  const result = routeResult(
    calculate({ type: 'PASSIVE_INCOME', amount: 0, savings: 1000000 }),
    'GR_B5_PROPERTY_800',
  );
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
});

test('B.4 and B.5 preserve the statutory instrument and property threshold splits', () => {
  const amount = (routeId) => routeData(routeId).requirements[0].financial.alternatives[0].amount;
  assert.deepEqual(
    ['GR_B4_FINANCIAL_350', 'GR_B4_FINANCIAL_500', 'GR_B4_FINANCIAL_800'].map(amount),
    [350000, 500000, 800000],
  );
  assert.deepEqual(
    ['GR_B5_PROPERTY_800', 'GR_B5_PROPERTY_400', 'GR_B5_CONVERSION_250', 'GR_B5_LISTED_250'].map(amount),
    [800000, 400000, 250000, 250000],
  );
  assert.equal(routeData('GR_B6_STARTUP').long_term_path.first_permit_months, 12);
  assert.equal(routeData('GR_B6_STARTUP').long_term_path.renewal_months, 24);
});

test('protection remains an individual unasked basis and never auto-passes from ordinary profile facts', () => {
  const protection = routeData('GR_PROTECTION');
  assert.deepEqual(protection.covers_categories, ['INTERNATIONAL_PROTECTION']);
  assert.equal(protection.requirements[0].evaluation_mode, 'UNASKED_CONDITION');

  const result = routeResult(calculate(), 'GR_PROTECTION');
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.conditions.length, 1);

  const temporaryProtection = routeData('GR_P3_TEMPORARY_PROTECTION');
  assert.equal(temporaryProtection.publishable, false);
});

test('Greek long-term data does not promise a country-wide citizenship year', () => {
  for (const route of greece.routes.filter(({ publishable }) => publishable)) {
    assert.equal(route.long_term_path.years_to_citizenship, null, route.route_id);
  }
  assert.equal(routeData('GR_E2_ICT').long_term_path.pr_path_status, 'REQUIRES_CHANGE_OF_BASIS');
  assert.equal(routeData('GR_H1_STUDY').long_term_path.residence_counts_for_pr, 'PARTIAL');
});

test('Greek city comparison keeps one size role per city and the common four-component basket', () => {
  assert.deepEqual(greece.cities.map(({ name_ru }) => name_ru), ['Афины', 'Салоники', 'Патры', 'Ханья']);
  for (const city of greece.cities) {
    const sizeRoles = city.structural_roles.filter((role) => ['LARGE', 'MEDIUM', 'SMALL'].includes(role));
    assert.equal(sizeRoles.length, 1, city.city_id);
    assert.deepEqual(
      city.cost_components.map(({ component }) => component).sort(),
      ['GROCERIES', 'RENT_STANDARD', 'TRANSPORT', 'UTILITIES'],
      city.city_id,
    );
  }
  assert.deepEqual(routeData('GR_Z1_DIGITAL_NOMAD').covers_categories, ['DIGITAL_NOMAD_REMOTE_WORK']);
});
