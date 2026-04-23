import React from 'react';
import { stripTelegramBannerLine } from '../utils/systemNotificationFormat';

export {
  stripTelegramBannerLine,
  stripLeadingTitleDuplicate,
  prepareSystemNotificationBody,
} from '../utils/systemNotificationFormat';

/**
 * Renderiza saltos de línea y etiquetas `<b>…</b>` (mismo formato que plantillas / Telegram).
 */
export function parseBoldSegments(
  line: string,
  keyPrefix: string,
  boldClassName = 'font-semibold text-slate-200'
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let k = 0;
  const re = /<b>([\s\S]*?)<\/b>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`${keyPrefix}-t-${k++}`}>{line.slice(last, m.index)}</span>
      );
    }
    nodes.push(
      <strong key={`${keyPrefix}-b-${k++}`} className={boldClassName}>
        {m[1]}
      </strong>
    );
    last = re.lastIndex;
  }
  if (last < line.length) {
    nodes.push(<span key={`${keyPrefix}-t-${k++}`}>{line.slice(last)}</span>);
  }
  return nodes.length ? nodes : [line];
}

type Props = {
  text: string;
  className?: string;
  /** Por defecto quita la línea entre campanas (título duplicado respecto al encabezado del card). */
  stripBannerLine?: boolean;
};

const TelegramFormattedMessage: React.FC<Props> = ({
  text,
  className = 'text-sm',
  stripBannerLine = true,
}) => {
  const display = stripBannerLine ? stripTelegramBannerLine(text) : text;
  const lines = display.split('\n');
  return (
    <div className={`leading-relaxed text-dark-400 ${className}`.trim()}>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {parseBoldSegments(line, `ln${i}`, 'font-semibold text-slate-200')}
        </React.Fragment>
      ))}
    </div>
  );
};

export default TelegramFormattedMessage;
