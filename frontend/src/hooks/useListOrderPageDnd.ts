import { useCallback, useRef, useState } from 'react';
import { arrayMove } from '../utils/arrayMove';
import { mergePageIntoFullOrder } from '../utils/persistedListOrder';

type Commit<T> = (next: T[]) => void;

export type ListOrderDragGhost = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export type UseListOrderPageDndOptions<T> = {
  ghostLabel?: (item: T) => string | undefined | null;
};

const DATA_ATTR = 'data-list-order-item';

function findDropTargetUnderPoint(clientX: number, clientY: number, validIds: ReadonlySet<number>): number | null {
  let stack: Element[] = [];
  try {
    stack = document.elementsFromPoint(clientX, clientY);
  } catch {
    return null;
  }
  for (const el of stack) {
    const node = el.closest(`[${DATA_ATTR}]`);
    if (!node) continue;
    const raw = node.getAttribute(DATA_ATTR);
    const id = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(id) || !validIds.has(id)) continue;
    return id;
  }
  return null;
}

/**
 * Reordenamiento por puntero (ratón y táctil) dentro de la página visible.
 * La API Drag & Drop clásica no es fiable en móvil/iOS.
 */
export function useListOrderPageDnd<T extends { id: number }>(
  paged: T[],
  startIndex: number,
  fullOrdered: T[],
  onCommit: Commit<T>,
  options?: UseListOrderPageDndOptions<T>
) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [pointerOverItemId, setPointerOverItemId] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<ListOrderDragGhost | null>(null);

  const pagedRef = useRef(paged);
  pagedRef.current = paged;
  const startIndexRef = useRef(startIndex);
  startIndexRef.current = startIndex;
  const fullOrderedRef = useRef(fullOrdered);
  fullOrderedRef.current = fullOrdered;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const dragSourceRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const ghostPointerOffsetRef = useRef<{ ox: number; oy: number }>({ ox: 0, oy: 0 });

  const validIdsRef = useRef<ReadonlySet<number>>(new Set());
  validIdsRef.current = new Set(paged.map((p) => p.id));

  const resolveGhostLabel = useCallback((itemId: number): string => {
    const item = pagedRef.current.find((i) => i.id === itemId);
    if (!item) return `Ítem ${itemId}`;
    const fn = optionsRef.current?.ghostLabel;
    if (fn) {
      try {
        const t = fn(item);
        const s = t != null ? String(t).trim() : '';
        if (s) return s;
      } catch {
        /* noop */
      }
    }
    return `Ítem ${itemId}`;
  }, []);

  const tryCommitReorder = useCallback((sourceId: number, targetId: number) => {
    if (sourceId === targetId) return;
    const pg = pagedRef.current;
    const si = startIndexRef.current;
    const fo = fullOrderedRef.current;
    const commit = onCommitRef.current;
    const a = pg.findIndex((t) => t.id === sourceId);
    const b = pg.findIndex((t) => t.id === targetId);
    if (a < 0 || b < 0) return;
    const newPage = arrayMove(pg, a, b);
    const nextFull = mergePageIntoFullOrder(fo, si, newPage);
    commit(nextFull);
  }, []);

  const clearGhost = useCallback(() => setDragGhost(null), []);

  const finalizeDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;

      const sourceId = dragSourceRef.current;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }

      dragSourceRef.current = null;
      clearGhost();
      setDragId(null);

      if (sourceId != null) {
        const overId = findDropTargetUnderPoint(e.clientX, e.clientY, validIdsRef.current);
        setPointerOverItemId(null);
        if (overId != null && sourceId !== overId) {
          tryCommitReorder(sourceId, overId);
        }
      } else {
        setPointerOverItemId(null);
      }
    },
    [tryCommitReorder, clearGhost]
  );

  const onGripPointerDown = useCallback(
    (itemId: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      finalizedRef.current = false;
      dragSourceRef.current = itemId;
      setDragId(itemId);
      setPointerOverItemId(itemId);

      const card = e.currentTarget.closest?.(`[${DATA_ATTR}]`) ?? null;
      let gx = e.clientX;
      let gy = e.clientY;
      let gw = Math.min(Math.max(window.innerWidth - 32, 200), 360);
      let gh = 120;
      let ox = 24;
      let oy = 32;

      if (card instanceof HTMLElement) {
        const rect = card.getBoundingClientRect();
        gw = rect.width;
        gh = rect.height;
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        gx = rect.left;
        gy = rect.top;
      }

      ghostPointerOffsetRef.current = { ox, oy };

      const label = resolveGhostLabel(itemId);
      setDragGhost({
        x: gx,
        y: gy,
        width: gw,
        height: gh,
        label,
      });

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [resolveGhostLabel]
  );

  const onGripPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const src = dragSourceRef.current;
    if (src == null || finalizedRef.current) return;

    const { ox, oy } = ghostPointerOffsetRef.current;
    setDragGhost((prev) => {
      if (!prev) return prev;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
      const margin = 6;
      const maxX = Math.max(margin, vw - prev.width - margin);
      const maxY = Math.max(margin, vh - prev.height - margin);
      let nx = e.clientX - ox;
      let ny = e.clientY - oy;
      nx = Math.min(Math.max(margin, nx), maxX);
      ny = Math.min(Math.max(margin, ny), maxY);
      if (nx === prev.x && ny === prev.y) return prev;
      return { ...prev, x: nx, y: ny };
    });

    const overId = findDropTargetUnderPoint(e.clientX, e.clientY, validIdsRef.current);
    setPointerOverItemId((prev) => {
      const next = overId ?? null;
      return prev !== next ? next : prev;
    });

    if (e.pointerType === 'touch') {
      e.preventDefault();
    }
  }, []);

  const onGripPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (dragSourceRef.current != null && !finalizedRef.current) {
        finalizeDrag(e);
      }
    },
    [finalizeDrag]
  );

  const onGripPointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    dragSourceRef.current = null;
    clearGhost();
    setDragId(null);
    setPointerOverItemId(null);
  }, [clearGhost]);

  const gripBinder = useCallback(
    (itemId: number): Pick<
      React.ComponentPropsWithoutRef<'button'>,
      'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
    > => ({
      onPointerDown: onGripPointerDown(itemId),
      onPointerMove: onGripPointerMove,
      onPointerUp: onGripPointerUp,
      onPointerCancel: onGripPointerCancel,
    }),
    [onGripPointerCancel, onGripPointerDown, onGripPointerMove, onGripPointerUp]
  );

  const droppableAttr = useCallback((itemId: number): Record<string, string | number> => {
    return { [DATA_ATTR]: String(itemId) };
  }, []);

  return {
    dragId,
    dragGhost,
    pointerOverItemId,
    droppableAttr,
    gripBinder,
  };
}
