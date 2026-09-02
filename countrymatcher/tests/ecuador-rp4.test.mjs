import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateActiveCountry, calculateFamilyThreshold, evaluateFamilyScenarios } from '../js/engine/rp4-engine.js';

const ecuador = JSON.parse(
  await readFile(new URL('../data/EC-research-v4.0.json', import.meta.url), 'utf8'),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: { USD: 1 },
    source: 'test',
    as_of: '2026-08-25',
  },
};

function profile({
  type = 'REMOTE_EMPLOYMENT',
  amount = 2_000,
  partnerIncluded = false,
  relationshipType = 'MARRIED',
  childrenCount = 0,
  savings = null,
} = {}) {
  return {
    residence: { current_country: 'RU', current_status: 'CITIZEN' },
    family: {
      adults_count: partnerIncluded ? 2 : 1,
      adult_ages: partnerIncluded ? [35, 35] : [35],
      partner_included: partnerIncluded,
      relationship_type: partnerIncluded ? relationshipType : null,
      children: Array.from({ length: childrenCount }, (_, index) => ({ age_years: 8 + index })),
      school_needed: childrenCount > 0,
    },
    income: {
      primary: {
        owner: 'APPLICANT',
        type,
        source_geography: 'SINGLE_COUNTRY',
        country_id: 'US',
        monthly_total: { amount, currency: 'USD' },
        monthly_provable: { amount, currency: 'USD' },
      },
      additional_sources: [],
      partner: { has_income: false, sources: [] },
      savings,
    },
    investment_capital: null,
    goal: {
      long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
      keep_russian_citizenship: 'NOT_REQUIRED',
    },
    pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  };
}

const calculate = (overrides = {}) => calculateActiveCountry(profile(overrides), ecuador, context);
const routeResult = (result, routeId) => result.routes.find(({ routeId: id }) => id === routeId);
const route = (routeId) => ecuador.routes.find(({ route_id }) => route_id === routeId);
const req = (routeId, requirementId) => route(routeId).requirements.find(({ requirement_id }) => requirement_id === requirementId);

test('Ecuador RP4 covers all 13 Canon route categories and keeps second-stage PR plus fiscal route unpublished', () => {
  assert.equal(ecuador.schema_version, '4.0');
  assert.equal(ecuador.canon_revision, '2026-08-08-final-lock');
  assert.equal(ecuador.country_id, 'EC');
  assert.equal(ecuador.route_coverage.length, 13);
  assert.ok(ecuador.route_coverage.every(({ result }) => result === 'ROUTE_EXISTS'));
  assert.equal(ecuador.routes.filter(({ publishable }) => publishable).length, 16);
  assert.deepEqual(
    ecuador.routes.filter(({ publishable }) => !publishable).map(({ route_id }) => route_id).sort(),
    ['EC_ICT', 'EC_FAMILY_TEMP_AMPARO', 'EC_FAMILY_PR_DIRECT', 'EC_OTHER_MARITIME', 'EC_PR_21_MONTHS', 'EC_FISCAL_TEMP_5Y'].sort(),
  );
  assert.deepEqual(
    ecuador.open_items.map(({ item_id }) => item_id).sort(),
    ['EC_FISCAL_TEMPORARY_5Y_OPERATION', 'EC_FISCAL_TEMPORARY_FINANCE_THRESHOLD_CONFLICT'].sort(),
  );
  assert.equal(ecuador.completeness.country_ready_status, 'READY');
});

test('Russian entry is visa-free 90 days in each 180-day period', () => {
  assert.equal(ecuador.entry_for_russian_citizen.entry_type, 'VISA_FREE');
  assert.equal(ecuador.entry_for_russian_citizen.visa_required, false);
  assert.equal(ecuador.entry_for_russian_citizen.maximum_stay_days, 90);
  assert.equal(ecuador.entry_for_russian_citizen.authorization_validity_days, 180);
  assert.match(ecuador.entry_for_russian_citizen.rule_ru, /90 дней в каждом 180-дневном периоде/);
});

test('Nomad uses 3 SBU monthly / 36 SBU annual and structured dependent formulas', () => {
  const alternatives = req('EC_DNV', 'EC_DNV_INCOME').financial.alternatives;
  assert.deepEqual(alternatives.map(({ amount, period }) => [amount, period]), [
    [1446, 'MONTHLY'],
    [17352, 'ANNUAL'],
  ]);
  const monthly = alternatives.find(({ period }) => period === 'MONTHLY');
  const annual = alternatives.find(({ period }) => period === 'ANNUAL');
  assert.deepEqual(monthly.family_formula, {
    base_applicant_amount: 1446,
    additional_adult_amount: 250,
    child_amount: 250,
  });
  assert.deepEqual(annual.family_formula, {
    base_applicant_amount: 17352,
    additional_adult_amount: 3000,
    child_amount: 3000,
  });
  assert.equal(annual.confidence, 'MEDIUM');
  assert.match(annual.family_formula_ru, /арифметическим производным/);
  assert.equal(calculateFamilyThreshold(monthly, profile()), 1446);
  assert.equal(calculateFamilyThreshold(monthly, profile({ partnerIncluded: true })), 1696);
  assert.equal(calculateFamilyThreshold(monthly, profile({ partnerIncluded: true, childrenCount: 1 })), 1946);
  assert.equal(calculateFamilyThreshold(annual, profile({ partnerIncluded: true })), 20352);
});


test('Official route sources use production or route-specific government URLs', () => {
  const sourceMap = new Map(ecuador.sources.map((source) => [source.source_id, source]));
  assert.equal(ecuador.sources.some(({ url }) => url.includes('gobec-dev02.gobiernoelectronico.gob.ec')), false);
  for (const routeId of ['EC_DNV', 'EC_RENTISTA', 'EC_JUBILADO', 'EC_STUDENT']) {
    const source = sourceMap.get(route(routeId).official_source_id);
    assert.ok(source, routeId);
    assert.match(source.url, /gob\.ec/);
    assert.notEqual(source.source_id, 'EC02');
  }
  for (const routeId of ['EC_LOCAL_EMPLOYMENT', 'EC_AUTONOMO_PRO_SERVICES', 'EC_ICT', 'EC_PR_21_MONTHS']) {
    const source = sourceMap.get(route(routeId).official_source_id);
    assert.ok(source, routeId);
    assert.match(source.url, /^https:\/\/www\.gob\.ec\//);
  }
});

test('Specialized OTHER routes no longer share one generic catalog source', () => {
  const sourceMap = new Map(ecuador.sources.map((source) => [source.source_id, source]));
  const routeIds = [
    'EC_OTHER_ARTIST',
    'EC_OTHER_RELIGIOUS',
    'EC_OTHER_VOLUNTEER',
    'EC_OTHER_MARITIME',
    'EC_OTHER_COOP_NGO_PRESS',
    'EC_OTHER_EXCEPTION',
    'EC_OTHER_EXCEPTION_180',
  ];
  const urls = routeIds.map((routeId) => sourceMap.get(route(routeId).official_source_id)?.url);
  assert.ok(urls.every(Boolean));
  assert.equal(new Set(urls).size, routeIds.length);
  assert.ok(urls.every((url) => url !== 'https://www.cancilleria.gob.ec/2020/06/16/visa-residencia-temporal/'));
});

test('Russian +90 tourist extension exclusion has a direct official migration source', () => {
  const sourceMap = new Map(ecuador.sources.map((source) => [source.source_id, source]));
  assert.match(ecuador.entry_for_russian_citizen.rule_ru, /не применяется/);
  assert.ok(ecuador.entry_for_russian_citizen.source_ids.includes('EC52'));
  assert.match(sourceMap.get('EC52').url, /procedure-MDI-45-/);
  assert.match(sourceMap.get('EC52').supports_ru, /не применяется к гражданам Российской Федерации/);
});

test('Every Ecuador evidence URL points beyond a bare domain root', () => {
  for (const source of ecuador.sources) {
    const parsed = new URL(source.url);
    assert.ok(parsed.pathname && parsed.pathname !== '/', `${source.source_id}:${source.url}`);
  }
});

test('SBU 2026 evidence points to the ministerial agreement, not a press release', () => {
  const source = ecuador.sources.find(({ source_id }) => source_id === 'EC05');
  assert.equal(source.source_type, 'LAW_OR_REGULATION');
  assert.match(source.title_ru, /MDT-2025-195/);
  assert.match(source.supports_ru, /482 USD/);
});

test('Jubilado 3-SBU threshold is backed by the current 2024 route card and LOMH regulation', () => {
  const source = ecuador.sources.find(({ source_id }) => source_id === 'EC50');
  assert.match(source.url, /MREMH-008-10-29-20240808/);
  assert.match(source.supports_ru, /3 SBU/);
  assert.match(source.supports_ru, /250 USD/);
  const pension = req('EC_JUBILADO', 'EC_JUBILADO_INCOME');
  assert.ok(pension.source_ids.includes('EC50'));
  assert.ok(pension.source_ids.includes('EC53'));
  assert.ok(pension.financial.alternatives[0].source_ids.includes('EC50'));
  assert.ok(pension.financial.alternatives[0].source_ids.includes('EC53'));
  const regulation = ecuador.sources.find(({ source_id }) => source_id === 'EC53');
  assert.match(regulation.supports_ru, /3 SBU/);
  assert.match(regulation.supports_ru, /250 USD/);
});

test('180-day exception route does not inherit the generic two-year PR path', () => {
  const short = route('EC_OTHER_EXCEPTION_180').long_term_path;
  assert.equal(short.first_permit_months, 6);
  assert.equal(short.renewal_status, 'CONDITIONAL');
  assert.equal(short.renewal_months, null);
  assert.match(short.renewal_ru, /180 дней/);
  assert.equal(short.pr_path_status, 'REQUIRES_CHANGE_OF_BASIS');
  assert.equal(short.years_to_pr, null);
  assert.equal(short.residence_counts_for_pr, 'CONDITIONAL');
  assert.match(short.pr_path_ru, /сама по себе не позволяет накопить более 21 месяца/);
});

test('Nomad runtime uses family-adjusted threshold', () => {
  assert.equal(routeResult(calculate({ amount: 1600 }), 'EC_DNV').routeStatus, 'SUITABLE');
  assert.equal(routeResult(calculate({ amount: 1600, partnerIncluded: true }), 'EC_DNV').routeStatus, 'UNSUITABLE');
  assert.notEqual(routeResult(calculate({ amount: 1700, partnerIncluded: true }), 'EC_DNV').routeStatus, 'UNSUITABLE');
});

test('Rentista and pension routes retain qualifying income semantics and +250 dependent formula', () => {
  for (const [routeId, requirementId] of [
    ['EC_RENTISTA', 'EC_RENTISTA_INCOME'],
    ['EC_JUBILADO', 'EC_JUBILADO_INCOME'],
  ]) {
    const alternative = req(routeId, requirementId).financial.alternatives[0];
    assert.deepEqual(alternative.family_formula, {
      base_applicant_amount: 1446,
      additional_adult_amount: 250,
      child_amount: 250,
    });
    assert.equal(calculateFamilyThreshold(alternative, profile({ partnerIncluded: true })), 1696);
  }
  assert.equal(routeResult(calculate({ type: 'PASSIVE_INCOME', amount: 1600 }), 'EC_RENTISTA').routeStatus, 'SUITABLE');
  assert.equal(routeResult(calculate({ type: 'PENSION', amount: 1600 }), 'EC_JUBILADO').routeStatus, 'SUITABLE');
  assert.equal(routeResult(calculate({ type: 'REMOTE_EMPLOYMENT', amount: 2000 }), 'EC_RENTISTA').routeStatus, 'UNSUITABLE');
});

test('Local employment keeps future basis and proportional part-time wording', () => {
  const result = routeResult(calculate({ type: 'REMOTE_EMPLOYMENT', amount: 5000 }), 'EC_LOCAL_EMPLOYMENT');
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  const salary = req('EC_LOCAL_EMPLOYMENT', 'EC_LOCAL_EMPLOYMENT_SALARY');
  assert.equal(salary.evaluation_mode, 'UNASKED_CONDITION');
  assert.match(salary.condition_ru, /пропорциональн/);
});

test('PR after 21 months is supporting-only and its requirements live in first-stage long-term paths', () => {
  const pr21 = route('EC_PR_21_MONTHS');
  assert.equal(pr21.publishable, false);
  const residence = req('EC_PR_21_MONTHS', 'EC_PR_21_MONTHS_RESIDENCE');
  assert.equal(residence.timing, 'BEFORE_APPLICATION');
  assert.equal(residence.requires_separate_basis, true);
  const means = req('EC_PR_21_MONTHS', 'EC_PR_21_MONTHS_MEANS');
  assert.equal(means.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(means.unmet_effect, 'BECOMES_CONDITION');
  const numeric = means.financial.alternatives.filter(({ comparison }) => comparison === 'AT_LEAST');
  assert.ok(numeric.some(({ amount, history_months }) => amount === 482 && history_months === 3));

  const result = calculate();
  assert.equal(result.routes.some(({ routeId }) => routeId === 'EC_PR_21_MONTHS'), false);

  const firstStageRoutes = ecuador.routes.filter(({ publishable, long_term_path }) =>
    publishable && long_term_path?.pr_path_status === 'AVAILABLE_AFTER_RESIDENCE');
  assert.ok(firstStageRoutes.length > 0);
  for (const item of firstStageRoutes) {
    assert.match(item.long_term_path.pr_path_ru, /более 21 месяца/);
    assert.match(item.long_term_path.pr_path_ru, /1 SBU/);
    assert.match(item.long_term_path.pr_path_ru, /трёхмесячн/);
  }
});

test('Student finance preserves numeric 1-SBU evidence and nonnumeric sponsor/scholarship paths', () => {
  const means = req('EC_STUDENT', 'EC_STUDENT_MEANS');
  assert.equal(means.evaluation_mode, 'UNASKED_CONDITION');
  assert.ok(means.financial.alternatives.some(({ kind, amount, comparison }) =>
    kind === 'INCOME' && amount === 482 && comparison === 'AT_LEAST'));
  assert.ok(means.financial.alternatives.some(({ kind, comparison }) => kind === 'SPONSOR' && comparison === 'NO_FIXED_THRESHOLD'));
  assert.ok(means.financial.alternatives.some(({ kind, comparison }) => kind === 'SCHOLARSHIP' && comparison === 'NO_FIXED_THRESHOLD'));
});

test('Investor never treats questionnaire savings as an already-established Ecuador investment', () => {
  const result = routeResult(calculate({ amount: 5000, savings: { amount: 100000, currency: 'USD' } }), 'EC_INVESTOR');
  assert.equal(result.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(result.conditions.length >= 1);
});

test('Fiscal-linked route stays excluded and records 2500/2510 official-source conflict', () => {
  const result = calculate();
  const fiscal = route('EC_FISCAL_TEMP_5Y');
  assert.equal(fiscal.publishable, false);
  assert.equal(result.routes.some(({ routeId }) => routeId === 'EC_FISCAL_TEMP_5Y'), false);
  const conflict = ecuador.open_items.find(({ item_id }) => item_id === 'EC_FISCAL_TEMPORARY_FINANCE_THRESHOLD_CONFLICT');
  assert.equal(conflict.block, 'TAXES');
  assert.equal(conflict.blocks_publication, true);
  assert.match(conflict.missing_ru, /2 500/);
  assert.match(conflict.missing_ru, /2 510/);
  const income = req('EC_FISCAL_TEMP_5Y', 'EC_FISCAL_FINANCE').financial.alternatives.find(({ kind }) => kind === 'INCOME');
  assert.equal(income.amount, 2500);
  assert.equal(income.confidence, 'MEDIUM');
  assert.ok(income.source_ids.includes('EC46'));
  assert.ok(income.source_ids.includes('EC47'));
});

test('Taxes completeness is partial only because of fiscal threshold conflict', () => {
  const taxes = ecuador.completeness.blocks.find(({ block }) => block === 'TAXES');
  assert.equal(taxes.status, 'PARTIAL_NON_BLOCKING');
  assert.deepEqual(taxes.open_item_ids, ['EC_FISCAL_TEMPORARY_FINANCE_THRESHOLD_CONFLICT']);
});

test('Every Ecuador city has exactly one size role and required four-component basket', () => {
  const sizeRoles = new Set(['LARGE', 'MEDIUM', 'SMALL']);
  const required = new Set(['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT']);
  for (const city of ecuador.cities) {
    assert.equal(city.structural_roles.filter((roleName) => sizeRoles.has(roleName)).length, 1, city.city_id);
    const components = new Set(city.cost_components.map(({ component }) => component));
    for (const component of required) assert.ok(components.has(component), `${city.city_id}:${component}`);
  }
  assert.ok(ecuador.cities.some(({ structural_roles }) => structural_roles.includes('CAPITAL')));
  assert.ok(ecuador.cities.some(({ structural_roles }) => structural_roles.includes('SMALL')));
});

test('School tuition uses actual Grade 1 and Grade 12 annual observations without ancillary fees', () => {
  const observations = ecuador.schools.international_school_tuition_observations;
  assert.deepEqual(observations.map(({ grade_stage, tuition }) => [grade_stage, tuition.amount]), [
    ['FIRST_GRADE', 15920],
    ['FINAL_GRADE', 18430],
  ]);
  assert.ok(observations.every(({ tuition }) => tuition.period === 'ACADEMIC_YEAR'));
});

test('Pet research preserves decision-relevant Ecuador import timing', () => {
  assert.equal(ecuador.pets.import_restrictions.status, 'RESTRICTIONS_FOUND');
  assert.match(ecuador.pets.import_restrictions.explanation_ru, /14 дней/);
  assert.match(ecuador.pets.import_restrictions.explanation_ru, /10 дней/);
  assert.match(ecuador.pets.import_restrictions.explanation_ru, /21 день/);
});


test('Derivative spouse and minor-child amparo is administrative-only and does not downgrade Ecuador start routes', () => {
  const derivativeRoutes = ecuador.routes.filter(({ family_scenarios: scenarios = [] }) =>
    scenarios.some(({ condition_ru = '' }) => condition_ru.includes('сама по себе не означает запрет совместного переезда'))
    || scenarios.some(({ applies_to, child_age_min, child_age_max, condition_ru = '' }) =>
      applies_to === 'CHILD'
      && child_age_min === 0
      && child_age_max === 17
      && condition_ru.includes('семейную процедуру amparo')));

  assert.ok(derivativeRoutes.length > 0);
  for (const item of derivativeRoutes) {
    const legalPartner = (item.family_scenarios || []).find(({ applies_to, relationship_types: types, condition_ru = '' }) =>
      applies_to === 'PARTNER'
      && Array.isArray(types)
      && types.includes('MARRIED')
      && types.includes('REGISTERED_PARTNERSHIP')
      && condition_ru.includes('сама по себе не означает запрет совместного переезда'));
    const minorChild = (item.family_scenarios || []).find(({ applies_to, child_age_min, child_age_max, condition_ru = '' }) =>
      applies_to === 'CHILD'
      && child_age_min === 0
      && child_age_max === 17
      && condition_ru.includes('семейную процедуру amparo'));

    if (legalPartner) {
      assert.equal(legalPartner.administrative_separate_filing, true, item.route_id);
      assert.equal(legalPartner.separate_route_required, false, item.route_id);
      assert.equal(legalPartner.join_stage, 'AFTER_INITIAL_RESIDENCE', item.route_id);
      const partnerFamily = evaluateFamilyScenarios(item, profile({ partnerIncluded: true }), ecuador.routes);
      assert.equal(partnerFamily.state, 'PASS', item.route_id);
    }

    if (minorChild) {
      assert.equal(minorChild.administrative_separate_filing, true, item.route_id);
      assert.equal(minorChild.separate_route_required, false, item.route_id);
      assert.equal(minorChild.join_stage, 'AFTER_INITIAL_RESIDENCE', item.route_id);
      const childFamily = evaluateFamilyScenarios(item, profile({ childrenCount: 1 }), ecuador.routes);
      assert.equal(childFamily.state, 'PASS', item.route_id);
    }
  }

  const dnv = routeResult(calculate({ amount: 6000, childrenCount: 1 }), 'EC_DNV');
  assert.equal(dnv.routeStatus, 'SUITABLE');
});

test('Unregistered partnership does not become unconditional direct family fit', () => {
  const result = routeResult(calculate({ partnerIncluded: true, relationshipType: 'UNREGISTERED_PARTNERSHIP' }), 'EC_DNV');
  assert.notEqual(result.routeStatus, 'SUITABLE');
});

test('Ecuador user-facing Russian copy follows 10.0.0 no-self-reference contract', () => {
  const forbidden = /(анкета\s+(?:не\s+)?(?:спрашивает|знает|устанавливает)|Country Matcher|движк|\bmatching\b|presentation[-\s]?only|\bengine\b|\bquestionnaire\b)/i;
  const violations = [];
  const walk = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (value && typeof value === 'object') {
      return Object.entries(value).forEach(([key, item]) => walk(item, path ? `${path}.${key}` : key));
    }
    if (typeof value === 'string' && path.split('.').pop()?.includes('_ru') && forbidden.test(value)) {
      violations.push({ path, value });
    }
  };
  walk(ecuador);
  assert.deepEqual(violations, []);
});
