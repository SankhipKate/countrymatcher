import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRouteRequirements } from '../js/engine/evaluate-route-requirements.js';

const context = {
  fx: { base_currency: 'USD', rates: { USD: 1, MXN: 18 }, as_of: '2026-08-01T00:00:00Z', source: 'test' },
};

const incomeSource = (amount, sourceCountry = 'US') => ({
  type: 'REMOTE_EMPLOYMENT',
  source_country: sourceCountry,
  provableUsd: amount,
});

const financialRoute = (model = 'INCOME_ONLY') => ({
  route_id: 'TEST_ROUTE',
  requirements: [{
    requirement_id: 'TEST_FINANCE',
    type: 'FINANCIAL',
    role: 'BLOCKER',
    subject: 'APPLICANT',
    timing: 'AT_APPLICATION',
    evaluation_mode: 'ENGINE',
    condition_ru: 'Подтвердить финансовое основание.',
    unmet_ru: 'Доход ниже обязательного порога.',
    financial: {
      model,
      alternatives: [{
        kind: 'INCOME', asked_in_questionnaire: true, amount: 1800, currency: 'MXN', period: 'MONTHLY',
        allowed_income_types: ['REMOTE_EMPLOYMENT'], source_geography: 'FOREIGN', source_ids: ['SRC'], confidence: 'HIGH',
      }, ...(model === 'INCOME_OR_SAVINGS' ? [{
        kind: 'SAVINGS', asked_in_questionnaire: false, amount: 18000, currency: 'MXN', period: 'AVERAGE_BALANCE',
        source_geography: 'NOT_APPLICABLE', source_ids: ['SRC'], confidence: 'HIGH',
      }] : [])],
    },
    source_ids: ['SRC'],
    confidence: 'HIGH',
  }],
});

test('common evaluator makes current income below an income-only threshold unsuitable', () => {
  const result = evaluateRouteRequirements(financialRoute(), { applicantSources: [incomeSource(1)] }, context, { countryId: 'MX' });
  assert.equal(result.status, 'UNSUITABLE');
  assert.match(result.checks[0].message, /ниже обязательного порога/);
});

test('common evaluator retains an unasked savings alternative as a condition', () => {
  const result = evaluateRouteRequirements(financialRoute('INCOME_OR_SAVINGS'), { applicantSources: [incomeSource(1)] }, context, { countryId: 'MX' });
  assert.equal(result.status, 'SUITABLE_WITH_CONDITIONS');
  assert.match(result.checks[0].condition, /финансовое основание/);
});

test('common evaluator applies a structured family multiplier to the threshold', () => {
  const route = financialRoute();
  route.requirements[0].financial.alternatives[0].family_formula = {
    main_applicant_multiplier: 1,
    additional_adult_multiplier: 0.5,
    child_multiplier: 0.3,
  };
  const profile = { adults: 2, children: [{ age_years: 8 }], applicantSources: [incomeSource(120)] };
  const result = evaluateRouteRequirements(route, profile, context, { countryId: 'MX' });
  assert.equal(result.status, 'UNSUITABLE');
  assert.equal(Math.round(result.financial[0].primary.thresholdUsd), 180);
});

test('common evaluator turns an unasked work basis into the exact researched condition', () => {
  const route = {
    route_id: 'WORK_ROUTE',
    requirements: [{
      requirement_id: 'WORK_BASIS', type: 'EMPLOYMENT_BASIS', role: 'CONDITION', subject: 'APPLICANT',
      timing: 'BEFORE_APPLICATION', evaluation_mode: 'UNASKED_CONDITION',
      condition_ru: 'Найти работодателя и получить оферту.', source_ids: ['SRC'], confidence: 'HIGH',
    }],
  };
  const result = evaluateRouteRequirements(route, { applicantSources: [] }, context, { countryId: 'MX' });
  assert.equal(result.status, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(result.checks[0].condition, 'Найти работодателя и получить оферту.');
});

test('common evaluator requires a pension basis while allowing regular income to top up the threshold', () => {
  const route = {
    route_id: 'AA_RETIREMENT',
    requirements: [{
      requirement_id: 'AA_RETIREMENT_FINANCE', type: 'FINANCIAL', role: 'BLOCKER',
      evaluation_mode: 'ENGINE', condition_ru: 'Подтвердить пенсию и общий регулярный доход.',
      unmet_ru: 'Пенсионное основание отсутствует либо сумма ниже порога.',
      financial: { alternatives: [{
        kind: 'INCOME', asked_in_questionnaire: true, amount: 2000, currency: 'USD',
        allowed_income_types: ['PENSION', 'PASSIVE_INCOME'], required_income_types: ['PENSION'],
        source_geography: 'FOREIGN',
      }] },
    }],
  };
  const withoutPension = evaluateRouteRequirements(route, {
    applicantSources: [{ type: 'PASSIVE_INCOME', source_country: 'US', provableUsd: 2500 }],
  }, context, { countryId: 'AA' });
  assert.equal(withoutPension.status, 'UNSUITABLE');

  const withTopUp = evaluateRouteRequirements(route, {
    applicantSources: [
      { type: 'PENSION', source_country: 'US', provableUsd: 1400 },
      { type: 'PASSIVE_INCOME', source_country: 'US', provableUsd: 700 },
    ],
  }, context, { countryId: 'AA' });
  assert.equal(withTopUp.status, 'SUITABLE');
});
