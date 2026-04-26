import { useCallback, useState } from 'react';
import { arrayMove } from '../utils/arrayMove';
import { mergePageIntoFullOrder } from '../utils/persistedListOrder';

type Commit<T> = (next: T[]) => void;

/**
 * DnD HTML5 reordenando solo dentro de la página visible; aplica el resultado
 * a la lista completa ya ordenada y confirma con ids.
 */
export function useListOrderPageDnd<T extends { id: number }>(
  paged: T[],
  startIndex: number,
  fullOrdered: T[],
  onCommit: Commit<T>
) {
  const [dragId, setDragId] = useState<number | null>(null);

  const onDragStart = useCallback(
    (id: number) => (e: React.DragEvent) => {
      setDragId(id);
      e.dataTransfer.setData('text/plain', String(id));
      e.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const onDragEnd = useCallback(() => {
    setDragId(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (targetId: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragId;
      if (from == null || from === targetId) {
        setDragId(null);
        return;
      }
      const a = paged.findIndex((t) => t.id === from);
      const b = paged.findIndex((t) => t.id === targetId);
      if (a < 0 || b < 0) {
        setDragId(null);
        return;
      }
      const newPage = arrayMove(paged, a, b);
      const nextFull = mergePageIntoFullOrder(fullOrdered, startIndex, newPage);
      onCommit(nextFull);
      setDragId(null);
    },
    [dragId, paged, startIndex, fullOrdered, onCommit]
  );

  return { dragId, onDragStart, onDragEnd, onDragOver, onDrop };
}
