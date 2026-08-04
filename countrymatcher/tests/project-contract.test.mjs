import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';

const repositoryRoot = new URL('../../', import.meta.url);
const appRoot = new URL('../', import.meta.url);
const dataRoot = new URL('../data/', import.meta.url);
const oldPublicUrls = [
  'https://sankhipkate.github.io/immigration-country-matcher/matcher/',
  'https://sankhipkate.github.io/immigration-country-matcher/countrymatcher/matcher/',
  'https://sankhipkate.github.io/immigration-country-matcher/landing/',
];

async function existingRelativeAsset(relativePath) {
  const cleanPath = relativePath.replace(/^\.\//, '').replace(/[?#].*$/, '');
  await access(new URL(`../${cleanPath}`, import.meta.url));
}

test('repository has one application folder, one backlog, and one source-document folder', async () => {
  const visible = (await readdir(repositoryRoot)).filter((name) => !name.startsWith('.')).sort();
  assert.deepEqual(visible, ['countrymatcher', 'research-backlog', 'source-documents']);
  const appChildren = await readdir(appRoot);
  assert.equal(appChildren.includes('research-backlog'), false);
  assert.equal(appChildren.includes('source-documents'), false);
  assert.equal(visible.some((name) => name.includes('immigration-country-matcher')), false);
});

test('root index is the application and matcher has no user page or redirect', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<form id="matcherForm"/);
  assert.match(html, /<section id="accessGate"/);
  assert.doesNotMatch(html, /<meta[^>]+http-equiv=["']refresh["']/i);
  assert.doesNotMatch(html, /window\.location\.replace/);
  assert.doesNotMatch(html, /(?:url=|location)[^>\n]*\.\/matcher\//i);
  assert.doesNotMatch(html, /<meta[^>]+name=["']robots["'][^>]+noindex/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/sankhipkate\.github\.io\/countrymatcher\/">/);

  const assets = [
    './matcher/access-gate.css?v=1.0.0',
    './pilot/styles.css?v=7.1.1',
    './matcher/styles.css?v=7.1.1',
    './matcher/access-gate.js?v=1.0.0',
    './matcher/app.js?v=7.1.1',
  ];
  for (const asset of assets) {
    assert.ok(html.includes(`"${asset}"`), asset);
    await existingRelativeAsset(asset);
  }
  assert.match(html, /class="access-brand" href="\.\/landing\/"/);
  assert.match(html, /class="brand" href="\.\/"/);

  await assert.rejects(access(new URL('../matcher/index.html', import.meta.url)));
  await assert.rejects(access(new URL('../pilot/index.html', import.meta.url)));
  await access(new URL('../landing/index.html', import.meta.url));
});

test('Pages workflow tests before publishing only countrymatcher', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  for (const action of [
    'actions/checkout@v4', 'actions/setup-node@v4', 'actions/configure-pages@v5',
    'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4',
  ]) assert.ok(workflow.includes(action), action);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /path: countrymatcher/);
  assert.equal(workflow.includes('path: .'), false);
  const testPosition = workflow.indexOf('run: npm test');
  const uploadPosition = workflow.indexOf('actions/upload-pages-artifact@v3');
  const deployPosition = workflow.indexOf('actions/deploy-pages@v4');
  assert.ok(testPosition > -1 && testPosition < uploadPosition && uploadPosition < deployPosition);
});

test('schema ids and maintained public documents use canonical addresses', async () => {
  const researchSchema = JSON.parse(await readFile(new URL('../data/research-package-v3.0.schema.json', import.meta.url), 'utf8'));
  const profileSchema = JSON.parse(await readFile(new URL('../data/schemas/user-profile-v1.schema.json', import.meta.url), 'utf8'));
  assert.equal(researchSchema.$id, 'https://sankhipkate.github.io/countrymatcher/data/research-package-v3.0.schema.json');
  assert.equal(profileSchema.$id, 'https://sankhipkate.github.io/countrymatcher/data/schemas/user-profile-v1.schema.json');

  const sourceDocumentsRoot = new URL('../../source-documents/', import.meta.url);
  const sourceMarkdown = (await readdir(sourceDocumentsRoot)).filter((name) => name.endsWith('.md'));
  const maintainedFiles = [
    new URL('../index.html', import.meta.url),
    new URL('../landing/index.html', import.meta.url),
    new URL('../README.md', import.meta.url),
    new URL('../DEPLOYMENT.md', import.meta.url),
    ...sourceMarkdown.map((name) => new URL(name, sourceDocumentsRoot)),
  ];
  for (const file of maintainedFiles) {
    const contents = await readFile(file, 'utf8');
    for (const oldUrl of oldPublicUrls) {
      assert.equal(contents.includes(oldUrl), false, `${file.pathname}: ${oldUrl}`);
    }
  }
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
