export const ROUTE_PRESENTATION_GROUPS = Object.freeze({
  SUITABLE: 'SUITABLE',
  SUITABLE_WITH_CONDITIONS: 'SUITABLE_WITH_CONDITIONS',
  REQUIRES_SEPARATE_BASIS: 'REQUIRES_SEPARATE_BASIS',
  INTERNATIONAL_PROTECTION: 'INTERNATIONAL_PROTECTION',
  UNSUITABLE: 'UNSUITABLE',
});

export const ROUTE_PRESENTATION_LABELS_RU = Object.freeze({
  SUITABLE: 'Подходит',
  SUITABLE_WITH_CONDITIONS: 'Подходит с условиями',
  REQUIRES_SEPARATE_BASIS: 'Требует отдельного основания',
  INTERNATIONAL_PROTECTION: 'Международная защита',
  UNSUITABLE: 'Не подходит',
});

export const ROUTE_PRESENTATION_RANK = Object.freeze({
  SUITABLE: 0,
  SUITABLE_WITH_CONDITIONS: 1,
  REQUIRES_SEPARATE_BASIS: 2,
  INTERNATIONAL_PROTECTION: 3,
  UNSUITABLE: 4,
});

export const routePresentationGroup = (route) => route?.presentationGroup || route?.routeStatus;
