import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertActiveResearchPackage } from '../js/engine/rp4-engine.js';
import {
  activeRp4Filenames,
  readActiveCountryManifest,
  rp4FilenameForCode,
} from './helpers/active-country-manifest.mjs';

const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();
const deployment = await readFile(new URL('../DEPLOYMENT.md', import.meta.url), 'utf8');

function versionTuple(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(match, `invalid product version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = versionTuple(left);
  const b = versionTuple(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

test('active-country manifest defines valid active RP4 packages and release provenance', async () => {
  const manifest = await readActiveCountryManifest();

  assert.ok(Array.isArray(manifest) && manifest.length > 0, 'active-country manifest must not be empty');

  const codes = manifest.map(({ code }) => code);
  assert.equal(new Set(codes).size, codes.length, 'active-country codes must be unique');

  for (const country of manifest) {
    assert.match(country.code, /^[A-Z]{2}$/, `${country.code}: code must be ISO alpha-2 format`);
    assert.ok(typeof country.name === 'string' && country.name.trim(), `${country.code}: name is required`);
    assert.ok(typeof country.region === 'string' && country.region.trim(), `${country.code}: region is required`);
    assert.match(
      country.introduced_version,
      /^\d+\.\d+\.\d+$/,
      `${country.code}: introduced_version must use product version format`,
    );
    assert.ok(
      compareVersions(country.introduced_version, version) <= 0,
      `${country.code}: introduced_version ${country.introduced_version} must not exceed current VERSION ${version}`,
    );

    const filename = rp4FilenameForCode(country.code);
    const pkg = JSON.parse(await readFile(new URL(`../data/${filename}`, import.meta.url), 'utf8'));

    assert.equal(pkg.country_id, country.code, `${filename}: country_id must match manifest code`);
    assert.equal(pkg.country_name_ru, country.name, `${filename}: country_name_ru must match manifest name`);
    assert.doesNotThrow(() => assertActiveResearchPackage(pkg), `${filename}: active RP4 contract`);

    const escapedVersion = country.introduced_version.replaceAll('.', '\\.');
    const releaseRow = deployment.match(new RegExp('^\\| `' + escapedVersion + '` \\| (.+) \\|$', 'm'));
    assert.ok(releaseRow, `${country.code}: DEPLOYMENT must contain release ${country.introduced_version}`);
    assert.ok(
      releaseRow[1].includes(country.name),
      `${country.code}: DEPLOYMENT ${country.introduced_version} must name ${country.name}`,
    );
  }
});

test('VERSION COUNTRIES component equals active-country manifest count', async () => {
  const manifest = await readActiveCountryManifest();
  const [countries] = versionTuple(version);
  assert.equal(
    manifest.length,
    countries,
    `VERSION ${version} requires ${countries} active countries, found ${manifest.length}`,
  );
});

test('manifest package order matches legacy runtime package order during migration', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  const declaration = app.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/);
  assert.ok(declaration, 'ACTIVE_RP4_PACKAGES declaration');
  const legacyPackages = [...declaration[1].matchAll(/'([A-Z]{2}-research-v4\.0\.json)'/g)]
    .map((match) => match[1]);

  assert.deepEqual(await activeRp4Filenames(), legacyPackages);
});
