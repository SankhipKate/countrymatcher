import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFxEndpoint, FX_BASE_CURRENCY } from '../pilot/fx-context.js';

const CURRENCY_CODE = /^[A-Z]{3}$/;
const artifactRoot = resolve(process.argv[2] || '.pages-artifact');
const dataRoot = resolve(artifactRoot, 'data');
const fallbackPath = resolve(dataRoot, 'fx-fallback.json');
const existing = JSON.parse(await readFile(fallbackPath, 'utf8'));

const response = await fetch(buildFxEndpoint(), { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`Frankfurter HTTP ${response.status}`);
const rows = await response.json();

const rates = {};
const dates = {};
for (const [rawCurrency, rawRate] of Object.entries(existing?.rates || {})) {
  const currency = String(rawCurrency || '').toUpperCase();
  const rate = Number(rawRate);
  const previousDate = existing?.dates?.[currency] ?? existing?.as_of;
  if (!CURRENCY_CODE.test(currency) || currency === FX_BASE_CURRENCY || !(rate > 0) || !Number.isFinite(Date.parse(previousDate))) continue;
  rates[currency] = rate;
  dates[currency] = previousDate;
}

let fetchedCount = 0;
for (const row of Array.isArray(rows) ? rows : []) {
  const currency = String(row?.quote || '').toUpperCase();
  const rate = Number(row?.rate);
  const date = row?.date;
  if (!CURRENCY_CODE.test(currency) || currency === FX_BASE_CURRENCY || !(rate > 0) || !Number.isFinite(Date.parse(date))) continue;
  fetchedCount += 1;
  if (dates[currency] && Date.parse(date) < Date.parse(dates[currency])) continue;
  rates[currency] = rate;
  dates[currency] = date;
}
if (!fetchedCount) throw new Error('Frankfurter returned no valid current rates');

const sortedCurrencies = Object.keys(rates).sort();
const sortedRates = Object.fromEntries(sortedCurrencies.map((currency) => [currency, rates[currency]]));
const sortedDates = Object.fromEntries(sortedCurrencies.map((currency) => [currency, dates[currency]]));
const validDates = Object.values(sortedDates).filter((date) => Number.isFinite(Date.parse(date)));
const asOf = validDates.length ? validDates.sort((a, b) => Date.parse(a) - Date.parse(b))[0] : null;

await writeFile(fallbackPath, `${JSON.stringify({
  ...existing,
  base_currency: FX_BASE_CURRENCY,
  source: 'Frankfurter — резервный курс',
  as_of: asOf,
  dates: sortedDates,
  rates: sortedRates,
}, null, 2)}\n`);
console.log(`FX fallback refreshed: ${fetchedCount} live currencies, ${sortedCurrencies.length} stored, oldest ${asOf || 'unknown'}`);
