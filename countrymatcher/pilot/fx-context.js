export const REQUESTED_CURRENCIES = Object.freeze(['EUR', 'ARS', 'MXN', 'BRL', 'RUB', 'UYU']);
export const REQUIRED_CURRENCIES = Object.freeze(['EUR', 'ARS', 'RUB', 'UYU']);
export const FX_ENDPOINT = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${REQUESTED_CURRENCIES.join(',')}`;
export const FX_CACHE_KEY = 'country-matcher-last-fx-context-v1';
export const FX_FALLBACK_URL = new URL('../data/fx-fallback.json', import.meta.url);

export class CalculationContextLoadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CalculationContextLoadError';
    this.code = 'CALCULATION_CONTEXT_INCOMPLETE';
    this.details = details;
  }
}

function parseRates(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.rates
    ? Object.entries(payload.rates).map(([quote, rate]) => ({ quote, rate, date: payload.date ?? payload.as_of }))
    : [payload];
  const rates = {};
  const dates = {};
  const requested = new Set(REQUESTED_CURRENCIES);
  for (const row of rows) {
    const quote = row?.quote;
    if (!requested.has(quote)) continue;
    const rate = Number(row?.rate);
    const date = row?.date ?? row?.as_of;
    if (!(rate > 0) || !date || !Number.isFinite(Date.parse(date))) continue;
    rates[quote] = rate;
    dates[quote] = date;
  }
  for (const quote of REQUIRED_CURRENCIES) {
    if (!(rates[quote] > 0)) {
      throw new CalculationContextLoadError(`Источник валютного курса не вернул корректный курс ${quote}.`, { currency: quote });
    }
  }
  const asOf = REQUIRED_CURRENCIES.map((quote) => dates[quote])
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
  return { rates, asOf };
}

function availableStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

function readSavedContext(storage, now) {
  try {
    const saved = JSON.parse(storage?.getItem(FX_CACHE_KEY) || 'null');
    const { rates, asOf } = parseRates(saved?.rows);
    return {
      calculation_date: now.toISOString(),
      engine_version: '7.1.2',
      fx: { base_currency: 'USD', rates, source: saved.source || 'Frankfurter — последний доступный курс', as_of: asOf, max_age_hours: null, is_saved_fallback: true },
    };
  } catch { return null; }
}

function contextFromBundled(payload, now) {
  if (payload?.base_currency !== 'USD') throw new CalculationContextLoadError('Резервный валютный контекст имеет неверную базовую валюту.');
  const { rates, asOf } = parseRates(payload);
  for (const currency of REQUESTED_CURRENCIES) {
    if (!(Number.isFinite(rates[currency]) && rates[currency] > 0)) {
      throw new CalculationContextLoadError(`Резервный валютный контекст не содержит корректный курс ${currency}.`, { currency });
    }
  }
  return {
    calculation_date: now.toISOString(),
    engine_version: '7.1.2',
    fx: { base_currency: 'USD', rates, source: payload.source || 'Frankfurter — резервный курс', as_of: asOf, max_age_hours: null, is_bundled_fallback: true },
  };
}

export async function loadCalculationContext({ fetchImpl = globalThis.fetch, fallbackFetchImpl = globalThis.fetch, fallbackUrl = FX_FALLBACK_URL, bundledFallback, now = new Date(), maxAgeHours = 96, storage } = {}) {
  const cache = availableStorage(storage);
  try {
    const response = await fetchImpl(FX_ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!response?.ok) throw new CalculationContextLoadError(`Источник валютного курса недоступен (HTTP ${response?.status ?? 'unknown'}).`);
    const { rates, asOf } = parseRates(await response.json());
    const ageMs = now.getTime() - Date.parse(asOf);
    if (ageMs > maxAgeHours * 3600000 || ageMs < -24 * 3600000) {
      throw new CalculationContextLoadError('Доступный валютный курс устарел.', { asOf, maxAgeHours });
    }
    const context = {
      calculation_date: now.toISOString(),
      engine_version: '7.1.2',
      fx: { base_currency: 'USD', rates, source: 'Frankfurter', as_of: asOf, max_age_hours: maxAgeHours },
    };
    try {
      cache?.setItem(FX_CACHE_KEY, JSON.stringify({
        source: 'Frankfurter',
        rows: Object.entries(rates).map(([quote, rate]) => ({ quote, rate, date: asOf })),
      }));
    } catch { /* A full or disabled browser store must not break calculation. */ }
    return context;
  } catch (error) {
    const saved = readSavedContext(cache, now);
    if (saved) return saved;
    try {
      let payload = bundledFallback;
      if (!payload) {
        const fallbackResponse = await fallbackFetchImpl(fallbackUrl, { headers: { Accept: 'application/json' } });
        if (!fallbackResponse?.ok) throw new Error(`HTTP ${fallbackResponse?.status ?? 'unknown'}`);
        payload = await fallbackResponse.json();
      }
      return contextFromBundled(payload, now);
    } catch (fallbackError) {
      throw new CalculationContextLoadError(`${error?.message || 'Live-курс недоступен'} Резервный курс также недоступен.`, {
        currency: fallbackError?.details?.currency || error?.details?.currency,
        cause: error?.message,
        fallbackCause: fallbackError?.message,
      });
    }
  }
}
