import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const dataDir = new URL('../data/', import.meta.url);
const schema = JSON.parse(await readFile(new URL('research-package-v3.0.schema.json', dataDir), 'utf8'));
const mexico = JSON.parse(await readFile(new URL('mexico-research-v3.0.json', dataDir), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

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

test('Mexico satisfies the current strict Research Package 3.0 schema', () => {
  assert.equal(validate(mexico), true, ajv.errorsText(validate.errors, { separator: '\n' }));
});

test('Mexico exposes two public routes and keeps six researched routes hidden', () => {
  assert.deepEqual(mexico.routes.filter(({ publishable }) => publishable).map(({ route_id }) => route_id), [
    'MX_TEMP_ECONOMIC_SOLVENCY',
    'MX_TEMP_LOCAL_JOB_OFFER',
  ]);
  assert.equal(mexico.routes.filter(({ publishable }) => !publishable).length, 6);
  assert.equal(mexico.completeness.public_routes_ready, 2);
  assert.equal(mexico.completeness.hidden_routes, 6);
  assert.equal(mexico.completeness.overall_percent, 96);
  assert.deepEqual(mexico.completeness.publication_blockers, []);
});

test('Mexico keeps official income and savings thresholds explicit', () => {
  const route = mexico.routes.find(({ route_id }) => route_id === 'MX_TEMP_ECONOMIC_SOLVENCY');
  assert.equal(route.income_threshold_amount, 79770.8);
  assert.equal(route.income_threshold_currency, 'MXN');
  assert.match(route.income_formula, /1 344 372,60 MXN/);
  assert.match(route.income_threshold_type, /6M_OR_AVERAGE_BALANCE_12M/);
});

test('all source ids referenced by Mexico exist', () => {
  const existing = new Set(mexico.sources.map(({ source_id }) => source_id));
  const referenced = collectSourceIds({
    routes: mexico.routes,
    cities: mexico.cities,
    schools: mexico.schools,
    pets: mexico.pets,
    lgbt: mexico.lgbt,
  });
  assert.deepEqual([...new Set(referenced)].filter((sourceId) => !existing.has(sourceId)), []);
});

test('runtime and backlog Mexico packages are byte-for-byte identical', async () => {
  const [runtime, backlog] = await Promise.all([
    readFile(new URL('../data/mexico-research-v3.0.json', import.meta.url)),
    readFile(new URL('../research-backlog/mexico-v3.0/mexico-research-v3.0.json', import.meta.url)),
  ]);
  assert.equal(runtime.equals(backlog), true);
});
