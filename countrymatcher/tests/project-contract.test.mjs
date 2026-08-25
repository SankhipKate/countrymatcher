import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

function filesystemEntryUrl(rootUrl, name) {
  return pathToFileURL(join(fileURLToPath(rootUrl), name));
}

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

async function activeRp4CountryNames() {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const activeBlock = app.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/);
  assert.ok(activeBlock, 'ACTIVE_RP4_PACKAGES must exist');
  const activeFiles = [...activeBlock[1].matchAll(/'([A-Z]{2}-research-v4\.0\.json)'/g)].map((match) => match[1]);
  assert.ok(activeFiles.length > 0, 'at least one active RP4 package is required');
  return Promise.all(activeFiles.map(async (filename) => {
    const pkg = JSON.parse(await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'));
    return pkg.country_name_ru;
  }));
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

test('every active NO_FIXED_THRESHOLD alternative records a completed practical research pass', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const activeBlock = app.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/);
  assert.ok(activeBlock, 'ACTIVE_RP4_PACKAGES must exist');
  const activeFiles = [...activeBlock[1].matchAll(/'([A-Z]{2}-research-v4\.0\.json)'/g)].map((match) => match[1]);

  const missing = [];
  for (const filename of activeFiles) {
    const pkg = JSON.parse(await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'));
    for (const route of pkg.routes || []) {
      for (const requirement of route.requirements || []) {
        for (const alternative of requirement.financial?.alternatives || []) {
          if (alternative.comparison !== 'NO_FIXED_THRESHOLD') continue;
          if (!['FOUND', 'NOT_FOUND'].includes(alternative.practical_financial_guidance?.status)) {
            missing.push(`${pkg.country_id}/${route.route_id}/${requirement.requirement_id}/${alternative.kind}`);
          }
        }
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('Brazil VITEM IV keeps the researched 1,000 USD/month consular screening without inventing an ENGINE verdict', async () => {
  const brazil = JSON.parse(await readFile(new URL('../data/BR-research-v4.0.json', import.meta.url), 'utf8'));
  const study = brazil.routes.find(({ route_id }) => route_id === 'BR_STUDY');
  const financial = study?.requirements.find(({ requirement_id }) => requirement_id === 'BR_STUDY_FIN');

  assert.equal(financial?.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(financial?.unmet_effect, 'BECOMES_CONDITION');
  assert.deepEqual(financial?.financial?.alternatives.map(({ kind }) => kind), [
    'INCOME', 'SAVINGS', 'SPONSOR', 'SCHOLARSHIP',
  ]);

  for (const alternative of financial.financial.alternatives) {
    assert.equal(alternative.comparison, 'NO_FIXED_THRESHOLD');
    assert.equal(alternative.asked_in_questionnaire, false);
    assert.equal(alternative.practical_financial_guidance?.status, 'FOUND');
    assert.equal(alternative.practical_financial_guidance?.evaluation_mode, 'DISPLAY_ONLY');
    assert.deepEqual(alternative.practical_screening_threshold, {
      comparison: 'AT_LEAST',
      currency: 'USD',
      period: 'MONTHLY',
      amount: 1000,
      source_ids: ['BR_SRC_STUDY_MEXICO_2026'],
    });
  }
});

test('current Canon keeps two normative standards and generalized practical screening semantics', async () => {
  const sourceDocumentsRoot = new URL('../../source-documents/canon-v4.0/', import.meta.url);
  const [manifest, research, matching, prompt] = await Promise.all([
    'CANON_MANIFEST.md',
    'COUNTRY_RESEARCH_STANDARD.md',
    'MATCHING_AND_RESULT_STANDARD.md',
    'NEW_COUNTRY_RESEARCH_PROMPT.md',
  ].map((path) => readFile(new URL(path, sourceDocumentsRoot), 'utf8')));

  assert.match(
    manifest,
    /Только эти два документа являются normative standards Canon 4\.0/u,
  );
  assert.match(
    prompt,
    /двух нормативных документов или обязательную JSON Schema/u,
  );
  assert.doesNotMatch(prompt, /трёх нормативных файлов/u);
  assert.match(
    research,
    /practical_screening_threshold` допустим рядом с любой финансовой альтернативой `NO_FIXED_THRESHOLD`/u,
  );
  assert.match(
    research,
    /ровно одну из этих трёх size-role/u,
  );
  assert.match(
    matching,
    /Screening threshold участвует в PASS\/FAIL только при `evaluation_mode = ENGINE`/u,
  );
  assert.match(
    matching,
    /Research alternative `CAPITAL` также может быть `asked_in_questionnaire: true`/u,
  );
  assert.match(
    matching,
    /Результат маршрута не должен зависеть от порядка `requirements\[\]`/u,
  );
  assert.match(
    matching,
    /`practical_screening_threshold` сравнивается только с остатком после более приоритетных требований/u,
  );
  assert.match(
    matching,
    /gross amount, reserved amount и available amount отдельно/u,
  );
  assert.doesNotMatch(
    matching,
    /`CAPITAL`, инвестиционное намерение и специальные виды активов остаются отдельными неизвестными фактами и не выводятся из общего объёма сбережений/u,
  );
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
  assert.doesNotMatch(canon, /необходимость международной школы/u);
  assert.match(canon, /Анкета не спрашивает тип школы/u);
  assert.match(canon, /Международные школы с обучением на английском/u);
  assert.match(canon, /school_needed[^\n]+не выбирает/u);
});

test('maintained project documents describe the current production questionnaire and funnel', async () => {
  const sourceDocumentsRoot = new URL('../../source-documents/', import.meta.url);
  const [readme, deployment, researchReadme, questionnaire, overview, roadmap, matchingStandard] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../DEPLOYMENT.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/research/README.md', import.meta.url), 'utf8'),
    readFile(new URL('QUESTIONNAIRE_AND_RESULTS_v4.0.md', sourceDocumentsRoot), 'utf8'),
    readFile(new URL('PROJECT_OVERVIEW_v4.0.md', sourceDocumentsRoot), 'utf8'),
    readFile(new URL('ROADMAP_v4.0.md', sourceDocumentsRoot), 'utf8'),
    readFile(new URL('canon-v4.0/MATCHING_AND_RESULT_STANDARD.md', sourceDocumentsRoot), 'utf8'),
  ]);

  const activeCountryNames = await activeRp4CountryNames();
  for (const country of activeCountryNames) {
    assert.ok(readme.includes(country), `README: ${country}`);
    assert.ok(deployment.includes(country), `DEPLOYMENT: ${country}`);
    assert.ok(researchReadme.includes(country), `research README: ${country}`);
    assert.ok(overview.includes(country), `PROJECT_OVERVIEW: ${country}`);
  }

  assert.doesNotMatch(`${readme}
${deployment}
${researchReadme}`, /подключены три страны|активные страны — Испания, Аргентина и Уругвай|единственная подключённая страна Canon 4\.0/u);
  assert.match(questionnaire, /подтверждаемых сбережений/u);
  assert.doesNotMatch(questionnaire, /семейный бюджет|Не знаю бюджет|Накопления[^\n]+не спрашиваются/u);
  assert.match(questionnaire, /первая страна открывается бесплатно полностью/u);
  assert.match(questionnaire, /автоматической синхронизации доступа между разными браузерами или устройствами нет/u);
  assert.match(matchingStandard, /## 22\.1\. Бесплатный preview и полный доступ/u);
  assert.match(matchingStandard, /## 32\.1\. Quality of Life editorial layer/u);
  assert.doesNotMatch(matchingStandard, /необходимость международной школы/u);
  assert.doesNotMatch(roadmap, /перенести проверку платного доступа на сервер|автоматическая оплата иностранными картами|автоматическая выдача доступа после подтверждённой оплаты/u);
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
    './matcher/access-gate.css',
    './pilot/styles.css',
    './matcher/styles.css',
    './matcher/access-gate.js',
    './matcher/app.js',
  ];
  for (const asset of assets) {
    assert.ok(html.includes(`"${asset}"`), asset);
    await existingRelativeAsset(asset);
  }
  assert.ok(html.indexOf('id="accessGate"') < html.indexOf('id="resultView"'));
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
  assert.match(workflow, /build-pages-artifact\.mjs pages-artifact/);
  assert.match(workflow, /refresh-fx-fallback\.mjs pages-artifact \|\| echo/);
  assert.match(workflow, /path: pages-artifact/);
  assert.doesNotMatch(workflow, /^\s+path: countrymatcher\s*$/m);
  assert.equal(workflow.includes('path: .'), false);
  const testPosition = workflow.indexOf('run: npm test');
  const uploadPosition = workflow.indexOf('actions/upload-pages-artifact@v3');
  const deployPosition = workflow.indexOf('actions/deploy-pages@v4');
  assert.ok(testPosition > -1 && testPosition < uploadPosition && uploadPosition < deployPosition);
});

test('Pages artifact is a positive runtime allowlist', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'countrymatcher-pages-'));
  const output = join(temporaryRoot, 'artifact');
  try {
    await execFileAsync(process.execPath, [new URL('../scripts/build-pages-artifact.mjs', import.meta.url).pathname, output]);
    for (const required of [
      'index.html', '.nojekyll', 'payment-config.js', 'assets/images/countrymatcher-logo.png',
      'landing/index.html', 'matcher/app.js', 'pilot/fx-context.js', 'js/engine/rp4-engine.js',
      'data/ES-research-v4.0.json', 'data/AR-research-v4.0.json', 'data/UY-research-v4.0.json', 'data/BR-research-v4.0.json', 'data/PT-research-v4.0.json', 'data/MX-research-v4.0.json', 'data/PY-research-v4.0.json', 'data/CO-research-v4.0.json', 'data/ME-research-v4.0.json',
      'data/quality-of-life-ru.json', 'data/country-consultants-ru.json', 'data/schemas/user-profile-v1.schema.json', 'data/fx-fallback.json',
    ]) await access(join(output, required));
    for (const excluded of ['tests', 'docs/research', 'node_modules', 'scripts', 'package.json', 'package-lock.json', 'data/research-package-v3.0.schema.json', 'data/spain-research-v3.0.json']) {
      await assert.rejects(access(join(output, excluded)), excluded);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('CI and Pages validate every RP4 package before completion or deploy', async () => {
  const workflows = await Promise.all(['test.yml', 'pages.yml'].map((name) => readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')));
  for (const workflow of workflows) {
    assert.match(workflow, /actions\/setup-python@v5/);
    assert.match(workflow, /pip install -r countrymatcher\/requirements\.txt/);
    const installPosition = workflow.indexOf('pip install -r countrymatcher/requirements.txt');
    const npmTestPosition = workflow.indexOf('run: npm test');
    assert.ok(
      installPosition > -1 && npmTestPosition > -1 && installPosition < npmTestPosition,
      'validator dependencies must be installed before npm test',
    );
    assert.match(workflow, /packages=\(countrymatcher\/data\/\*-research-v4\.0\.json\)/);
    assert.match(workflow, /if \[ \$\{#packages\[@\]\} -eq 0 \]/);
    assert.match(workflow, /python3 countrymatcher\/data\/validate-v4\.0\.py "\$package"/);
  }
  const pages = workflows[1];
  assert.ok(pages.indexOf('validate-v4.0.py') < pages.indexOf('actions/upload-pages-artifact@v3'));
});

test('filesystem entry names remain paths instead of URL fragments or queries', () => {
  const root = pathToFileURL('/tmp/source-documents/');
  const hashName = '#U041f-file.md';
  const queryName = 'README.md?draft';
  const hashUrl = filesystemEntryUrl(root, hashName);
  const queryUrl = filesystemEntryUrl(root, queryName);

  assert.equal(hashUrl.hash, '');
  assert.equal(hashUrl.search, '');
  assert.ok(decodeURIComponent(hashUrl.pathname).endsWith(`/${hashName}`));
  assert.equal(queryUrl.hash, '');
  assert.equal(queryUrl.search, '');
  assert.ok(decodeURIComponent(queryUrl.pathname).endsWith(`/${queryName}`));
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
    ...sourceMarkdown.map((name) => filesystemEntryUrl(sourceDocumentsRoot, name)),
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
  assert.deepEqual(filenames, ['ES-research-v4.0.json', 'AR-research-v4.0.json', 'UY-research-v4.0.json', 'BR-research-v4.0.json', 'PT-research-v4.0.json', 'MX-research-v4.0.json', 'PY-research-v4.0.json', 'CO-research-v4.0.json', 'ME-research-v4.0.json']);
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

test('runtime data URLs are module-relative and remain valid under a project subpath', async () => {
  const [matcher, fx] = await Promise.all([
    readFile(new URL('../matcher/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../pilot/fx-context.js', import.meta.url), 'utf8'),
  ]);
  assert.match(matcher, /const DATA_BASE = new URL\('\.\.\/data\/', import\.meta\.url\)/);
  assert.doesNotMatch(matcher, /fetch\(['"]\.\.\/data/);
  assert.match(matcher, /fetch\(withBuildId\(new URL\(filename, DATA_BASE\), buildId\)\)/);
  assert.match(matcher, /fetch\(withBuildId\(new URL\('schemas\/user-profile-v1\.schema\.json', DATA_BASE\), buildId\)\)/);
  assert.match(matcher, /fetch\(withBuildId\(new URL\(QUALITY_OF_LIFE_EDITORIAL_FILE, DATA_BASE\), buildId\)\)/);
  assert.match(matcher, /fallbackUrl: withBuildId\(FX_FALLBACK_URL, buildId\)/);
  assert.match(fx, /new URL\('\.\.\/data\/fx-fallback\.json', import\.meta\.url\)/);
  const deploymentRoot = new URL('https://example.test/future/project-subpath/');
  const matcherModule = new URL('matcher/app.js', deploymentRoot);
  const pilotModule = new URL('pilot/fx-context.js', deploymentRoot);
  const dataBase = new URL('../data/', matcherModule);
  const countryUrl = new URL('ES-research-v4.0.json', dataBase);
  countryUrl.searchParams.set('v', 'TEST-BUILD');
  const schemaUrl = new URL('schemas/user-profile-v1.schema.json', dataBase);
  schemaUrl.searchParams.set('v', 'TEST-BUILD');
  assert.equal(countryUrl.href, 'https://example.test/future/project-subpath/data/ES-research-v4.0.json?v=TEST-BUILD');
  assert.equal(schemaUrl.href, 'https://example.test/future/project-subpath/data/schemas/user-profile-v1.schema.json?v=TEST-BUILD');
  assert.equal(new URL('../data/fx-fallback.json', pilotModule).href, 'https://example.test/future/project-subpath/data/fx-fallback.json');
  assert.doesNotMatch(`${matcher}\n${fx}`, /sankhipkate\.github\.io|github\.io\/countrymatcher/);
});

test('matcher renders practical financial guidance separately from official numeric thresholds', async () => {
  const matcher = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(matcher, /\.filter\(\(item\) => item\.threshold != null\)/);
  assert.doesNotMatch(matcher, /Практический финансовый порог Country Matcher/);
  assert.doesNotMatch(matcher, /const practicalScreeningBlock =/);
  assert.match(matcher, /const practicalGuidanceBlock =/);
  assert.match(matcher, /item\.practicalGuidance/);
  assert.match(matcher, /practicalGuidanceItems = financialRequirements\.flatMap[\s\S]*?\.filter\(\(item\) => item\.practicalGuidance\)[\s\S]*?\.map\(\(item\) => item\.practicalGuidance\)/);
  assert.match(matcher, /const practicalGuidanceBlock = !unsuitable && practicalGuidanceItems\.length/);
  assert.match(matcher, /PRACTITIONER_GUIDANCE:\s*'Практическая рекомендация специалиста'/);
  assert.match(matcher, /REPORTED_PRACTICE:\s*'Опубликованная практика'/);
  assert.match(matcher, /INDIVIDUAL_CASE:\s*'Индивидуальный кейс'/);
  assert.match(matcher, /figure\.evidence\.map\(\(evidence\) =>/);
  assert.match(matcher, /practicalEvidenceLabel\[evidence\.evidence_type\]/);
  assert.match(matcher, /formatPracticalSourceDate\(evidence\.source_date\)/);
  assert.doesNotMatch(matcher, /figure\.(?:evidence_type|source_date|source_ids)/);
  assert.match(matcher, /Дата источника:/);
  assert.match(matcher, /надёжную практическую сумму найти не удалось/);
  assert.doesNotMatch(matcher, /thresholdUsd[^\n]+practicalGuidance|practicalGuidance[^\n]+thresholdUsd/);
  const numericFinancialItems = matcher.match(/const financialItems =[\s\S]*?summary\.alternatives[\s\S]*?\);/);
  assert.ok(numericFinancialItems);
  assert.doesNotMatch(numericFinancialItems[0], /practicalGuidance/);
});

test('research order connected status matches the active RP4 matcher and ignores archived RP3 files', async () => {
  const queue = JSON.parse(await readFile(new URL('../../source-documents/COUNTRY_RESEARCH_ORDER_v4.0.json', import.meta.url), 'utf8'));
  assert.equal(queue.countries.length, 250);
  assert.equal(new Set(queue.countries.map(({ overall_rank }) => overall_rank)).size, 250);

  const activeCountryNames = await activeRp4CountryNames();
  const connectedNames = queue.countries
    .filter(({ research_status }) => research_status === 'Подключена')
    .map(({ country }) => country);

  assert.deepEqual([...connectedNames].sort(), [...activeCountryNames].sort());
  const archivedV3 = (await readdir(dataRoot)).filter((name) => name.endsWith('-research-v3.0.json'));
  assert.ok(archivedV3.length > 0);
});

test('landing active-country manifest matches active RP4 packages', async () => {
  const matcher = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const declaration = matcher.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/);
  assert.ok(declaration, 'ACTIVE_RP4_PACKAGES declaration');

  const filenames = [...declaration[1].matchAll(/'([A-Z]{2}-research-v4\.0\.json)'/g)]
    .map((match) => match[1]);

  const activeCountries = await Promise.all(
    filenames.map(async (filename) => {
      const pkg = JSON.parse(
        await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'),
      );
      return {
        code: pkg.country_id,
        name: pkg.country_name_ru,
      };
    }),
  );

  const manifest = JSON.parse(
    await readFile(
      new URL('../data/active-countries.json', import.meta.url),
      'utf8',
    ),
  );

  assert.equal(Array.isArray(manifest), true);
  assert.equal(manifest.length, filenames.length);

  assert.deepEqual(
    manifest.map(({ code, name }) => ({ code, name })),
    activeCountries,
  );

  for (const country of manifest) {
    assert.match(country.region, /\S+/);
  }

  const landing = await readFile(
    new URL('../landing/index.html', import.meta.url),
    'utf8',
  );

  assert.match(
    landing,
    /fetch\('\.\.\/data\/active-countries\.json'/,
  );

  const build = await readFile(
    new URL('../scripts/build-pages-artifact.mjs', import.meta.url),
    'utf8',
  );

  assert.match(build, /'data\/active-countries\.json'/);
});
