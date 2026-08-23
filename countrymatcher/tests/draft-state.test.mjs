import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DRAFT_VERSION, prepareDraftForRestore } from '../matcher/draft-state.js';
import { buildUserProfile, validateUserProfile } from '../matcher/profile.js';
import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const currentDraft = (answers = {}) => ({
  version: DRAFT_VERSION,
  savedAt: '2026-08-23T00:00:00.000Z',
  answers: {
    currentCountry: 'PH',
    currentStatus: 'TOURIST_OR_VISA_FREE',
    applicationMethods: ['ANY'],

    partnerIncluded: false,
    relationshipType: '',
    applicantAge: '40',
    partnerAge: '',
    childAges: [],
    lgbtEnabled: false,

    primaryType: 'REMOTE_EMPLOYMENT',
    primarySourceScope: 'SINGLE_COUNTRY',
    primarySourceCountry: 'PH',
    primaryTotalAmount: '1000000000000',
    primaryAmount: '1000000000000',
    primaryCurrency: 'USD',
    primaryEvidence: 'FULL',

    hasAdditionalIncome: false,
    partnerHasIncome: false,

    savingsAmount: '1000000000000',
    savingsCurrency: 'USD',

    longTermGoal: 'TEMPORARY_RESIDENCE_SUFFICIENT',
    keepRuCitizenship: 'REQUIRED',

    petTypes: ['NONE'],
    specialCircumstances: ['NONE'],
    medicalEnabled: false,
    routeSpecificAnswers: {},

    ...answers,
  },
});

test('current v4 draft is restored unchanged', () => {
  const current = currentDraft({
    primarySourceScope: 'SINGLE_COUNTRY',
    primarySourceCountry: 'PH',
  });

  assert.equal(prepareDraftForRestore(current), current);
});

test('older and unsupported draft versions are rejected instead of migrated', () => {
  for (const version of [2, 3, 5]) {
    const stored = currentDraft();
    stored.version = version;
    assert.equal(
      prepareDraftForRestore(stored),
      null,
      `draft version ${version} must not be restored`,
    );
  }
});

test('current v4 missing SourceScope stays invalid before matching', () => {
  const restored = prepareDraftForRestore(currentDraft({
    primarySourceScope: '',
    primarySourceCountry: 'PH',
    longTermGoal: 'CITIZENSHIP_REQUIRED',
  }));

  assert.ok(restored);

  const profile = buildUserProfile(restored.answers);

  assert.equal(profile.income.primary.source_geography, null);
  assert.equal(profile.income.primary.country_id, null);

  const validation = validateUserProfile(profile);

  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.some(({ field }) => field === 'primarySourceScope'),
    'missing SourceScope must stop the profile before matching',
  );
});

test('current v4 absent SourceScope is not manufactured during restore', () => {
  const stored = currentDraft();
  delete stored.answers.primarySourceScope;

  const restored = prepareDraftForRestore(stored);

  assert.ok(restored);
  assert.equal('primarySourceScope' in restored.answers, false);

  const profile = buildUserProfile(restored.answers);

  assert.equal(profile.income.primary.source_geography, null);
  assert.equal(profile.income.primary.country_id, null);
  assert.equal(validateUserProfile(profile).valid, false);
});

const packageFiles = [
  'ES-research-v4.0.json',
  'PT-research-v4.0.json',
  'BR-research-v4.0.json',
  'CO-research-v4.0.json',
];

const packages = await Promise.all(
  packageFiles.map(async (filename) =>
    JSON.parse(
      await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'),
    ),
  ),
);

const collectCurrencyCodes = (value, result = new Set(['USD'])) => {
  if (Array.isArray(value)) {
    for (const item of value) collectCurrencyCodes(item, result);
    return result;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectCurrencyCodes(item, result);
    return result;
  }

  if (typeof value === 'string' && /^[A-Z]{3}$/.test(value)) {
    result.add(value);
  }

  return result;
};

const currencies = collectCurrencyCodes(packages);

const engineContext = {
  fx: {
    base_currency: 'USD',
    rates: Object.fromEntries([...currencies].map((code) => [code, 1])),
    as_of: '2026-08-22',
    source: 'stage-b-regression',
  },
};

test('explicit PH SourceScope survives restore -> profile -> validation -> FOREIGN financial engine for ES/PT/BR/CO', () => {
  const restored = prepareDraftForRestore(currentDraft({
    primarySourceScope: 'SINGLE_COUNTRY',
    primarySourceCountry: 'PH',
  }));

  const profile = buildUserProfile(restored.answers);
  const validation = validateUserProfile(profile);

  assert.equal(validation.valid, true);
  assert.equal(profile.income.primary.source_geography, 'SINGLE_COUNTRY');
  assert.equal(profile.income.primary.country_id, 'PH');

  for (const pkg of packages) {
    const targets = [];

    for (const route of pkg.routes.filter(({ publishable }) => publishable === true)) {
      for (const requirement of route.requirements || []) {
        if (
          requirement.type !== 'FINANCIAL'
          || requirement.evaluation_mode !== 'ENGINE'
        ) continue;

        const alternatives = requirement.financial?.alternatives || [];

        const indexes = alternatives
          .map((alternative, index) => ({ alternative, index }))
          .filter(({ alternative }) =>
            alternative.kind === 'INCOME'
            && alternative.asked_in_questionnaire === true
            && alternative.source_geography === 'FOREIGN'
            && Array.isArray(alternative.allowed_income_types)
            && alternative.allowed_income_types.includes('REMOTE_EMPLOYMENT')
          )
          .map(({ index }) => index);

        if (indexes.length) {
          targets.push({
            routeId: route.route_id,
            requirementId: requirement.requirement_id,
            alternativeIndexes: indexes,
          });
        }
      }
    }

    assert.ok(
      targets.length > 0,
      `${pkg.country_id}: expected at least one publishable FOREIGN remote-income target`,
    );

    const result = calculateActiveCountry(profile, pkg, engineContext);

    for (const target of targets) {
      const presentedRoute = result.routes.find(
        ({ routeId }) => routeId === target.routeId,
      );

      assert.ok(
        presentedRoute,
        `${pkg.country_id}/${target.routeId}: route must remain evaluable`,
      );

      const presentedRequirement = presentedRoute.financialRequirements.find(
        ({ requirementId }) => requirementId === target.requirementId,
      );

      assert.ok(
        presentedRequirement,
        `${pkg.country_id}/${target.routeId}/${target.requirementId}: financial result missing`,
      );

      for (const index of target.alternativeIndexes) {
        const alternative =
          presentedRequirement.summary.alternatives[index];

        assert.ok(
          alternative,
          `${pkg.country_id}/${target.routeId}/${target.requirementId}: alternative ${index} missing`,
        );

        assert.equal(
          alternative.state,
          'PASS',
          `${pkg.country_id}/${target.routeId}/${target.requirementId}: FOREIGN income must PASS for explicit PH source`,
        );
      }
    }
  }
});
