import { useEffect, RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mantiene el foco dentro del panel del modal (Tab / Shift+Tab) y enfoca el primer control al abrir.
 */
export function useModalFocusTrap(panelRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const root = panelRef.current;
    if (!root) return;

    const getFocusable = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0
      );

    const focusFirst = () => {
      const nodes = getFocusable();
      if (nodes.length) nodes[0].focus();
    };

    const t = window.setTimeout(focusFirst, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = getFocusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, panelRef]);
}
