import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
const spain = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);
const validateSchools = ajv.getSchema(`${schema.$id}#/$defs/schools`);

const legacySchools = structuredClone(spain.schools);
const newSchools = {
  public_school_rules: structuredClone(spain.schools.public_school_rules),
  international_school_status: 'AVAILABLE',
  international_schools: [],
  international_school_cities: [{ city_name_ru: 'Новый школьный город', source_ids: ['ES_ICS'] }],
};
const integrityErrors = (pkg) => {
  const script = [
    "import importlib.util,json,sys",
    "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
    "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
    "print('\\n'.join(module.validate_integrity(json.load(sys.stdin))))",
  ].join(';');
  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url), input: JSON.stringify(pkg), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

test('schools schema accepts AVAILABLE with either legacy schools or new school cities', () => {
  assert.equal(validateSchools(legacySchools), true, JSON.stringify(validateSchools.errors));
  assert.equal(validateSchools(newSchools), true, JSON.stringify(validateSchools.errors));
});

test('schools schema rejects AVAILABLE without evidence and school cities without sources', () => {
  const noEvidence = structuredClone(newSchools);
  noEvidence.international_school_cities = [];
  assert.equal(validateSchools(noEvidence), false);

  const emptySources = structuredClone(newSchools);
  emptySources.international_school_cities[0].source_ids = [];
  assert.equal(validateSchools(emptySources), false);
});

test('integrity rejects duplicate school-city names without linking them to main cities', () => {
  const duplicate = structuredClone(spain);
  duplicate.schools.international_school_cities = [
    { city_name_ru: 'Отдельный школьный город', source_ids: ['ES_ICS'] },
    { city_name_ru: 'Отдельный школьный город', source_ids: ['ES_STPATRICK'] },
  ];
  assert.match(integrityErrors(duplicate), /duplicate city_name_ru Отдельный школьный город/);

  const independent = structuredClone(spain);
  independent.schools.international_school_cities = [
    { city_name_ru: 'Город вне основной городской модели', source_ids: ['ES_ICS'] },
  ];
  assert.equal(integrityErrors(independent), '');
});

test('legacy international school city IDs must still resolve to main cities', () => {
  const invalid = structuredClone(spain);
  invalid.schools.international_schools[0].city_id = 'MISSING_CITY';
  assert.match(integrityErrors(invalid), /international_schools\[0\]\.city_id: unknown city_id MISSING_CITY/);
});
