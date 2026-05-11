import React, { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
   * compact: listas medianas con pie reducido.
   * minimal: panel campanario (solo prev/sig + resumen corto).
   */
  variant?: 'card' | 'embedded' | 'compact' | 'minimal';
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
  const { t } = useTranslation();
  const pageSizeFieldId = useId();
  const showPageSize =
    variant !== 'minimal' &&
    Boolean(onPageSizeChange) &&
    Array.isArray(pageSizeOptions) &&
    pageSizeOptions.length > 0;
  const showPageNav = totalPages > 1;

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  const pages = showPageNav ? getVisiblePaginationPages(totalPages, currentPage) : [];

  /** Panel campanario: una sola fila ultracompacta (sin rejilla ni «por página»); siempre que haya ítems. */
  if (variant === 'minimal') {
    if (totalItems <= 0) return null;
    const navActive = totalPages > 1;
    const summary = navActive
      ? t('common.pagination.compactSummary', { start, end, total: totalItems })
      : t('common.pagination.unreadSummary', { total: totalItems });
    return (
      <div
        className={[
          'flex items-center justify-between gap-1 border-t border-dark-700/90 bg-dark-900/50 px-1.5 py-1 sm:gap-2',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {navActive ? (
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || disabled}
            aria-label={t('common.pagination.prevPageAria')}
            className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md bg-dark-700 text-white transition-colors hover:bg-dark-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft size={14} strokeWidth={2} className="shrink-0" aria-hidden />
          </button>
        ) : (
          <span className="inline-block h-7 w-8 shrink-0" aria-hidden />
        )}
        <p className="min-w-0 flex-1 select-none truncate text-center text-[0.6125rem] font-medium tabular-nums text-dark-400">
          {summary}
        </p>
        {navActive ? (
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || disabled}
            aria-label={t('common.pagination.nextPageAria')}
            className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md bg-dark-700 text-white transition-colors hover:bg-dark-600 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight size={14} strokeWidth={2} className="shrink-0" aria-hidden />
          </button>
        ) : (
          <span className="inline-block h-7 w-8 shrink-0" aria-hidden />
        )}
      </div>
    );
  }

  if (totalItems <= 0 || (!showPageNav && !showPageSize)) return null;

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
          {t('common.pagination.showingSummary', { start, end, total: totalItems, itemLabel })}
        </p>
        {showPageSize && (
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <label htmlFor={pageSizeFieldId} className={`whitespace-nowrap ${pageSizeLabelClass}`}>
              {t('common.pagination.perPage')}
            </label>
            <select
              id={pageSizeFieldId}
              className={pageSizeSelectClass}
              value={itemsPerPage}
              disabled={disabled}
              aria-label={t('common.pagination.perPageAria')}
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
            aria-label={t('common.pagination.prevPageAria')}
            className={prevNextBtnClass}
          >
            <ChevronLeft size={chevronSize} className="shrink-0" />
            <span className="hidden sm:inline">{t('common.pagination.prev')}</span>
          </button>
          <div className={scrollPagesClass} role="navigation" aria-label={t('common.pagination.pagesAria')}>
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
            aria-label={t('common.pagination.nextPageAria')}
            className={prevNextBtnClass}
          >
            <span className="hidden sm:inline">{t('common.pagination.next')}</span>
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
