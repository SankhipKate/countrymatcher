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

  const sourceDocumentsRoot = new URL('../../source-documents/', import.meta.url);
  for (const path of [
    'README.md',
    'canon-v4.0/CANON_MANIFEST.md',
    'canon-v4.0/COUNTRY_RESEARCH_STANDARD.md',
    'canon-v4.0/MATCHING_AND_RESULT_STANDARD.md',
    'canon-v4.0/NEW_COUNTRY_RESEARCH_PROMPT.md',
    'canon-v4.0/FINAL_LOCK_VALIDATION_REPORT_v4.0.md',
    'canon-v4.0/process/',
  ]) await access(new URL(path, sourceDocumentsRoot));
  for (const path of [
    'README_v4.0.md',
    'COUNTRY_RESEARCH_STANDARD_v4.0.md',
    'MATCHING_AND_RESULT_STANDARD_v4.0.md',
    'NEW_COUNTRY_RESEARCH_PROMPT_v4.0.md',
    'canon-v4.0/CANON_MANIFEST_v4.0.md',
  ]) await assert.rejects(access(new URL(path, sourceDocumentsRoot)));

  const sourceReadme = await readFile(new URL('README.md', sourceDocumentsRoot), 'utf8');
  assert.match(sourceReadme, /Действующий Canon: 4\.0/);
  assert.match(sourceReadme, /source-documents\/canon-v4\.0\//);
  const manifest = await readFile(new URL('canon-v4.0/CANON_MANIFEST.md', sourceDocumentsRoot), 'utf8');
  assert.match(manifest, /Только эти два документа являются normative standards Canon 4\.0\./);
});

test('current Canon never requires a school-type preference for international school presentation', async () => {
  const sourceDocumentsRoot = new URL('../../source-documents/canon-v4.0/', import.meta.url);
  const documents = await Promise.all([
    'COUNTRY_RESEARCH_STANDARD.md',
    'MATCHING_AND_RESULT_STANDARD.md',
    'NEW_COUNTRY_RESEARCH_PROMPT.md',
  ].map((path) => readFile(new URL(path, sourceDocumentsRoot), 'utf8')));
  const canon = documents.join('\n');
  assert.doesNotMatch(canon, /Международная школа учитывается отдельно и только когда пользователь указал необходимость международной школы/u);
  assert.match(canon, /Анкета не спрашивает тип школы/u);
  assert.match(canon, /Международные школы с обучением на английском/u);
  assert.match(canon, /school_needed[^\n]+не выбирает/u);
});

test('root index is the application and matcher has no user page or redirect', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<form id="matcherForm"/);
  assert.match(html, /<section id="accessGate"/);
  assert.match(html, /<form id="accessForm" hidden>[\s\S]*?<\/form>\s*<p class="access-help">/);
  assert.doesNotMatch(html, /<meta[^>]+http-equiv=["']refresh["']/i);
  assert.doesNotMatch(html, /window\.location\.replace/);
  assert.doesNotMatch(html, /(?:url=|location)[^>\n]*\.\/matcher\//i);
  assert.doesNotMatch(html, /<meta[^>]+name=["']robots["'][^>]+noindex/i);
  assert.match(html, /<link rel="canonical" href="https:\/\/sankhipkate\.github\.io\/countrymatcher\/">/);

  const assets = [
    './matcher/access-gate.css?v=4.0.1',
    './pilot/styles.css?v=7.1.2',
    './matcher/styles.css?v=7.1.2',
    './matcher/access-gate.js?v=5.0.0',
    './matcher/app.js?v=7.1.2',
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

test('CI and Pages validate every RP4 package before completion or deploy', async () => {
  const workflows = await Promise.all(['test.yml', 'pages.yml'].map((name) => readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')));
  for (const workflow of workflows) {
    assert.match(workflow, /actions\/setup-python@v5/);
    assert.match(workflow, /pip install -r countrymatcher\/requirements\.txt/);
    assert.match(workflow, /packages=\(countrymatcher\/data\/\*-research-v4\.0\.json\)/);
    assert.match(workflow, /if \[ \$\{#packages\[@\]\} -eq 0 \]/);
    assert.match(workflow, /python3 countrymatcher\/data\/validate-v4\.0\.py "\$package"/);
  }
  const pages = workflows[1];
  assert.ok(pages.indexOf('validate-v4.0.py') < pages.indexOf('actions/upload-pages-artifact@v3'));
});

test('schema ids and maintained public documents use canonical addresses', async () => {
  const researchSchema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
  const profileSchema = JSON.parse(await readFile(new URL('../data/schemas/user-profile-v1.schema.json', import.meta.url), 'utf8'));
  assert.equal(researchSchema.$id, 'https://sankhipkate.github.io/countrymatcher/data/research-package-v4.0.schema.json');
  assert.equal(profileSchema.$id, 'https://sankhipkate.github.io/countrymatcher/data/schemas/user-profile-v1.schema.json');

  const sourceDocumentsRoot = new URL('../../source-documents/', import.meta.url);
  const sourceMarkdown = (await readdir(sourceDocumentsRoot, { recursive: true })).filter((name) => name.endsWith('.md'));
  const maintainedFiles = [
    new URL('../index.html', import.meta.url),
    new URL('../landing/index.html', import.meta.url),
    new URL('../README.md', import.meta.url),
    new URL('../DEPLOYMENT.md', import.meta.url),
    new URL('../docs/research/README.md', import.meta.url),
    ...sourceMarkdown.map((name) => new URL(name, sourceDocumentsRoot)),
  ];
  for (const file of maintainedFiles) {
    const contents = await readFile(file, 'utf8');
    for (const oldUrl of oldPublicUrls) {
      assert.equal(contents.includes(oldUrl), false, `${file.pathname}: ${oldUrl}`);
    }
  }

  const markdownFiles = maintainedFiles.filter((file) => file.pathname.endsWith('.md'));
  for (const file of markdownFiles) {
    const contents = await readFile(file, 'utf8');
    const targets = [...contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1].trim());
    for (const target of targets) {
      if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(target)) continue;
      const localTarget = target.split('#', 1)[0].split('?', 1)[0];
      if (!localTarget) continue;
      await access(new URL(localTarget, file));
    }
  }
});

test('active matcher declares a non-empty list of Final Lock RP4 packages', async () => {
  const matcher = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const declaration = matcher.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/);
  assert.ok(declaration, 'ACTIVE_RP4_PACKAGES declaration');
  const filenames = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(filenames, ['ES-research-v4.0.json', 'AR-research-v4.0.json', 'UY-research-v4.0.json']);
  for (const filename of filenames) {
    assert.match(filename, /^[A-Z]{2}-research-v4\.0\.json$/);
    const pkg = JSON.parse(await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'));
    assert.equal(pkg.schema_version, '4.0');
    assert.equal(pkg.canon_revision, '2026-08-08-final-lock');
    assert.notEqual(pkg.completeness.country_ready_status, 'BLOCKED');
  }
  assert.match(matcher, /Promise\.all\(ACTIVE_RP4_PACKAGES\.map/);
  assert.doesNotMatch(matcher, /-research-v3\.0\.json/);
  assert.doesNotMatch(matcher, /countries\/.+-adapter\.js/);
  assert.doesNotMatch(matcher, /spainData|calculateActiveSpain/);
});

test('matcher renders practical financial guidance separately from official numeric thresholds', async () => {
  const matcher = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(matcher, /\.filter\(\(item\) => item\.threshold != null\)/);
  assert.match(matcher, /const practicalGuidanceBlock =/);
  assert.match(matcher, /item\.practicalGuidance/);
  assert.match(matcher, /practicalGuidanceItems[\s\S]*?\.filter\(\(item\) => item\.state !== 'FAIL' && item\.practicalGuidance\)[\s\S]*?\.map\(\(item\) => item\.practicalGuidance\)/);
  assert.match(matcher, /const practicalGuidanceBlock = !unsuitable && practicalGuidanceItems\.length/);
  assert.match(matcher, /PRACTITIONER_GUIDANCE:\s*'Практическая рекомендация специалиста'/);
  assert.match(matcher, /REPORTED_PRACTICE:\s*'Опубликованная практика'/);
  assert.match(matcher, /INDIVIDUAL_CASE:\s*'Индивидуальный кейс'/);
  assert.match(matcher, /figure\.evidence\.map\(\(evidence\) =>/);
  assert.match(matcher, /practicalEvidenceLabel\[evidence\.evidence_type\]/);
  assert.match(matcher, /formatPracticalSourceDate\(evidence\.source_date\)/);
  assert.doesNotMatch(matcher, /figure\.(?:evidence_type|source_date|source_ids)/);
  assert.match(matcher, /Дата источника:/);
  assert.match(matcher, /Это не официальный минимальный порог\./);
  assert.match(matcher, /надёжную практическую сумму найти не удалось/);
  assert.doesNotMatch(matcher, /thresholdUsd[^\n]+practicalGuidance|practicalGuidance[^\n]+thresholdUsd/);
  const numericFinancialItems = matcher.match(/const financialItems =[\s\S]*?summary\.alternatives[\s\S]*?\);/);
  assert.ok(numericFinancialItems);
  assert.doesNotMatch(numericFinancialItems[0], /practicalGuidance/);
});

test('research order marks only migrated RP4 countries connected and ignores archived RP3 files', async () => {
  const queue = JSON.parse(await readFile(new URL('../../source-documents/COUNTRY_RESEARCH_ORDER_v4.0.json', import.meta.url), 'utf8'));
  assert.equal(queue.countries.length, 250);
  assert.equal(new Set(queue.countries.map(({ overall_rank }) => overall_rank)).size, 250);
  const byName = new Map(queue.countries.map((country) => [country.country, country]));
  for (const country of ['Испания', 'Аргентина']) assert.equal(byName.get(country)?.research_status, 'Подключена', country);
  for (const country of ['Бразилия', 'Мексика', 'Парагвай', 'Португалия', 'Уругвай']) {
    assert.equal(byName.get(country)?.research_status, 'Исследована, ожидает миграции 4.0', country);
  }
  const archivedV3 = (await readdir(dataRoot)).filter((name) => name.endsWith('-research-v3.0.json'));
  assert.ok(archivedV3.length > 0);
  const formerlyConnected = ['Испания', 'Аргентина', 'Бразилия', 'Мексика', 'Парагвай', 'Португалия', 'Уругвай'];
  assert.deepEqual(formerlyConnected.filter((country) => byName.get(country)?.research_status === 'Подключена'), ['Испания', 'Аргентина']);
});
