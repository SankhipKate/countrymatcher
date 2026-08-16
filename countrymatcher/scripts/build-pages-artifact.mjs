import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputRoot = resolve(process.argv[2] || resolve(appRoot, '.pages-artifact'));
const files = [
  '.nojekyll', 'index.html', 'payment-config.js',
  'assets', 'landing', 'matcher', 'pilot', 'js',
  'data/ES-research-v4.0.json', 'data/AR-research-v4.0.json', 'data/UY-research-v4.0.json',
  'data/quality-of-life-ru.json', 'data/fx-fallback.json', 'data/schemas/user-profile-v1.schema.json',
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const relative of files) {
  const destination = resolve(outputRoot, relative);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(resolve(appRoot, relative), destination, { recursive: true });
}
console.log(`Pages artifact built at ${outputRoot}`);
