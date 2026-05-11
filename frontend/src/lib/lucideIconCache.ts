import type { LucideIcon } from 'lucide-react';
import { ALL_LUCIDE_ICON_ENTRIES, LUCIDE_DYNAMIC_IMPORTS } from './lucideDynamicRegistry';

/**
 * Los SVG se empaquetan en el build (import() → chunks JS locales servidos por la misma app).
 * Aquí los precargamos en memoria para que el selector no muestre parpadeos por celda.
 */
const resolved = new Map<string, LucideIcon>();
const expectedCount = ALL_LUCIDE_ICON_ENTRIES.length;

let prefetchPromise: Promise<void> | null = null;

function runPrefetchBatches(): Promise<void> {
  const kebabs = ALL_LUCIDE_ICON_ENTRIES.map((e) => e.kebab);
  const batchSize = 160;
  return (async () => {
    for (let i = 0; i < kebabs.length; i += batchSize) {
      const slice = kebabs.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async (kebab) => {
          if (resolved.has(kebab)) return;
          const mod = await LUCIDE_DYNAMIC_IMPORTS[kebab]();
          resolved.set(kebab, mod.default);
        })
      );
    }
  })();
}

export function isLucideIconCacheComplete(): boolean {
  return resolved.size >= expectedCount;
}

export function getResolvedLucideIcon(kebab: string): LucideIcon | undefined {
  return resolved.get(kebab);
}

/** Precarga todos los módulos de ícono en memoria (desde chunks del propio bundle). */
export function prefetchAllLucideIcons(): Promise<void> {
  if (resolved.size >= expectedCount) return Promise.resolve();
  if (!prefetchPromise) {
    prefetchPromise = runPrefetchBatches().finally(() => {
      prefetchPromise = null;
    });
  }
  return prefetchPromise;
}
