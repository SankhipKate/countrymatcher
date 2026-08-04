import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const [schema, brazil] = await Promise.all([
  readFile(new URL('../data/research-package-v3.0.schema.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../data/brazil-research-v3.0.json', import.meta.url), 'utf8').then(JSON.parse),
]);

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function collectSourceIds(value, result = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSourceIds(item, result));
    return result;
  }
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value.source_ids)) result.push(...value.source_ids);
  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'source_ids') collectSourceIds(nested, result);
  }
  return result;
}

test('Brazil satisfies the strict Research Package 3.0 schema', () => {
  assert.equal(validate(brazil), true, ajv.errorsText(validate.errors, { separator: '\n' }));
});

test('Brazil exposes eight publishable routes with no hidden routes or research blockers', () => {
  assert.deepEqual(brazil.routes.map(({ route_id }) => route_id), [
    'BR_DIGITAL_NOMAD',
    'BR_RETIREMENT',
    'BR_LOCAL_EMPLOYMENT',
    'BR_BRAZIL_GRADUATE_WORK',
    'BR_STUDY',
    'BR_FAMILY_REUNIFICATION',
    'BR_PRODUCTIVE_INVESTOR',
    'BR_REAL_ESTATE_INVESTOR',
  ]);
  assert.ok(brazil.routes.every(({ publishable, available_to_russian_citizen }) => publishable && available_to_russian_citizen));
  assert.equal(brazil.completeness.overall_percent, 97);
  assert.equal(brazil.completeness.public_routes_ready, 8);
  assert.equal(brazil.completeness.hidden_routes, 0);
  assert.deepEqual(brazil.completeness.publication_blockers, []);
  assert.equal(brazil.completeness.country_ready_status, 'RESEARCH_READY_FOR_RUNTIME');
});

test('Brazil keeps official income and investment thresholds explicit', () => {
  const byId = new Map(brazil.routes.map((route) => [route.route_id, route]));
  assert.equal(byId.get('BR_DIGITAL_NOMAD').income_threshold_amount, 1500);
  assert.match(byId.get('BR_DIGITAL_NOMAD').income_formula, /18 000 USD/);
  assert.equal(byId.get('BR_RETIREMENT').income_threshold_amount, 2000);
  assert.equal(byId.get('BR_PRODUCTIVE_INVESTOR').income_threshold_amount, 500000);
  assert.match(byId.get('BR_PRODUCTIVE_INVESTOR').income_formula, /150 000–500 000 BRL/);
  assert.equal(byId.get('BR_REAL_ESTATE_INVESTOR').income_threshold_amount, 1000000);
  assert.match(byId.get('BR_REAL_ESTATE_INVESTOR').income_formula, /700 000 BRL/);
});

test('all referenced source ids exist in the Brazil package', () => {
  const existing = new Set(brazil.sources.map(({ source_id }) => source_id));
  const referenced = collectSourceIds({
    routes: brazil.routes,
    cities: brazil.cities,
    schools: brazil.schools,
    pets: brazil.pets,
    lgbt: brazil.lgbt,
  });
  assert.deepEqual([...new Set(referenced)].filter((sourceId) => !existing.has(sourceId)), []);
});

test('Brazil has large, medium and small city coverage with concrete climate ranges', () => {
  assert.deepEqual(new Set(brazil.cities.map(({ size }) => size)), new Set(['крупный', 'средний', 'небольшой']));
  assert.ok(brazil.cities.some(({ roles_ru }) => roles_ru.includes('Столица')));
  assert.ok(brazil.cities.some(({ roles_ru }) => roles_ru.includes('Самый недорогой')));
  assert.ok(brazil.cities.every(({ cold_period_temperature_range_c, hot_period_temperature_range_c }) =>
    /\d/.test(cold_period_temperature_range_c) && /\d/.test(hot_period_temperature_range_c)));
});
