function displayedGroup(country) {
  return country?.bestRoute?.presentationGroup || country?.bestRoute?.routeStatus;
}

function ascendingRank(value, values) {
  if (!Number.isFinite(value)) return null;
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  const index = sorted.findIndex((candidate) => candidate >= value);
  return index < 0 ? null : index + 1;
}

export function selectWorstSuitableCountry(countries, metrics) {
  const orderedCountries = Array.isArray(countries) ? countries : [];
  const suitableCountries = orderedCountries.filter((country) => displayedGroup(country) === 'SUITABLE');
  if (suitableCountries.length === 1) return suitableCountries[0];
  if (suitableCountries.length === 0) return orderedCountries[0] || null;

  const citizenshipValues = suitableCountries.map(metrics.citizenshipYears);
  const incomeValues = suitableCountries.map(metrics.incomeThreshold);

  return suitableCountries.reduce((selected, country) => {
    const citizenshipRank = ascendingRank(metrics.citizenshipYears(country), citizenshipValues);
    const incomeRank = ascendingRank(metrics.incomeThreshold(country), incomeValues);
    const score = citizenshipRank == null || incomeRank == null ? Number.NEGATIVE_INFINITY : citizenshipRank + incomeRank;
    return score > selected.score ? { country, score } : selected;
  }, { country: suitableCountries[0], score: Number.NEGATIVE_INFINITY }).country;
}
