import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const repositoryRoot = new URL('../../', import.meta.url);
const appRoot = new URL('../', import.meta.url);
const dataRoot = new URL('../data/', import.meta.url);

test('repository has one application folder, one backlog, and one source-document folder', async () => {
  const visible = (await readdir(repositoryRoot)).filter((name) => !name.startsWith('.')).sort();
  assert.deepEqual(visible, ['countrymatcher', 'research-backlog', 'source-documents']);
  const appChildren = await readdir(appRoot);
  assert.equal(appChildren.includes('research-backlog'), false);
  assert.equal(appChildren.includes('source-documents'), false);
  assert.equal(visible.some((name) => name.includes('immigration-country-matcher')), false);
});

test('every connected country has legal-entry data for a Russian citizen and the UI renders it', async () => {
  const packageFiles = (await readdir(dataRoot)).filter((name) => name.endsWith('-research-v3.0.json')).sort();
  for (const file of packageFiles) {
    const data = JSON.parse(await readFile(new URL(file, dataRoot), 'utf8'));
    const entry = data.entry_for_russian_citizen;
    assert.ok(entry, `${file}: entry_for_russian_citizen`);
    assert.ok(entry.summary_ru.length > 40, `${file}: summary_ru`);
    assert.ok(entry.maximum_stay_days > 0, `${file}: maximum_stay_days`);
    assert.ok(entry.source_ids.length > 0, `${file}: source_ids`);
    for (const sourceId of entry.source_ids) {
      assert.ok(data.sources.some(({ source_id }) => source_id === sourceId), `${file}: missing ${sourceId}`);
    }
  }
  const adapters = await Promise.all([
    'argentina-adapter.js', 'brazil-adapter.js', 'mexico-adapter.js',
    'paraguay-adapter.js', 'portugal-adapter.js', 'spain-adapter.js',
  ].map((file) => readFile(new URL(`../js/countries/${file}`, import.meta.url), 'utf8')));
  assert.equal(adapters.every((source) => source.includes('entryForRussianCitizen: data.entry_for_russian_citizen || null')), true);
  assert.equal(adapters.every((source) => source.includes('data.entry_for_russian_citizen?.source_ids')), true);
  const ui = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.ok(ui.includes('Как гражданину РФ законно въехать'));
  assert.ok(ui.includes("replace(/[.;]+$/u, '')"));
});

test('research order mirrors all countries and marks every packaged country as connected', async () => {
  const queue = JSON.parse(await readFile(new URL('../../source-documents/COUNTRY_RESEARCH_ORDER.json', import.meta.url), 'utf8'));
  assert.equal(queue.countries.length, 250);
  assert.equal(new Set(queue.countries.map(({ overall_rank }) => overall_rank)).size, 250);
  const byName = new Map(queue.countries.map((country) => [country.country, country]));
  const packageFiles = (await readdir(dataRoot)).filter((name) => name.endsWith('-research-v3.0.json'));
  for (const file of packageFiles) {
    const data = JSON.parse(await readFile(new URL(file, dataRoot), 'utf8'));
    assert.equal(byName.get(data.country_name_ru)?.research_status, 'Подключена', data.country_name_ru);
  }
});
