import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { formatCalendarDateLongEs } from '../utils/dateUtils';
import {
  type PeriodEffectiveBucket,
  PERIOD_ROW_BORDER_COLOR,
  calendarEventYmd,
  compareCalendarEventsForPeriod,
  getEffectiveCalendarPeriodBucket,
  periodDetailStatusDisplay,
  sumCalendarRowsByCurrency,
} from '../utils/calendarPeriodEffective';

type SortKey = 'date' | 'type' | 'title' | 'amount' | 'status';
type SortDir = 'asc' | 'desc';

const SORT_COL_STORAGE_PREFIX = 'pf:calendar:periodDetailSort:col:';

const EXPENSE_ORDER: CalendarEvent['eventType'][] = [
  'EXPENSE',
  'RECURRING_EXPENSE',
  'CARD_PAYMENT',
  'LOAN_PAYMENT',
];

const BUCKET_ORDER: PeriodEffectiveBucket[] = ['paid', 'pending', 'overdue', 'cancelled'];

function bucketRank(b: PeriodEffectiveBucket): number {
  const i = BUCKET_ORDER.indexOf(b);
  return i === -1 ? 999 : i;
}

function readPersistedSortColumn(persistenceKeySuffix: string, fallback: SortKey): SortKey {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = sessionStorage.getItem(`${SORT_COL_STORAGE_PREFIX}${persistenceKeySuffix}`);
    if (
      raw === 'date' ||
      raw === 'type' ||
      raw === 'title' ||
      raw === 'amount' ||
      raw === 'status'
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function persistSortColumn(persistenceKeySuffix: string, key: SortKey) {
  try {
    sessionStorage.setItem(`${SORT_COL_STORAGE_PREFIX}${persistenceKeySuffix}`, key);
  } catch {
    /* ignore */
  }
}

export interface CalendarPeriodDetailTableProps {
  persistenceKeySuffix: string;
  variant: 'income' | 'expense';
  heading: React.ReactNode;
  sourceEvents: CalendarEvent[];
  todayYmd: string;
  emptyLabel: string;
  eventTypeLabels: Record<string, string>;
}

const CalendarPeriodDetailTable: React.FC<CalendarPeriodDetailTableProps> = ({
  persistenceKeySuffix,
  variant,
  heading,
  sourceEvents,
  todayYmd,
  emptyLabel,
  eventTypeLabels,
}) => {
  const { t } = useTranslation();
  const { formatCurrency: fc, localeTag, primaryCurrency } = useIntlFormatting();

  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<'all' | PeriodEffectiveBucket>('all');
  /** Ingreso solo usa all | INCOME; gastos: all | tipos de gasto */
  const [typeFilterIncome, setTypeFilterIncome] = useState<'all' | 'INCOME'>('all');
  const [typeFilterExpense, setTypeFilterExpense] = useState<'all' | CalendarEvent['eventType']>('all');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [sortKey, setSortKey] = useState<SortKey>(() => readPersistedSortColumn(persistenceKeySuffix, 'date'));

  const lblDate = t('pages.calendar.fieldDate');
  const lblType = t('pages.calendar.fieldType');
  const lblTitle = t('pages.calendar.fieldTitle');
  const lblAmount = t('pages.calendar.fieldAmount');
  const lblStatus = t('pages.calendar.fieldStatus');

  const statusLabels = useMemo(
    () => ({
      PENDING: t('pages.calendarStatuses.PENDING'),
      PAID: t('pages.calendarStatuses.PAID'),
      RECEIVED: t('pages.calendarStatuses.RECEIVED'),
      OVERDUE: t('pages.calendarStatuses.OVERDUE'),
      CANCELLED: t('pages.calendarStatuses.CANCELLED'),
    }),
    [t]
  );

  const incomeTypeLabel = eventTypeLabels.INCOME ?? 'INCOME';
  const normalizedQuery = search.trim().toLowerCase();

  const typeOptionsForExpense = useMemo(() => {
    const present = new Set(sourceEvents.map((e) => e.eventType));
    return EXPENSE_ORDER.filter((tp) => present.has(tp));
  }, [sourceEvents]);

  const processedRows = useMemo(() => {
    let list = [...sourceEvents];

    if (variant === 'expense') {
      if (typeFilterExpense !== 'all') list = list.filter((ev) => ev.eventType === typeFilterExpense);
    } else if (variant === 'income' && typeFilterIncome !== 'all') {
      list = list.filter((ev) => ev.eventType === 'INCOME');
    }

    if (bucketFilter !== 'all') {
      list = list.filter((ev) => getEffectiveCalendarPeriodBucket(ev, todayYmd) === bucketFilter);
    }

    if (normalizedQuery) {
      list = list.filter((ev) => {
        const bucket = getEffectiveCalendarPeriodBucket(ev, todayYmd);
        const st = periodDetailStatusDisplay(ev, bucket, statusLabels);
        const typeLabel =
          variant === 'income' ? incomeTypeLabel : eventTypeLabels[ev.eventType] ?? ev.eventType;
        const amtStr = fc(ev.amount, ev.currency).toLowerCase();
        const hay = [
          calendarEventYmd(ev),
          typeLabel,
          ev.title ?? '',
          st,
          String(ev.amount ?? ''),
          (ev.currency || '').toUpperCase(),
          amtStr,
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(normalizedQuery);
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = calendarEventYmd(a).localeCompare(calendarEventYmd(b));
      } else if (sortKey === 'type') {
        const ta = variant === 'income' ? incomeTypeLabel : eventTypeLabels[a.eventType] ?? a.eventType;
        const tb = variant === 'income' ? incomeTypeLabel : eventTypeLabels[b.eventType] ?? b.eventType;
        cmp = ta.localeCompare(tb, localeTag, { sensitivity: 'base' });
      } else if (sortKey === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', localeTag, { sensitivity: 'base' });
      } else if (sortKey === 'amount') {
        cmp = a.amount === b.amount ? 0 : a.amount < b.amount ? -1 : 1;
      } else if (sortKey === 'status') {
        const ba = getEffectiveCalendarPeriodBucket(a, todayYmd);
        const bb = getEffectiveCalendarPeriodBucket(b, todayYmd);
        cmp = bucketRank(ba) - bucketRank(bb);
        if (cmp === 0) {
          cmp = periodDetailStatusDisplay(a, ba, statusLabels).localeCompare(
            periodDetailStatusDisplay(b, bb, statusLabels),
            localeTag,
            { sensitivity: 'base' }
          );
        }
      }

      cmp *= dir;
      if (cmp !== 0) return cmp;
      return compareCalendarEventsForPeriod(a, b);
    });

    return list;
  }, [
    bucketFilter,
    eventTypeLabels,
    fc,
    incomeTypeLabel,
    localeTag,
    normalizedQuery,
    sortDir,
    sortKey,
    sourceEvents,
    statusLabels,
    todayYmd,
    typeFilterExpense,
    typeFilterIncome,
    variant,
  ]);

  const totalsByCurrency = useMemo(
    () => sumCalendarRowsByCurrency(processedRows, primaryCurrency),
    [processedRows, primaryCurrency]
  );

  const toggleSort = (key: SortKey) => {
    persistSortColumn(persistenceKeySuffix, key);
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      const ascDefaultCols: SortKey[] = ['date', 'type', 'title', 'status'];
      setSortDir(ascDefaultCols.includes(key) ? 'asc' : 'desc');
    }
  };

  const ThBtn: React.FC<{ column: SortKey; align?: 'left' | 'right'; children: React.ReactNode }> = ({
    column,
    align = 'left',
    children,
  }) => {
    const active = sortKey === column;
    const ArrowIcon =
      column === sortKey ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

    return (
      <th
        className={`py-3 px-4 text-dark-400 font-medium select-none ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSort(column)}
          aria-sort={
            sortKey === column ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
          }
          className={`flex w-full items-center gap-2 cursor-pointer hover:text-white ${align === 'right' ? 'justify-end text-right' : ''}`}
        >
          <span>{children}</span>
          <ArrowIcon size={16} className={active ? 'shrink-0' : 'shrink-0 opacity-50'} aria-hidden />
        </button>
      </th>
    );
  };

  const totalBlock = (
    <div className="flex flex-col items-end gap-0.5 tabular-nums w-full md:w-auto">
      {totalsByCurrency.map(([cur, amt]) => (
        <span key={cur} className="text-white font-semibold">
          {fc(amt, cur)}
        </span>
      ))}
    </div>
  );

  return (
    <div className="card w-full overflow-hidden">
      <div className="mb-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2 min-h-[42px]">{heading}</div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end w-full sm:flex-1 lg:max-w-3xl">
          <label className="relative flex flex-1 min-w-[160px] sm:max-w-xs lg:max-w-sm">
            <span className="sr-only">{t('pages.calendar.periodDetailSearchLabel')}</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('pages.calendar.periodDetailSearchPlaceholder')}
              className="input w-full pl-9"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value as 'all' | PeriodEffectiveBucket)}
            className="input min-h-[42px] w-full sm:w-auto sm:min-w-[11rem]"
            aria-label={t('pages.calendar.periodDetailFilterStatusAria')}
          >
            <option value="all">{t('pages.calendar.periodDetailFilterStatusAll')}</option>
            <option value="pending">{t('pages.calendar.periodDetailFilterStatusPending')}</option>
            <option value="paid">{t('pages.calendar.periodDetailFilterStatusSettled')}</option>
            <option value="overdue">{t('pages.calendar.periodDetailFilterStatusOverdue')}</option>
            <option value="cancelled">{t('pages.calendar.periodDetailFilterStatusCancelled')}</option>
          </select>

          <select
            value={variant === 'income' ? typeFilterIncome : typeFilterExpense}
            onChange={(e) => {
              if (variant === 'income')
                setTypeFilterIncome(e.target.value === 'all' ? 'all' : 'INCOME');
              else setTypeFilterExpense(e.target.value as 'all' | CalendarEvent['eventType']);
            }}
            className="input min-h-[42px] w-full sm:w-auto sm:min-w-[11.5rem]"
            aria-label={t('pages.calendar.periodDetailFilterTypeAria')}
          >
            <option value="all">{t('pages.calendar.periodDetailFilterTypeAll')}</option>
            {variant === 'income' ? (
              <option value="INCOME">{eventTypeLabels.INCOME}</option>
            ) : (
              typeOptionsForExpense.map((tp) => (
                <option key={tp} value={tp}>
                  {eventTypeLabels[tp] ?? tp}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {sourceEvents.length === 0 ? (
        <p className="text-dark-500 text-sm">{emptyLabel}</p>
      ) : processedRows.length === 0 ? (
        <p className="text-dark-500 text-sm">{t('pages.calendar.periodDetailNoMatches')}</p>
      ) : (
        <div className="max-md:max-h-none max-md:border-0 max-md:rounded-none rounded-xl border border-dark-700 max-md:bg-transparent md:max-h-[min(28rem,55vh)] flex flex-col min-h-0 overflow-hidden md:rounded-xl">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain md:min-h-[8rem]">
            <div className="table-responsive table-stack pb-px">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-[2] bg-dark-800 shadow-[inset_0_-1px_0_0_rgba(51,65,85,0.9)]">
                  <tr className="border-b border-dark-700">
                    <ThBtn column="date">{lblDate}</ThBtn>
                    <ThBtn column="type">{lblType}</ThBtn>
                    <ThBtn column="title">{lblTitle}</ThBtn>
                    <ThBtn column="amount" align="right">
                      {lblAmount}
                    </ThBtn>
                    <ThBtn column="status">{lblStatus}</ThBtn>
                  </tr>
                </thead>
                <tbody>
                  {processedRows.map((ev) => {
                    const bucket = getEffectiveCalendarPeriodBucket(ev, todayYmd);
                    const typeLabel =
                      variant === 'income'
                        ? incomeTypeLabel
                        : eventTypeLabels[ev.eventType] ?? ev.eventType;

                    return (
                      <tr
                        key={ev.id}
                        className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftStyle: 'solid',
                          borderLeftColor: PERIOD_ROW_BORDER_COLOR[bucket],
                        }}
                      >
                        <td data-label={lblDate} className="py-3 px-4">
                          <span className="table-stack-value whitespace-nowrap text-dark-300">
                            {formatCalendarDateLongEs(ev.eventDate, localeTag)}
                          </span>
                        </td>
                        <td data-label={lblType} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{typeLabel}</span>
                        </td>
                        <td
                          data-label={lblTitle}
                          data-stack="hero"
                          className="py-3 px-4 text-white min-w-0"
                        >
                          <span className="break-words">{ev.title}</span>
                        </td>
                        <td data-label={lblAmount} className="py-3 px-4 md:text-right">
                          <span className="table-stack-value">{fc(ev.amount, ev.currency)}</span>
                        </td>
                        <td data-label={lblStatus} className="py-3 px-4">
                          <span
                            className="table-stack-value whitespace-nowrap"
                            style={{ color: PERIOD_ROW_BORDER_COLOR[bucket] }}
                          >
                            {periodDetailStatusDisplay(ev, bucket, statusLabels)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="max-md:hidden">
                  <tr className="border-t-2 border-dark-600 bg-dark-800 shadow-[inset_0_1px_0_0_rgba(51,65,85,0.5)]">
                    <td colSpan={3} className="py-3 px-4 text-dark-300 font-semibold text-left align-middle">
                      {t('pages.calendar.periodDetailTotal')}
                    </td>
                    <td className="py-3 px-4 text-right align-middle">{totalBlock}</td>
                    <td className="align-middle" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="md:hidden border-t-2 border-dark-600 bg-dark-800 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-dark-400">
              {t('pages.calendar.periodDetailTotal')}
            </p>
            {totalBlock}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPeriodDetailTable;
