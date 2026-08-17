import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FX_ENDPOINT, REQUESTED_CURRENCIES } from '../pilot/fx-context.js';

const artifactRoot = resolve(process.argv[2] || '.pages-artifact');
const fallbackPath = resolve(artifactRoot, 'data/fx-fallback.json');
const response = await fetch(FX_ENDPOINT, { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`Frankfurter HTTP ${response.status}`);
const rows = await response.json();
const rates = {};
const dates = {};
for (const row of Array.isArray(rows) ? rows : []) {
  if (!REQUESTED_CURRENCIES.includes(row?.quote) || !(Number(row?.rate) > 0) || !Number.isFinite(Date.parse(row?.date))) continue;
  rates[row.quote] = Number(row.rate);
  dates[row.quote] = row.date;
}
for (const currency of REQUESTED_CURRENCIES) if (!(rates[currency] > 0)) throw new Error(`Missing valid ${currency}`);
const existing = JSON.parse(await readFile(fallbackPath, 'utf8'));
const asOf = REQUESTED_CURRENCIES.map((currency) => dates[currency]).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
await writeFile(fallbackPath, `${JSON.stringify({ ...existing, base_currency: 'USD', source: 'Frankfurter — резервный курс', as_of: asOf, rates }, null, 2)}\n`);
console.log(`FX fallback refreshed: ${asOf}`);
