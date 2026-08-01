import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = new URL('../', import.meta.url);
const schema = JSON.parse(await readFile(
  new URL('data/research-package-v3.0.schema.json', root),
  'utf8',
));
const brazil = JSON.parse(await readFile(
  new URL('research-backlog/brazil-v3.0/brazil-research-v3.0.json', root),
  'utf8',
));

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
addFormats(ajv);
const validate = ajv.compile(schema);

function collectSourceIds(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSourceIds(item, result);
    return result;
  }

  if (!value || typeof value !== 'object') return result;

  if (Array.isArray(value.source_ids)) {
    result.push(...value.source_ids);
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'source_ids') collectSourceIds(nested, result);
  }

  return result;
}

test('Brazil draft satisfies the strict Research Package 3.0 schema', () => {
  assert.equal(
    validate(brazil),
    true,
    ajv.errorsText(validate.errors, { separator: '\n' }),
  );
});

test('Brazil draft exposes only nomad and retirement as future public routes', () => {
  assert.deepEqual(
    brazil.routes
      .filter(({ publishable }) => publishable)
      .map(({ route_id }) => route_id),
    ['BR_DIGITAL_NOMAD', 'BR_RETIREMENT'],
  );

  assert.deepEqual(
    brazil.routes
      .filter(({ publishable }) => !publishable)
      .map(({ route_id }) => route_id),
    [
      'BR_EMPLOYMENT_HIDDEN',
      'BR_STUDENT_HIDDEN',
      'BR_FAMILY_HIDDEN',
      'BR_INVESTOR_HIDDEN',
    ],
  );

  assert.equal(brazil.completeness.public_routes_ready, 2);
  assert.equal(brazil.completeness.hidden_routes, 4);
});

test('Brazil official income thresholds remain explicit', () => {
  const nomad = brazil.routes.find(
    ({ route_id }) => route_id === 'BR_DIGITAL_NOMAD',
  );
  const retirement = brazil.routes.find(
    ({ route_id }) => route_id === 'BR_RETIREMENT',
  );

  assert.equal(nomad.income_threshold_amount, 1500);
  assert.equal(nomad.income_threshold_currency, 'USD');
  assert.match(nomad.income_formula, /18 000 USD/);

  assert.equal(retirement.income_threshold_amount, 2000);
  assert.equal(retirement.income_threshold_currency, 'USD');
});

test('every source referenced by the Brazil draft exists', () => {
  const existing = new Set(
    brazil.sources.map(({ source_id }) => source_id),
  );

  const referenced = collectSourceIds({
    routes: brazil.routes,
    cities: brazil.cities,
    schools: brazil.schools,
    pets: brazil.pets,
    lgbt: brazil.lgbt,
  });

  assert.deepEqual(
    [...new Set(referenced)].filter(
      (sourceId) => !existing.has(sourceId),
    ),
    [],
  );
});

test('Brazil remains disconnected from the public matcher while blockers exist', async () => {
  const app = await readFile(
    new URL('matcher/app.js', root),
    'utf8',
  );

  assert.doesNotMatch(app, /brazil-research-v3\.0/i);
  assert.doesNotMatch(app, /brazil-adapter/i);
  assert.equal(
    brazil.completeness.country_ready_status,
    'DRAFT_RUNTIME_BLOCKED',
  );
  assert.ok(
    brazil.completeness.publication_blockers.some(
      (item) => /небольшого города/i.test(item),
    ),
  );
});
