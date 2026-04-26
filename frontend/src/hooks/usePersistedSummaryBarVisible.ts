import { useCallback, useEffect, useState } from 'react';
import { loadSummaryBarVisible, saveSummaryBarVisible } from '../utils/summaryBarStorage';
import type { SummaryBarModuleKey } from '../utils/summaryBarModuleKeys';

/**
 * Muestra/oculta la barra de totales; persiste en localStorage por usuario y módulo.
 */
export function usePersistedSummaryBarVisible(
  userId: number | undefined,
  module: SummaryBarModuleKey
): { visible: boolean; setVisible: (v: boolean) => void; toggle: () => void } {
  const [visible, setVisibleState] = useState(() => {
    if (userId == null) return true;
    return loadSummaryBarVisible(userId, module);
  });

  useEffect(() => {
    if (userId == null) {
      setVisibleState(true);
      return;
    }
    setVisibleState(loadSummaryBarVisible(userId, module));
  }, [userId, module]);

  const setVisible = useCallback(
    (v: boolean) => {
      setVisibleState(v);
      if (userId != null) saveSummaryBarVisible(userId, module, v);
    },
    [userId, module]
  );

  const toggle = useCallback(() => {
    setVisibleState((prev) => {
      const next = !prev;
      if (userId != null) saveSummaryBarVisible(userId, module, next);
      return next;
    });
  }, [userId, module]);

  return { visible, setVisible, toggle };
}
