import type { SummaryBarModuleKey } from './summaryBarModuleKeys';

const STORAGE_PREFIX = 'paulino:summaryBar:v1:';

function key(userId: number, module: SummaryBarModuleKey) {
  return `${STORAGE_PREFIX}${userId}:${module}`;
}

/** Por defecto la barra de totales es visible. */
export function loadSummaryBarVisible(userId: number, module: SummaryBarModuleKey): boolean {
  try {
    const raw = localStorage.getItem(key(userId, module));
    if (raw == null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function saveSummaryBarVisible(userId: number, module: SummaryBarModuleKey, visible: boolean) {
  try {
    localStorage.setItem(key(userId, module), visible ? '1' : '0');
  } catch {
    /* ignore */
  }
}
