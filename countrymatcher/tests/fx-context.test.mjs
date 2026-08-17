import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CalculationContextLoadError,
  FX_CACHE_KEY,
  FX_ENDPOINT,
  FX_FALLBACK_URL,
  REQUESTED_CURRENCIES,
  REQUIRED_CURRENCIES,
  loadCalculationContext,
} from '../pilot/fx-context.js';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const row = (quote, rate, date = '2026-08-11') => ({ quote, rate, date });
const requiredRows = (date = '2026-08-11') => [
  row('EUR', 0.86, date),
  row('ARS', 1320, date),
  row('MXN', 18.6, date),
  row('BRL', 5.4, date),
  row('RUB', 79, date),
  row('UYU', 40.1, date),
  row('PYG', 6250, date),
];
const bundled = (rates = { EUR: 0.86, ARS: 1320, MXN: 18.6, BRL: 5.4, RUB: 79, UYU: 40.1, PYG: 6250 }) => ({
  base_currency: 'USD', source: 'Frankfurter — резервный курс', as_of: '2026-08-01', rates,
});
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
  assert.deepEqual(REQUESTED_CURRENCIES, ['EUR', 'ARS', 'MXN', 'BRL', 'RUB', 'UYU', 'PYG']);
  assert.deepEqual(REQUIRED_CURRENCIES, ['EUR', 'ARS', 'MXN', 'BRL', 'RUB', 'UYU', 'PYG']);
  assert.equal(FX_ENDPOINT, `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${REQUESTED_CURRENCIES.join(',')}`);
  assert.equal(FX_FALLBACK_URL.href, new URL('../data/fx-fallback.json', new URL('../pilot/fx-context.js', import.meta.url)).href);
});

test('complete network response retains all valid requested currencies', async () => {
  const context = await network([
    row('EUR', 0.86, '2026-08-10'), row('ARS', 1320), row('MXN', 18.6),
    row('BRL', 5.4), row('RUB', 79), row('UYU', 40.1), row('PYG', 6250), row('CAD', 1.3),
  ]);
  assert.deepEqual(context.fx.rates, { EUR: 0.86, ARS: 1320, MXN: 18.6, BRL: 5.4, RUB: 79, UYU: 40.1, PYG: 6250 });
  assert.equal(context.fx.base_currency, 'USD');
  assert.equal(context.fx.source, 'Frankfurter');
  assert.equal(context.fx.as_of, '2026-08-10');
});

test('missing or malformed required UYU rejects the network context', async () => {
  const withoutUyu = requiredRows().filter(({ quote }) => quote !== 'UYU');
  await assert.rejects(() => network(withoutUyu), (error) => {
    assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
    assert.equal(error.details.currency, 'UYU');
    return true;
  });
  await assertIncomplete(() => network([...withoutUyu, row('UYU', 0)]), /UYU/);
});

test('missing or malformed required PYG rejects the network context', async () => {
  const withoutPyg = requiredRows().filter(({ quote }) => quote !== 'PYG');
  await assert.rejects(() => network(withoutPyg), (error) => {
    assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
    assert.equal(error.details.currency, 'PYG');
    return true;
  });
  await assertIncomplete(() => network([...withoutPyg, row('PYG', 0)]), /PYG/);
});

test('missing or malformed required BRL rejects the network context', async () => {
  const withoutBrl = requiredRows().filter(({ quote }) => quote !== 'BRL');
  await assert.rejects(() => network(withoutBrl), (error) => {
    assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
    assert.equal(error.details.currency, 'BRL');
    return true;
  });
  await assertIncomplete(() => network([...withoutBrl, row('BRL', 0)]), /BRL/);
});

test('missing or malformed required MXN rejects the network context', async () => {
  const withoutMxn = requiredRows().filter(({ quote }) => quote !== 'MXN');
  await assert.rejects(() => network(withoutMxn), (error) => {
    assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
    assert.equal(error.details.currency, 'MXN');
    return true;
  });
  await assertIncomplete(() => network([...withoutMxn, row('MXN', 0)]), /MXN/);
});

test('missing required RUB preserves the existing incomplete-context error contract', async () => {
  await assertIncomplete(() => network(requiredRows().filter(({ quote }) => quote !== 'RUB')), /RUB/);
});

test('an older required UYU controls as_of', async () => {
  const context = await network([
    row('EUR', 0.86, '2026-08-11'), row('ARS', 1320, '2026-08-11'),
    row('MXN', 18.6, '2026-08-11'), row('BRL', 5.4, '2026-08-11'),
    row('RUB', 79, '2026-08-11'), row('UYU', 40.1, '2026-07-01'), row('PYG', 6250, '2026-08-11'),
  ], { maxAgeHours: 2000 });
  assert.equal(context.fx.rates.UYU, 40.1);
  assert.equal(context.fx.as_of, '2026-07-01');
});

test('stale and excessively future-dated required network contexts keep the common error code', async () => {
  await assertIncomplete(() => network(requiredRows('2026-08-01'), { maxAgeHours: 96 }), /устарел/);
  await assertIncomplete(() => network(requiredRows('2026-08-14'), { maxAgeHours: 96 }), /устарел/);
  const staleUyu = requiredRows().map((item) => item.quote === 'UYU' ? row('UYU', 40.1, '2026-08-01') : item);
  await assertIncomplete(() => network(staleUyu, { maxAgeHours: 96 }), /устарел/);
});

test('saved fallback without required RUB is rejected', async () => {
  const storage = storageWith(requiredRows('2020-01-01').filter(({ quote }) => quote !== 'RUB'));
  await assertIncomplete(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW, storage }));
});

test('saved fallback without required UYU is rejected', async () => {
  const rows = requiredRows('2020-01-01').filter(({ quote }) => quote !== 'UYU');
  const storage = storageWith(rows);
  await assertIncomplete(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW, storage }));
});

test('saved fallback without required PYG is rejected', async () => {
  const rows = requiredRows('2020-01-01').filter(({ quote }) => quote !== 'PYG');
  const storage = storageWith(rows);
  await assertIncomplete(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW, storage }));
});

test('saved fallback with all required active-country currencies is accepted without cache freshness validation', async () => {
  const storage = storageWith(requiredRows('2020-01-01'));
  const context = await loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW, storage });
  assert.equal(context.fx.is_saved_fallback, true);
  assert.equal(context.fx.as_of, '2020-01-01');
  assert.deepEqual(context.fx.rates, { EUR: 0.86, ARS: 1320, MXN: 18.6, BRL: 5.4, RUB: 79, UYU: 40.1, PYG: 6250 });
});

test('healthy live and saved cache precede the bundled fallback', async () => {
  const live = await loadCalculationContext({ fetchImpl: async () => response(requiredRows()), bundledFallback: bundled(), now: NOW });
  assert.equal(live.fx.source, 'Frankfurter');
  const saved = await loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, storage: storageWith(requiredRows('2020-01-01')), bundledFallback: bundled(), now: NOW });
  assert.equal(saved.fx.is_saved_fallback, true);
});

test('valid bundled fallback is the dated final calculation source and retains requested currencies', async () => {
  const context = await loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, storage: null, bundledFallback: bundled(), now: NOW });
  assert.equal(context.fx.is_bundled_fallback, true);
  assert.equal(context.fx.source, 'Frankfurter — резервный курс');
  assert.equal(context.fx.as_of, '2026-08-01');
  assert.deepEqual(Object.keys(context.fx.rates), REQUESTED_CURRENCIES);
});

test('malformed bundled fallback and a required currency missing everywhere fail explicitly', async () => {
  await assertIncomplete(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, storage: null, bundledFallback: { nope: true }, now: NOW }));
  await assert.rejects(() => loadCalculationContext({ fetchImpl: async () => response(requiredRows().filter(({ quote }) => quote !== 'UYU')), storage: null, bundledFallback: bundled({ EUR: 0.86, ARS: 1320, MXN: 18.6, BRL: 5.4, RUB: 79, PYG: 6250 }), now: NOW }), (error) => {
    assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
    assert.equal(error.details.currency, 'UYU');
    return true;
  });
});

test('bundled fallback requires active-country MXN without changing live/cache semantics', async () => {
  for (const currency of ['MXN']) {
    const missing = bundled();
    delete missing.rates[currency];
    await assert.rejects(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, storage: null, bundledFallback: missing, now: NOW }), (error) => {
      assert.equal(error.code, 'CALCULATION_CONTEXT_INCOMPLETE');
      assert.equal(error.details.currency, currency);
      return true;
    });
    const malformed = bundled({ ...bundled().rates, [currency]: 0 });
    await assert.rejects(() => loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, storage: null, bundledFallback: malformed, now: NOW }), (error) => {
      assert.equal(error.details.currency, currency);
      return true;
    });
  }
  const liveWithoutOptional = await network(requiredRows());
  assert.equal(liveWithoutOptional.fx.source, 'Frankfurter');
  const savedWithoutOptional = await loadCalculationContext({ fetchImpl: async () => { throw new Error('offline'); }, storage: storageWith(requiredRows('2020-01-01')), bundledFallback: bundled(), now: NOW });
  assert.equal(savedWithoutOptional.fx.is_saved_fallback, true);
});
