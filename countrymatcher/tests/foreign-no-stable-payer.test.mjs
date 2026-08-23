import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildUserProfile } from '../matcher/profile.js';
import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const montenegro = JSON.parse(
  await readFile(
    new URL('../data/ME-research-v4.0.json', import.meta.url),
    'utf8',
  ),
);

const context = {
  calculation_date: '2026-08-23T00:00:00.000Z',
  fx: {
    base_currency: 'USD',
    rates: {
      USD: 1,
      EUR: 0.86,
    },
    source: 'test',
    as_of: '2026-08-23',
  },
};

const answers = ({
  sourceScope,
  sourceCountry = '',
  type = 'FREELANCE_OR_SELF_EMPLOYED',
}) => ({
  inRussia: false,
  currentCountry: 'PH',
  currentStatus: 'TEMPORARY_RESIDENCE',
  applicationMethods: ['ANY'],
  partnerIncluded: false,
  relationshipType: '',
  applicantAge: '',
  partnerAge: '',
  lgbtEnabled: false,
  childAges: [],
  primaryType: type,
  primarySourceScope: sourceScope,
  primarySourceCountry: sourceCountry,
  primaryTotalAmount: '5000',
  primaryAmount: '5000',
  primaryCurrency: 'USD',
  primaryEvidence: 'FULL',
  hasAdditionalIncome: false,
  partnerHasIncome: false,
  savingsAmount: '0',
  savingsCurrency: 'USD',
  longTermGoal: 'TEMPORARY_RESIDENCE_SUFFICIENT',
  keepRuCitizenship: 'NOT_REQUIRED',
  petTypes: ['NONE'],
  specialCircumstances: ['NONE'],
  medicalEnabled: false,
  routeSpecificAnswers: {},
});

const dnv = (profile) =>
  calculateActiveCountry(
    profile,
    montenegro,
    context,
  ).routes.find(({ routeId }) => routeId === 'ME_DNV');

test('Montenegro DNV accepts NO_STABLE_PAYER foreign freelance income without a condition and keeps an informational notice', () => {
  const profile = buildUserProfile(
    answers({
      sourceScope: 'NO_STABLE_PAYER',
    }),
  );

  const result = dnv(profile);

  assert.equal(
    profile.income.primary.type,
    'FREELANCE_OR_SELF_EMPLOYED',
  );
  assert.equal(
    profile.income.primary.source_geography,
    'NO_STABLE_PAYER',
  );
  assert.equal(
    profile.income.primary.country_id,
    null,
  );

  assert.equal(
    result.routeStatus,
    'SUITABLE',
  );
  assert.deepEqual(
    result.conditions,
    [],
  );

  const income = result.financialSummary.alternatives.find(
    ({ kind }) => kind === 'INCOME',
  );

  assert.ok(income);
  assert.match(
    income.geographyNotice,
    /без постоянного плательщика/u,
  );
  assert.match(
    income.geographyNotice,
    /из-за пределов страны назначения/u,
  );
});


test('ordinary known foreign source does not receive the NO_STABLE_PAYER notice', () => {
  const profile = buildUserProfile(
    answers({
      sourceScope: 'SINGLE_COUNTRY',
      sourceCountry: 'US',
      type: 'REMOTE_EMPLOYMENT',
    }),
  );

  const result = dnv(profile);

  assert.equal(
    result.routeStatus,
    'SUITABLE',
  );

  const income = result.financialSummary.alternatives.find(
    ({ kind }) => kind === 'INCOME',
  );

  assert.ok(income);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      income,
      'geographyNotice',
    ),
    false,
  );
});
