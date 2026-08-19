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

export const countryCount = (count) => `${count} ${pluralRu(count, 'страна', 'страны', 'стран')}`;
export const additionalCountriesText = (count) => `Ещё ${countryCount(count)}`;

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
  let unsuitableRoutes = 0;

  for (const result of results) {
    if (MATCHED_STATUSES.has(result?.bestRoute?.routeStatus)) countries += 1;
    for (const route of Array.isArray(result?.routes) ? result.routes : []) {
      if (route?.routeStatus === 'SUITABLE') suitableRoutes += 1;
      if (route?.routeStatus === 'SUITABLE_WITH_CONDITIONS') conditionalRoutes += 1;
      if (route?.routeStatus === 'UNSUITABLE') unsuitableRoutes += 1;
    }
  }

  return {
    countries,
    routes: suitableRoutes + conditionalRoutes,
    suitableRoutes,
    conditionalRoutes,
    unsuitableRoutes,
    totalEvaluatedRoutes: suitableRoutes + conditionalRoutes + unsuitableRoutes,
  };
}

export function teaserPresentation(calculation) {
  const counts = summarizeCalculation(calculation);

  if (counts.countries === 0) {
    return {
      countries: 0,
      routes: 0,
      suitableRoutes: 0,
      conditionalRoutes: 0,
      unsuitableRoutes: counts.unsuitableRoutes,
      totalEvaluatedRoutes: counts.totalEvaluatedRoutes,
      heading: 'По вашим ответам среди подключённых сейчас маршрутов подходящих или потенциально подходящих вариантов нет.',
      text: 'Полный результат покажет причины, почему конкретные маршруты не подошли.',
      breakdown: [],
    };
  }

  return {
    ...counts,
    heading: `Проверили ${counts.totalEvaluatedRoutes} ${pluralRu(counts.totalEvaluatedRoutes, 'миграционный маршрут', 'миграционных маршрута', 'миграционных маршрутов')} исходя из ваших ответов`,
    text: '',
    breakdown: [
      routeCounter(counts.suitableRoutes, 'подходит', 'подходят'),
      `${counts.conditionalRoutes} ${pluralRu(counts.conditionalRoutes, 'маршрут', 'маршрута', 'маршрутов')} — при выполнении условий`,
      counts.unsuitableRoutes ? routeCounter(counts.unsuitableRoutes, 'не подходит', 'не подходят') : null,
    ].filter(Boolean),
  };
}

export function deriveFunnelPresentation(calculation, sortCountriesForDisplay) {
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
  const [freeCountry] = sortedMatchedCountries;
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
  };
}

export { MATCHED_STATUSES };
