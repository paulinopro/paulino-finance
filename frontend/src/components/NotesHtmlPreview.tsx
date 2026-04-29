import React, { useMemo } from 'react';
import { sanitizeNotesHtmlForPreview } from '../utils/sanitizeNotesHtml';

type NotesHtmlPreviewProps = {
  html: string;
  className?: string;
};

/**
 * Sanitiza y muestra notas con HTML (p. ej. &lt;b&gt;, listas, enlaces) en tarjetas y vistas compactas.
 */
export const NotesHtmlPreview: React.FC<NotesHtmlPreviewProps> = ({ html, className = '' }) => {
  const safe = useMemo(() => sanitizeNotesHtmlForPreview(html), [html]);

  return (
    <div
      className={`notes-html-preview break-words [&_a]:text-primary-400 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-dark-600 [&_blockquote]:pl-2 [&_code]:rounded [&_code]:bg-dark-800 [&_code]:px-1 [&_code]:text-xs [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-dark-800 [&_pre]:p-2 [&_pre]:text-xs [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 ${className}`}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
};
