import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const appRootUrl = new URL('../', import.meta.url);
const appRoot = fileURLToPath(appRootUrl);
const read = (path) => readFile(new URL(path, appRootUrl), 'utf8');
const buildScript = fileURLToPath(new URL('../scripts/build-pages-artifact.mjs', import.meta.url));

async function sourceFiles(path) {
  const directory = new URL(path, appRootUrl);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = `${path}${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(`${child}/`));
    else if (/\.(?:js|html)$/.test(entry.name)) files.push(child);
  }
  return files;
}

async function artifactTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await artifactTextFiles(path));
    else if (['.js', '.html'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function relativeJsSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:from|import)\s*(["'])(\.\.?\/[^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)\1/g,
    /\bimport\s*\(\s*(["'])(\.\.?\/[^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)\1\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[2]);
  }
  return specifiers;
}

function htmlRuntimeSpecifiers(source) {
  const specifiers = [];
  for (const tag of source.matchAll(/<script\b[^>]*>/gi)) {
    const match = tag[0].match(/\bsrc=(["'])(\.\.?\/[^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)\1/i);
    if (match) specifiers.push(match[2]);
  }
  for (const tag of source.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=(["'])stylesheet\1/i.test(tag[0])) continue;
    const match = tag[0].match(/\bhref=(["'])(\.\.?\/[^"']+\.css(?:\?[^"']*)?(?:#[^"']*)?)\1/i);
    if (match) specifiers.push(match[2]);
  }
  return specifiers;
}

function assertBuildId(specifier, buildId, file) {
  const url = new URL(specifier, 'https://example.test/project/');
  assert.equal(url.searchParams.get('v'), buildId, `${file}: ${specifier}`);
}

async function buildArtifact(output, env = {}) {
  await execFileAsync(process.execPath, [buildScript, output], {
    cwd: appRoot,
    env: { ...process.env, ...env },
  });
}

test('VERSION is the single manual product-version source', async () => {
  const version = (await read('VERSION')).trim();
  assert.match(version, /^\d+\.\d+\.\d+$/);

  const [packageJson, packageLock, matcherHtml, readme, deployment, fxContext] = await Promise.all([
    read('package.json').then(JSON.parse),
    read('package-lock.json').then(JSON.parse),
    read('index.html'),
    read('README.md'),
    read('DEPLOYMENT.md'),
    read('pilot/fx-context.js'),
  ]);

  assert.equal(Object.hasOwn(packageJson, 'version'), false);
  assert.equal(Object.hasOwn(packageLock, 'version'), false);
  assert.equal(Object.hasOwn(packageLock.packages[''], 'version'), false);
  assert.match(matcherHtml, /версия <span data-app-version>dev<\/span>/);
  assert.doesNotMatch(matcherHtml, /версия \d+\.\d+\.\d+/);
  assert.doesNotMatch(readme, /Версия интерфейса:\s*\*\*\d+\.\d+\.\d+\*\*/);
  assert.match(readme, /\[`VERSION`\]\(VERSION\)/);
  assert.match(deployment, /Техническим источником текущего номера служит только файл `VERSION`/);
  assert.doesNotMatch(fxContext, /engine_version/);

  const runtimeFiles = [
    'index.html',
    ...await sourceFiles('landing/'),
    ...await sourceFiles('js/'),
    ...await sourceFiles('matcher/'),
    ...await sourceFiles('pilot/'),
  ];
  for (const file of runtimeFiles) {
    assert.doesNotMatch(await read(file), /\?v=/, `${file} contains a manual cache key`);
  }
});

test('Pages artifact injects app version and one deployment BUILD_ID across runtime references', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'countrymatcher-versioned-pages-'));
  const output = join(temporaryRoot, 'artifact');
  const appVersion = '99.88.77';
  const buildId = 'TEST-BUILD-123';
  try {
    await buildArtifact(output, { APP_VERSION: appVersion, BUILD_ID: buildId });

    const index = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(index, new RegExp(`версия <span data-app-version>${appVersion.replaceAll('.', '\\.')}</span>`));
    assert.match(index, new RegExp(`<meta name="countrymatcher-build-id" content="${buildId}">`));
    assert.doesNotMatch(index, />dev<\/span>/);

    const textFiles = await artifactTextFiles(output);
    let staticRuntimeReferenceCount = 0;
    const seenCacheIds = new Set();
    for (const file of textFiles) {
      const source = await readFile(file, 'utf8');
      const specifiers = file.endsWith('.js') ? relativeJsSpecifiers(source) : htmlRuntimeSpecifiers(source);
      staticRuntimeReferenceCount += specifiers.length;
      for (const specifier of specifiers) assertBuildId(specifier, buildId, file);
      for (const match of source.matchAll(/[?&]v=([A-Za-z0-9._-]+)/g)) seenCacheIds.add(match[1]);
    }
    assert.ok(staticRuntimeReferenceCount > 0, 'artifact must contain versioned static runtime references');
    assert.deepEqual([...seenCacheIds], [buildId]);

    const matcher = await readFile(join(output, 'matcher/app.js'), 'utf8');
    assert.match(matcher, /function currentBuildId\(\)/);
    assert.match(matcher, /meta\[name="countrymatcher-build-id"\]/);
    assert.match(matcher, /versioned\.searchParams\.set\('v', buildId\)/);
    assert.match(matcher, /fetch\(withBuildId\(new URL\(filename, DATA_BASE\), buildId\)\)/);
    assert.match(matcher, /fetch\(withBuildId\(new URL\('schemas\/user-profile-v1\.schema\.json', DATA_BASE\), buildId\)\)/);
    assert.match(matcher, /fetch\(withBuildId\(new URL\(QUALITY_OF_LIFE_EDITORIAL_FILE, DATA_BASE\), buildId\)\)/);
    assert.match(matcher, /fallbackUrl: withBuildId\(FX_FALLBACK_URL, buildId\)/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('GitHub deployment identity produces a deployment-scoped BUILD_ID', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'countrymatcher-github-build-id-'));
  const output = join(temporaryRoot, 'artifact');
  const env = {
    APP_VERSION: '99.88.77',
    BUILD_ID: '',
    GITHUB_SHA: 'abcdef1234567890abcdef1234567890abcdef12',
    GITHUB_RUN_ID: '424242',
    GITHUB_RUN_ATTEMPT: '3',
  };
  try {
    await buildArtifact(output, env);
    const index = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(index, /<meta name="countrymatcher-build-id" content="abcdef123456-424242-3">/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
