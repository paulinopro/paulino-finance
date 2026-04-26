import React from 'react';
import { GripVertical } from 'lucide-react';

type Props = {
  itemId: number;
  disabled?: boolean;
  onDragStart: (id: number) => (e: React.DragEvent) => void;
  onDragEnd: () => void;
  className?: string;
};

/**
 * Asa para reordenar tarjetas; el artículo contenedor recibe onDragOver + onDrop.
 */
const ListOrderDragHandle: React.FC<Props> = ({ itemId, disabled, onDragStart, onDragEnd, className = '' }) => {
  if (disabled) return null;
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart(itemId)}
      onDragEnd={onDragEnd}
      className={[
        'inline-flex min-h-[40px] min-w-[32px] shrink-0 items-center justify-center rounded-lg text-dark-500',
        'touch-none select-none cursor-grab active:cursor-grabbing',
        'hover:bg-dark-700/60 hover:text-dark-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title="Reordenar (arrastrar)"
      aria-label="Reordenar: arrastre para colocar en otro puesto de la página"
    >
      <GripVertical className="h-5 w-5" aria-hidden />
    </button>
  );
};

export default ListOrderDragHandle;
