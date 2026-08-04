export const ROUTE_STATUSES = Object.freeze({
  SUITABLE: 'SUITABLE',
  SUITABLE_WITH_CONDITIONS: 'SUITABLE_WITH_CONDITIONS',
  UNSUITABLE: 'UNSUITABLE',
});

export const STATUS_LABELS_RU = Object.freeze({
  SUITABLE: 'Подходит',
  SUITABLE_WITH_CONDITIONS: 'Подходит с условиями',
  UNSUITABLE: 'Не подходит',
});

export const COUNTRY_GROUP_LABELS_RU = Object.freeze({
  SUITABLE: 'Подходит',
  SUITABLE_WITH_CONDITIONS: 'Подходит с условиями',
  UNSUITABLE: 'Не подходит',
});

export const CONFLICT_SEVERITY_RANK = Object.freeze({
  UNSUITABLE: 3,
  SUITABLE_WITH_CONDITIONS: 2,
  SUITABLE: 1,
});

export const SELECTION_PREFERENCE_RANK = Object.freeze({
  SUITABLE: 3,
  SUITABLE_WITH_CONDITIONS: 2,
  UNSUITABLE: 1,
});

export function resolveStatusConflict(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS;
  for (const status of statuses) {
    if (!(status in CONFLICT_SEVERITY_RANK)) throw new TypeError(`Unknown route status: ${status}`);
  }
  return statuses.reduce((strictest, current) =>
    CONFLICT_SEVERITY_RANK[current] > CONFLICT_SEVERITY_RANK[strictest] ? current : strictest
  );
}
