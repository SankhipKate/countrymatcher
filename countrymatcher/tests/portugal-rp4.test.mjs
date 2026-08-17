import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  calculateActiveCountry,
} from '../js/engine/rp4-engine.js';

const portugal = JSON.parse(
  await readFile(
    new URL('../data/PT-research-v4.0.json', import.meta.url),
    'utf8',
  ),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: {
      USD: 1,
      EUR: 0.9,
    },
    source: 'test',
    as_of: '2026-08-16',
  },
};

const incomeSource = (
  owner,
  type,
  amount,
  currency = 'EUR',
  countryId = 'US',
  geography = 'SINGLE_COUNTRY',
) => ({
  owner,
  type,
  source_geography: geography,
  country_id: geography === 'SINGLE_COUNTRY' ? countryId : null,
  monthly_total: { amount, currency },
  monthly_provable: { amount, currency },
});

const profile = ({
  applicantAmount = 3680,
  applicantCurrency = 'EUR',
  applicantType = 'REMOTE_EMPLOYMENT',
  applicantCountryId = 'US',
  applicantGeography = 'SINGLE_COUNTRY',
  adults = 1,
  children = 0,
  childAges = null,
  partnerIncluded = adults === 2,
  relationshipType = partnerIncluded ? 'MARRIED' : null,
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
      'APPLICANT',
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
    savings: null,
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

const requirementById = (routeId, requirementId) =>
  portugal.routes
    .find(({ route_id }) => route_id === routeId)
    .requirements
    .find(({ requirement_id }) => requirement_id === requirementId);

test('Portugal remote-work status is derived generically and Madeira uncertainty is informational', async () => {
  const remote = portugal.routes.find(
    ({ route_id }) => route_id === 'PT_REMOTE_WORK',
  );

  assert.equal(
    remote.requirements.some(
      ({ requirement_id }) =>
        requirement_id === 'PT_REMOTE_MADEIRA_REFERENCE',
    ),
    false,
  );

  const income = requirementById(
    'PT_REMOTE_WORK',
    'PT_REMOTE_INCOME',
  );

  assert.match(
    income.condition_ru,
    /Retribuição Mínima Mensal Garantida/,
  );
  assert.match(
    income.condition_ru,
    /минимальная гарантированная месячная оплата труда/,
  );
  assert.match(income.condition_ru, /Мадейр/);

  const exact = routeById(
    calculateActiveCountry(
      profile({ applicantAmount: 3680 }),
      portugal,
      context,
    ),
    'PT_REMOTE_WORK',
  );

  assert.equal(exact.routeStatus, 'SUITABLE');
  assert.deepEqual(exact.conditions, []);

  const below = routeById(
    calculateActiveCountry(
      profile({ applicantAmount: 3679 }),
      portugal,
      context,
    ),
    'PT_REMOTE_WORK',
  );

  assert.equal(below.routeStatus, 'UNSUITABLE');

  const engineSource = await readFile(
    new URL('../js/engine/rp4-engine.js', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    engineSource,
    /PT_REMOTE_WORK|PT_REMOTE_MADEIRA_REFERENCE/,
  );
  assert.doesNotMatch(
    engineSource,
    /country_id\s*===\s*['"]PT['"]/,
  );
});

test('Portugal keeps ARI and Skilled Job Seeker researched but unpublished', () => {
  const result = calculateActiveCountry(
    profile({ applicantAmount: 6000 }),
    portugal,
    context,
  );

  assert.equal(
    portugal.routes.find(({ route_id }) => route_id === 'PT_ARI').publishable,
    false,
  );

  assert.equal(
    portugal.routes.find(
      ({ route_id }) => route_id === 'PT_SKILLED_JOB_SEEKER',
    ).publishable,
    false,
  );

  assert.equal(
    result.routes.some(({ routeId }) => routeId === 'PT_ARI'),
    false,
  );

  assert.equal(
    result.routes.some(({ routeId }) => routeId === 'PT_SKILLED_JOB_SEEKER'),
    false,
  );
});

test('Portugal humanitarian and protection routes keep protection presentation', () => {
  const result = calculateActiveCountry(
    profile({ applicantAmount: 6000 }),
    portugal,
    context,
  );

  assert.equal(
    routeById(result, 'PT_PROTECTION').presentationGroup,
    'INTERNATIONAL_PROTECTION',
  );

  assert.equal(
    routeById(result, 'PT_HUMANITARIAN').presentationGroup,
    'INTERNATIONAL_PROTECTION',
  );
});

test('Portugal uses one normalized four-component city scenario', () => {
  const expectedConditions = {
    RENT_STANDARD: 'Однокомнатная квартира в центре города.',
    UTILITIES:
      'Базовые коммунальные услуги для квартиры площадью около 85 м²; интернет не включён.',
    GROCERIES: 'Продукты на одного человека в месяц.',
    TRANSPORT:
      'Месячный проездной на общественный транспорт для одного человека.',
  };

  for (const city of portugal.cities) {
    const components = Object.fromEntries(
      city.cost_components.map((item) => [item.component, item]),
    );

    assert.deepEqual(
      Object.keys(components).sort(),
      Object.keys(expectedConditions).sort(),
      city.city_id,
    );

    for (const [component, condition] of Object.entries(
      expectedConditions,
    )) {
      assert.equal(
        components[component].condition_ru,
        condition,
        `${city.city_id} ${component}`,
      );
    }
  }

  const calculated = calculateActiveCountry(
    profile({ applicantAmount: 6000 }),
    portugal,
    context,
  );

  assert.deepEqual(
    calculated.cities[0].comparisonComponents,
    [
      'RENT_STANDARD',
      'UTILITIES',
      'GROCERIES',
      'TRANSPORT',
    ],
  );

  assert.ok(
    calculated.cities.every(
      ({ comparisonCostUsd }) =>
        Number.isFinite(comparisonCostUsd),
    ),
  );
});

test('Portugal keeps country-wide school cities independent from displayed cities', () => {
  const cities = portugal.schools.international_school_cities
    .map(({ city_name_ru }) => city_name_ru);

  assert.equal(
    portugal.schools.international_school_status,
    'AVAILABLE',
  );

  assert.equal(cities.length, 15);
  assert.ok(cities.includes('Коимбра'));

  assert.equal(portugal.cities.length, 6);

  const observations =
    portugal.schools.international_school_tuition_observations;

  assert.equal(observations.length, 4);

  const firstGrade = observations
    .filter(({ grade_stage }) => grade_stage === 'FIRST_GRADE')
    .map(({ tuition }) => tuition.amount);

  const finalGrade = observations
    .filter(({ grade_stage }) => grade_stage === 'FINAL_GRADE')
    .map(({ tuition }) => tuition.amount);

  assert.equal(Math.min(...firstGrade), 11105);
  assert.equal(Math.max(...finalGrade), 23532);
});

test('Portugal entry and LGBT facts survive RP4 integration unchanged', () => {
  assert.equal(
    portugal.entry_for_russian_citizen.entry_type,
    'CONSULAR_VISA',
  );
  assert.equal(
    portugal.entry_for_russian_citizen.visa_required,
    true,
  );
  assert.equal(
    portugal.entry_for_russian_citizen.maximum_stay_days,
    90,
  );

  assert.equal(portugal.lgbt.legal_assessment, 'FULL_RECOGNITION');
  assert.equal(portugal.lgbt.practical_assessment, 'OPEN');
});


test('Portugal user-facing country information is Russian and pet import is origin-based', () => {
  const school = portugal.schools.public_school_rules[0];
  const pets = portugal.pets;
  const lgbt = portugal.lgbt;
  const taxes = portugal.taxes;

  const userFacingText = [
    portugal.entry_for_russian_citizen.rule_ru,
    portugal.entry_for_russian_citizen.processing_time_ru,

    school.jurisdiction_ru,
    school.language_ru,
    school.rule_ru,

    pets.import_restrictions.explanation_ru,
    pets.after_entry_restrictions.explanation_ru,

    lgbt.same_sex_relations_rule_ru,
    lgbt.state_restrictions_ru,
    lgbt.same_sex_marriage_rule_ru,
    lgbt.registered_partnership_rule_ru,
    lgbt.foreign_document_rule_ru,
    lgbt.parenthood_ru,
    lgbt.anti_discrimination.complaint_mechanisms_ru,
    lgbt.anti_discrimination.rule_ru,
    lgbt.systemic_practical_restrictions_ru,
    lgbt.regional_differences_ru,
    lgbt.assessment_basis_ru,

    taxes.tax_residency_rule_ru,
    taxes.other_residency_triggers_ru,
    taxes.personal_income_tax_ru,
    taxes.social_contributions_ru,
    taxes.foreign_income_ru,
    taxes.double_taxation_with_russia_ru,
  ].join('\n');

  const forbiddenFragments = [
    'Schengen visa',
    'rolling 180',
    'multiple-entry',
    'statutory baseline',
    'operational guidance',
    'basic education',
    'secondary education',
    'integration/',
    'non-mother-tongue',
    'consensual same-sex',
    'family recognition',
    'equality/non-discrimination',
    'de facto/equivalent',
    'immigration/evidence',
    'same-sex marriage/family document',
    'ordinary authenticity',
    'legalisation/translation',
    'same-sex parenthood',
    'complaint mechanism',
    'constitutional/public-policy',
    'systemic state restrictions',
    'community infrastructure',
    'smaller cities',
    'tax residence generally',
    'habitual-dwelling',
    'progressive personal income tax',
    'worldwide income',
    'current practical relief',
    'microchip, действующая rabies',
    'potentially dangerous:',
    'control/leash/muzzle',
  ];

  for (const fragment of forbiddenFragments) {
    assert.equal(
      userFacingText.toLowerCase().includes(fragment.toLowerCase()),
      false,
      fragment,
    );
  }

  assert.equal(
    pets.import_restrictions.explanation_ru.includes('из России'),
    false,
  );

  assert.match(
    pets.import_restrictions.explanation_ru,
    /страны, из которой животное фактически въезжает/,
  );

  assert.match(
    pets.import_restrictions.explanation_ru,
    /Общего запрета на ввоз собак потенциально опасных пород нет/,
  );

  assert.equal(
    portugal.schools.international_school_tuition_observations.length,
    4,
  );

  assert.match(
    taxes.foreign_income_ru,
    /IFICI — льготный налоговый режим для научных исследований и инноваций/,
  );
});


test('Portugal hides supporting family and pure ICT routes under generic public policy', () => {
  const hiddenIds = [
    'PT_ICT',
    'PT_FAMILY_REUNIFICATION',
    'PT_EU_PORTUGUESE_FAMILY',
  ];

  for (const routeId of hiddenIds) {
    const source = portugal.routes.find(
      ({ route_id }) => route_id === routeId,
    );

    assert.ok(source, routeId);
    assert.equal(source.publishable, false, routeId);
  }

  const result = calculateActiveCountry(
    profile({ applicantAmount: 6000 }),
    portugal,
    context,
  );

  for (const routeId of hiddenIds) {
    assert.equal(
      result.routes.some(({ routeId: id }) => id === routeId),
      false,
      routeId,
    );
  }

  assert.equal(
    portugal.route_coverage
      .find(({ category }) => category === 'INTRA_COMPANY_TRANSFER')
      .linked_route_ids.includes('PT_ICT'),
    true,
  );

  assert.deepEqual(
    portugal.route_coverage
      .find(({ category }) => category === 'FAMILY')
      .linked_route_ids,
    [
      'PT_FAMILY_REUNIFICATION',
      'PT_EU_PORTUGUESE_FAMILY',
    ],
  );
});

test('Portugal entry presentation does not duplicate structured visa and stay fields', () => {
  const entry = portugal.entry_for_russian_citizen;

  assert.equal(entry.visa_required, true);
  assert.equal(entry.maximum_stay_days, 90);

  assert.equal(
    entry.rule_ru.includes('90 дней'),
    false,
  );

  assert.equal(
    entry.rule_ru.toLowerCase().includes('нужна шенгенская виза'),
    false,
  );

  assert.equal(
    entry.rule_ru.toLowerCase().includes('требуется шенгенская виза'),
    false,
  );

  assert.match(
    entry.processing_time_ru,
    /15 календарных дней/,
  );

  assert.match(
    entry.processing_time_ru,
    /45 дней/,
  );
});
