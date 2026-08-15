import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  ACTIVE_ENGINE_FINANCIAL_CAPABILITIES,
  evaluateRoute,
} from '../js/engine/rp4-engine.js';

const schema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
const spain = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));
const validatorSource = await readFile(new URL('../data/validate-v4.0.py', import.meta.url), 'utf8');
const context = { fx: { base_currency: 'USD', rates: { USD: 1, EUR: 0.9 }, as_of: '2026-08-15', source: 'test' } };
const profile = {
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  family: { adults_count: 1, adult_ages: [35], partner_included: false, relationship_type: null, children: [], school_needed: false },
  income: {
    primary: {
      owner: 'APPLICANT', type: 'REMOTE_EMPLOYMENT', source_geography: 'SINGLE_COUNTRY', country_id: 'US',
      monthly_total: { amount: 5000, currency: 'USD' }, monthly_provable: { amount: 5000, currency: 'USD' },
    },
    additional_sources: [], partner: { has_income: false, sources: [] },
    savings: { amount: 50000, currency: 'USD' },
  },
  investment_capital: { amount: 50000, currency: 'USD' },
  goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
};

const alternative = (kind = 'INCOME', comparison = 'AT_LEAST') => ({
  kind, asked_in_questionnaire: true,
  amount: comparison === 'NO_FIXED_THRESHOLD' ? null : 1000,
  currency: comparison === 'NO_FIXED_THRESHOLD' ? null : 'USD',
  period: kind === 'CAPITAL' || kind === 'SAVINGS' ? 'ONE_TIME' : 'MONTHLY',
  comparison, history_months: null,
  allowed_income_types: kind === 'INCOME' ? ['REMOTE_EMPLOYMENT'] : null,
  source_geography: kind === 'INCOME' ? 'ANY' : 'NOT_APPLICABLE',
  family_formula_ru: null, source_ids: ['SRC'], confidence: 'HIGH',
  ...(kind === 'INCOME' ? { income_owners: ['APPLICANT'] } : {}),
});
const requirement = (model, alternatives, extra = {}) => ({
  requirement_id: 'CAPABILITY_FIN', type: 'FINANCIAL', subject: 'APPLICANT', timing: 'NOW',
  evaluation_mode: 'ENGINE', unmet_effect: 'BLOCKS', condition_ru: 'Capability test.',
  profile_path: 'INCOME_APPLICANT', met_ru: 'Pass.', unmet_ru: 'Fail.', source_ids: ['SRC'], confidence: 'HIGH',
  financial: { model, alternatives, ...(model === 'INCOME_WITH_SAVINGS_SHORTFALL' ? { shortfall_coverage: { coverage_months: 6 } } : {}) },
  ...extra,
});
const runtimeRoute = (financialRequirement) => ({
  route_id: 'CAPABILITY_ROUTE', name_ru: 'Capability route', publishable: true, requirements: [financialRequirement],
});
const assertRuntimeSupported = (financialRequirement) => assert.doesNotThrow(() =>
  evaluateRoute(runtimeRoute(financialRequirement), profile, context, 'ES'));
const assertRuntimeUnsupported = (financialRequirement) => assert.throws(() =>
  evaluateRoute(runtimeRoute(financialRequirement), profile, context, 'ES'),
  (error) => error?.code === 'RP4_EVALUATION_UNSUPPORTED');

const integrityErrors = (pkg) => {
  const script = [
    'import importlib.util,json,sys',
    "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
    'module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)',
    "print('\\n'.join(module.validate_integrity(json.load(sys.stdin))))",
  ].join(';');
  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url), input: JSON.stringify(pkg), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const dnvRequirement = (pkg) => pkg.routes.find(({ route_id }) => route_id === 'ES_DNV')
  .requirements.find(({ type, evaluation_mode }) => type === 'FINANCIAL' && evaluation_mode === 'ENGINE');

test('actual engine exports an immutable JSON capability contract', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ACTIVE_ENGINE_FINANCIAL_CAPABILITIES)), {
    models: ['INCOME_ONLY', 'SAVINGS_ONLY', 'INCOME_OR_SAVINGS', 'INCOME_AND_SAVINGS', 'INCOME_WITH_SAVINGS_SHORTFALL', 'INVESTMENT_CAPITAL', 'SPONSOR_OR_SCHOLARSHIP'],
    alternativeKinds: ['INCOME', 'SAVINGS', 'CAPITAL'],
    comparisons: ['AT_LEAST', 'MORE_THAN', 'EXACT', 'NO_FIXED_THRESHOLD'],
  });
  assert.equal(Object.isFrozen(ACTIVE_ENGINE_FINANCIAL_CAPABILITIES), true);
  for (const values of Object.values(ACTIVE_ENGINE_FINANCIAL_CAPABILITIES)) assert.equal(Object.isFrozen(values), true);
});

test('every declared model, kind, and comparison has a non-unsupported active ENGINE path', () => {
  const modelAlternatives = {
    INCOME_ONLY: [alternative('INCOME')],
    SAVINGS_ONLY: [alternative('SAVINGS')],
    INCOME_OR_SAVINGS: [alternative('INCOME'), alternative('SAVINGS')],
    INCOME_AND_SAVINGS: [alternative('INCOME'), alternative('SAVINGS')],
    INCOME_WITH_SAVINGS_SHORTFALL: [alternative('INCOME')],
    INVESTMENT_CAPITAL: [alternative('CAPITAL')],
    SPONSOR_OR_SCHOLARSHIP: [alternative('INCOME')],
  };
  for (const model of ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.models) {
    assertRuntimeSupported(requirement(model, modelAlternatives[model]));
  }
  const kindModels = { INCOME: 'INCOME_ONLY', SAVINGS: 'SAVINGS_ONLY', CAPITAL: 'INVESTMENT_CAPITAL' };
  for (const kind of ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.alternativeKinds) {
    assertRuntimeSupported(requirement(kindModels[kind], [alternative(kind)]));
  }
  for (const comparison of ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.comparisons) {
    assertRuntimeSupported(requirement('INCOME_ONLY', [alternative('INCOME', comparison)]));
  }
});

test('schema financial enum values outside the capability contract stay unsupported in active ENGINE', () => {
  const modelEnum = schema.$defs.financialRequirement.properties.model.enum;
  const alternativeProperties = schema.$defs.financialAlternative.properties;
  for (const model of modelEnum.filter((value) => !ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.models.includes(value))) {
    assertRuntimeUnsupported(requirement(model, [alternative('INCOME')]));
  }
  for (const kind of alternativeProperties.kind.enum.filter((value) => !ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.alternativeKinds.includes(value))) {
    assertRuntimeUnsupported(requirement('SPONSOR_OR_SCHOLARSHIP', [alternative(kind)]));
  }
  for (const comparison of alternativeProperties.comparison.enum.filter((value) => !ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.comparisons.includes(value))) {
    assertRuntimeUnsupported(requirement('INCOME_ONLY', [alternative('INCOME', comparison)]));
  }
  assertRuntimeUnsupported(requirement('FUTURE_MODEL', [alternative('INCOME')]));
});

test('Python validator imports the engine contract without a duplicate capability list', () => {
  assert.match(validatorSource, /engine\.ACTIVE_ENGINE_FINANCIAL_CAPABILITIES/);
  assert.match(validatorSource, /subprocess\.run/);
  for (const duplicatedValue of ['INCOME_ONLY', 'SAVINGS_ONLY', 'SPONSOR_OR_SCHOLARSHIP', 'OFFICIAL_FORMULA']) {
    assert.equal(validatorSource.includes(duplicatedValue), false, duplicatedValue);
  }
});

test('validator and runtime agree for supported and unsupported active ENGINE semantics', () => {
  assert.equal(integrityErrors(spain), '');
  assertRuntimeSupported(structuredClone(dnvRequirement(spain)));

  for (const [semantic, value] of [['comparison', 'OFFICIAL_FORMULA'], ['kind', 'SPONSOR'], ['kind', 'SCHOLARSHIP']]) {
    const pkg = structuredClone(spain);
    const financialRequirement = dnvRequirement(pkg);
    financialRequirement.financial.alternatives[0][semantic] = value;
    assert.match(integrityErrors(pkg), new RegExp(`ES_DNV.*${financialRequirement.requirement_id}.*alternatives\\[0\\].*${semantic}.*${value}`));
    assertRuntimeUnsupported(financialRequirement);
  }
  const unsupportedModel = structuredClone(spain);
  const unsupportedModelRequirement = dnvRequirement(unsupportedModel);
  unsupportedModelRequirement.financial.model = 'FUTURE_MODEL';
  assert.match(integrityErrors(unsupportedModel), /ES_DNV.*ES_DNV_FIN.*financial\.model.*FUTURE_MODEL/);
  assertRuntimeUnsupported(unsupportedModelRequirement);
});

test('OFFICIAL_FORMULA and Spain Study sponsor semantics remain valid outside active ENGINE', () => {
  assert.ok(schema.$defs.financialAlternative.properties.comparison.enum.includes('OFFICIAL_FORMULA'));
  const unaskedFormula = structuredClone(spain);
  const formulaRequirement = dnvRequirement(unaskedFormula);
  formulaRequirement.evaluation_mode = 'UNASKED_CONDITION';
  formulaRequirement.unmet_effect = 'BECOMES_CONDITION';
  formulaRequirement.financial.alternatives[0].comparison = 'OFFICIAL_FORMULA';
  formulaRequirement.financial.alternatives[0].asked_in_questionnaire = false;
  assert.equal(integrityErrors(unaskedFormula), '');

  const study = spain.routes.find(({ route_id }) => route_id === 'ES_STUDY');
  const studyFinancial = study.requirements.find(({ type }) => type === 'FINANCIAL');
  assert.equal(studyFinancial.evaluation_mode, 'UNASKED_CONDITION');
  assert.ok(studyFinancial.financial.alternatives.some(({ kind }) => kind === 'SPONSOR'));
  assert.ok(studyFinancial.financial.alternatives.some(({ kind }) => kind === 'SCHOLARSHIP'));
  assert.equal(integrityErrors(spain), '');
});
