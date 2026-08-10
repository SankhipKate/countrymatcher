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
