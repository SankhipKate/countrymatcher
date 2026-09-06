import { readFile } from 'node:fs/promises';
import {
  activeRp4FilenamesFromManifest,
  rp4FilenameForCode,
} from '../../js/active-country-manifest.js';

export { rp4FilenameForCode };

const appRoot = new URL('../../', import.meta.url);

export async function readActiveCountryManifest() {
  return JSON.parse(await readFile(new URL('data/active-countries.json', appRoot), 'utf8'));
}

export async function activeRp4Filenames() {
  const manifest = await readActiveCountryManifest();
  return activeRp4FilenamesFromManifest(manifest);
}

export async function readActiveRp4Packages() {
  const filenames = await activeRp4Filenames();
  return Promise.all(filenames.map(async (filename) => JSON.parse(
    await readFile(new URL(`data/${filename}`, appRoot), 'utf8'),
  )));
}
