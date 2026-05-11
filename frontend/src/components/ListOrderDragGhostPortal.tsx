import React from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import type { ListOrderDragGhost } from '../hooks/useListOrderPageDnd';

type Props = {
  ghost: ListOrderDragGhost | null;
};

/**
 * Clon ligero que sigue al puntero mientras `useListOrderPageDnd` está activo.
 * Va en document.body (`pointer-events: none`).
 */
const ListOrderDragGhostPortal: React.FC<Props> = ({ ghost }) => {
  if (ghost == null || typeof document === 'undefined') return null;

  const node = (
    <div
      role="presentation"
      aria-hidden
      className="pointer-events-none fixed z-[2147483646] box-border rounded-2xl border border-primary-500/35 bg-dark-800/93 p-3 shadow-[0_22px_55px_-10px_rgba(0,0,0,0.85)] ring-2 ring-black/35 backdrop-blur-[2px]"
      style={{
        left: ghost.x,
        top: ghost.y,
        width: ghost.width,
        height: ghost.height,
      }}
    >
      <div className="flex h-full min-h-0 flex-col justify-center gap-2 overflow-hidden">
        <div className="flex min-h-0 items-start gap-2.5">
          <span className="mt-0.5 shrink-0 rounded-lg bg-dark-700/80 p-1.5 text-primary-400">
            <GripVertical className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 pt-0.5 text-[0.8125rem] font-semibold leading-snug tracking-tight text-white [word-break:break-word] line-clamp-4">
            {ghost.label}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default ListOrderDragGhostPortal;
