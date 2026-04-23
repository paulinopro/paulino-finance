import React, { useMemo } from 'react';
import {
  parseStructuredNotificationRows,
  prepareSystemNotificationBody,
} from '../utils/systemNotificationFormat';
import { parseBoldSegments } from './TelegramFormattedMessage';

type Variant = 'full' | 'compact';

type Props = {
  title: string;
  message: string;
  /** Historial (full) vs campana (compact). */
  variant?: Variant;
  className?: string;
};

/**
 * Cuerpo de notificación del sistema: mismos datos que la plantilla/Telegram,
 * presentación propia (filas etiqueta/valor), responsive, sin repetir el título del card.
 */
const SystemNotificationBody: React.FC<Props> = ({
  title,
  message,
  variant = 'full',
  className = '',
}) => {
  const prepared = useMemo(() => prepareSystemNotificationBody(title, message), [title, message]);
  const { rows, unparseableLines } = useMemo(
    () => parseStructuredNotificationRows(prepared),
    [prepared]
  );

  const isCompact = variant === 'compact';
  const labelClass = isCompact
    ? 'text-[0.65rem] font-medium uppercase tracking-wide text-dark-500 sm:text-[0.7rem]'
    : 'text-[0.7rem] font-medium uppercase tracking-wide text-dark-500 sm:text-xs';
  const valueClass = isCompact
    ? 'text-xs leading-snug text-dark-100 [word-break:break-word] sm:text-sm'
    : 'text-sm leading-relaxed text-dark-100 [word-break:break-word] sm:text-base';
  const rowGap = isCompact ? 'gap-y-2 sm:gap-y-1.5' : 'gap-y-3 sm:gap-y-2';
  const shellClass = isCompact
    ? 'rounded-lg border border-dark-600/40 bg-dark-800/30 px-2.5 py-2 sm:px-3 sm:py-2.5'
    : 'rounded-xl border border-dark-600/45 bg-dark-800/35 px-3 py-3 sm:px-4 sm:py-3.5';

  let fallbackBlock: React.ReactNode = null;
  if (unparseableLines.length > 0) {
    const text = unparseableLines.join('\n');
    fallbackBlock = (
      <div
        className={
          isCompact
            ? 'mt-2 border-t border-dark-600/35 pt-2 text-xs leading-relaxed text-dark-300'
            : 'mt-3 border-t border-dark-600/40 pt-3 text-sm leading-relaxed text-dark-300 sm:text-[0.9375rem]'
        }
      >
        {text.split('\n').map((line, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {parseBoldSegments(line, `fb${i}`, 'font-semibold text-dark-100')}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (!prepared.trim()) {
    return null;
  }

  if (rows.length === 0) {
    return (
      <div className={`${shellClass} ${className}`.trim()}>
        <div
          className={
            isCompact
              ? 'text-xs leading-relaxed text-dark-300'
              : 'text-sm leading-relaxed text-dark-300 sm:text-[0.9375rem]'
          }
        >
          {prepared.split('\n').map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {parseBoldSegments(line, `fl${i}`, 'font-semibold text-dark-100')}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${shellClass} ${className}`.trim()}>
      <dl className={`grid ${rowGap}`}>
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(5.5rem,10rem)_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0 sm:items-baseline"
          >
            <dt className={labelClass}>{row.label}</dt>
            <dd className={`m-0 ${valueClass}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {fallbackBlock}
    </div>
  );
};

export default SystemNotificationBody;
