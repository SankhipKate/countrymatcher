import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const dataDir = new URL('../data/', import.meta.url);
const schema = JSON.parse(await readFile(new URL('research-package-v3.0.schema.json', dataDir), 'utf8'));
const argentina = JSON.parse(await readFile(new URL('argentina-research-v3.0.json', dataDir), 'utf8'));
const paraguay = JSON.parse(await readFile(new URL('paraguay-research-v3.0.json', dataDir), 'utf8'));
const portugal = JSON.parse(await readFile(new URL('portugal-research-v3.0.json', dataDir), 'utf8'));
const brazil = JSON.parse(await readFile(new URL('brazil-research-v3.0.json', dataDir), 'utf8'));
const mexico = JSON.parse(await readFile(new URL('mexico-research-v3.0.json', dataDir), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

test('every publishable v3 route has structured requirements', () => {
  for (const country of [argentina, brazil, mexico, paraguay, portugal]) {
    for (const route of country.routes.filter(({ publishable }) => publishable)) {
      assert.ok(Array.isArray(route.requirements) && route.requirements.length > 0, route.route_id);
    }
  }
});

const collectSourceIds = (value, result = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceIds(item, result);
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value.source_ids)) result.push(...value.source_ids);
  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'source_ids') collectSourceIds(nested, result);
  }
  return result;
};

test('Argentina satisfies the strict Research Package 3.0 schema', () => {
  assert.equal(validate(argentina), true, ajv.errorsText(validate.errors, { separator: '\n' }));
});

test('Research Package 3.0 exposes exactly three public route statuses', () => {
  assert.deepEqual(argentina.status_policy.statuses, [
    'SUITABLE',
    'SUITABLE_WITH_CONDITIONS',
    'UNSUITABLE',
  ]);
});

test('Argentina has six publishable routes and one hidden investor route', () => {
  assert.equal(argentina.routes.length, 7);
  assert.equal(argentina.routes.filter(({ publishable }) => publishable).length, 6);
  const hidden = argentina.routes.filter(({ publishable }) => !publishable);
  assert.deepEqual(hidden.map(({ route_id }) => route_id), ['AR_INVESTOR_HIDDEN']);
  assert.equal(argentina.routes.some(({ route_id }) => route_id === 'AR_FAMILY'), false);
  assert.equal(argentina.routes.some(({ route_id }) => route_id === 'AR_MERCOSUR_SECOND_NATIONALITY'), false);
  assert.equal(argentina.completeness.public_routes_ready, 6);
  assert.equal(argentina.completeness.hidden_routes, 1);
  assert.equal(argentina.completeness.overall_percent, 92);
});

test('all referenced source ids exist in the Argentina package', () => {
  const existing = new Set(argentina.sources.map(({ source_id }) => source_id));
  const referenced = collectSourceIds({
    routes: argentina.routes,
    cities: argentina.cities,
    schools: argentina.schools,
    pets: argentina.pets,
    lgbt: argentina.lgbt,
  });
  assert.deepEqual([...new Set(referenced)].filter((sourceId) => !existing.has(sourceId)), []);
});

test('Argentina package keeps unknown thresholds explicit instead of inventing values', () => {
  const nomad = argentina.routes.find(({ route_id }) => route_id === 'AR_NOMAD');
  const investor = argentina.routes.find(({ route_id }) => route_id === 'AR_INVESTOR_HIDDEN');
  assert.equal(nomad.income_threshold_amount, null);
  assert.equal(nomad.income_threshold_currency, null);
  assert.equal(investor.publishable, false);
});


test('pending changes contain only future changes and can be empty', () => {
  assert.equal('recent_change_ru' in argentina.lgbt, false);
  assert.deepEqual(argentina.lgbt.pending_changes, []);
  assert.equal(validate(argentina), true, ajv.errorsText(validate.errors, { separator: '\n' }));
});


test('Paraguay satisfies the strict Research Package 3.0 schema', () => {
  assert.equal(validate(paraguay), true, ajv.errorsText(validate.errors, { separator: '\n' }));
});

test('Paraguay exposes two publishable routes and keeps Investor Pass hidden', () => {
  assert.deepEqual(paraguay.routes.filter(({ publishable }) => publishable).map(({ route_id }) => route_id), [
    'PY_TEMPORARY',
    'PY_PERMANENT_AFTER_TEMP',
  ]);
  assert.deepEqual(paraguay.routes.filter(({ publishable }) => !publishable).map(({ route_id }) => route_id), ['PY_INVESTOR_PASS']);
  assert.equal(paraguay.completeness.public_routes_ready, 2);
  assert.equal(paraguay.completeness.hidden_routes, 1);
});

test('all referenced source ids exist in the Paraguay package', () => {
  const existing = new Set(paraguay.sources.map(({ source_id }) => source_id));
  const referenced = collectSourceIds({
    routes: paraguay.routes,
    cities: paraguay.cities,
    schools: paraguay.schools,
    pets: paraguay.pets,
    lgbt: paraguay.lgbt,
  });
  assert.deepEqual([...new Set(referenced)].filter((sourceId) => !existing.has(sourceId)), []);
});

test('Paraguay keeps unknown residence-income thresholds explicit', () => {
  const temporary = paraguay.routes.find(({ route_id }) => route_id === 'PY_TEMPORARY');
  const permanent = paraguay.routes.find(({ route_id }) => route_id === 'PY_PERMANENT_AFTER_TEMP');
  assert.equal(temporary.income_threshold_amount, null);
  assert.equal(permanent.income_threshold_amount, null);
  assert.equal(permanent.income_threshold_type, 'DOCUMENTARY_CATEGORY_NO_UNIVERSAL_AMOUNT');
});

test('Portugal satisfies the strict Research Package 3.0 schema', () => {
  assert.equal(validate(portugal), true, ajv.errorsText(validate.errors, { separator: '\n' }));
});

test('Portugal exposes four publishable routes and keeps combined D3 hidden', () => {
  assert.deepEqual(portugal.routes.filter(({ publishable }) => publishable).map(({ route_id }) => route_id), [
    'PT_D8_REMOTE',
    'PT_D7_OWN_INCOME',
    'PT_D2_INDEPENDENT',
    'PT_D1_EMPLOYMENT',
  ]);
  assert.deepEqual(portugal.routes.filter(({ publishable }) => !publishable).map(({ route_id }) => route_id), [
    'PT_D3_HIGHLY_QUALIFIED',
  ]);
  assert.equal(portugal.completeness.public_routes_ready, 4);
  assert.equal(portugal.completeness.hidden_routes, 1);
});

test('all referenced source ids exist in the Portugal package', () => {
  const existing = new Set(portugal.sources.map(({ source_id }) => source_id));
  const referenced = collectSourceIds({
    routes: portugal.routes,
    cities: portugal.cities,
    schools: portugal.schools,
    pets: portugal.pets,
    lgbt: portugal.lgbt,
  });
  assert.deepEqual([...new Set(referenced)].filter((sourceId) => !existing.has(sourceId)), []);
});
