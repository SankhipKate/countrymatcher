export const DRAFT_VERSION = 4;

export function prepareDraftForRestore(stored) {
  if (!stored || typeof stored !== 'object' || !stored.answers || typeof stored.answers !== 'object') return null;
  if (stored.version !== DRAFT_VERSION) return null;
  return stored;
}
