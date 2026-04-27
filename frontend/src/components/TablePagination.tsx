import React, { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_WINDOW = 5;

/** Números de página visibles (ventana deslizante), mismo criterio que Historial de Notificaciones */
export function getVisiblePaginationPages(
  totalPages: number,
  currentPage: number,
  windowSize: number = PAGE_WINDOW
): number[] {
  const count = Math.min(windowSize, totalPages);
  return Array.from({ length: count }, (_, i) => {
    if (totalPages <= windowSize) return i + 1;
    if (currentPage <= 3) return i + 1;
    if (currentPage >= totalPages - 2) return totalPages - windowSize + 1 + i;
    return currentPage - 2 + i;
  });
}

export type TablePaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /** Texto al final del resumen, p. ej. "notificaciones", "gastos", "meses" */
  itemLabel: string;
  disabled?: boolean;
  /** Si se pasa, se muestra un selector «Por página» y el pie puede verse aunque solo haya una página. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  /**
   * card: envoltorio `card-view` (Historial de Notificaciones).
   * embedded: solo el contenido interno (modales / bloques ya dentro de una tarjeta).
   * compact: campana del layout (mismo patrón, padding reducido).
   */
  variant?: 'card' | 'embedded' | 'compact';
  className?: string;
};

/**
 * Paginador unificado: mismo aspecto en PC y móvil que Historial de Notificaciones
 * (resumen, Anterior/Siguiente con chevrons, hasta 5 números de página con scroll horizontal si hace falta).
 */
const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  itemLabel,
  disabled = false,
  pageSizeOptions,
  onPageSizeChange,
  variant = 'card',
  className = '',
}) => {
  const pageSizeFieldId = useId();
  const showPageSize =
    Boolean(onPageSizeChange) && Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0;
  const showPageNav = totalPages > 1;

  if (totalItems <= 0 || (!showPageNav && !showPageSize)) return null;

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  const pages = showPageNav ? getVisiblePaginationPages(totalPages, currentPage) : [];

  const chevronSize = variant === 'compact' ? 18 : 20;
  const shellPad = variant === 'compact' ? 'p-2 sm:p-3' : variant === 'embedded' ? '' : 'p-3 sm:p-5';
  const cardShell = variant === 'card' ? `card-view ${shellPad}` : '';

  const summaryClass =
    variant === 'compact'
      ? 'min-w-0 flex-1 text-left text-[0.7rem] leading-relaxed text-dark-400 sm:text-xs'
      : 'min-w-0 flex-1 text-left text-xs leading-relaxed text-dark-400 sm:text-sm';

  const navRowClass =
    variant === 'compact'
      ? 'flex items-center gap-0.5 sm:gap-1'
      : 'flex items-center gap-1 sm:gap-2';

  const prevNextBtnClass =
    variant === 'compact'
      ? 'flex min-h-[40px] shrink-0 items-center justify-center gap-1 rounded-lg bg-dark-700 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-dark-600 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation sm:min-h-[44px] sm:px-2.5'
      : 'flex min-h-[44px] shrink-0 items-center justify-center gap-1 rounded-lg bg-dark-700 px-2.5 py-2 text-sm font-medium text-white transition-colors hover:bg-dark-600 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation sm:px-3';

  const numBtnClass = (active: boolean) =>
    variant === 'compact'
      ? `min-h-[40px] min-w-[36px] shrink-0 rounded-lg text-xs font-medium transition-colors touch-manipulation sm:min-h-[44px] sm:min-w-[40px] sm:text-sm ${
          active ? 'bg-primary-600 text-white' : 'bg-dark-700 text-white hover:bg-dark-600'
        } disabled:cursor-not-allowed disabled:opacity-50`
      : `min-h-[44px] min-w-[40px] shrink-0 rounded-lg text-sm font-medium transition-colors touch-manipulation sm:min-w-[44px] ${
          active ? 'bg-primary-600 text-white' : 'bg-dark-700 text-white hover:bg-dark-600'
        } disabled:cursor-not-allowed disabled:opacity-50`;

  const scrollPagesClass =
    variant === 'compact'
      ? 'flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto px-0.5 py-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] sm:min-h-[44px] sm:gap-1'
      : 'flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-1 py-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]';

  const pageSizeSelectClass =
    variant === 'compact'
      ? 'rounded-lg border border-dark-600 bg-dark-800 py-1.5 pl-2 pr-7 text-xs text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50'
      : 'rounded-lg border border-dark-600 bg-dark-800 py-2 pl-2.5 pr-8 text-sm text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50';

  const pageSizeLabelClass =
    variant === 'compact' ? 'text-[0.7rem] text-dark-400 sm:text-xs' : 'text-xs text-dark-400 sm:text-sm';

  const content = (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className={summaryClass}>
          Mostrando {start}–{end} de {totalItems} {itemLabel}
        </p>
        {showPageSize && (
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <label htmlFor={pageSizeFieldId} className={`whitespace-nowrap ${pageSizeLabelClass}`}>
              Por página
            </label>
            <select
              id={pageSizeFieldId}
              className={pageSizeSelectClass}
              value={itemsPerPage}
              disabled={disabled}
              aria-label="Registros por página"
              onChange={(e) => onPageSizeChange?.(parseInt(e.target.value, 10))}
            >
              {pageSizeOptions!.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {showPageNav && (
        <div className={navRowClass}>
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || disabled}
            aria-label="Página anterior"
            className={prevNextBtnClass}
          >
            <ChevronLeft size={chevronSize} className="shrink-0" />
            <span className="hidden sm:inline">Anterior</span>
          </button>
          <div className={scrollPagesClass} role="navigation" aria-label="Páginas">
            {pages.map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                disabled={disabled}
                className={numBtnClass(currentPage === pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || disabled}
            aria-label="Página siguiente"
            className={prevNextBtnClass}
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight size={chevronSize} className="shrink-0" />
          </button>
        </div>
      )}
    </div>
  );

  if (variant === 'embedded') {
    return <div className={className}>{content}</div>;
  }

  if (variant === 'compact') {
    return (
      <div className={['border-t border-dark-700', shellPad, className].filter(Boolean).join(' ')}>
        {content}
      </div>
    );
  }

  return <div className={[cardShell, className].filter(Boolean).join(' ')}>{content}</div>;
};

export default TablePagination;
