/**
 * A partir de este ancho el shell usa sidebar persistente (sin drawer tipo móvil ni tab bar inferior).
 * Alineado con Tailwind `md` (768px): tablets e iPad en orientación típica entran aquí.
 */
export const LAYOUT_DESKTOP_SHELL_MIN_PX = 768;

export const LAYOUT_DESKTOP_SHELL_MEDIA = `(min-width: ${LAYOUT_DESKTOP_SHELL_MIN_PX}px)`;
