import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildFxEndpoint,
  collectCurrencyCodes,
  collectQuestionnaireCurrencyCodes,
  FX_BASE_CURRENCY,
  FX_CACHE_KEY,
  FX_FALLBACK_URL,
  hasCompleteFxOutage,
  loadCalculationContext,
  normalizeFxCurrencies,
  summarizeFxContext,
} from '../pilot/fx-context.js';

const NOW = new Date('2026-08-12T00:00:00.000Z');
const row = (quote, rate, date = '2026-08-11') => ({ quote, rate, date });
const response = (rows) => ({ ok: true, json: async () => rows });
const bundled = (rates, dates = {}) => ({
  base_currency: 'USD',
  source: 'Frankfurter — резервный курс',
  as_of: '2026-08-01',
  dates,
  rates,
});

function memoryStorage(rows = []) {
  let value = rows.length ? JSON.stringify({ source: 'Frankfurter', rows }) : null;
  return {
    getItem(key) { return key === FX_CACHE_KEY ? value : null; },
    setItem(key, next) { if (key === FX_CACHE_KEY) value = String(next); },
    snapshot() { return value ? JSON.parse(value) : null; },
  };
}

const load = (currencies, rows, extra = {}) => loadCalculationContext({
  currencies,
  fetchImpl: async () => response(rows),
  fallbackFetchImpl: async () => ({ ok: false, status: 404 }),
  now: NOW,
  storage: null,
  logger: { warn() {} },
  ...extra,
});

test('FX currencies are discovered from RP4 currency fields instead of a country-specific manual list', () => {
  const packages = [
    { country_currency: 'EUR', nested: { currency: 'USD' } },
    { country_currency: 'CLP', tuition: { currency: 'CLP' } },
    { country_currency: 'UYU', note: { currency: null } },
  ];
  assert.deepEqual(collectCurrencyCodes(packages), ['EUR', 'USD', 'CLP', 'UYU']);
  assert.deepEqual(normalizeFxCurrencies([...collectCurrencyCodes(packages), 'RUB', 'USD']), ['CLP', 'EUR', 'RUB', 'UYU']);
  assert.equal(buildFxEndpoint(['EUR', 'CLP', 'USD', 'RUB']), 'https://api.frankfurter.dev/v2/rates?base=USD');
  assert.equal(FX_BASE_CURRENCY, 'USD');
  assert.equal(FX_FALLBACK_URL.href, new URL('../data/fx-fallback.json', new URL('../pilot/fx-context.js', import.meta.url)).href);
});


test('questionnaire currencies are discovered from actual currency selects instead of a second FX list', () => {
  const indexMarkup = '<select id="primaryCurrency"><option>USD</option><option>EUR</option><option>RUB</option></select>';
  const appMarkup = '<select id="${prefix}Currency"><option>USD</option><option value="EUR">Euro</option><option>RUB</option></select>';
  assert.deepEqual(collectQuestionnaireCurrencyCodes([indexMarkup, appMarkup]), ['USD', 'EUR', 'RUB']);
});

test('live endpoint deliberately requests all available Frankfurter rates so one bad local code cannot poison quotes', async () => {
  let requestedUrl = null;
  const context = await loadCalculationContext({
    currencies: ['EUR', 'ZZZ'],
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return response([row('EUR', 0.86)]);
    },
    bundledFallback: bundled({}),
    now: NOW,
    storage: null,
    logger: { warn() {} },
  });
  assert.equal(requestedUrl, 'https://api.frankfurter.dev/v2/rates?base=USD');
  assert.deepEqual(context.fx.rates, { EUR: 0.86 });
  assert.deepEqual(context.fx.missing_currencies, ['ZZZ']);
});

test('complete live response is used directly', async () => {
  const context = await load(['EUR', 'RUB', 'CLP'], [row('EUR', 0.86), row('RUB', 79), row('CLP', 930)]);
  assert.deepEqual(context.fx.rates, { CLP: 930, EUR: 0.86, RUB: 79 });
  assert.deepEqual(context.fx.missing_currencies, []);
  assert.equal(context.fx.source, 'Frankfurter');
  assert.equal(context.fx.as_of, '2026-08-11');
  assert.equal(context.fx.is_saved_fallback, false);
  assert.equal(context.fx.is_bundled_fallback, false);
});


test('indexed monetary units derive a USD rate through their quoted currency', async () => {
  const context = await loadCalculationContext({
    currencies: ['CLP', 'CLF'],
    fetchImpl: async () => response([row('CLP', 900)]),
    bundledFallback: bundled({}),
    indexedUnits: {
      units: {
        CLF: {
          quote_currency: 'CLP',
          quote_amount: 40865.87,
          as_of: '2026-08-12',
          source: 'SII — Unidad de Fomento',
        },
      },
    },
    now: NOW,
    storage: null,
    logger: { warn() {} },
  });

  assert.ok(Math.abs(context.fx.rates.CLF - (900 / 40865.87)) < 1e-12);
  assert.deepEqual(context.fx.missing_currencies, []);
  assert.equal(context.fx.rate_source_kinds.CLF, 'derived');
  assert.match(context.fx.rate_sources.CLF, /SII/);
  assert.equal(context.fx.rate_dates.CLF, '2026-08-11');
});

test('one missing live currency is filled from bundled fallback without discarding healthy live rates', async () => {
  const context = await load(['EUR', 'UYU'], [row('EUR', 0.86)], {
    bundledFallback: bundled({ EUR: 0.80, UYU: 40.1 }),
  });
  assert.deepEqual(context.fx.rates, { EUR: 0.86, UYU: 40.1 });
  assert.deepEqual(context.fx.missing_currencies, []);
  assert.equal(context.fx.source, 'Frankfurter + резервный курс');
  assert.equal(context.fx.as_of, '2026-08-01');
  assert.equal(context.fx.is_bundled_fallback, true);
});

test('stale or malformed live rows fall back independently while fresh rows stay live', async () => {
  const context = await load(['EUR', 'RUB', 'UYU'], [
    row('EUR', 0.86),
    row('RUB', 79, '2026-07-01'),
    row('UYU', 0),
  ], {
    bundledFallback: bundled({ RUB: 80, UYU: 40.2 }, { RUB: '2026-08-05', UYU: '2026-08-06' }),
  });
  assert.deepEqual(context.fx.rates, { EUR: 0.86, RUB: 80, UYU: 40.2 });
  assert.equal(context.fx.as_of, '2026-08-05');
});

test('saved browser rates fill individual holes before bundled fallback', async () => {
  const storage = memoryStorage([row('UYU', 39.5, '2020-01-01')]);
  const context = await loadCalculationContext({
    currencies: ['EUR', 'UYU'],
    fetchImpl: async () => response([row('EUR', 0.86)]),
    bundledFallback: bundled({ UYU: 40.2 }),
    now: NOW,
    storage,
    logger: { warn() {} },
  });
  assert.deepEqual(context.fx.rates, { EUR: 0.86, UYU: 39.5 });
  assert.equal(context.fx.is_saved_fallback, true);
  assert.equal(context.fx.is_bundled_fallback, false);
  assert.equal(context.fx.as_of, '2020-01-01');
});

test('partial live refresh preserves an older saved row instead of erasing it', async () => {
  const storage = memoryStorage([row('EUR', 0.8, '2026-08-01'), row('UYU', 39.5, '2026-08-02')]);
  await loadCalculationContext({
    currencies: ['EUR', 'UYU'],
    fetchImpl: async () => response([row('EUR', 0.86, '2026-08-11')]),
    bundledFallback: bundled({}),
    now: NOW,
    storage,
    logger: { warn() {} },
  });
  assert.deepEqual(storage.snapshot().rows, [
    row('EUR', 0.86, '2026-08-11'),
    row('UYU', 39.5, '2026-08-02'),
  ]);
});

test('a currency missing from live, saved, and bundled remains a local hole instead of failing the whole context', async () => {
  const context = await load(['EUR', 'CLP'], [row('EUR', 0.86)], {
    bundledFallback: bundled({ EUR: 0.8 }),
  });
  assert.deepEqual(context.fx.rates, { EUR: 0.86 });
  assert.deepEqual(context.fx.missing_currencies, ['CLP']);
  assert.equal(context.fx.source, 'Frankfurter');
});

test('invalid bundled fallback does not discard healthy live currencies', async () => {
  const context = await load(['EUR', 'CLP'], [row('EUR', 0.86)], {
    bundledFallback: { base_currency: 'EUR', rates: { CLP: 930 }, as_of: '2026-08-01' },
  });
  assert.deepEqual(context.fx.rates, { EUR: 0.86 });
  assert.deepEqual(context.fx.missing_currencies, ['CLP']);
});

test('offline live source can merge saved and bundled currencies', async () => {
  const storage = memoryStorage([row('EUR', 0.82, '2020-01-01')]);
  const context = await loadCalculationContext({
    currencies: ['EUR', 'UYU'],
    fetchImpl: async () => { throw new Error('offline'); },
    bundledFallback: bundled({ UYU: 40.2 }),
    now: NOW,
    storage,
    logger: { warn() {} },
  });
  assert.deepEqual(context.fx.rates, { EUR: 0.82, UYU: 40.2 });
  assert.equal(context.fx.source, 'Frankfurter — резервные курсы');
  assert.deepEqual(context.fx.missing_currencies, []);
});

test('no requested quotes produces a valid USD-only context without network dependency', async () => {
  let calls = 0;
  const context = await loadCalculationContext({
    currencies: ['USD'],
    fetchImpl: async () => { calls += 1; throw new Error('should not fetch'); },
    now: NOW,
    storage: null,
    logger: { warn() {} },
  });
  assert.equal(calls, 0);
  assert.deepEqual(context.fx.rates, {});
  assert.deepEqual(context.fx.requested_currencies, []);
  assert.deepEqual(context.fx.missing_currencies, []);
});

test('per-country FX summary is not poisoned by an old fallback used by another country', async () => {
  const context = await load(['EUR', 'UYU'], [row('EUR', 0.86, '2026-08-11')], {
    bundledFallback: bundled({ UYU: 40.2 }, { UYU: '2021-01-01' }),
  });
  assert.equal(context.fx.as_of, '2021-01-01');
  assert.deepEqual(summarizeFxContext(context.fx, ['EUR']), {
    currencies: ['EUR'],
    as_of: '2026-08-11',
    source: 'Frankfurter',
  });
  assert.deepEqual(summarizeFxContext(context.fx, ['UYU']), {
    currencies: ['UYU'],
    as_of: '2021-01-01',
    source: 'Frankfurter — резервный курс',
  });
  assert.deepEqual(summarizeFxContext(context.fx, ['EUR', 'UYU']), {
    currencies: ['EUR', 'UYU'],
    as_of: '2021-01-01',
    source: 'Frankfurter + резервный курс',
  });
});

test('saved browser-only rates are labelled as saved fallback, never as live Frankfurter', async () => {
  const storage = memoryStorage([row('EUR', 0.82, '2020-01-01')]);
  const context = await loadCalculationContext({
    currencies: ['EUR'],
    fetchImpl: async () => { throw new Error('offline'); },
    bundledFallback: bundled({}),
    now: NOW,
    storage,
    logger: { warn() {} },
  });
  assert.equal(context.fx.source, 'Frankfurter — сохранённый курс');
  assert.equal(context.fx.rate_sources.EUR, 'Frankfurter — сохранённый курс');
  assert.deepEqual(summarizeFxContext(context.fx, ['EUR']), {
    currencies: ['EUR'],
    as_of: '2020-01-01',
    source: 'Frankfurter — сохранённый курс',
  });
});

test('complete FX outage is explicit and has no fake source or date', async () => {
  const context = await loadCalculationContext({
    currencies: ['EUR', 'RUB'],
    fetchImpl: async () => { throw new Error('offline'); },
    fallbackFetchImpl: async () => ({ ok: false, status: 503 }),
    now: NOW,
    storage: null,
    logger: { warn() {} },
  });
  assert.deepEqual(context.fx.rates, {});
  assert.deepEqual(context.fx.missing_currencies, ['EUR', 'RUB']);
  assert.equal(context.fx.source, null);
  assert.equal(context.fx.as_of, null);
  assert.equal(hasCompleteFxOutage(context.fx), true);
  assert.deepEqual(summarizeFxContext(context.fx, ['EUR']), { currencies: ['EUR'], as_of: null, source: null });
});

test('partial FX holes are not classified as complete outage', async () => {
  const context = await load(['EUR', 'CLP'], [row('EUR', 0.86)], { bundledFallback: bundled({}) });
  assert.equal(hasCompleteFxOutage(context.fx), false);
});

test('fallback refresh stores every current Frankfurter currency independently of RP4 inventory', async () => {
  const script = await readFile(new URL('../scripts/refresh-fx-fallback.mjs', import.meta.url), 'utf8');
  assert.match(script, /buildFxEndpoint\(\)/);
  assert.match(script, /Object\.entries\(existing\?\.rates \|\| \{\}\)/);
  assert.match(script, /for \(const row of Array\.isArray\(rows\) \? rows : \[\]\)/);
  assert.match(script, /fetchedCount/);
  assert.match(script, /Date\.parse\(date\) < Date\.parse\(dates\[currency\]\)/);
  assert.doesNotMatch(script, /readdir\(dataRoot\)|collectCurrencyCodes|collectQuestionnaireCurrencyCodes|requestedCurrencies/);
  assert.doesNotMatch(script, /REQUESTED_CURRENCIES|REQUIRED_CURRENCIES|Missing valid/);
});

test('committed FX fallback is a broad universal reserve rather than the current RP4 currency subset', async () => {
  const fallback = JSON.parse(await readFile(new URL('../data/fx-fallback.json', import.meta.url), 'utf8'));
  const currencies = Object.keys(fallback.rates || {});
  assert.equal(fallback.base_currency, 'USD');
  assert.ok(currencies.length > 100, `expected broad Frankfurter reserve, got ${currencies.length} currencies`);
  for (const currency of ['ARS', 'BRL', 'CLP', 'COP', 'CRC', 'EUR', 'MXN', 'PYG', 'RUB', 'THB', 'UYU']) {
    assert.ok(Number(fallback.rates?.[currency]) > 0, `missing fallback rate for ${currency}`);
    assert.ok(Number.isFinite(Date.parse(fallback.dates?.[currency])), `missing fallback date for ${currency}`);
  }
});
