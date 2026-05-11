const ICON_RE = /^[A-Z][a-zA-Z0-9]{1,62}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function assertLucideIconKey(raw: string): string {
  const s = String(raw).trim();
  if (!ICON_RE.test(s)) {
    throw new Error(
      'Ícono no válido (use nombre PascalCase de Lucide, p. ej. UtensilsCrossed o ShoppingBag)'
    );
  }
  return s;
}

function assertHexColor(raw: string): string {
  const s = String(raw).trim();
  if (!COLOR_RE.test(s)) {
    throw new Error('Color debe ser hex de 6 cifras, p. ej. #3b82f6');
  }
  return `#${s.slice(1).toLowerCase()}`;
}

/** Crear categoría: null si no viene o vacío */
export function resolveCategoryIconCreate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  return assertLucideIconKey(String(raw));
}

export function resolveCategoryColorCreate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  return assertHexColor(String(raw));
}

export function resolveCategoryIconUpdate(
  raw: unknown,
  previous: string | null
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  return assertLucideIconKey(String(raw));
}

export function resolveCategoryColorUpdate(
  raw: unknown,
  previous: string | null
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  return assertHexColor(String(raw));
}
