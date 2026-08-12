import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CalculationContextLoadError,
  FX_CACHE_KEY,
  FX_ENDPOINT,
  REQUESTED_CURRENCIES,
  REQUIRED_CURRENCIES,
  loadCalculationContext,
} from '../pilot/fx-context.js';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const row = (quote, rate, date = '2026-08-11') => ({ quote, rate, date });
const requiredRows = (date = '2026-08-11') => [
  row('EUR', 0.86, date),
  row('ARS', 1320, date),
  row('RUB', 79, date),
];
const response = (rows) => ({ ok: true, json: async () => rows });
const network = (rows, extra = {}) => loadCalculationContext({
  fetchImpl: async () => response(rows),
  now: NOW,
  storage: null,
  ...extra,
});
const storageWith = (rows) => ({
  getItem: (key) => key === FX_CACHE_KEY ? JSON.stringify({ source: 'Frankfurter', rows }) : null,
  setItem() {},
});
const assertIncomplete = async (operation, message) => assert.rejects(operation, (error) => {
  assert.ok(error instanceof CalculationContextLoadError);
  assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
  if (message) assert.match(error.message, message);
  return true;
});

test('FX endpoint is generated from the single requested-currency list', () => {
  assert.deepEqual(REQUESTED_CURRENCIES, ['EUR', 'ARS', 'MXN', 'BRL', 'RUB', 'UYU']);
  assert.deepEqual(REQUIRED_CURRENCIES, ['EUR', 'ARS', 'RUB']);
  assert.equal(FX_ENDPOINT, `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${REQUESTED_CURRENCIES.join(',')}`);
});

test('complete network response retains all valid requested currencies', async () => {
  const context = await network([
    row('EUR', 0.86, '2026-08-10'), row('ARS', 1320), row('MXN', 18.6),
    row('BRL', 5.4), row('RUB', 79), row('UYU', 40.1), row('CAD', 1.3),
  ]);
  assert.deepEqual(context.fx.rates, { EUR: 0.86, ARS: 1320, MXN: 18.6, BRL: 5.4, RUB: 79, UYU: 40.1 });
  assert.equal(context.fx.base_currency, 'USD');
  assert.equal(context.fx.source, 'Frankfurter');
  assert.equal(context.fx.as_of, '2026-08-10');
});

test('optional UYU may be absent without coupling current runtime countries to it', async () => {
  const context = await network([...requiredRows(), row('MXN', 18.6), row('BRL', 5.4)]);
  assert.equal(context.fx.rates.UYU, undefined);
  assert.deepEqual(
    Object.fromEntries(REQUIRED_CURRENCIES.map((quote) => [quote, context.fx.rates[quote]])),
    { EUR: 0.86, ARS: 1320, RUB: 79 },
  );
});

test('malformed optional rows are omitted without failing the loader', async () => {
  const context = await network([
    ...requiredRows(), row('UYU', 0), row('MXN', 18.6, 'not-a-date'), row('BRL', 5.4),
  ]);
  assert.equal(context.fx.rates.UYU, undefined);
  assert.equal(context.fx.rates.MXN, undefined);
  assert.equal(context.fx.rates.BRL, 5.4);
});

test('missing required RUB preserves the existing incomplete-context error contract', async () => {
  await assertIncomplete(() => network([row('EUR', 0.86), row('ARS', 1320)]), /RUB/);
});

test('required dates alone control as_of and an older optional UYU remains usable', async () => {
  const context = await network([
    row('EUR', 0.86, '2026-08-11'), row('ARS', 1320, '2026-08-11'),
    row('RUB', 79, '2026-08-11'), row('UYU', 40.1, '2026-07-01'),
  ]);
  assert.equal(context.fx.rates.UYU, 40.1);
  assert.equal(context.fx.as_of, '2026-08-11');
});

test('stale and excessively future-dated required network contexts keep the common error code', async () => {
  await assertIncomplete(() => network(requiredRows('2026-08-01'), { maxAgeHours: 96 }), /устарел/);
  await assertIncomplete(() => network(requiredRows('2026-08-14'), { maxAgeHours: 96 }), /устарел/);
});

test('saved fallback without required RUB is rejected', async () => {
  const storage = storageWith([row('EUR', 0.86, '2020-01-01'), row('ARS', 1320, '2020-01-01')]);
  await assertIncomplete(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW, storage }));
});

test('saved fallback without optional UYU is accepted without adding cache freshness validation', async () => {
  const storage = storageWith(requiredRows('2020-01-01'));
  const context = await loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW, storage });
  assert.equal(context.fx.is_saved_fallback, true);
  assert.equal(context.fx.as_of, '2020-01-01');
  assert.equal(context.fx.rates.UYU, undefined);
  assert.deepEqual(context.fx.rates, { EUR: 0.86, ARS: 1320, RUB: 79 });
});
