import React, { useCallback, useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { formatDateDdMmYyyy } from '../utils/dateUtils';
import TablePagination from './TablePagination';

export type FinancialHistoryKind = 'expense' | 'income';

export interface FinancialHistoryModalProps {
  kind: FinancialHistoryKind;
  itemId: number | null;
  itemTitle: string;
  open: boolean;
  onClose: () => void;
}

interface TimelineEntry {
  id: number;
  eventDate: string;
  amount: number;
  currency: string;
  status: string;
  showOnCalendar: boolean;
  eventType: string;
}

export default function FinancialHistoryModal({
  kind,
  itemId,
  itemTitle,
  open,
  onClose,
}: FinancialHistoryModalProps) {
  const { t } = useTranslation();
  const { formatCurrency: fc } = useIntlFormatting();
  const panelRef = useRef<HTMLDivElement>(null);
  const { pageSize: itemsPerPage, setPageSize: setItemsPerPage, pageSizeOptions } = usePersistedTablePageSize(
    'pf:pageSize:financialHistoryModal',
    TABLE_PAGE_SIZE
  );
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [nextOccurrenceDate, setNextOccurrenceDate] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  useEscapeKey(open, onClose);
  useModalFocusTrap(panelRef, open);

  useEffect(() => {
    if (open && itemId != null) {
      setCurrentPage(1);
      setInitialLoaded(false);
    }
  }, [open, itemId]);

  const fetchTimeline = useCallback(async () => {
    if (itemId == null) return;
    try {
      setLoading(true);
      const path = kind === 'expense' ? `/expenses/${itemId}/timeline` : `/income/${itemId}/timeline`;
      const res = await api.get(path, {
        params: {
          page: currentPage,
          limit: itemsPerPage,
          refreshCalendar: currentPage === 1,
        },
      });
      setNextOccurrenceDate(res.data.nextOccurrenceDate ?? null);
      setEntries(Array.isArray(res.data.entries) ? res.data.entries : []);
      const p = res.data.pagination;
      if (p && typeof p.total === 'number') {
        setTotalItems(p.total);
        setTotalPages(Math.max(1, Number(p.totalPages) || 1));
      } else {
        setTotalItems(0);
        setTotalPages(1);
      }
      setInitialLoaded(true);
    } catch {
      toast.error(t('pages.financialItemHistory.loadError'));
      setEntries([]);
      setTotalItems(0);
      setTotalPages(1);
      setNextOccurrenceDate(null);
      setInitialLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [kind, itemId, currentPage, itemsPerPage, t]);

  useEffect(() => {
    if (!open || itemId == null) return;
    void fetchTimeline();
  }, [open, itemId, fetchTimeline]);

  const titleKey = kind === 'expense' ? 'pages.financialItemHistory.titleExpense' : 'pages.financialItemHistory.titleIncome';

  const statusLabel = (status: string) => {
    const k = status as 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
    const mapKey = `pages.calendarStatuses.${k}`;
    const translated = t(mapKey);
    return translated === mapKey ? status : translated;
  };

  const eventTypeLabel = (eventType: string) => {
    const mapKey = `pages.calendarEventTypes.${eventType}`;
    const translated = t(mapKey);
    return translated === mapKey ? eventType : translated;
  };

  if (!open) return null;

  const showInitialSpinner = loading && entries.length === 0;
  const showPageOverlay = loading && entries.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card modal-sheet max-w-4xl w-full max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 shrink-0 mb-4">
          <div className="min-w-0">
            <h2 id="financial-history-title" className="text-xl font-bold text-white">
              {t(titleKey)}
            </h2>
            <p className="text-sm text-dark-400 mt-1 break-words">{itemTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 shrink-0"
            aria-label={t('common.actions.close')}
          >
            <X size={22} />
          </button>
        </div>

        <p className="text-xs text-dark-500 mb-4 shrink-0">{t('pages.financialItemHistory.intro')}</p>

        <div className="rounded-lg border border-dark-600 bg-dark-800/50 px-4 py-3 mb-4 shrink-0">
          <div className="text-xs uppercase tracking-wide text-dark-500">{t('pages.financialItemHistory.nextOccurrence')}</div>
          <div className="text-white font-medium mt-1">
            {loading && !initialLoaded ? (
              <span className="text-dark-400">{t('common.actions.loading')}</span>
            ) : nextOccurrenceDate ? (
              formatDateDdMmYyyy(nextOccurrenceDate)
            ) : (
              <span className="text-dark-400">{t('pages.financialItemHistory.noneNext')}</span>
            )}
          </div>
        </div>

        <div className="relative flex flex-col flex-1 min-h-0 gap-0">
          <div className="relative flex-1 min-h-0 overflow-auto -mx-1 px-1">
            {showInitialSpinner ? (
              <p className="text-dark-400 text-sm py-6 text-center">{t('common.actions.loading')}</p>
            ) : entries.length === 0 ? (
              <p className="text-dark-400 text-sm py-6 text-center">{t('pages.financialItemHistory.empty')}</p>
            ) : (
              <div className={showPageOverlay ? 'opacity-55 pointer-events-none transition-opacity' : ''}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-dark-500 border-b border-dark-700">
                      <th className="py-2 pr-3 font-medium">{t('pages.financialItemHistory.colDate')}</th>
                      <th className="py-2 pr-3 font-medium">{t('pages.financialItemHistory.colEventType')}</th>
                      <th className="py-2 pr-3 font-medium">{t('pages.financialItemHistory.colAmount')}</th>
                      <th className="py-2 pr-3 font-medium">{t('pages.financialItemHistory.colStatus')}</th>
                      <th className="py-2 font-medium">{t('pages.financialItemHistory.colCalendar')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((row) => (
                      <tr key={row.id} className="border-b border-dark-700/80 text-dark-200">
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDateDdMmYyyy(row.eventDate)}</td>
                        <td className="py-2 pr-3 text-dark-300">{eventTypeLabel(row.eventType)}</td>
                        <td className="py-2 pr-3">{fc(row.amount, row.currency)}</td>
                        <td className="py-2 pr-3">{statusLabel(row.status)}</td>
                        <td className="py-2 text-xs">
                          {row.showOnCalendar ? (
                            <span className="text-emerald-400/90">{t('pages.financialItemHistory.visible')}</span>
                          ) : (
                            <span className="text-dark-500">{t('pages.financialItemHistory.archived')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showPageOverlay && (
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-dark-950/25"
                aria-busy
              >
                <span className="rounded-md bg-dark-800/95 px-3 py-2 text-sm text-dark-200 shadow-lg border border-dark-600">
                  {t('common.actions.loading')}
                </span>
              </div>
            )}
          </div>

          {totalItems > 0 && (
            <TablePagination
              variant="embedded"
              className="mt-3 shrink-0 border-t border-dark-700 pt-3"
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemLabel={t('pages.financialItemHistory.itemsLabel')}
              disabled={loading}
              pageSizeOptions={pageSizeOptions}
              onPageSizeChange={(n) => {
                setItemsPerPage(n);
                setCurrentPage(1);
              }}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}
