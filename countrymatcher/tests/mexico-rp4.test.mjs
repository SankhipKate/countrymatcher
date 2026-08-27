import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  calculateActiveCountry,
} from '../js/engine/rp4-engine.js';

const mexico = JSON.parse(
  await readFile(
    new URL('../data/MX-research-v4.0.json', import.meta.url),
    'utf8',
  ),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: {
      USD: 1,
      MXN: 18.6,
    },
    source: 'test',
    as_of: '2026-08-16',
  },
};

const incomeSource = (
  type,
  amount,
  currency = 'MXN',
  countryId = 'RU',
  geography = 'SINGLE_COUNTRY',
) => ({
  owner: 'APPLICANT',
  type,
  source_geography: geography,
  country_id: geography === 'SINGLE_COUNTRY' ? countryId : null,
  monthly_total: { amount, currency },
  monthly_provable: { amount, currency },
});

const profile = ({
  applicantAmount = 80000,
  applicantCurrency = 'MXN',
  applicantType = 'REMOTE_EMPLOYMENT',
  applicantCountryId = 'RU',
  applicantGeography = 'SINGLE_COUNTRY',
  adults = 1,
  children = 0,
  childAges = null,
  partnerIncluded = adults === 2,
  relationshipType = partnerIncluded ? 'MARRIED' : null,
  savingsAmount = null,
  savingsCurrency = 'MXN',
} = {}) => ({
  residence: {
    current_country: 'RU',
    current_status: 'CITIZEN',
  },
  family: {
    adults_count: adults,
    adult_ages: Array(adults).fill(35),
    partner_included: partnerIncluded,
    relationship_type: partnerIncluded ? relationshipType : null,
    children: (childAges || Array(children).fill(7))
      .map((age) => ({ age_years: age })),
    school_needed: false,
  },
  income: {
    primary: incomeSource(
      applicantType,
      applicantAmount,
      applicantCurrency,
      applicantCountryId,
      applicantGeography,
    ),
    additional_sources: [],
    partner: {
      has_income: false,
      sources: [],
    },
    savings: savingsAmount == null ? null : { amount: savingsAmount, currency: savingsCurrency },
  },
  investment_capital: null,
  goal: {
    long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
    keep_russian_citizenship: 'NOT_REQUIRED',
  },
  pets: {
    types: ['NONE'],
    dogs: [],
    other_pet_notes: null,
  },
});

const routeById = (result, routeId) =>
  result.routes.find(({ routeId: id }) => id === routeId);

const packageRouteById = (routeId) =>
  mexico.routes.find(({ route_id }) => route_id === routeId);

const requirementById = (routeId, requirementId) =>
  packageRouteById(routeId).requirements
    .find(({ requirement_id }) => requirement_id === requirementId);

test('Mexico package keeps the agreed route inventory and points route unpublished', () => {
  assert.equal(mexico.country_id, 'MX');
  assert.equal(mexico.routes.length, 14);

  const points = packageRouteById('MX_PR_POINTS');
  assert.ok(points);
  assert.equal(points.publishable, false);

  const result = calculateActiveCountry(profile(), mexico, context);
  assert.equal(routeById(result, 'MX_PR_POINTS'), undefined);
});

test('Mexico solvency keeps the national UMA formula materialized while current savings remain evaluable', () => {
  const requirement = requirementById(
    'MX_TEMP_SOLVENCY',
    'MX_TEMP_SOLVENCY_FIN',
  );

  assert.equal(requirement.evaluation_mode, 'ENGINE');
  assert.equal(requirement.unmet_effect, 'BLOCKS');
  assert.equal(requirement.financial.model, 'INCOME_OR_SAVINGS');

  const income = requirement.financial.alternatives
    .find(({ kind }) => kind === 'INCOME');
  const savings = requirement.financial.alternatives
    .find(({ kind }) => kind === 'SAVINGS');

  assert.equal(income.amount, 79770.8);
  assert.equal(income.currency, 'MXN');
  assert.equal(income.period, 'MONTHLY');
  assert.equal(income.comparison, 'MORE_THAN');
  assert.equal(income.history_months, 6);
  assert.equal(income.asked_in_questionnaire, true);

  assert.equal(savings.amount, 1344372.6);
  assert.equal(savings.currency, 'MXN');
  assert.equal(savings.period, 'ONE_TIME');
  assert.equal(savings.comparison, 'AT_LEAST');
  assert.equal(savings.history_months, 12);
  assert.equal(savings.asked_in_questionnaire, true);
});

test('Mexico solvency keeps documentary history and filing-post variation as display-only preparation', () => {
  const history = requirementById(
    'MX_TEMP_SOLVENCY',
    'MX_TEMP_SOLVENCY_INCOME_HISTORY',
  );
  const consular = requirementById(
    'MX_TEMP_SOLVENCY',
    'MX_CONSULAR_VARIATION',
  );

  assert.equal(history.evaluation_mode, 'DISPLAY_ONLY');
  assert.equal(history.unmet_effect, 'NONE');
  assert.match(history.condition_ru, /6 месяцев/);
  assert.match(history.condition_ru, /12 месяцев/);

  assert.equal(consular.evaluation_mode, 'DISPLAY_ONLY');
  assert.equal(consular.unmet_effect, 'NONE');
  assert.match(consular.condition_ru, /консульств/i);
});

test('Mexico solvency above the national income threshold is suitable while documentary checks stay display-only', () => {
  const result = calculateActiveCountry(
    profile({ applicantAmount: 80000 }),
    mexico,
    context,
  );
  const route = routeById(result, 'MX_TEMP_SOLVENCY');

  assert.ok(route);
  assert.equal(route.routeStatus, 'SUITABLE');
  assert.equal(route.blockers?.length || 0, 0);
  assert.equal(route.conditions?.length || 0, 0);

  const preparation = (route.displayOnlyRequirements || []).map(({ condition_ru }) => condition_ru).join(' ');
  assert.match(preparation, /6 месяцев/);
  assert.match(preparation, /12 месяцев/);
  assert.match(preparation, /консульств/i);
});

test('Mexico solvency blocks when both current income and current savings are below their numeric alternatives', () => {
  for (const input of [
    { applicantAmount: 0, savingsAmount: 0 },
    { applicantAmount: 70000, savingsAmount: 1000000 },
  ]) {
    const result = calculateActiveCountry(profile(input), mexico, context);
    const route = routeById(result, 'MX_TEMP_SOLVENCY');

    assert.ok(route);
    assert.equal(route.routeStatus, 'UNSUITABLE');
    assert.ok((route.blockers?.length || 0) >= 1);
    assert.equal(route.financialSummary?.state, 'FAIL');
  }
});

test('Mexico solvency passes through current savings while twelve-month history stays display-only', () => {
  const result = calculateActiveCountry(
    profile({ applicantAmount: 70000, savingsAmount: 1400000 }),
    mexico,
    context,
  );
  const route = routeById(result, 'MX_TEMP_SOLVENCY');

  assert.ok(route);
  assert.equal(route.routeStatus, 'SUITABLE');
  assert.equal(route.financialSummary?.state, 'PASS');
  assert.equal(route.blockers?.length || 0, 0);
  assert.equal(route.conditions?.length || 0, 0);
  assert.ok((route.displayOnlyRequirements || []).some(({ condition_ru }) => /12 месяцев/u.test(condition_ru)));
});

test('Mexico retiree savings alternative is also evaluated from current questionnaire savings', () => {
  const requirement = requirementById('MX_PR_RETIREE', 'MX_PR_RETIREE_FIN');
  const savings = requirement.financial.alternatives.find(({ kind }) => kind === 'SAVINGS');

  assert.equal(savings.amount, 5378663.5);
  assert.equal(savings.currency, 'MXN');
  assert.equal(savings.history_months, 12);
  assert.equal(savings.asked_in_questionnaire, true);

  const result = calculateActiveCountry(
    profile({ applicantType: 'PENSION', applicantAmount: 100000, savingsAmount: 6000000 }),
    mexico,
    context,
  );
  const route = routeById(result, 'MX_PR_RETIREE');

  assert.ok(route);
  assert.equal(route.financialSummary?.state, 'PASS');
  assert.equal(route.blockers?.length || 0, 0);
});

test('Mexico protection and humanitarian routes share international-protection presentation without changing route type', () => {
  const humanitarian = packageRouteById('MX_HUMANITARIAN');

  assert.equal(humanitarian.route_type, 'OTHER');
  assert.equal(humanitarian.is_humanitarian, true);

  const result = calculateActiveCountry(profile(), mexico, context);

  assert.equal(
    routeById(result, 'MX_PROTECTION').presentationGroup,
    'INTERNATIONAL_PROTECTION',
  );
  assert.equal(
    routeById(result, 'MX_HUMANITARIAN').presentationGroup,
    'INTERNATIONAL_PROTECTION',
  );
});

test('Mexico hides pure family routes under the generic public visibility policy while retaining FAMILY coverage', () => {
  const hiddenIds = [
    'MX_FAMILY_SPOUSE_MEX_PR',
    'MX_FAMILY_TEMP_SPONSOR',
    'MX_FAMILY_DIRECT_PR',
  ];

  for (const routeId of hiddenIds) {
    const source = packageRouteById(routeId);
    assert.ok(source, routeId);
    assert.equal(source.route_type, 'FAMILY', routeId);
    assert.equal(source.publishable, false, routeId);
  }

  const result = calculateActiveCountry(profile(), mexico, context);

  for (const routeId of hiddenIds) {
    assert.equal(
      routeById(result, routeId),
      undefined,
      `${routeId} should not appear as a standalone public route`,
    );
  }

  assert.deepEqual(
    mexico.route_coverage
      .find(({ category }) => category === 'FAMILY')
      .linked_route_ids,
    hiddenIds,
  );
});

test('Mexico uses the agreed Core-8 cities with one normalized four-component basket', () => {
  assert.deepEqual(
    mexico.cities.map(({ name_ru }) => name_ru),
    [
      'Мехико',
      'Гвадалахара',
      'Монтеррей',
      'Керетаро',
      'Мерида',
      'Пуэбла',
      'Пуэрто-Вальярта',
      'Канкун',
    ],
  );

  for (const city of mexico.cities) {
    assert.deepEqual(
      city.cost_components.map(({ component }) => component),
      ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT'],
      city.name_ru,
    );

    assert.ok(
      city.cost_components.every(({ period }) => period === 'MONTHLY'),
      city.name_ru,
    );

    const bases = Object.fromEntries(
      city.cost_components.map(({ component, household_basis }) => [
        component,
        household_basis,
      ]),
    );

    assert.equal(bases.RENT_STANDARD, 'PER_HOUSEHOLD');
    assert.equal(bases.UTILITIES, 'PER_HOUSEHOLD');
    assert.equal(bases.GROCERIES, 'PER_PERSON');
    assert.equal(bases.TRANSPORT, 'PER_PERSON');
  }
});

test('Mexico school-city evidence remains country-wide and independent from Core-8 cities', () => {
  const schoolCities = mexico.schools.international_school_cities
    .map(({ city_name_ru }) => city_name_ru);

  assert.equal(schoolCities.length, 12);

  for (const city of [
    'Мехико',
    'Гвадалахара',
    'Керетаро',
    'Мерида',
    'Пуэбла',
    'Пуэрто-Вальярта',
    'Канкун',
    'Дуранго',
    'Сальтильо',
    'Торреон',
    'Тампико',
  ]) {
    assert.ok(schoolCities.includes(city), city);
  }

  assert.ok(
    schoolCities.some((city) => city.startsWith('Монтеррей')),
    'Monterrey metropolitan school evidence',
  );

  assert.ok(
    schoolCities.some((city) => !mexico.cities
      .map(({ name_ru }) => name_ru)
      .includes(city)),
    'school-city list must be independent from Core-8',
  );
});

test('Mexico Russian-citizen entry keeps SAE validity separate from the possible visitor stay', () => {
  const entry = mexico.entry_for_russian_citizen;

  assert.equal(entry.entry_type, 'ETA');
  assert.equal(entry.authorization_validity_days, 30);
  assert.equal(entry.maximum_stay_days, 180);
  assert.match(entry.rule_ru, /однократн/i);
  assert.match(entry.rule_ru, /не является резиденцией/i);
});

test('Mexico tax residence does not invent a 183-day rule', () => {
  assert.equal(mexico.taxes.typical_day_threshold, null);
  assert.match(mexico.taxes.tax_residency_rule_ru, /не простым правилом 183 дней/i);
  assert.match(mexico.taxes.tax_residency_rule_ru, /centro de intereses vitales/i);
});

test('Mexico pets remain origin-sensitive rather than applying the US screwworm rule globally', () => {
  assert.equal(
    mexico.pets.import_restrictions.status,
    'RESTRICTIONS_FOUND',
  );
  assert.match(
    mexico.pets.import_restrictions.explanation_ru,
    /стране происхождения/i,
  );
  assert.match(
    mexico.pets.import_restrictions.explanation_ru,
    /не распространяются автоматически/i,
  );
});

test('Mexico regression fixture pins accepted administrative-only family behavior', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/MX_REGRESSION_EXPECTATIONS_v4.0.json', import.meta.url), 'utf8'));
  assert.equal(fixture.country_id, 'MX');
  assert.equal(fixture.rules_version, '4.0');
  assert.equal(fixture.canonical_version, '4.0');
  assert.equal(fixture.canon_revision, '2026-08-08-final-lock');
  for (const item of fixture.cases) {
    const result = calculateActiveCountry(profile(item.profile), mexico, context);
    const route = routeById(result, item.route_id);
    assert.ok(route, item.route_id);
    assert.equal(route.routeStatus, item.expected.route_status, item.route_id);
    assert.equal(route.familyEvaluation.state, item.expected.family_state, item.route_id);
    assert.equal(route.familyEvaluation.classification, item.expected.family_classification, item.route_id);
    assert.equal(route.familyEvaluation.sortRank, item.expected.family_sort_rank, item.route_id);
    assert.equal(route.conditions?.length || 0, item.expected.conditions_count, item.route_id);
  }
});
