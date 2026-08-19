export const FX_BASE_CURRENCY = 'USD';
export const FX_ENDPOINT_BASE = 'https://api.frankfurter.dev/v2/rates';
export const FX_CACHE_KEY = 'country-matcher-last-fx-context-v1';
export const FX_FALLBACK_URL = new URL('../data/fx-fallback.json', import.meta.url);

const CURRENCY_CODE = /^[A-Z]{3}$/;
const LIVE_SOURCE = 'Frankfurter';
const SAVED_SOURCE = 'Frankfurter — сохранённый курс';
const BUNDLED_SOURCE = 'Frankfurter — резервный курс';

export function collectCurrencyCodes(value) {
  const currencies = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if ((key === 'currency' || key === 'country_currency') && typeof child === 'string' && CURRENCY_CODE.test(child)) {
        currencies.add(child);
      }
      visit(child);
    }
  };
  visit(value);
  return [...currencies];
}

export function collectQuestionnaireCurrencyCodes(markupSources = []) {
  const sources = Array.isArray(markupSources) ? markupSources : [markupSources];
  const currencies = new Set();
  const selectPattern = /<select\b[^>]*\bid=(['"])[^'"]*Currency\1[^>]*>([\s\S]*?)<\/select>/gi;
  const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    for (const selectMatch of source.matchAll(selectPattern)) {
      const options = selectMatch[2];
      for (const optionMatch of options.matchAll(optionPattern)) {
        const attributes = optionMatch[1] || '';
        const valueMatch = attributes.match(/\bvalue\s*=\s*(['"]?)([A-Z]{3})\1/i);
        const text = String(optionMatch[2] || '').replace(/<[^>]*>/g, '').trim().toUpperCase();
        const code = valueMatch?.[2]?.toUpperCase() || text;
        if (CURRENCY_CODE.test(code)) currencies.add(code);
      }
    }
  }
  return [...currencies];
}

export function normalizeFxCurrencies(currencies = []) {
  return [...new Set(currencies)]
    .filter((currency) => typeof currency === 'string' && CURRENCY_CODE.test(currency))
    .filter((currency) => currency !== FX_BASE_CURRENCY)
    .sort();
}

export function buildFxEndpoint() {
  return `${FX_ENDPOINT_BASE}?base=${FX_BASE_CURRENCY}`;
}

function rowsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.rates && typeof payload.rates === 'object') {
    return Object.entries(payload.rates).map(([quote, rate]) => ({
      quote,
      rate,
      date: payload?.dates?.[quote] ?? payload.date ?? payload.as_of,
    }));
  }
  return payload ? [payload] : [];
}

function parseRates(payload, requestedCurrencies) {
  const requested = new Set(normalizeFxCurrencies(requestedCurrencies));
  const rates = {};
  const dates = {};
  for (const row of rowsFromPayload(payload)) {
    const quote = row?.quote;
    if (!requested.has(quote)) continue;
    const rate = Number(row?.rate);
    const date = row?.date ?? row?.as_of;
    if (!(rate > 0) || !date || !Number.isFinite(Date.parse(date))) continue;
    rates[quote] = rate;
    dates[quote] = date;
  }
  return { rates, dates };
}

function availableStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function readSavedRates(storage, currencies) {
  try {
    const saved = JSON.parse(storage?.getItem(FX_CACHE_KEY) || 'null');
    const parsed = parseRates(saved?.rows, currencies);
    return { ...parsed, source: SAVED_SOURCE };
  } catch {
    return { rates: {}, dates: {}, source: SAVED_SOURCE };
  }
}

function readBundledRates(payload, currencies) {
  if (!payload || payload.base_currency !== FX_BASE_CURRENCY) {
    return { rates: {}, dates: {}, source: BUNDLED_SOURCE };
  }
  const parsed = parseRates(payload, currencies);
  return { ...parsed, source: payload.source || BUNDLED_SOURCE };
}

function isFreshLiveDate(date, now, maxAgeHours) {
  const ageMs = now.getTime() - Date.parse(date);
  return ageMs <= maxAgeHours * 3600000 && ageMs >= -24 * 3600000;
}

function oldestDate(dates) {
  const valid = Object.values(dates).filter((date) => Number.isFinite(Date.parse(date)));
  if (!valid.length) return null;
  return valid.sort((left, right) => Date.parse(left) - Date.parse(right))[0];
}

function sourceLabel(sourceKinds, savedSource = SAVED_SOURCE, bundledSource = BUNDLED_SOURCE) {
  if (sourceKinds.size === 1 && sourceKinds.has('live')) return LIVE_SOURCE;
  if (sourceKinds.size === 1 && sourceKinds.has('saved')) return savedSource;
  if (sourceKinds.size === 1 && sourceKinds.has('bundled')) return bundledSource;
  if (sourceKinds.has('live')) return 'Frankfurter + резервный курс';
  if (sourceKinds.size) return 'Frankfurter — резервные курсы';
  return null;
}

function warn(logger, message, error) {
  try {
    logger?.warn?.(`[CountryMatcher FX] ${message}`, error);
  } catch { /* Logging itself must never affect calculation. */ }
}

function writeSavedRates(storage, currencies, live, saved) {
  try {
    const rows = [];
    for (const currency of normalizeFxCurrencies(currencies)) {
      const liveRate = live.rates[currency];
      const savedRate = saved.rates[currency];
      if (liveRate > 0) rows.push({ quote: currency, rate: liveRate, date: live.dates[currency] });
      else if (savedRate > 0) rows.push({ quote: currency, rate: savedRate, date: saved.dates[currency] });
    }
    if (rows.length) storage?.setItem(FX_CACHE_KEY, JSON.stringify({ source: SAVED_SOURCE, rows }));
  } catch { /* A full or disabled browser store must not break calculation. */ }
}

export function summarizeFxContext(fx = {}, currencies = []) {
  const usedCurrencies = normalizeFxCurrencies(currencies);
  if (!usedCurrencies.length) return { currencies: [], as_of: null, source: null };

  const dates = {};
  const kinds = new Set();
  let savedSource = SAVED_SOURCE;
  let bundledSource = BUNDLED_SOURCE;
  for (const currency of usedCurrencies) {
    const date = fx.rate_dates?.[currency];
    if (date && Number.isFinite(Date.parse(date))) dates[currency] = date;
    const kind = fx.rate_source_kinds?.[currency];
    if (kind) kinds.add(kind);
    const label = fx.rate_sources?.[currency];
    if (kind === 'saved' && label) savedSource = label;
    if (kind === 'bundled' && label) bundledSource = label;
  }

  const hasDetailedMetadata = Object.keys(fx.rate_dates || {}).length > 0 || Object.keys(fx.rate_source_kinds || {}).length > 0;
  return {
    currencies: usedCurrencies,
    as_of: oldestDate(dates) ?? (!hasDetailedMetadata ? fx.as_of ?? null : null),
    source: sourceLabel(kinds, savedSource, bundledSource) ?? (!hasDetailedMetadata ? fx.source ?? null : null),
  };
}

export function hasCompleteFxOutage(fx = {}) {
  const requested = Array.isArray(fx.requested_currencies) ? fx.requested_currencies : [];
  const missing = Array.isArray(fx.missing_currencies) ? fx.missing_currencies : [];
  return requested.length > 0 && missing.length >= requested.length;
}

export async function loadCalculationContext({
  currencies = [],
  fetchImpl = globalThis.fetch,
  fallbackFetchImpl = globalThis.fetch,
  fallbackUrl = FX_FALLBACK_URL,
  bundledFallback,
  now = new Date(),
  maxAgeHours = 96,
  storage,
  logger = console,
} = {}) {
  const requestedCurrencies = normalizeFxCurrencies(currencies);
  const cache = availableStorage(storage);
  const saved = readSavedRates(cache, requestedCurrencies);
  let live = { rates: {}, dates: {} };

  if (requestedCurrencies.length) {
    try {
      const response = await fetchImpl(buildFxEndpoint(), { headers: { Accept: 'application/json' } });
      if (response?.ok) {
        const parsed = parseRates(await response.json(), requestedCurrencies);
        for (const currency of requestedCurrencies) {
          if (parsed.rates[currency] > 0 && isFreshLiveDate(parsed.dates[currency], now, maxAgeHours)) {
            live.rates[currency] = parsed.rates[currency];
            live.dates[currency] = parsed.dates[currency];
          }
        }
      } else {
        warn(logger, `Frankfurter live request returned HTTP ${response?.status ?? 'unknown'}.`, null);
      }
    } catch (error) {
      warn(logger, 'Frankfurter live request failed; continuing with saved/bundled fallback.', error);
    }
  }

  writeSavedRates(cache, requestedCurrencies, live, saved);

  const missingBeforeBundled = requestedCurrencies.filter((currency) => !(live.rates[currency] > 0) && !(saved.rates[currency] > 0));
  let bundled = { rates: {}, dates: {}, source: BUNDLED_SOURCE };
  if (missingBeforeBundled.length) {
    try {
      let payload = bundledFallback;
      if (!payload) {
        const fallbackResponse = await fallbackFetchImpl(fallbackUrl, { headers: { Accept: 'application/json' } });
        if (fallbackResponse?.ok) payload = await fallbackResponse.json();
        else warn(logger, `Bundled FX fallback returned HTTP ${fallbackResponse?.status ?? 'unknown'}.`, null);
      }
      bundled = readBundledRates(payload, requestedCurrencies);
    } catch (error) {
      warn(logger, 'Bundled FX fallback could not be read; missing currencies remain local to affected countries.', error);
    }
  }

  const rates = {};
  const dates = {};
  const rateSources = {};
  const rateSourceKinds = {};
  const sourceKinds = new Set();
  for (const currency of requestedCurrencies) {
    if (live.rates[currency] > 0) {
      rates[currency] = live.rates[currency];
      dates[currency] = live.dates[currency];
      rateSources[currency] = LIVE_SOURCE;
      rateSourceKinds[currency] = 'live';
      sourceKinds.add('live');
    } else if (saved.rates[currency] > 0) {
      rates[currency] = saved.rates[currency];
      dates[currency] = saved.dates[currency];
      rateSources[currency] = saved.source;
      rateSourceKinds[currency] = 'saved';
      sourceKinds.add('saved');
    } else if (bundled.rates[currency] > 0) {
      rates[currency] = bundled.rates[currency];
      dates[currency] = bundled.dates[currency];
      rateSources[currency] = bundled.source;
      rateSourceKinds[currency] = 'bundled';
      sourceKinds.add('bundled');
    }
  }

  const missingCurrencies = requestedCurrencies.filter((currency) => !(rates[currency] > 0));
  return {
    calculation_date: now.toISOString(),
    engine_version: '7.2.0',
    fx: {
      base_currency: FX_BASE_CURRENCY,
      rates,
      source: sourceLabel(sourceKinds, saved.source, bundled.source),
      as_of: oldestDate(dates),
      rate_dates: dates,
      rate_sources: rateSources,
      rate_source_kinds: rateSourceKinds,
      max_age_hours: maxAgeHours,
      requested_currencies: requestedCurrencies,
      missing_currencies: missingCurrencies,
      is_saved_fallback: sourceKinds.has('saved'),
      is_bundled_fallback: sourceKinds.has('bundled'),
    },
  };
}
