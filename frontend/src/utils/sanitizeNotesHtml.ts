/**
 * Sanitiza HTML de notas para preview (solo navegador). Quita scripts, iframes y atributos de evento.
 * Sin dependencias externas para entornos Docker donde `npm install` puede no incluir paquetes opcionales.
 */
export function sanitizeNotesHtmlForPreview(html: string): string {
  const raw = (html ?? '').trim();
  if (!raw) return '';

  if (typeof document === 'undefined') {
    return raw;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/html');
    const body = doc.body;

    body
      .querySelectorAll('script, iframe, object, embed, form, meta, base, link, style')
      .forEach((el) => el.remove());

    body.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const val = (attr.value || '').trim().toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') {
          el.removeAttribute(attr.name);
        } else if (
          (name === 'href' || name === 'src' || name === 'xlink:href') &&
          val.startsWith('javascript:')
        ) {
          el.removeAttribute(attr.name);
        }
      }
    });

    return body.innerHTML;
  } catch {
    return '';
  }
}
