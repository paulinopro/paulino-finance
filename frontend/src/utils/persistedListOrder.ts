import type { ListOrderModuleKey } from './listOrderModuleKeys';

const STORAGE_PREFIX = 'paulino:listOrder:v1:';

function key(userId: number, module: ListOrderModuleKey) {
  return `${STORAGE_PREFIX}${userId}:${module}`;
}

export function loadSavedIdOrder(userId: number, module: ListOrderModuleKey): number[] | null {
  try {
    const raw = localStorage.getItem(key(userId, module));
    if (raw == null) return null;
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return null;
    const out = p.filter((x) => typeof x === 'number' && Number.isInteger(x) && x > 0) as number[];
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function saveIdOrder(userId: number, module: ListOrderModuleKey, order: number[]) {
  try {
    if (order.length === 0) {
      localStorage.removeItem(key(userId, module));
      return;
    }
    localStorage.setItem(key(userId, module), JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

/**
 * Aplica un orden guardado: primero los ids en `saved` que sigan existiendo,
 * luego el resto en el orden original de `items`.
 */
export function mergeIdOrderWithItems<T extends { id: number }>(items: T[], saved: number[] | null): T[] {
  if (!items.length) return items;
  if (!saved || saved.length === 0) return items;
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const out: T[] = [];
  const used = new Set<number>();
  for (const id of saved) {
    const row = byId.get(id);
    if (row) {
      out.push(row);
      used.add(id);
    }
  }
  for (const it of items) {
    if (!used.has(it.id)) out.push(it);
  }
  return out;
}

/** Sustituye un tramo reordenado (p. ej. página) dentro de la lista completa. */
export function mergePageIntoFullOrder<T>(full: T[], start: number, newPage: T[]): T[] {
  const end = start + newPage.length;
  return [...full.slice(0, start), ...newPage, ...full.slice(end)];
}
