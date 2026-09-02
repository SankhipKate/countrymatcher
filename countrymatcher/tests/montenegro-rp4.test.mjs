import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  calculateActiveCountry,
} from '../js/engine/rp4-engine.js';

const montenegro = JSON.parse(
  await readFile(
    new URL(
      '../data/ME-research-v4.0.json',
      import.meta.url,
    ),
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
    as_of: '2026-08-21',
  },
};

const profile = ({
  amount = 1800,
  countryId = 'US',
} = {}) => ({
  citizenships: ['RU'],
  residence: {
    current_country: 'RU',
    current_status: 'CITIZEN',
  },
  application_preferences: {
    methods: ['IN_COUNTRY'],
  },
  family: {
    adults_count: 1,
    adult_ages: [35],
    partner_included: false,
    relationship_type: null,
    children: [],
    school_needed: false,
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
      type: 'REMOTE_EMPLOYMENT',
      source_geography: 'SINGLE_COUNTRY',
      country_id: countryId,
      monthly_total: {
        amount,
        currency: 'EUR',
      },
      monthly_provable: {
        amount,
        currency: 'EUR',
      },
    },
    additional_sources: [],
    partner: {
      has_income: false,
      sources: [],
    },
    savings: {
      amount: 0,
      currency: 'EUR',
    },
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
  special_circumstances: ['NONE'],
});

const routeData = (routeId) =>
  montenegro.routes.find(
    ({ route_id }) => route_id === routeId,
  );

const requirementData = (
  routeId,
  requirementId,
) =>
  routeData(routeId)?.requirements.find(
    ({ requirement_id }) =>
      requirement_id === requirementId,
  );

const routeResult = (
  result,
  routeId,
) =>
  result.routes.find(
    ({ routeId: id }) => id === routeId,
  );

const requirementResult = (
  route,
  requirementId,
) =>
  route.requirementResults.find(
    ({ requirement }) =>
      requirement.requirement_id === requirementId,
  );

const calculate = (overrides = {}) =>
  calculateActiveCountry(
    profile(overrides),
    montenegro,
    context,
  );

test('Montenegro RP4 pins approved publication boundary', () => {
  assert.equal(montenegro.schema_version, '4.0');
  assert.equal(
    montenegro.canon_revision,
    '2026-08-08-final-lock',
  );
  assert.equal(montenegro.country_id, 'ME');
  assert.equal(
    montenegro.country_name_ru,
    'Черногория',
  );
  assert.equal(
    montenegro.country_currency,
    'EUR',
  );

  assert.equal(
    montenegro.routes.length,
    19,
  );

  assert.equal(
    montenegro.routes.filter(
      ({ publishable }) => publishable,
    ).length,
    17,
  );

  assert.deepEqual(
    montenegro.routes.filter(({ publishable }) => !publishable).map(({ route_id }) => route_id).sort(),
    ['ME_FAMILY', 'ME_ICT'].sort(),
  );

  assert.ok(
    montenegro.open_items.every(
      ({ blocks_publication }) =>
        blocks_publication === false,
    ),
  );

  assert.doesNotMatch(
    montenegro.country_summary_ru,
    /block publication of ME_DNV/u,
  );
});

test('Montenegro DNV uses approved 1800 EUR operational threshold', () => {
  const threshold = requirementData(
    'ME_DNV',
    'ME_DNV_INCOME',
  ).financial.alternatives[0];

  assert.equal(threshold.amount, 1800);
  assert.equal(threshold.currency, 'EUR');
  assert.equal(threshold.period, 'MONTHLY');
  assert.equal(threshold.history_months, 12);
  assert.equal(
    threshold.source_geography,
    'FOREIGN',
  );

  const exact = routeResult(
    calculate({ amount: 1800 }),
    'ME_DNV',
  );

  assert.equal(
    exact.routeStatus,
    'SUITABLE',
  );

  assert.equal(
    requirementResult(
      exact,
      'ME_DNV_INCOME',
    ).state,
    'PASS',
  );

  const below = routeResult(
    calculate({ amount: 1799 }),
    'ME_DNV',
  );

  assert.equal(
    below.routeStatus,
    'UNSUITABLE',
  );

  const domestic = routeResult(
    calculate({
      amount: 2500,
      countryId: 'ME',
    }),
    'ME_DNV',
  );

  assert.equal(
    domestic.routeStatus,
    'UNSUITABLE',
  );
});

test('Montenegro DNV preserves family and long-term limits', () => {
  const dnv = routeData('ME_DNV');

  const family = dnv.family_scenarios.find(
    ({ scenario_id }) =>
      scenario_id === 'ME_DNV_FAMILY',
  );

  assert.ok(family);

  assert.deepEqual(
    family.relationship_types,
    [
      'MARRIED',
      'REGISTERED_PARTNERSHIP',
    ],
  );

  assert.equal(
    family.linked_route_id,
    'ME_FAMILY',
  );

  assert.equal(
    family.join_stage,
    'AFTER_INITIAL_RESIDENCE',
  );

  assert.equal(
    dnv.long_term_path.first_permit_months,
    24,
  );

  assert.equal(
    dnv.long_term_path.renewal_months,
    24,
  );

  assert.equal(
    dnv.long_term_path.pr_path_status,
    'REQUIRES_CHANGE_OF_BASIS',
  );

  assert.equal(
    dnv.long_term_path.years_to_pr,
    5,
  );
});

test('Montenegro entry and city comparison set stay pinned', () => {
  assert.equal(
    montenegro.entry_for_russian_citizen.entry_type,
    'VISA_FREE',
  );

  assert.equal(
    montenegro.entry_for_russian_citizen.maximum_stay_days,
    30,
  );

  assert.match(
    montenegro.entry_for_russian_citizen.rule_ru,
    /01\.11\.2026/u,
  );

  assert.deepEqual(
    montenegro.cities.map(
      ({ name_ru }) => name_ru,
    ),
    [
      'Подгорица',
      'Бар',
      'Будва',
      'Цетине',
    ],
  );

  for (const city of montenegro.cities) {
    assert.deepEqual(
      city.cost_components.map(
        ({ component }) => component,
      ),
      [
        'RENT_STANDARD',
        'UTILITIES',
        'GROCERIES',
        'TRANSPORT',
      ],
    );
  }
});


test('Montenegro DNV administrative family flow stays suitable', () => {
  const familyProfile = profile({
    amount: 1800,
    countryId: 'US',
  });

  familyProfile.family = {
    adults_count: 2,
    adult_ages: [35, 35],
    partner_included: true,
    relationship_type: 'REGISTERED_PARTNERSHIP',
    children: [
      {
        age_years: 13,
      },
    ],
    school_needed: false,
  };

  const result = calculateActiveCountry(
    familyProfile,
    montenegro,
    context,
  );

  const dnv = routeResult(
    result,
    'ME_DNV',
  );

  assert.equal(
    dnv.routeStatus,
    'SUITABLE',
  );

  assert.equal(
    dnv.familyEvaluation.state,
    'PASS',
  );

  assert.equal(
    dnv.familyEvaluation.classification,
    'SIMULTANEOUS',
  );

  assert.equal(
    dnv.familyEvaluation.sortRank,
    1,
  );

  assert.deepEqual(
    dnv.familyEvaluation.conditions,
    [],
  );

  const familyScenario = routeData(
    'ME_DNV',
  ).family_scenarios.find(
    ({ scenario_id }) =>
      scenario_id === 'ME_DNV_FAMILY',
  );

  assert.equal(
    familyScenario.simultaneous_move,
    'YES',
  );

  assert.equal(
    familyScenario.administrative_separate_filing,
    true,
  );

  assert.equal(
    familyScenario.join_stage,
    'AFTER_INITIAL_RESIDENCE',
  );

  assert.equal(
    familyScenario.separate_route_required,
    false,
  );
});

test('Montenegro DNV 12-month income history is filing evidence only', () => {
  const history = requirementData(
    'ME_DNV',
    'ME_DNV_INCOME_HISTORY',
  );

  assert.ok(history);

  assert.equal(
    history.evaluation_mode,
    'DISPLAY_ONLY',
  );

  assert.equal(
    history.unmet_effect,
    'NONE',
  );

  assert.match(
    history.condition_ru,
    /предыдущие 12 месяцев/u,
  );

  assert.equal(
    requirementData(
      'ME_DNV',
      'ME_DNV_INCOME',
    ).financial.alternatives[0].history_months,
    12,
  );
});


test('Montenegro entry switches at the adopted 2026 visa cutover', () => {
  const entryProfile = profile({
    amount: 1800,
    countryId: 'US',
  });

  const before = calculateActiveCountry(
    entryProfile,
    montenegro,
    {
      ...context,
      calculation_date: '2026-10-31T22:59:59.999Z',
    },
  );

  const after = calculateActiveCountry(
    entryProfile,
    montenegro,
    {
      ...context,
      calculation_date: '2026-10-31T23:00:00.000Z',
    },
  );

  assert.equal(
    before.entryForRussianCitizen.visaRequired,
    false,
  );
  assert.equal(
    before.entryForRussianCitizen.maximumStayDays,
    30,
  );
  assert.equal(
    after.entryForRussianCitizen.visaRequired,
    true,
  );
  assert.equal(
    after.entryForRussianCitizen.maximumStayDays,
    90,
  );
  assert.match(
    after.entryForRussianCitizen.rule,
    /1 ноября 2026/u,
  );
});

test('Montenegro in-country application copy stays neutral across the Russian entry cutover', () => {
  const methods = montenegro.routes
    .flatMap(({ route_id: routeId, application_methods = [] }) => application_methods.map((method) => ({ routeId, method })))
    .filter(({ method }) => method.method === 'IN_COUNTRY' && method.availability === 'AVAILABLE' && method.entry_condition_ru?.includes('актуальные правила въезда для граждан РФ'));
  assert.equal(methods.length, 17);
  for (const { routeId, method } of methods) {
    assert.doesNotMatch(method.entry_condition_ru, /без визы до 30 дней/u, routeId);
    assert.doesNotMatch(method.entry_condition_ru, /виза не требуется/u, routeId);
    assert.equal(method.visa_required_for_ru, null, routeId);
  }
  assert.equal(montenegro.review_schedule.entry_consular_next_review, '2026-10-15');
});


test('Montenegro keeps visa_required_for_ru null outside THIRD_COUNTRY methods', () => {
  const methods = montenegro.routes.flatMap(
    ({ route_id: routeId, application_methods = [] }) =>
      application_methods.map((method) => ({ routeId, method })),
  );

  assert.equal(methods.length, 36);
  assert.equal(
    methods.some(({ method }) => method.method === 'THIRD_COUNTRY'),
    false,
  );

  for (const { routeId, method } of methods) {
    assert.equal(
      method.visa_required_for_ru,
      null,
      `${routeId}:${method.method}`,
    );
  }
});
