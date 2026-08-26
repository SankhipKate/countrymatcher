import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const paraguay = JSON.parse(
  await readFile(new URL('../data/PY-research-v4.0.json', import.meta.url), 'utf8'),
);

const context = {
  fx: {
    base_currency: 'USD',
    rates: { USD: 1, PYG: 7300 },
    source: 'test',
    as_of: '2026-08-26',
  },
};

const profile = ({ longTerm = 'TEMPORARY_RESIDENCE_SUFFICIENT' } = {}) => ({
  citizenships: ['RU'],
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: {
    adults_count: 1,
    adult_ages: [35],
    partner_included: false,
    relationship_type: null,
    children: [{ age_years: 7 }],
    school_needed: true,
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
      type: 'NO_REGULAR_INCOME',
      source_geography: 'NO_STABLE_PAYER',
      country_id: null,
      monthly_total: { amount: 0, currency: 'USD' },
      monthly_provable: { amount: 0, currency: 'USD' },
    },
    additional_sources: [],
    partner: { has_income: false, sources: [] },
    savings: { amount: 0, currency: 'USD' },
  },
  investment_capital: null,
  goal: {
    long_term: longTerm,
    keep_russian_citizenship: 'NOT_REQUIRED',
  },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  special_circumstances: ['NONE'],
  route_specific_answers: {},
});

const routeById = (result, routeId) => result.routes.find(({ routeId: id }) => id === routeId);
const packageRouteById = (routeId) => paraguay.routes.find(({ route_id }) => route_id === routeId);

test('Paraguay temporary residence with a child stays suitable without a financial requirement', () => {
  const result = calculateActiveCountry(profile(), paraguay, context);
  const route = routeById(result, 'PY_GENERAL_TEMPORARY');
  const child = packageRouteById('PY_GENERAL_TEMPORARY').family_scenarios
    .find(({ scenario_id }) => scenario_id === 'PY_TEMP_FAM_CHILD');

  assert.equal(route.routeStatus, 'SUITABLE');
  assert.equal(route.familyEvaluation.state, 'PASS');
  assert.equal(route.familyEvaluation.classification, 'SIMULTANEOUS');
  assert.equal(route.financialSummary, null);
  assert.equal(child.simultaneous_move, 'YES');
  assert.equal(child.administrative_separate_filing, true);
  assert.equal(child.separate_route_required, false);
  assert.equal(child.linked_route_id, null);
  assert.equal(child.join_stage, 'WITH_INITIAL_APPLICATION');
});

test('Paraguay future PR solvency is display-only and does not downgrade the temporary route', () => {
  const result = calculateActiveCountry(profile({ longTerm: 'PR_REQUIRED' }), paraguay, context);
  const route = routeById(result, 'PY_GENERAL_TEMPORARY');
  const requirement = packageRouteById('PY_GENERAL_TEMPORARY').requirements
    .find(({ requirement_id }) => requirement_id === 'PY_TEMP_PR_SOLVENCY_INFO');

  assert.equal(route.routeStatus, 'SUITABLE');
  assert.equal(requirement.evaluation_mode, 'DISPLAY_ONLY');
  assert.equal(requirement.unmet_effect, 'NONE');
  assert.equal(route.conditions.length, 0);
  assert.ok(route.displayOnlyRequirements.some(({ condition_ru }) => /постоянную резиденцию|ПМЖ/u.test(condition_ru)));
});
