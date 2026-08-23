import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);
const validate = ajv.getSchema(`${schema.$id}#/$defs/financialAlternative`);

const figure = {
  amount: 1500, currency: 'USD', period: 'MONTHLY', family_context_ru: 'Один заявитель',
  evidence: [{ source_id: 'SRC_1', source_date: '2026-08-10', evidence_type: 'PRACTITIONER_GUIDANCE' }],
  note_ru: 'Опубликованный ориентир практикующего специалиста.',
};
const alternative = {
  kind: 'INCOME', asked_in_questionnaire: true, amount: null, currency: null, period: 'MONTHLY',
  comparison: 'NO_FIXED_THRESHOLD', history_months: null, allowed_income_types: ['REMOTE_EMPLOYMENT'],
  source_geography: 'FOREIGN', family_formula_ru: null, source_ids: ['SRC_1'], confidence: 'HIGH',
  income_owners: ['APPLICANT'], practical_financial_guidance: {
    evaluation_mode: 'DISPLAY_ONLY', status: 'FOUND', summary_ru: 'Практический ориентир.',
    figures: [figure], disclaimer_ru: 'Решение принимается индивидуально.',
  },
};

test('RP4 schema accepts FOUND practical financial single and range figures', () => {
  assert.equal(validate(alternative), true, JSON.stringify(validate.errors));
  const independentlyConfirmed = structuredClone(alternative);
  independentlyConfirmed.practical_financial_guidance.figures[0].evidence.push({
    source_id: 'SRC_2', source_date: '2025-08-04', evidence_type: 'REPORTED_PRACTICE',
  });
  assert.equal(validate(independentlyConfirmed), true, JSON.stringify(validate.errors));
  const ranged = structuredClone(alternative);
  ranged.practical_financial_guidance.figures = [{ ...figure, amount: undefined, amount_min: 1200, amount_max: 1800 }];
  assert.equal(validate(ranged), true, JSON.stringify(validate.errors));
});

test('RP4 schema enforces FOUND/NOT_FOUND figure cardinality', () => {
  const foundEmpty = structuredClone(alternative);
  foundEmpty.practical_financial_guidance.figures = [];
  assert.equal(validate(foundEmpty), false);
  const notFound = structuredClone(alternative);
  notFound.practical_financial_guidance = { evaluation_mode: 'DISPLAY_ONLY', status: 'NOT_FOUND', summary_ru: 'Поиск завершён.', figures: [], disclaimer_ru: 'Число не найдено.' };
  assert.equal(validate(notFound), true, JSON.stringify(validate.errors));
  notFound.practical_financial_guidance.figures = [figure];
  assert.equal(validate(notFound), false);
});

test('RP4 schema rejects malformed practical figures and guidance on an official threshold', () => {
  for (const mutate of [
    (x) => { delete x.practical_financial_guidance.figures[0].evidence; },
    (x) => { x.practical_financial_guidance.figures[0].evidence = []; },
    (x) => { delete x.practical_financial_guidance.figures[0].evidence[0].source_id; },
    (x) => { delete x.practical_financial_guidance.figures[0].evidence[0].source_date; },
    (x) => { delete x.practical_financial_guidance.figures[0].evidence[0].evidence_type; },
    (x) => { x.practical_financial_guidance.figures[0].evidence[0].evidence_type = 'BLOG'; },
    (x) => { x.practical_financial_guidance.figures[0].source_ids = ['SRC_1']; },
    (x) => { x.practical_financial_guidance.figures[0].source_date = '2026-08-10'; },
    (x) => { x.practical_financial_guidance.figures[0].evidence_type = 'REPORTED_PRACTICE'; },
    (x) => { x.practical_financial_guidance.figures[0].currency = 'usd'; },
    (x) => { x.practical_financial_guidance.figures[0].amount = 0; },
    (x) => { x.practical_financial_guidance.figures[0].amount = -1; },
    (x) => { x.practical_financial_guidance.figures[0].amount_min = 100; },
    (x) => { delete x.practical_financial_guidance.figures[0].amount; x.practical_financial_guidance.figures[0].amount_min = 0; x.practical_financial_guidance.figures[0].amount_max = 100; },
    (x) => { x.comparison = 'AT_LEAST'; x.amount = 1500; x.currency = 'USD'; },
    (x) => { x.amount = 1500; },
    (x) => { x.currency = 'USD'; },
  ]) {
    const invalid = structuredClone(alternative);
    mutate(invalid);
    assert.equal(validate(invalid), false);
  }
});

test('practical screening is separate from legal thresholds and requires FOUND practical guidance', () => {
  const screened = structuredClone(alternative);
  screened.practical_screening_threshold = {
    comparison: 'AT_LEAST', currency: 'USD', period: 'MONTHLY',
    family_formula: { base_applicant_amount: 1500, additional_adult_amount: 500, child_amount: 500 },
    source_ids: ['SRC_1'],
  };
  assert.equal(validate(screened), true, JSON.stringify(validate.errors));
  const flatScreened = structuredClone(screened);
  flatScreened.practical_screening_threshold = { comparison: 'AT_LEAST', currency: 'USD', period: 'MONTHLY', amount: 1500, source_ids: ['SRC_1'] };
  assert.equal(validate(flatScreened), true, JSON.stringify(validate.errors));
  for (const mutate of [
    (x) => { x.practical_screening_threshold.comparison = 'MORE_THAN'; },
    (x) => { x.practical_screening_threshold.family_formula.child_amount = -1; },
    (x) => { delete x.practical_screening_threshold.family_formula; },
    (x) => { delete x.practical_financial_guidance; },
    (x) => { x.comparison = 'AT_LEAST'; x.amount = 1500; x.currency = 'USD'; },
  ]) {
    const invalid = structuredClone(screened); mutate(invalid);
    assert.equal(validate(invalid), false);
  }
});

test('schema allows practical screening for non-income alternatives without making them legal thresholds', () => {
  for (const [kind, period] of [
    ['SAVINGS', 'ONE_TIME'],
    ['CAPITAL', 'ONE_TIME'],
    ['SPONSOR', 'MONTHLY'],
    ['SCHOLARSHIP', 'ACADEMIC_YEAR'],
  ]) {
    const item = structuredClone(alternative);
    item.kind = kind;
    item.asked_in_questionnaire = false;
    delete item.income_owners;
    item.allowed_income_types = null;
    item.source_geography = 'NOT_APPLICABLE';
    item.period = period;
    item.practical_screening_threshold = {
      comparison: 'AT_LEAST',
      currency: 'USD',
      period,
      amount: 1500,
      source_ids: ['SRC_1'],
    };

    assert.equal(validate(item), true, `${kind}: ${JSON.stringify(validate.errors)}`);
    assert.equal(item.amount, null);
    assert.equal(item.currency, null);
  }
});

test('schema accepts academic-year practical evidence and requires FOUND guidance for screening', () => {
  const academic = structuredClone(alternative);
  academic.practical_financial_guidance.figures[0].period = 'ACADEMIC_YEAR';
  assert.equal(validate(academic), true, JSON.stringify(validate.errors));

  const screened = structuredClone(alternative);
  screened.practical_screening_threshold = {
    comparison: 'AT_LEAST',
    currency: 'USD',
    period: 'MONTHLY',
    amount: 1500,
    source_ids: ['SRC_1'],
  };
  screened.practical_financial_guidance.status = 'NOT_FOUND';
  screened.practical_financial_guidance.figures = [];

  assert.equal(validate(screened), false);
});

test('RP4 integrity validator accepts ACADEMIC_YEAR practical evidence', async () => {
  const pkg = JSON.parse(await readFile(new URL('../data/AR-research-v4.0.json', import.meta.url), 'utf8'));
  const item = pkg.routes.find(({ route_id }) => route_id === 'AR_NOMAD').requirements
    .find(({ type }) => type === 'FINANCIAL').financial.alternatives
    .find(({ comparison }) => comparison === 'NO_FIXED_THRESHOLD');

  assert.ok(item.practical_financial_guidance?.figures?.length);
  item.practical_financial_guidance.figures[0].period = 'ACADEMIC_YEAR';

  const script = [
    "import importlib.util,json,sys",
    "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
    "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
    "print('\\n'.join(module.validate_integrity(json.load(sys.stdin))))",
  ].join(';');

  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify(pkg),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('RP4 integrity validator rejects descending ranges and unresolved practical source IDs', async () => {
  const pkg = JSON.parse(await readFile(new URL('../data/AR-research-v4.0.json', import.meta.url), 'utf8'));
  const item = pkg.routes.find(({ route_id }) => route_id === 'AR_NOMAD').requirements
    .find(({ type }) => type === 'FINANCIAL').financial.alternatives
    .find(({ comparison }) => comparison === 'NO_FIXED_THRESHOLD');
  item.practical_financial_guidance = {
    ...alternative.practical_financial_guidance,
    figures: [{
      ...figure, amount: undefined, amount_min: 2000, amount_max: 1500,
      evidence: [
        { source_id: 'MISSING_SOURCE', source_date: '2026-08-10', evidence_type: 'REPORTED_PRACTICE' },
        { source_id: 'MISSING_SOURCE', source_date: '2025-08-04', evidence_type: 'PRACTITIONER_GUIDANCE' },
      ],
    }],
  };
  const script = [
    "import importlib.util,json,sys",
    "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
    "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
    "print('\\n'.join(module.validate_integrity(json.load(sys.stdin))))",
  ].join(';');
  const result = spawnSync('python3', ['-c', script], { cwd: new URL('..', import.meta.url), input: JSON.stringify(pkg), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /amount_max must be >= amount_min/);
  assert.match(result.stdout, /unknown source_id MISSING_SOURCE/);
  assert.match(result.stdout, /duplicate source_id MISSING_SOURCE/);
});

test('RP4 integrity validator rejects unresolved and non-positive practical screening data', async () => {
  const pkg = JSON.parse(await readFile(new URL('../data/UY-research-v4.0.json', import.meta.url), 'utf8'));
  const screening = pkg.routes.find(({ route_id }) => route_id === 'UY_PERMANENT_COMMON').requirements
    .find(({ requirement_id }) => requirement_id === 'UY_PERM_MEANS').financial.alternatives[0].practical_screening_threshold;
  screening.source_ids = ['MISSING_SCREENING_SOURCE'];
  screening.family_formula.child_amount = -1;
  const script = [
    "import importlib.util,json,sys",
    "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
    "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
    "print('\\n'.join(module.validate_integrity(json.load(sys.stdin))))",
  ].join(';');
  const result = spawnSync('python3', ['-c', script], { cwd: new URL('..', import.meta.url), input: JSON.stringify(pkg), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unknown source_id MISSING_SCREENING_SOURCE/);
  assert.match(result.stdout, /child_amount: must be >= 0/);
});
