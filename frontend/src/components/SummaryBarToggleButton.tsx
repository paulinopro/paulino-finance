import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = {
  visible: boolean;
  onToggle: () => void;
  className?: string;
};

/** Icono solo: alterna visibilidad de la barra de totales (visible → ocultar con ojo tachado). */
const SummaryBarToggleButton: React.FC<Props> = ({ visible, onToggle, className = '' }) => {
  const label = visible ? 'Ocultar totales' : 'Mostrar totales';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-dark-600/80',
        'bg-dark-800/80 text-dark-300 transition-colors hover:border-dark-500 hover:bg-dark-700/80 hover:text-white',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/60',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={label}
      aria-label={label}
      aria-pressed={visible}
    >
      {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
    </button>
  );
};

export default SummaryBarToggleButton;
