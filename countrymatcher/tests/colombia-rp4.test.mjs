import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const colombia = JSON.parse(
  await readFile(
    new URL('../data/CO-research-v4.0.json', import.meta.url),
    'utf8',
  ),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: {
      USD: 1,
      COP: 4000,
    },
    source: 'test',
    as_of: '2026-08-19',
  },
};

const incomeSource = ({
  type = 'REMOTE_EMPLOYMENT',
  amount = 6_000_000,
  currency = 'COP',
  countryId = 'US',
  geography = 'SINGLE_COUNTRY',
} = {}) => ({
  owner: 'APPLICANT',
  type,
  source_geography: geography,
  country_id: geography === 'SINGLE_COUNTRY' ? countryId : null,
  monthly_total: { amount, currency },
  monthly_provable: { amount, currency },
});

const profile = ({
  type = 'REMOTE_EMPLOYMENT',
  amount = 6_000_000,
  currency = 'COP',
  countryId = 'US',
  geography = 'SINGLE_COUNTRY',
  goal = 'TEMPORARY_RESIDENCE_SUFFICIENT',
  partnerIncluded = false,
  relationshipType = 'MARRIED',
  children = [],
  savings = null,
  investmentCapital = null,
} = {}) => ({
  residence: {
    current_country: 'RU',
    current_status: 'CITIZEN',
  },
  family: {
    adults_count: partnerIncluded ? 2 : 1,
    adult_ages: partnerIncluded ? [35, 35] : [35],
    partner_included: partnerIncluded,
    relationship_type: partnerIncluded ? relationshipType : null,
    children: children.map((age) => ({ age_years: age })),
    school_needed: false,
  },
  income: {
    primary: incomeSource({ type, amount, currency, countryId, geography }),
    additional_sources: [],
    partner: {
      has_income: false,
      sources: [],
    },
    savings,
  },
  investment_capital: investmentCapital,
  goal: {
    long_term: goal,
    keep_russian_citizenship: 'NOT_REQUIRED',
  },
  pets: {
    types: ['NONE'],
    dogs: [],
    other_pet_notes: null,
  },
});

const routeData = (routeId) => colombia.routes.find(({ route_id }) => route_id === routeId);
const requirementData = (routeId, requirementId) => routeData(routeId)
  ?.requirements.find(({ requirement_id }) => requirement_id === requirementId);
const routeResult = (result, routeId) => result.routes.find(({ routeId: id }) => id === routeId);
const requirementResult = (route, requirementId) => route.requirementResults
  .find(({ requirement }) => requirement.requirement_id === requirementId);

function calculate(overrides = {}) {
  return calculateActiveCountry(profile(overrides), colombia, context);
}

test('Colombia RP4 pins the current route inventory and publication boundary', () => {
  assert.equal(colombia.schema_version, '4.0');
  assert.equal(colombia.canon_revision, '2026-08-08-final-lock');
  assert.equal(colombia.country_id, 'CO');
  assert.equal(colombia.country_currency, 'COP');
  assert.equal(colombia.routes.length, 15);

  assert.deepEqual(
    colombia.route_coverage.map(({ category, result }) => [category, result]),
    [
      ['DIGITAL_NOMAD_REMOTE_WORK', 'ROUTE_EXISTS'],
      ['INCOME_FINANCIALLY_INDEPENDENT', 'ROUTE_EXISTS'],
      ['RETIREMENT', 'ROUTE_EXISTS'],
      ['LOCAL_EMPLOYMENT', 'ROUTE_EXISTS'],
      ['HIGHLY_QUALIFIED_SPECIALIST', 'ROUTE_EXISTS'],
      ['INTRA_COMPANY_TRANSFER', 'UNAVAILABLE_TO_RU'],
      ['ENTREPRENEURSHIP_SELF_EMPLOYMENT', 'ROUTE_EXISTS'],
      ['INVESTMENT', 'ROUTE_EXISTS'],
      ['STUDY', 'ROUTE_EXISTS'],
      ['FAMILY', 'ROUTE_EXISTS'],
      ['GENERAL_RESIDENCE', 'NO_ROUTE'],
      ['INTERNATIONAL_PROTECTION', 'ROUTE_EXISTS'],
      ['OTHER', 'ROUTE_EXISTS'],
    ],
  );

  const student = routeData('CO_V_ESTUDIANTE');
  assert.equal(student.publishable, false);
  const studentGap = colombia.open_items.find(({ item_id }) => item_id === 'CO_GAP_STUDENT_FINANCE_OR_BRANCH');
  assert.equal(studentGap.related_route_id, 'CO_V_ESTUDIANTE');
  assert.equal(studentGap.blocks_publication, true);

  const calculated = calculate();
  assert.equal(calculated.routes.some(({ routeId }) => routeId === 'CO_V_ESTUDIANTE'), false);
});

test('Colombia Digital Nomad enforces 3 SMLMV, foreign geography, and COP conversion', () => {
  const threshold = requirementData('CO_V_DIGITAL_NOMAD', 'CO_DN_INCOME').financial.alternatives[0];
  assert.equal(threshold.amount, 5_252_715);
  assert.equal(threshold.currency, 'COP');
  assert.equal(threshold.history_months, 3);
  assert.equal(threshold.source_geography, 'FOREIGN');

  const exact = routeResult(calculate({ amount: 5_252_715 }), 'CO_V_DIGITAL_NOMAD');
  assert.equal(exact.routeStatus, 'SUITABLE');
  assert.equal(requirementResult(exact, 'CO_DN_INCOME').state, 'PASS');
  assert.deepEqual(exact.conditions, []);

  const below = routeResult(calculate({ amount: 5_252_714 }), 'CO_V_DIGITAL_NOMAD');
  assert.equal(below.routeStatus, 'UNSUITABLE');
  assert.equal(requirementResult(below, 'CO_DN_INCOME').state, 'FAIL');

  const domestic = routeResult(calculate({ amount: 6_000_000, countryId: 'CO' }), 'CO_V_DIGITAL_NOMAD');
  assert.equal(domestic.routeStatus, 'UNSUITABLE');
  assert.equal(requirementResult(domestic, 'CO_DN_INCOME').state, 'FAIL');

  const exactUsd = routeResult(calculate({ amount: 5_252_715 / 4000, currency: 'USD' }), 'CO_V_DIGITAL_NOMAD');
  assert.equal(requirementResult(exactUsd, 'CO_DN_INCOME').state, 'PASS');
});

test('Colombia Rentista uses 10 SMLMV only for qualifying passive or investment income', () => {
  const threshold = requirementData('CO_V_RENTISTA', 'CO_RENT_INCOME').financial.alternatives[0];
  assert.equal(threshold.amount, 17_509_050);
  assert.equal(threshold.currency, 'COP');
  assert.deepEqual(threshold.allowed_income_types, ['PASSIVE_INCOME', 'INVESTMENT_INCOME']);

  const exact = routeResult(calculate({
    type: 'PASSIVE_INCOME',
    amount: 17_509_050,
    countryId: 'CO',
  }), 'CO_V_RENTISTA');
  assert.equal(exact.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementResult(exact, 'CO_RENT_INCOME').state, 'PASS');
  assert.equal(requirementResult(exact, 'CO_RENT_SOURCE').effect, 'CONDITION');

  const salary = routeResult(calculate({
    type: 'REMOTE_EMPLOYMENT',
    amount: 30_000_000,
  }), 'CO_V_RENTISTA');
  assert.equal(salary.routeStatus, 'UNSUITABLE');
  assert.equal(requirementResult(salary, 'CO_RENT_INCOME').state, 'FAIL');
});

test('Colombia Pensionado uses the 3 SMLMV pension threshold without inventing an extra basis condition', () => {
  const threshold = requirementData('CO_M_PENSIONADO', 'CO_PENSION_INCOME').financial.alternatives[0];
  assert.equal(threshold.amount, 5_252_715);
  assert.deepEqual(threshold.allowed_income_types, ['PENSION']);

  const exact = routeResult(calculate({
    type: 'PENSION',
    amount: 5_252_715,
    countryId: 'CO',
  }), 'CO_M_PENSIONADO');
  assert.equal(exact.routeStatus, 'SUITABLE');
  assert.equal(requirementResult(exact, 'CO_PENSION_INCOME').state, 'PASS');
  assert.equal(requirementResult(exact, 'CO_PENSION_LIFETIME').effect, 'NONE');

  const below = routeResult(calculate({
    type: 'PENSION',
    amount: 5_252_714,
    countryId: 'CO',
  }), 'CO_M_PENSIONADO');
  assert.equal(below.routeStatus, 'UNSUITABLE');

  const path = routeData('CO_M_PENSIONADO').long_term_path;
  assert.equal(path.pr_path_status, 'AVAILABLE_AFTER_RESIDENCE');
  assert.equal(path.years_to_pr, 5);
  assert.equal(path.citizenship_path_status, 'AVAILABLE');
  assert.equal(path.years_to_citizenship, 5);
  assert.equal(path.residence_counts_for_citizenship, 'NO');
});

test('Colombia independent professional route keeps 5 SMLMV income separate from the professional basis', () => {
  const threshold = requirementData('CO_M_PROFESIONAL_INDEPENDIENTE', 'CO_IND_INCOME').financial.alternatives[0];
  assert.equal(threshold.amount, 8_754_525);
  assert.equal(threshold.history_months, 6);

  const exact = routeResult(calculate({
    type: 'OTHER_REGULAR_INCOME',
    amount: 8_754_525,
    countryId: 'CO',
  }), 'CO_M_PROFESIONAL_INDEPENDIENTE');
  assert.equal(exact.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementResult(exact, 'CO_IND_INCOME').state, 'PASS');
  assert.equal(requirementResult(exact, 'CO_IND_PROF_BASIS').effect, 'CONDITION');
  assert.equal(requirementResult(exact, 'CO_IND_INCOME_HISTORY').effect, 'NONE');

  const below = routeResult(calculate({
    type: 'OTHER_REGULAR_INCOME',
    amount: 8_754_524,
    countryId: 'CO',
  }), 'CO_M_PROFESIONAL_INDEPENDIENTE');
  assert.equal(below.routeStatus, 'UNSUITABLE');
});

test('Colombia capital routes never treat current savings or questionnaire capital as an already-established legal basis', () => {
  const result = calculate({
    type: 'NO_REGULAR_INCOME',
    amount: 0,
    geography: 'NO_STABLE_PAYER',
    countryId: null,
    savings: { amount: 2_000_000_000, currency: 'COP' },
    investmentCapital: { amount: 2_000_000_000, currency: 'COP' },
  });

  const owner = routeResult(result, 'CO_M_SOCIO_PROPIETARIO');
  const investor = routeResult(result, 'CO_M_INVERSIONISTA');

  assert.equal(owner.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementResult(owner, 'CO_SOCIO_CAPITAL').state, 'UNKNOWN');
  assert.equal(requirementResult(owner, 'CO_SOCIO_CAPITAL').effect, 'CONDITION');

  assert.equal(investor.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementResult(investor, 'CO_INVEST_CAPITAL').state, 'UNKNOWN');
  assert.equal(requirementResult(investor, 'CO_INVEST_CAPITAL').effect, 'CONDITION');

  const ownerCapital = requirementData('CO_M_SOCIO_PROPIETARIO', 'CO_SOCIO_CAPITAL').financial.alternatives[0];
  assert.equal(ownerCapital.asked_in_questionnaire, false);
  assert.equal(ownerCapital.amount, 175_090_500);

  const investorAlternatives = requirementData('CO_M_INVERSIONISTA', 'CO_INVEST_CAPITAL').financial.alternatives;
  assert.deepEqual(
    investorAlternatives.map(({ amount, comparison, asked_in_questionnaire }) => [amount, comparison, asked_in_questionnaire]),
    [
      [1_138_088_250, 'MORE_THAN', false],
      [612_816_750, 'AT_LEAST', false],
    ],
  );
});

test('Colombia employment and internationalization remain future separate bases rather than current-income proxies', () => {
  const result = calculate({ amount: 50_000_000 });
  const worker = routeResult(result, 'CO_M_TRABAJADOR');
  const fomento = routeResult(result, 'CO_M_FOMENTO_INTERNACIONALIZACION');

  assert.equal(worker.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementResult(worker, 'CO_WORKER_CONTRACT').effect, 'CONDITION');
  assert.equal(requirementResult(worker, 'CO_WORKER_EMPLOYER_SOLVENCY').effect, 'NONE');

  assert.equal(fomento.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementResult(fomento, 'CO_FOMENTO_HOST').effect, 'CONDITION');
  assert.equal(requirementResult(fomento, 'CO_FOMENTO_POSTGRAD').effect, 'NONE');

  for (const routeId of ['CO_M_FOMENTO_INTERNACIONALIZACION', 'CO_M_INVERSIONISTA', 'CO_M_PARENT_ADOPTION_COLOMBIAN']) {
    const rights = routeData(routeId).applicant_work_rights;
    assert.equal(rights.employment.status, 'NOT_RESEARCHED');
    assert.equal(rights.self_employment.status, 'NOT_RESEARCHED');
    assert.equal(rights.remote_foreign_work.status, 'NOT_RESEARCHED');
  }
});

test('Colombia family timing keeps beneficiary visas after the principal while protection can move together', () => {
  const married = calculate({
    amount: 6_000_000,
    partnerIncluded: true,
    relationshipType: 'MARRIED',
  });
  const digitalNomad = routeResult(married, 'CO_V_DIGITAL_NOMAD');
  const protection = routeResult(married, 'CO_INTERNATIONAL_PROTECTION');

  assert.equal(digitalNomad.familyEvaluation.state, 'CONDITION');
  assert.match(digitalNomad.familyEvaluation.conditions.join('\n'), /после выдачи действующей визы|после/i);
  assert.equal(protection.familyEvaluation.state, 'PASS');

  const protectionPartner = routeData('CO_INTERNATIONAL_PROTECTION').family_scenarios
    .find(({ applies_to }) => applies_to === 'PARTNER');
  assert.equal(protectionPartner.simultaneous_move, 'YES');
  assert.equal(protectionPartner.join_stage, 'WITH_INITIAL_APPLICATION');
  assert.equal(protectionPartner.separate_route_required, false);

  const unregistered = calculate({
    amount: 6_000_000,
    partnerIncluded: true,
    relationshipType: 'UNREGISTERED_PARTNERSHIP',
  });
  assert.notEqual(routeResult(unregistered, 'CO_V_DIGITAL_NOMAD').familyEvaluation.state, 'EXCLUDED');
  assert.notEqual(routeResult(unregistered, 'CO_INTERNATIONAL_PROTECTION').familyEvaluation.state, 'EXCLUDED');
});

test('Colombia family M routes preserve their distinct R and citizenship clocks', () => {
  const expectations = {
    CO_M_SPOUSE_COLOMBIAN: [3, 2],
    CO_M_PERMANENT_PARTNER_COLOMBIAN: [5, 2],
    CO_M_PARENT_BIRTH_COLOMBIAN: [2, 2],
    CO_M_PARENT_ADOPTION_COLOMBIAN: [2, 2],
  };

  for (const [routeId, [yearsToPr, yearsToCitizenship]] of Object.entries(expectations)) {
    const path = routeData(routeId).long_term_path;
    assert.equal(path.pr_path_status, 'AVAILABLE_AFTER_RESIDENCE', routeId);
    assert.equal(path.years_to_pr, yearsToPr, routeId);
    assert.equal(path.residence_counts_for_pr, 'YES', routeId);
    assert.equal(path.citizenship_path_status, 'AVAILABLE', routeId);
    assert.equal(path.years_to_citizenship, yearsToCitizenship, routeId);
    assert.equal(path.residence_counts_for_citizenship, 'NO', routeId);
    assert.equal(path.renunciation_required, false, routeId);
  }
});

test('Colombia long-term goal is evaluated without overriding a better current route group', () => {
  const temporary = calculate({ amount: 6_000_000, goal: 'TEMPORARY_RESIDENCE_SUFFICIENT' });
  assert.equal(temporary.bestRoute.routeId, 'CO_V_DIGITAL_NOMAD');
  assert.equal(temporary.bestRoute.goalFit, 'MEETS');

  for (const goal of ['PR_REQUIRED', 'CITIZENSHIP_REQUIRED']) {
    const result = calculate({ amount: 6_000_000, goal });
    const digitalNomad = routeResult(result, 'CO_V_DIGITAL_NOMAD');
    const fomento = routeResult(result, 'CO_M_FOMENTO_INTERNACIONALIZACION');

    assert.equal(digitalNomad.routeStatus, 'SUITABLE', goal);
    assert.equal(digitalNomad.goalFit, 'UNKNOWN', goal);

    assert.equal(fomento.routeStatus, 'SUITABLE_WITH_CONDITIONS', goal);
    assert.equal(fomento.goalFit, 'MEETS', goal);

    assert.equal(result.bestRoute.routeId, 'CO_V_DIGITAL_NOMAD', goal);
  }

  for (const goal of ['PR_REQUIRED', 'CITIZENSHIP_REQUIRED']) {
    const result = calculate({
      type: 'PENSION',
      amount: 5_252_715,
      countryId: 'CO',
      goal,
    });

    const pensionado = routeResult(result, 'CO_M_PENSIONADO');

    assert.equal(pensionado.routeStatus, 'SUITABLE', goal);
    assert.equal(pensionado.goalFit, 'MEETS', goal);
  }
});

test('Colombia city comparison uses the same four-component one-person basket in all four structural roles', () => {
  assert.deepEqual(
    colombia.cities.map(({ city_id, structural_roles }) => [city_id, structural_roles]),
    [
      ['CO_BOGOTA', ['CAPITAL', 'LARGE']],
      ['CO_MEDELLIN', ['LARGE']],
      ['CO_PEREIRA', ['MEDIUM']],
      ['CO_TUNJA', ['SMALL']],
    ],
  );

  for (const city of colombia.cities) {
    assert.deepEqual(
      city.cost_components.map(({ component }) => component),
      ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT'],
      city.city_id,
    );
    assert.ok(city.cost_components.every(({ currency, period }) => currency === 'USD' && period === 'MONTHLY'));
  }

  const result = calculate();
  const costs = Object.fromEntries(result.cities.map(({ cityId, comparisonCostUsd }) => [cityId, comparisonCostUsd]));
  assert.deepEqual(costs, {
    CO_BOGOTA: 1134.2,
    CO_MEDELLIN: 1229.4,
    CO_PEREIRA: 750,
    CO_TUNJA: 625.1,
  });

  assert.ok(result.cities.find(({ cityId }) => cityId === 'CO_MEDELLIN').labels.includes('Самый дорогой'));
  assert.ok(result.cities.find(({ cityId }) => cityId === 'CO_TUNJA').labels.includes('Самый недорогой'));
  assert.ok(result.cities.find(({ cityId }) => cityId === 'CO_TUNJA').labels.includes('Самый прохладный'));
});
