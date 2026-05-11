import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppNotification } from '../types';
import { notificationBellPreview, buildBellRecurringExpensePreview } from '../utils/systemNotificationFormat';
import { useIntlFormatting } from '../context/IntlFormattingContext';

type Props = {
  notification: AppNotification;
  typeLabel: string;
  onActivate: () => void;
};

/** Altura flexible: preview recurrente muestra hasta 3 líneas de detalle */
const rowBase =
  'flex min-h-[4rem] w-full shrink-0 cursor-pointer items-stretch border-b border-dark-700/75 px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-dark-700/98 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 focus-visible:ring-offset-dark-800';

const NotificationBellListRow: React.FC<Props> = ({ notification, typeLabel, onActivate }) => {
  const { t } = useTranslation();
  const { formatDateTimeShort } = useIntlFormatting();

  const recurringPreview = useMemo(() => {
    if (notification.type !== 'RECURRING_EXPENSE') return null;
    return buildBellRecurringExpensePreview(
      notification.title,
      notification.message,
      notification.createdAt
    );
  }, [notification.type, notification.title, notification.message, notification.createdAt]);

  const plainPreview = useMemo(
    () => notificationBellPreview(notification.title, notification.message),
    [notification.title, notification.message]
  );
  const when = useMemo(
    () => formatDateTimeShort(notification.createdAt),
    [formatDateTimeShort, notification.createdAt]
  );

  const recurringTitle = recurringPreview
    ? `${recurringPreview.description}\n${t('notifBell.amount')}: ${recurringPreview.montoWithCurrency} — ${t('notifBell.paymentDate')}: ${recurringPreview.paymentDateDdMmYyyy}\n${t('notifBell.daysLeft', { count: recurringPreview.daysRemaining })}`
    : undefined;

  return (
    <button
      type="button"
      className={[
        rowBase,
        'border-l-2',
        notification.isRead ? 'border-l-transparent bg-transparent' : 'border-l-primary-500 bg-primary-500/[0.04]',
      ].join(' ')}
      onClick={onActivate}
    >
      <span className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex min-h-0 w-full items-baseline gap-2">
          <span className="min-w-0 truncate text-[0.5625rem] font-semibold uppercase tracking-wider text-dark-500">
            {typeLabel}
          </span>
          <span className="ml-auto shrink-0 text-[0.5625rem] tabular-nums leading-none text-dark-500">{when}</span>
        </span>
        <span className="line-clamp-1 text-[0.78125rem] font-semibold leading-tight tracking-tight text-white [word-break:break-word]">
          {notification.title}
        </span>
        {recurringPreview ? (
          <span
            className="flex min-h-0 min-w-0 flex-col gap-0.5 text-left [word-break:break-word]"
            title={recurringTitle}
          >
            <span className="line-clamp-1 text-[0.625rem] leading-snug text-dark-300">
              <strong className="font-semibold text-dark-200">{t('notifBell.description')}:</strong>{' '}
              {recurringPreview.description}
            </span>
            <span className="line-clamp-1 text-[0.625rem] leading-snug text-dark-300">
              <strong className="font-semibold text-dark-200">{t('notifBell.amount')}:</strong>{' '}
              {recurringPreview.montoWithCurrency} <span className="text-dark-500">—</span>{' '}
              <strong className="font-semibold text-dark-200">{t('notifBell.paymentDate')}:</strong>{' '}
              <span className="tabular-nums">{recurringPreview.paymentDateDdMmYyyy}</span>
            </span>
            <span className="line-clamp-1 text-[0.625rem] leading-snug text-dark-400">
              ⏳ {t('notifBell.daysLeft', { count: recurringPreview.daysRemaining })}
            </span>
          </span>
        ) : (
          <span
            className="line-clamp-1 text-[0.65625rem] leading-snug text-dark-400 [word-break:break-word]"
            title={plainPreview || undefined}
          >
            {plainPreview || t('common.emptyDash')}
          </span>
        )}
      </span>
    </button>
  );
};

export default NotificationBellListRow;
