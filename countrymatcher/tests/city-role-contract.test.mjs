import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const dataRoot = new URL('../data/', import.meta.url);
const SIZE_ROLES = new Set(['LARGE', 'MEDIUM', 'SMALL']);

async function loadPackage(filename) {
  return JSON.parse(await readFile(new URL(filename, dataRoot), 'utf8'));
}

function integrityErrors(pkg) {
  const script = [
    "import importlib.util,json,sys",
    "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
    "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
    "print('\\n'.join(module.validate_integrity(json.load(sys.stdin))))",
  ].join(';');

  const result = spawnSync('python3', ['-c', script], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify(pkg),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('every RP4 city has exactly one LARGE, MEDIUM, or SMALL size role', async () => {
  const filenames = (await readdir(dataRoot))
    .filter((name) => /-research-v4\.0\.json$/.test(name))
    .sort();

  assert.ok(filenames.length > 0);

  for (const filename of filenames) {
    const pkg = await loadPackage(filename);

    for (const city of pkg.cities || []) {
      const sizeRoles = (city.structural_roles || [])
        .filter((role) => SIZE_ROLES.has(role));

      assert.equal(
        sizeRoles.length,
        1,
        `${pkg.country_id}/${city.city_id}: expected exactly one size role, got ${JSON.stringify(city.structural_roles)}`,
      );
    }
  }
});

test('schema itself requires exactly one LARGE, MEDIUM, or SMALL size role', async () => {
  const colombia = await loadPackage('CO-research-v4.0.json');

  const schemaErrors = (pkg) => {
    const script = [
      "import importlib.util,json,sys",
      "spec=importlib.util.spec_from_file_location('validator','data/validate-v4.0.py')",
      "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
      "print('\\n'.join(module.validate_schema(json.load(sys.stdin))))",
    ].join(';');

    const result = spawnSync('python3', ['-c', script], {
      cwd: new URL('..', import.meta.url),
      input: JSON.stringify(pkg),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  const capitalOnly = structuredClone(colombia);
  capitalOnly.cities.find((city) => city.city_id === 'CO_BOGOTA').structural_roles = ['CAPITAL'];
  assert.match(schemaErrors(capitalOnly), /structural_roles/);

  const multipleSizes = structuredClone(colombia);
  multipleSizes.cities.find((city) => city.city_id === 'CO_BOGOTA').structural_roles =
    ['CAPITAL', 'LARGE', 'MEDIUM'];
  assert.match(schemaErrors(multipleSizes), /structural_roles/);

  const valid = structuredClone(colombia);
  valid.cities.find((city) => city.city_id === 'CO_BOGOTA').structural_roles =
    ['CAPITAL', 'LARGE'];
  assert.equal(schemaErrors(valid), '');
});

test('validator rejects a CAPITAL-only city without a size role', async () => {
  const colombia = await loadPackage('CO-research-v4.0.json');
  const broken = structuredClone(colombia);

  const bogota = broken.cities.find(
    (city) => city.city_id === 'CO_BOGOTA',
  );

  assert.ok(bogota);
  bogota.structural_roles = ['CAPITAL'];

  assert.match(
    integrityErrors(broken),
    /every city requires exactly one size role from LARGE, MEDIUM, SMALL/,
  );
});

test('validator rejects a city with multiple size roles', async () => {
  const colombia = await loadPackage('CO-research-v4.0.json');
  const broken = structuredClone(colombia);

  const bogota = broken.cities.find(
    (city) => city.city_id === 'CO_BOGOTA',
  );

  assert.ok(bogota);
  bogota.structural_roles = ['CAPITAL', 'LARGE', 'MEDIUM'];

  assert.match(
    integrityErrors(broken),
    /every city requires exactly one size role from LARGE, MEDIUM, SMALL/,
  );
});
