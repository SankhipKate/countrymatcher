const CURRENCY_LABEL_OVERRIDES = Object.freeze({ CLF: 'UF' });

export function formatCurrency(amount, code = 'USD') {
  const numeric = Number(amount ?? 0);
  const displayAmount = numeric !== 0 && Math.abs(numeric) < 0.01 ? Math.sign(numeric) * 0.01 : numeric;
  const fractionDigits = Math.abs(displayAmount) < 100 && displayAmount !== 0 ? 2 : 0;
  const labelOverride = CURRENCY_LABEL_OVERRIDES[code];
  if (labelOverride) {
    const formatted = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    }).format(displayAmount);
    return `${formatted} ${labelOverride}`;
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: code, minimumFractionDigits: 0, maximumFractionDigits: fractionDigits,
  }).format(displayAmount);
}

export const monetaryPeriodSuffix = (period) => ({
  MONTHLY: '/мес', ANNUAL: '/год', YEARLY: '/год', ONE_TIME: '',
})[period] || '';

export function runtimeUsdAmount(amount, currency, context) {
  if (currency === 'USD') return Number(amount);
  const base = context?.fx?.base_currency;
  const rate = (code) => code === base ? 1 : Number(context?.fx?.rates?.[code]);
  const sourceRate = rate(currency);
  const usdRate = rate('USD');
  if (!(sourceRate > 0) || !(usdRate > 0) || !Number.isFinite(Number(amount))) return null;
  const converted = Number(amount) / sourceRate * usdRate;
  if (!Number.isFinite(converted)) return null;
  return converted < 1000 ? Math.round(converted)
    : converted < 100000 ? Math.round(converted / 10) * 10 : Math.round(converted / 100) * 100;
}

export function formatMonetaryAmount({ amount, currency, period = null }, context, { includePeriod = true } = {}) {
  const suffix = includePeriod ? monetaryPeriodSuffix(period) : '';
  const local = `${formatCurrency(amount, currency)}${suffix}`;
  const usd = currency === 'USD' ? null : runtimeUsdAmount(amount, currency, context);
  return usd == null ? local : `${local} (${formatCurrency(usd, 'USD')}${suffix})`;
}

export function formatRequirementText(requirement, context) {
  const text = String(requirement?.condition_ru ?? '');
  if (!requirement?.display_amount) return text;
  return text.replace('{display_amount}', formatMonetaryAmount(requirement.display_amount, context));
}
