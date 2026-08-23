import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';
import { buildUserProfile, validateUserProfile } from '../matcher/profile.js';
import {
  mergeRouteSpecificAnswer,
  renderRouteSpecificFollowUps,
} from '../matcher/route-specific-follow-up.js';

const spain = JSON.parse(
  await readFile(
    new URL('../data/ES-research-v4.0.json', import.meta.url),
    'utf8',
  ),
);

const question = {
  question_id: 'support_type',
  prompt_ru: 'Какой вариант финансирования относится к вашей ситуации?',
  answer_type: 'SINGLE_SELECT',
  options: [
    { value: 'SELF', label_ru: 'Собственные средства' },
    { value: 'LEGAL_ENTITY', label_ru: 'Финансирование организации' },
  ],
};

const condition = {
  question_id: 'support_type',
  operator: 'EQUALS',
  values: ['SELF'],
};

const context = {
  fx: {
    base_currency: 'USD',
    rates: {
      USD: 1,
      EUR: 1,
    },
    as_of: '2026-08-23',
    source: 'stage-d-test',
  },
};

const answers = (routeSpecificAnswers = {}) => ({
  inRussia: false,
  currentCountry: 'PH',
  currentStatus: 'TOURIST_OR_VISA_FREE',
  applicationMethods: ['ANY'],

  partnerIncluded: false,
  relationshipType: '',
  applicantAge: '40',
  partnerAge: '',
  childAges: [],
  lgbtEnabled: false,

  primaryType: 'PASSIVE_INCOME',
  primarySourceScope: 'SINGLE_COUNTRY',
  primarySourceCountry: 'PH',
  primaryTotalAmount: '100000',
  primaryAmount: '100000',
  primaryCurrency: 'USD',
  primaryEvidence: 'FULL',

  hasAdditionalIncome: false,
  additionalType: '',
  additionalSourceScope: '',
  additionalSourceCountry: '',
  additionalTotalAmount: '',
  additionalAmount: '',
  additionalCurrency: 'USD',
  additionalEvidence: '',

  partnerHasIncome: false,
  partnerType: '',
  partnerSourceScope: '',
  partnerSourceCountry: '',
  partnerTotalAmount: '',
  partnerAmount: '',
  partnerCurrency: 'USD',
  partnerEvidence: '',

  savingsAmount: '0',
  savingsCurrency: 'USD',

  longTermGoal: 'TEMPORARY_RESIDENCE_SUFFICIENT',
  keepRuCitizenship: 'NOT_REQUIRED',

  petTypes: ['NONE'],
  specialCircumstances: ['NONE'],
  medicalEnabled: false,

  routeSpecificAnswers,
});

function packageWithIncomeGate() {
  const pkg = structuredClone(spain);
  const route = pkg.routes.find(({ route_id }) => route_id === 'ES_NLV');

  assert.ok(route);

  route.route_specific_questions = [structuredClone(question)];

  const financial = route.requirements.find(
    ({ requirement_id }) => requirement_id === 'ES_NLV_FIN',
  );

  assert.ok(financial);

  financial.financial.alternatives[0].applies_if =
    structuredClone(condition);

  return { pkg, financial };
}

function nlv(result) {
  const route = result.routes.find(({ routeId }) => routeId === 'ES_NLV');
  assert.ok(route);
  return route;
}

test('Stage D chain: UNKNOWN -> rendered follow-up -> answer -> profile -> recalculation -> resolved condition', () => {
  const { pkg, financial } = packageWithIncomeGate();

  const initialProfile = buildUserProfile(answers());
  assert.equal(validateUserProfile(initialProfile).valid, true);

  const initial = nlv(
    calculateActiveCountry(initialProfile, pkg, context),
  );

  assert.equal(initial.routeStatus, 'SUITABLE_WITH_CONDITIONS');

  assert.deepEqual(
    initial.routeSpecificFollowUps.map(({ questionId }) => questionId),
    ['support_type'],
  );

  assert.ok(initial.conditions.includes(financial.condition_ru));

  const rendered = renderRouteSpecificFollowUps(initial);

  assert.match(rendered, /data-route-follow-up/);
  assert.match(rendered, /data-route-id="ES_NLV"/);
  assert.match(rendered, /data-question-id="support_type"/);
  assert.match(rendered, /Какой вариант финансирования относится к вашей ситуации\?/);
  assert.match(rendered, /Собственные средства/);
  assert.match(rendered, /Финансирование организации/);

  const routeSpecificAnswers = mergeRouteSpecificAnswer(
    initialProfile.route_specific_answers,
    'ES_NLV',
    'support_type',
    'SELF',
  );

  assert.deepEqual(routeSpecificAnswers, {
    ES_NLV: {
      support_type: 'SELF',
    },
  });

  const answeredProfile = buildUserProfile(
    answers(routeSpecificAnswers),
  );

  assert.equal(validateUserProfile(answeredProfile).valid, true);
  assert.equal(
    answeredProfile.route_specific_answers.ES_NLV.support_type,
    'SELF',
  );

  const recalculated = nlv(
    calculateActiveCountry(answeredProfile, pkg, context),
  );

  const financialResult = recalculated.financialRequirements.find(
    ({ requirementId }) => requirementId === 'ES_NLV_FIN',
  );

  assert.ok(financialResult);
  assert.equal(financialResult.summary.state, 'PASS');

  assert.equal(
    recalculated.conditions.includes(financial.condition_ru),
    false,
  );

  assert.deepEqual(recalculated.routeSpecificFollowUps, []);
});

test('UNKNOWN gated OR branch is not asked when an ungated branch already PASSes', () => {
  const pkg = structuredClone(spain);
  const route = pkg.routes.find(({ route_id }) => route_id === 'ES_NLV');

  assert.ok(route);

  route.route_specific_questions = [structuredClone(question)];

  const financial = route.requirements.find(
    ({ requirement_id }) => requirement_id === 'ES_NLV_FIN',
  );

  assert.ok(financial);

  // Income is the confirmed PASS baseline.
  // Only the savings branch is route-specific and unanswered.
  financial.financial.alternatives[1].applies_if =
    structuredClone(condition);

  const result = nlv(
    calculateActiveCountry(
      buildUserProfile(answers()),
      pkg,
      context,
    ),
  );

  const financialResult = result.financialRequirements.find(
    ({ requirementId }) => requirementId === 'ES_NLV_FIN',
  );

  assert.ok(financialResult);
  assert.equal(financialResult.summary.state, 'PASS');
  assert.deepEqual(result.routeSpecificFollowUps, []);
});

test('answered FALSE applicability does not leave a stale follow-up', () => {
  const { pkg } = packageWithIncomeGate();

  const routeSpecificAnswers = mergeRouteSpecificAnswer(
    {},
    'ES_NLV',
    'support_type',
    'LEGAL_ENTITY',
  );

  const result = nlv(
    calculateActiveCountry(
      buildUserProfile(answers(routeSpecificAnswers)),
      pkg,
      context,
    ),
  );

  assert.equal(result.routeStatus, 'UNSUITABLE');
  assert.deepEqual(result.routeSpecificFollowUps, []);
});

test('answer merge preserves existing answers for other routes and questions', () => {
  const result = mergeRouteSpecificAnswer(
    {
      PT_STUDY: {
        accommodation_support: 'HOUSING',
      },
      ES_NLV: {
        earlier_question: 'VALUE',
      },
    },
    'ES_NLV',
    'support_type',
    'SELF',
  );

  assert.deepEqual(result, {
    PT_STUDY: {
      accommodation_support: 'HOUSING',
    },
    ES_NLV: {
      earlier_question: 'VALUE',
      support_type: 'SELF',
    },
  });
});
