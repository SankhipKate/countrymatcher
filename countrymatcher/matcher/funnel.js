const MATCHED_STATUSES = new Set([
  'SUITABLE',
  'SUITABLE_WITH_CONDITIONS',
]);

export const FUNNEL_STATES = Object.freeze({
  FREE_COUNTRY: 'FREE_COUNTRY',
  ZERO_MATCH: 'ZERO_MATCH',
  ERROR: 'ERROR',
});

export function usesSingularVerb(count) {
  const absoluteCount = Math.abs(Number(count));
  return absoluteCount % 10 === 1 && absoluteCount % 100 !== 11;
}

function pluralRu(count, one, few, many) {
  const absoluteCount = Math.abs(Number(count));
  const mod10 = absoluteCount % 10;
  const mod100 = absoluteCount % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function routeCounter(count, singularVerb, pluralVerb, suffix = '') {
  const routeWord = pluralRu(count, 'маршрут', 'маршрута', 'маршрутов');
  const verb = usesSingularVerb(count) ? singularVerb : pluralVerb;
  return `${count} ${routeWord} ${verb}${suffix ? ` ${suffix}` : ''}`;
}

const routeCount = (count) => `${count} ${pluralRu(count, 'маршрут', 'маршрута', 'маршрутов')}`;

const bestRouteGroup = (result) => (
  result?.bestRoute?.presentationGroup
  || result?.bestRoute?.routeStatus
  || result?.presentationGroup
  || result?.routeStatus
  || 'UNSUITABLE'
);

export function summarizeCountries(calculation) {
  const summary = { suitable: 0, conditional: 0, separateBasis: 0 };
  for (const result of Array.isArray(calculation?.results) ? calculation.results : []) {
    const groups = new Set((result.routes || []).map(bestRouteGroup));
    if (groups.has('SUITABLE')) summary.suitable += 1;
    if (groups.has('SUITABLE_WITH_CONDITIONS')) summary.conditional += 1;
    if (groups.has('REQUIRES_SEPARATE_BASIS') || groups.has('INTERNATIONAL_PROTECTION')) summary.separateBasis += 1;
  }
  return summary;
}

export function countrySummaryHeading(calculation) {
  return 'Результат расчёта';
}

export const countryCount = (count) => `${count} ${pluralRu(count, 'страна', 'страны', 'стран')}`;
export const additionalCountriesText = (count) => `Ещё ${countryCount(count)}`;
export const countryLocative = (count) => `${count} ${pluralRu(count, 'стране', 'странах', 'странах')}`;

function hasValidResults(calculation) {
  return Array.isArray(calculation?.results)
    && calculation.results.length > 0
    && calculation.results.every((result) => {
      if (!result || typeof result !== 'object') return false;
      if (!result.country || typeof result.country !== 'object') return false;
      if (!Array.isArray(result.routes)) return false;

      const noEvaluableRoutes = result.evaluationState === 'NO_EVALUABLE_ROUTES'
        && result.bestRoute === null
        && result.routes.length === 0;
      const evaluatedResult = result.bestRoute
        && typeof result.bestRoute === 'object'
        && typeof result.bestRoute.routeStatus === 'string';

      return Boolean(noEvaluableRoutes || evaluatedResult);
    });
}

export function summarizeCalculation(calculation) {
  const results = Array.isArray(calculation?.results) ? calculation.results : [];
  let countries = 0;
  let suitableRoutes = 0;
  let conditionalRoutes = 0;
  let separateBasisRoutes = 0;
  let unsuitableRoutes = 0;

  for (const result of results) {
    if (MATCHED_STATUSES.has(result?.bestRoute?.routeStatus)) countries += 1;
    for (const route of Array.isArray(result?.routes) ? result.routes : []) {
      const group = bestRouteGroup(route);
      if (group === 'SUITABLE') suitableRoutes += 1;
      if (group === 'SUITABLE_WITH_CONDITIONS') conditionalRoutes += 1;
      if (['REQUIRES_SEPARATE_BASIS', 'INTERNATIONAL_PROTECTION'].includes(group)) separateBasisRoutes += 1;
      if (group === 'UNSUITABLE') unsuitableRoutes += 1;
    }
  }

  return {
    countries,
    routes: suitableRoutes + conditionalRoutes + separateBasisRoutes,
    suitableRoutes,
    conditionalRoutes,
    separateBasisRoutes,
    unsuitableRoutes,
    totalEvaluatedRoutes: suitableRoutes + conditionalRoutes + separateBasisRoutes + unsuitableRoutes,
  };
}

export function teaserPresentation(calculation) {
  const counts = summarizeCalculation(calculation);
  const countryCounts = summarizeCountries(calculation);
  const connectedCountries = Array.isArray(calculation?.results) ? calculation.results.length : 0;
  const potentialRoutes = counts.conditionalRoutes + counts.separateBasisRoutes;

  if (counts.countries === 0) {
    return {
      countries: 0,
      routes: 0,
      suitableRoutes: 0,
      conditionalRoutes: 0,
      separateBasisRoutes: 0,
      unsuitableRoutes: counts.unsuitableRoutes,
      totalEvaluatedRoutes: counts.totalEvaluatedRoutes,
      heading: 'По вашим ответам среди подключённых сейчас маршрутов подходящих или потенциально подходящих вариантов нет.',
      text: 'Полный результат покажет причины, почему конкретные маршруты не подошли.',
      breakdown: [],
      countryCounts,
    };
  }

  return {
    ...counts,
    heading: countrySummaryHeading(calculation),
    text: '',
    countryCounts,
    breakdown: [
      `${countryCount(countryCounts.suitable)}:и ${routeCount(counts.suitableRoutes)}, ${usesSingularVerb(counts.suitableRoutes) ? 'который уже вам подходит' : 'которые уже вам подходят'}`,
      `${countryCount(connectedCountries)}:и ${routeCount(potentialRoutes)}, ${usesSingularVerb(potentialRoutes) ? 'в котором необходимо выполнить условие, либо по основанию, которое, возможно, у вас уже есть' : 'в которых необходимо выполнить условие, либо по основанию, которое, возможно, у вас уже есть'}`,
    ],
  };
}

export function deriveFunnelPresentation(calculation, sortCountriesForDisplay, selectFreeCountry) {
  const errors = Array.isArray(calculation?.errors) ? calculation.errors : [];
  if (!hasValidResults(calculation) || typeof sortCountriesForDisplay !== 'function') {
    return errors.length ? { state: FUNNEL_STATES.ERROR, errors } : { state: FUNNEL_STATES.ERROR };
  }

  const teaser = teaserPresentation(calculation);
  const matchedCountries = calculation.results.filter((result) => (
    MATCHED_STATUSES.has(result.bestRoute?.routeStatus)
  ));

  if (matchedCountries.length === 0) {
    if (errors.length) return { state: FUNNEL_STATES.ERROR, errors };
    return {
      state: FUNNEL_STATES.ZERO_MATCH,
      teaser,
    };
  }

  const sortedMatchedCountries = sortCountriesForDisplay(matchedCountries);
  const defaultFreeCountry = sortedMatchedCountries[0];
  const freeCountry = typeof selectFreeCountry === 'function'
    ? selectFreeCountry(sortedMatchedCountries)
    : defaultFreeCountry;
  if (!sortedMatchedCountries.includes(freeCountry)) return { state: FUNNEL_STATES.ERROR };
  if (!freeCountry) return { state: FUNNEL_STATES.ERROR };

  return {
    state: FUNNEL_STATES.FREE_COUNTRY,
    teaser,
    freeCountryMessage: 'Одна страна открыта бесплатно — полный разбор ниже.',
    lockedCountryCount: Math.max(0, sortedMatchedCountries.length - 1),
    ...(errors.length ? { errors } : {}),
    previewCalculation: { results: [freeCountry], ...(errors.length ? { errors } : {}) },
    lockedCountries: sortedMatchedCountries
      .filter((result) => result !== freeCountry)
      .map((result) => ({
        countryId: result.country.countryId,
        name: result.country.name,
      })),
    fullCalculation: calculation,
  };
}

export { MATCHED_STATUSES };
