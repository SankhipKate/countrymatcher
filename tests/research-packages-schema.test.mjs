import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const dataDir = new URL('../data/', import.meta.url);
const schema = JSON.parse(await readFile(new URL('research-package-v3.0.schema.json', dataDir), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const packageFiles = (await readdir(dataDir)).filter((name) => name.endsWith('-research-v3.0.json')).sort();

test('all seven country packages satisfy the single strict v3 schema', async () => {
  assert.deepEqual(packageFiles, [
    'argentina-research-v3.0.json', 'brazil-research-v3.0.json', 'mexico-research-v3.0.json',
    'paraguay-research-v3.0.json', 'portugal-research-v3.0.json', 'spain-research-v3.0.json',
    'uruguay-research-v3.0.json',
  ]);
  const failures = [];
  for (const file of packageFiles) {
    const data = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
    if (!validate(data)) failures.push(`${file}:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`);
  }
  assert.deepEqual(failures, [], failures.join('\n\n'));
});

test('Spain and Uruguay preserve detailed research tables without using them as status text', async () => {
  for (const file of ['spain-research-v3.0.json', 'uruguay-research-v3.0.json']) {
    const data = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
    assert.ok(data.detail_tables);
    for (const key of ['routes', 'route_income', 'route_family', 'route_status', 'route_work', 'cities', 'schools', 'lgbt_rules']) {
      assert.ok(Array.isArray(data.detail_tables[key]), `${file}: ${key}`);
    }
    assert.ok(data.routes.every(({ requirements }) => Array.isArray(requirements) && requirements.length > 0));
    assert.ok(data.routes.every(({ status_logic_ru }) => status_logic_ru === 'Статус формируется только из requirements.'));
  }
});
