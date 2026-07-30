export function formatCurrency(amount, code = 'USD') {
  const numeric = Number(amount ?? 0);
  const displayAmount = numeric !== 0 && Math.abs(numeric) < 0.01 ? Math.sign(numeric) * 0.01 : numeric;
  const fractionDigits = Math.abs(displayAmount) < 100 && displayAmount !== 0 ? 2 : 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(displayAmount);
}
