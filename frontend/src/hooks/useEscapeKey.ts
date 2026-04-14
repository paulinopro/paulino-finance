import { useEffect, useRef } from 'react';

/**
 * Invokes onClose when Escape is pressed while enabled is true.
 * Uses a ref so the latest callback runs without re-subscribing every render.
 */
export function useEscapeKey(enabled: boolean, onClose: () => void) {
  const saved = useRef(onClose);
  saved.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        saved.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}
