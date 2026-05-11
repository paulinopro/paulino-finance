import type { LucideIcon } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

/** Mapa oficial de cargas diferidas Lucide (`kebab-case` → importer). */
export type LucideDynamicImporterMap = Record<string, () => Promise<{ default: LucideIcon }>>;

export const LUCIDE_DYNAMIC_IMPORTS = dynamicIconImports as LucideDynamicImporterMap;

/** `utensils-crossed` → `UtensilsCrossed` */
export function lucideKebabToPascal(kebab: string): string {
  return kebab
    .split('-')
    .map((segment) => {
      if (!segment) return '';
      if (/^[0-9]+$/.test(segment)) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join('');
}

const pascalByKebab: Record<string, string> = {};

/** Lista ordenada (PascalCase, kebab): incluye todas las piezas disponibles en `dynamicIconImports`. */
export const ALL_LUCIDE_ICON_ENTRIES: ReadonlyArray<{ kebab: string; pascal: string }> = (() => {
  const rows: { kebab: string; pascal: string }[] = [];
  for (const kebab of Object.keys(LUCIDE_DYNAMIC_IMPORTS)) {
    const pascal = lucideKebabToPascal(kebab);
    pascalByKebab[pascal] = kebab;
    rows.push({ kebab, pascal });
  }
  rows.sort((a, b) => a.pascal.localeCompare(b.pascal, 'en'));
  return rows;
})();

/** Nombre público PascalCase (guardado en API) → clave interna para import dinámico. */
export function lucidePascalToKebab(pascal: string): string | undefined {
  return pascalByKebab[pascal];
}
