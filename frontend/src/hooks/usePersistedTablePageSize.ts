import { useCallback, useEffect, useMemo, useState } from 'react';
import { mergeTablePageSizeOptions } from '../constants/pagination';

function readStoredPageSize(key: string, fallback: number, allowed: Set<number>): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || !allowed.has(n)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

/**
 * Tamaño de página de tabla con persistencia en localStorage.
 * Incluye `defaultSize` en las opciones aunque no esté en la lista base (p. ej. 8 o 12).
 */
export function usePersistedTablePageSize(
  storageKey: string,
  defaultSize: number
): {
  pageSize: number;
  setPageSize: (n: number) => void;
  pageSizeOptions: number[];
} {
  const pageSizeOptions = useMemo(() => mergeTablePageSizeOptions(defaultSize), [defaultSize]);

  const allowed = useMemo(() => new Set(pageSizeOptions), [pageSizeOptions]);

  const [pageSize, setPageSizeState] = useState(() =>
    readStoredPageSize(storageKey, defaultSize, allowed)
  );

  useEffect(() => {
    setPageSizeState(readStoredPageSize(storageKey, defaultSize, allowed));
  }, [storageKey, defaultSize, allowed]);

  const setPageSize = useCallback(
    (n: number) => {
      if (!allowed.has(n)) return;
      setPageSizeState(n);
      try {
        localStorage.setItem(storageKey, String(n));
      } catch {
        /* ignore */
      }
    },
    [allowed, storageKey]
  );

  return { pageSize, setPageSize, pageSizeOptions };
}
