import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  ACTIVE_ENGINE_FINANCIAL_CAPABILITIES,
  APPLICABILITY_STATES,
  Rp4EvaluationUnsupportedError,
  calculateActiveCountry,
  evaluateApplicability,
  evaluateFinancialRequirement,
  evaluateRoute,
} from '../js/engine/rp4-engine.js';

const schema = JSON.parse(
  await readFile(
    new URL('../data/research-package-v4.0.schema.json', import.meta.url),
    'utf8',
  ),
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);

const validateCondition =
  ajv.getSchema(`${schema.$id}#/$defs/applicabilityCondition`);
const validateQuestion =
  ajv.getSchema(`${schema.$id}#/$defs/routeSpecificQuestion`);
const validateAlternative =
  ajv.getSchema(`${schema.$id}#/$defs/financialAlternative`);
const validateFinancial =
  ajv.getSchema(`${schema.$id}#/$defs/financialRequirement`);
const validateRequirement =
  ajv.getSchema(`${schema.$id}#/$defs/routeRequirement`);

const question = {
  question_id: 'support_type',
  prompt_ru: 'Кто обеспечивает финансирование?',
  answer_type: 'SINGLE_SELECT',
  options: [
    { value: 'SELF', label_ru: 'Сам заявитель' },
    { value: 'LEGAL_ENTITY', label_ru: 'Юридическое лицо' },
  ],
};

const condition = {
  question_id: 'support_type',
  operator: 'EQUALS',
  values: ['SELF'],
};

const alternative = (extra = {}) => ({
  kind: 'INCOME',
  asked_in_questionnaire: true,
  amount: 1000,
  currency: 'USD',
  period: 'MONTHLY',
  comparison: 'AT_LEAST',
  history_months: null,
  allowed_income_types: ['REMOTE_EMPLOYMENT'],
  source_geography: 'ANY',
  family_formula_ru: null,
  source_ids: ['SRC'],
  confidence: 'HIGH',
  income_owners: ['APPLICANT'],
  ...extra,
});

const financialRequirement = (alternatives, model = 'INCOME_ONLY') => ({
  requirement_id: 'FIN',
  type: 'FINANCIAL',
  subject: 'APPLICANT',
  timing: 'AT_APPLICATION',
  evaluation_mode: 'ENGINE',
  unmet_effect: 'BLOCKS',
  condition_ru: 'Подтвердить финансовое требование.',
  met_ru: 'Финансовое требование выполнено.',
  unmet_ru: 'Финансовое требование не выполнено.',
  profile_path: 'INCOME_APPLICANT',
  source_ids: ['SRC'],
  confidence: 'HIGH',
  financial: { model, alternatives },
});

const nonFinancialRequirement = (extra = {}) => ({
  requirement_id: 'BASIS',
  type: 'OTHER_BASIS',
  subject: 'APPLICANT',
  timing: 'AT_APPLICATION',
  evaluation_mode: 'ENGINE',
  unmet_effect: 'BLOCKS',
  condition_ru: 'Уточнить основание.',
  met_ru: 'Основание выполнено.',
  unmet_ru: 'Основание не выполнено.',
  profile_path: 'CURRENT_COUNTRY',
  engine_rule: { operator: 'EQUALS', value: 'RU' },
  source_ids: ['SRC'],
  confidence: 'HIGH',
  ...extra,
});

const profile = (answer) => ({
  residence: {
    current_country: 'PH',
    current_status: 'TEMPORARY_RESIDENCE',
  },
  family: {
    adults_count: 1,
    adult_ages: [40],
    partner_included: false,
    relationship_type: null,
    children: [],
  },
  income: {
    primary: {
      owner: 'APPLICANT',
      type: 'REMOTE_EMPLOYMENT',
      source_geography: 'SINGLE_COUNTRY',
      country_id: 'PH',
      monthly_total: { amount: 2000, currency: 'USD' },
      monthly_provable: { amount: 2000, currency: 'USD' },
      evidence_level: 'FULL',
    },
    additional_sources: [],
    partner: { has_income: false, sources: [] },
    savings: { amount: 0, currency: 'USD' },
  },
  goal: {
    long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT',
    keep_russian_citizenship: 'NOT_REQUIRED',
  },
  route_specific_answers:
    answer === undefined
      ? {}
      : { TEST: { support_type: answer } },
});

const route = (requirements) => ({
  route_id: 'TEST',
  name_ru: 'Тестовый маршрут',
  requirements,
  route_specific_questions: [question],
});

const context = {
  fx: {
    base_currency: 'USD',
    rates: { USD: 1, EUR: 1 },
    as_of: '2026-08-22',
    source: 'test',
  },
};

test('schema defines typed route-specific questions and applicability conditions', () => {
  assert.equal(validateQuestion(question), true, JSON.stringify(validateQuestion.errors));
  assert.equal(validateCondition(condition), true, JSON.stringify(validateCondition.errors));

  const inCondition = {
    question_id: 'support_type',
    operator: 'IN',
    values: ['SELF', 'LEGAL_ENTITY'],
  };
  assert.equal(validateCondition(inCondition), true, JSON.stringify(validateCondition.errors));

  const invalidEquals = structuredClone(inCondition);
  invalidEquals.operator = 'EQUALS';
  assert.equal(validateCondition(invalidEquals), false);
});

test('schema defines alternative applies_if structurally while active model support comes from the capability contract', () => {
  const gated = alternative({ applies_if: condition });

  assert.equal(
    validateAlternative(gated),
    true,
    JSON.stringify(validateAlternative.errors),
  );

  for (const model of [
    'INCOME_ONLY',
    'INCOME_AND_SAVINGS',
    'INCOME_WITH_SAVINGS_SHORTFALL',
  ]) {
    const value = {
      model,
      alternatives: [gated],
      ...(model === 'INCOME_WITH_SAVINGS_SHORTFALL'
        ? {
            shortfall_coverage: {
              calculation: 'MONTHLY_SHORTFALL_X_MONTHS',
              coverage_months: 6,
              condition_ru: 'Покрыть дефицит накоплениями.',
            },
          }
        : {}),
    };

    assert.equal(
      validateFinancial(value),
      true,
      `${model}: ${JSON.stringify(validateFinancial.errors)}`,
    );
  }

  assert.deepEqual(
    ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.alternativeApplicabilityModels,
    [
      'INCOME_ONLY',
      'SAVINGS_ONLY',
      'INCOME_OR_SAVINGS',
      'INVESTMENT_CAPITAL',
      'SPONSOR_OR_SCHOLARSHIP',
    ],
  );
});

test('schema allows requirement gate on ENGINE/UNASKED but alternative gate only on FINANCIAL ENGINE', () => {
  const gated = nonFinancialRequirement({ applies_if: condition });
  assert.equal(
    validateRequirement(gated),
    true,
    JSON.stringify(validateRequirement.errors),
  );

  const unaskedRequirementGate = {
    ...gated,
    evaluation_mode: 'UNASKED_CONDITION',
    unmet_effect: 'BECOMES_CONDITION',
  };
  assert.equal(
    validateRequirement(unaskedRequirementGate),
    true,
    JSON.stringify(validateRequirement.errors),
  );

  const displayOnly = {
    ...gated,
    evaluation_mode: 'DISPLAY_ONLY',
    unmet_effect: 'NONE',
  };
  assert.equal(validateRequirement(displayOnly), false);

  const unaskedAlternativeGate = financialRequirement([
    alternative({
      asked_in_questionnaire: false,
      applies_if: condition,
    }),
  ]);
  unaskedAlternativeGate.evaluation_mode = 'UNASKED_CONDITION';
  unaskedAlternativeGate.unmet_effect = 'BECOMES_CONDITION';

  assert.equal(validateRequirement(unaskedAlternativeGate), false);
});

test('applicability resolver is TRUE, FALSE, or UNKNOWN and never guesses a missing answer', () => {
  const testRoute = route([]);

  assert.equal(
    evaluateApplicability(undefined, profile(), testRoute),
    APPLICABILITY_STATES.TRUE,
  );

  assert.equal(
    evaluateApplicability(condition, profile(), testRoute),
    APPLICABILITY_STATES.UNKNOWN,
  );

  assert.equal(
    evaluateApplicability(condition, profile('SELF'), testRoute),
    APPLICABILITY_STATES.TRUE,
  );

  assert.equal(
    evaluateApplicability(condition, profile('LEGAL_ENTITY'), testRoute),
    APPLICABILITY_STATES.FALSE,
  );

  assert.equal(
    evaluateApplicability(condition, profile('CORRUPT_VALUE'), testRoute),
    APPLICABILITY_STATES.UNKNOWN,
  );
});

test('requirement FALSE is NOT_APPLICABLE, UNKNOWN is CONDITION, TRUE evaluates normally', () => {
  const gatedRequirement = nonFinancialRequirement({
    applies_if: {
      question_id: 'support_type',
      operator: 'EQUALS',
      values: ['LEGAL_ENTITY'],
    },
  });

  const testRoute = route([gatedRequirement]);

  const falseResult = evaluateRoute(testRoute, profile('SELF'), context, 'ES');
  assert.equal(falseResult.routeStatus, 'SUITABLE');
  assert.equal(falseResult.requirementResults[0].state, 'NOT_APPLICABLE');
  assert.equal(falseResult.requirementResults[0].effect, 'NONE');
  assert.deepEqual(falseResult.blockers, []);
  assert.deepEqual(falseResult.conditions, []);

  const unknownResult = evaluateRoute(testRoute, profile(), context, 'ES');
  assert.equal(unknownResult.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(unknownResult.requirementResults[0].state, 'UNKNOWN');
  assert.equal(unknownResult.requirementResults[0].effect, 'CONDITION');
  assert.deepEqual(unknownResult.blockers, []);
  assert.deepEqual(unknownResult.conditions, ['Уточнить основание.']);

  const trueResult = evaluateRoute(testRoute, profile('LEGAL_ENTITY'), context, 'ES');
  assert.equal(trueResult.routeStatus, 'UNSUITABLE');
  assert.equal(trueResult.requirementResults[0].state, 'FAIL');
  assert.equal(trueResult.requirementResults[0].effect, 'BLOCKER');
});

test('unknown financial gate cannot PASS even when the underlying amount would pass', () => {
  const requirement = financialRequirement([
    alternative({
      amount: 1000,
      applies_if: condition,
    }),
  ]);

  const result = evaluateFinancialRequirement(
    requirement,
    profile(),
    context,
    'ES',
    route([requirement]),
  );

  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.alternatives[0].state, 'UNKNOWN');
  assert.equal(
    result.alternatives[0].applicability,
    APPLICABILITY_STATES.UNKNOWN,
  );
});

test('confirmed OR PASS outranks an unknown saving branch; otherwise unknown can save a failed branch', () => {
  const requirement = financialRequirement([
    alternative({ amount: 1000 }),
    alternative({ amount: 500, applies_if: condition }),
  ]);

  const testRoute = route([requirement]);

  const confirmedPass = evaluateFinancialRequirement(
    requirement,
    profile(),
    context,
    'ES',
    testRoute,
  );
  assert.equal(confirmedPass.state, 'PASS');

  const failedBaseline = financialRequirement([
    alternative({ amount: 3000 }),
    alternative({ amount: 1000, applies_if: condition }),
  ]);

  const unknownSavingPath = evaluateFinancialRequirement(
    failedBaseline,
    profile(),
    context,
    'ES',
    route([failedBaseline]),
  );

  assert.equal(unknownSavingPath.state, 'UNKNOWN');

  const falseSavingPath = evaluateFinancialRequirement(
    failedBaseline,
    profile('LEGAL_ENTITY'),
    context,
    'ES',
    route([failedBaseline]),
  );

  assert.equal(falseSavingPath.state, 'FAIL');
  assert.equal(falseSavingPath.alternatives[1].state, 'NOT_APPLICABLE');
});

test('all gated financial alternatives FALSE is a developer contract error', () => {
  const requirement = financialRequirement([
    alternative({ applies_if: condition }),
  ]);

  assert.throws(
    () =>
      evaluateFinancialRequirement(
        requirement,
        profile('LEGAL_ENTITY'),
        context,
        'ES',
        route([requirement]),
      ),
    Rp4EvaluationUnsupportedError,
  );
});

test('alternative gate on AND/shortfall models is rejected by runtime too', () => {
  for (const model of ['INCOME_AND_SAVINGS', 'INCOME_WITH_SAVINGS_SHORTFALL']) {
    const requirement = financialRequirement(
      [alternative({ applies_if: condition })],
      model,
    );

    if (model === 'INCOME_WITH_SAVINGS_SHORTFALL') {
      requirement.financial.shortfall_coverage = {
        calculation: 'MONTHLY_SHORTFALL_X_MONTHS',
        coverage_months: 6,
        condition_ru: 'Покрыть дефицит накоплениями.',
      };
    }

    assert.throws(
      () =>
        evaluateFinancialRequirement(
          requirement,
          profile('SELF'),
          context,
          'ES',
          route([requirement]),
        ),
      Rp4EvaluationUnsupportedError,
      model,
    );
  }
});

const validatorPath = fileURLToPath(
  new URL('../data/validate-v4.0.py', import.meta.url),
);

const spain = JSON.parse(
  await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'),
);

async function runValidator(pkg) {
  const dir = await mkdtemp(join(tmpdir(), 'countrymatcher-applies-if-'));
  const target = join(dir, 'ES-research-v4.0.json');

  try {
    await writeFile(target, JSON.stringify(pkg), 'utf8');
    return spawnSync('python3', [validatorPath, target], {
      encoding: 'utf8',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function packageWithValidGate() {
  const pkg = structuredClone(spain);
  const targetRoute = pkg.routes.find(({ route_id }) => route_id === 'ES_NLV');
  assert.ok(targetRoute, 'ES_NLV fixture route');

  const targetRequirement = targetRoute.requirements.find(
    (item) =>
      item.type === 'FINANCIAL'
      && item.evaluation_mode === 'ENGINE'
      && ['INCOME_ONLY', 'SAVINGS_ONLY', 'INVESTMENT_CAPITAL', 'SPONSOR_OR_SCHOLARSHIP', 'INCOME_OR_SAVINGS']
        .includes(item.financial?.model),
  );

  assert.ok(targetRequirement, 'ES_NLV active OR-style financial requirement');

  targetRoute.route_specific_questions = [structuredClone(question)];
  targetRequirement.financial.alternatives[0].applies_if = structuredClone(condition);

  return { pkg, targetRoute, targetRequirement };
}

test('integrity validator resolves applies_if question IDs and option values', async () => {
  const valid = packageWithValidGate();
  const validResult = await runValidator(valid.pkg);

  assert.equal(
    validResult.status,
    0,
    `${validResult.stdout}\n${validResult.stderr}`,
  );

  const badQuestion = packageWithValidGate();
  badQuestion.targetRequirement.financial.alternatives[0].applies_if.question_id =
    'missing_question';

  const badQuestionResult = await runValidator(badQuestion.pkg);
  assert.equal(badQuestionResult.status, 1);
  assert.match(
    `${badQuestionResult.stdout}\n${badQuestionResult.stderr}`,
    /unknown route-specific question missing_question/,
  );

  const badValue = packageWithValidGate();
  badValue.targetRequirement.financial.alternatives[0].applies_if.values =
    ['NOT_AN_OPTION'];

  const badValueResult = await runValidator(badValue.pkg);
  assert.equal(badValueResult.status, 1);
  assert.match(
    `${badValueResult.stdout}\n${badValueResult.stderr}`,
    /NOT_AN_OPTION is not an option of support_type/,
  );
});


test('runtime rejects alternative-level applies_if outside FINANCIAL ENGINE', () => {
  const requirement = financialRequirement([
    alternative({
      asked_in_questionnaire: false,
      applies_if: condition,
    }),
  ]);

  requirement.evaluation_mode = 'UNASKED_CONDITION';
  requirement.unmet_effect = 'BECOMES_CONDITION';

  assert.throws(
    () => evaluateRoute(route([requirement]), profile(), context, 'ES'),
    Rp4EvaluationUnsupportedError,
  );
});

test('integrity validator requires exhaustive option coverage when every financial alternative is gated', async () => {
  const complete = packageWithValidGate();

  complete.targetRequirement.financial.alternatives[1].applies_if = {
    question_id: 'support_type',
    operator: 'EQUALS',
    values: ['LEGAL_ENTITY'],
  };

  const completeResult = await runValidator(complete.pkg);

  assert.equal(
    completeResult.status,
    0,
    `${completeResult.stdout}\n${completeResult.stderr}`,
  );

  const incomplete = packageWithValidGate();

  incomplete.targetRequirement.financial.alternatives[1].applies_if = {
    question_id: 'support_type',
    operator: 'EQUALS',
    values: ['SELF'],
  };

  const incompleteResult = await runValidator(incomplete.pkg);

  assert.equal(incompleteResult.status, 1);

  assert.match(
    `${incompleteResult.stdout}\n${incompleteResult.stderr}`,
    /all-gated alternatives must cover every option of support_type; missing LEGAL_ENTITY/,
  );
});

const routeSpecificProfile = (routeId, answer) => {
  const value = profile();

  value.route_specific_answers = {
    [routeId]: {
      support_type: answer,
    },
  };

  return value;
};

test('presentation omits FALSE-gated financial alternatives', () => {
  const pkg = structuredClone(spain);
  const nlv = pkg.routes.find(({ route_id }) => route_id === 'ES_NLV');

  assert.ok(nlv);

  nlv.route_specific_questions = [structuredClone(question)];

  const financial = nlv.requirements.find(
    ({ requirement_id }) => requirement_id === 'ES_NLV_FIN',
  );

  assert.ok(financial);

  financial.financial.alternatives[0].applies_if = {
    question_id: 'support_type',
    operator: 'EQUALS',
    values: ['SELF'],
  };

  const result = calculateActiveCountry(
    routeSpecificProfile('ES_NLV', 'LEGAL_ENTITY'),
    pkg,
    context,
  );

  const presented = result.routes.find(({ routeId }) => routeId === 'ES_NLV');

  assert.ok(presented);

  const presentedFinancial = presented.financialRequirements.find(
    ({ requirementId }) => requirementId === 'ES_NLV_FIN',
  );

  assert.ok(presentedFinancial);

  assert.deepEqual(
    presentedFinancial.summary.alternatives.map(({ kind }) => kind),
    ['SAVINGS'],
  );

  assert.deepEqual(
    presented.financialSummary.alternatives.map(({ kind }) => kind),
    ['SAVINGS'],
  );
});

test('presentation omits an entire FALSE-gated financial requirement', () => {
  const pkg = structuredClone(spain);
  const nlv = pkg.routes.find(({ route_id }) => route_id === 'ES_NLV');

  assert.ok(nlv);

  nlv.route_specific_questions = [structuredClone(question)];

  const financial = nlv.requirements.find(
    ({ requirement_id }) => requirement_id === 'ES_NLV_FIN',
  );

  assert.ok(financial);

  financial.applies_if = {
    question_id: 'support_type',
    operator: 'EQUALS',
    values: ['SELF'],
  };

  const result = calculateActiveCountry(
    routeSpecificProfile('ES_NLV', 'LEGAL_ENTITY'),
    pkg,
    context,
  );

  const presented = result.routes.find(({ routeId }) => routeId === 'ES_NLV');

  assert.ok(presented);

  assert.equal(
    presented.financialRequirements.some(
      ({ requirementId }) => requirementId === 'ES_NLV_FIN',
    ),
    false,
  );

  assert.equal(presented.financialSummary, null);
});
