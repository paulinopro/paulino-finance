import { useCallback, useEffect, useMemo, useState } from 'react';
import { mergeIdOrderWithItems, loadSavedIdOrder, saveIdOrder } from '../utils/persistedListOrder';
import type { ListOrderModuleKey } from '../utils/listOrderModuleKeys';

/**
 * Mantiene un orden de ids por módulo en localStorage, por usuario.
 * Los registros nuevos (no presentes al guardar) se añaden al final.
 */
export function usePersistedIdOrder<T extends { id: number }>({
  module,
  userId,
  sourceItems,
}: {
  module: ListOrderModuleKey;
  userId: number | undefined;
  sourceItems: T[];
}): { ordered: T[]; setOrderByIds: (ids: number[]) => void } {
  const [orderIds, setOrderIds] = useState<number[] | null>(() => {
    if (userId == null) return null;
    return loadSavedIdOrder(userId, module);
  });

  useEffect(() => {
    if (userId == null) {
      setOrderIds(null);
      return;
    }
    setOrderIds(loadSavedIdOrder(userId, module));
  }, [userId, module]);

  const ordered = useMemo(
    () => mergeIdOrderWithItems(sourceItems, orderIds),
    [sourceItems, orderIds]
  );

  /** Sincronizar orden guardado con ids reales, sin borrar mientras `sourceItems` aún no cargó (suele ser `[]` al inicio). */
  useEffect(() => {
    if (userId == null || !orderIds?.length) return;
    if (sourceItems.length === 0) return;
    const valid = new Set(sourceItems.map((r) => r.id));
    const pruned = orderIds.filter((id) => valid.has(id));
    if (pruned.length === orderIds.length) return;
    setOrderIds(pruned.length ? pruned : null);
    if (pruned.length) {
      saveIdOrder(userId, module, pruned);
    } else {
      saveIdOrder(userId, module, []);
    }
  }, [userId, module, sourceItems, orderIds]);

  const setOrderByIds = useCallback(
    (ids: number[]) => {
      if (userId == null) return;
      setOrderIds(ids);
      saveIdOrder(userId, module, ids);
    },
    [userId, module]
  );

  return { ordered, setOrderByIds };
}
