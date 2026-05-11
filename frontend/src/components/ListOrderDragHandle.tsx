import React from 'react';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type GripBinder = Pick<
  React.ComponentPropsWithoutRef<'button'>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
>;

type Props = {
  itemId: number;
  disabled?: boolean;
  gripBinder: (itemId: number) => GripBinder;
  className?: string;
};

/**
 * Asa táctil y de ratón: captura puntero y coordina zonas `[data-list-order-item]` en cada tarjeta.
 */
const ListOrderDragHandle: React.FC<Props> = ({ itemId, disabled, gripBinder, className = '' }) => {
  const { t } = useTranslation();
  if (disabled) return null;

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = gripBinder(itemId);

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={[
        'inline-flex min-h-[44px] min-w-[40px] shrink-0 items-center justify-center rounded-lg text-dark-500',
        'touch-none select-none cursor-grab active:cursor-grabbing',
        'hover:bg-dark-700/60 hover:text-dark-200 [-webkit-touch-callout:none]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={t('common.reorder.title')}
      aria-label={t('common.reorder.aria')}
    >
      <GripVertical className="h-5 w-5 pointer-events-none" aria-hidden />
    </button>
  );
};

export default ListOrderDragHandle;
