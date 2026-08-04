import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function sourceFiles(path) {
  const directory = new URL(path, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = `${path}${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(`${child}/`));
    else if (/\.(?:js|html)$/.test(entry.name)) files.push(child);
  }
  return files;
}

test('release version is identical in every required location', async () => {
  const version = (await read('VERSION')).trim();
  assert.match(version, /^\d+\.\d+\.\d+$/);

  const [packageJson, packageLock, matcherHtml, readme, deployment, fxContext] = await Promise.all([
    read('package.json').then(JSON.parse),
    read('package-lock.json').then(JSON.parse),
    read('matcher/index.html'),
    read('README.md'),
    read('DEPLOYMENT.md'),
    read('pilot/fx-context.js'),
  ]);

  assert.equal(packageJson.version, version);
  assert.equal(packageLock.version, version);
  assert.equal(packageLock.packages[''].version, version);
  assert.match(matcherHtml, new RegExp(`версия ${version.replaceAll('.', '\\.')}`));
  assert.match(readme, new RegExp(`Версия интерфейса: \\*\\*${version.replaceAll('.', '\\.')}\\*\\*`));
  assert.match(deployment, new RegExp(`Версия интерфейса: \\*\\*${version.replaceAll('.', '\\.')}\\*\\*`));
  assert.match(fxContext, new RegExp(`engine_version: '${version.replaceAll('.', '\\.')}'`));
});

test('application cache keys use the release version', async () => {
  const version = (await read('VERSION')).trim();
  const files = [
    ...await sourceFiles('js/'),
    ...await sourceFiles('matcher/'),
    ...await sourceFiles('pilot/'),
  ];

  for (const file of files) {
    const source = await read(file);
    for (const match of source.matchAll(/([^'"\s]+)\?v=(\d+\.\d+\.\d+)/g)) {
      const [, asset, cacheVersion] = match;
      if (asset.includes('access-gate.')) continue;
      assert.equal(cacheVersion, version, `${file}: ${asset} uses cache key ${cacheVersion}`);
    }
  }
});
