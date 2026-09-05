import { readFile } from 'node:fs/promises';

const appRoot = new URL('../../', import.meta.url);

export function rp4FilenameForCode(code) {
  return `${code}-research-v4.0.json`;
}

export async function readActiveCountryManifest() {
  return JSON.parse(await readFile(new URL('data/active-countries.json', appRoot), 'utf8'));
}

export async function activeRp4Filenames() {
  const manifest = await readActiveCountryManifest();
  return manifest.map(({ code }) => rp4FilenameForCode(code));
}

export async function readActiveRp4Packages() {
  const filenames = await activeRp4Filenames();
  return Promise.all(filenames.map(async (filename) => JSON.parse(
    await readFile(new URL(`data/${filename}`, appRoot), 'utf8'),
  )));
}
