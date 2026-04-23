"use strict";
/**
 * Layout unificado para reportes PDF (pdfkit) — estilo moderno y legible.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE = exports.CONTENT = exports.M = exports.C = exports.ReportPdfSession = void 0;
exports.renderReportPdf = renderReportPdf;
exports.drawSectionLabel = drawSectionLabel;
exports.drawKpiGrid = drawKpiGrid;
exports.drawTable = drawTable;
exports.drawPeriodStrip = drawPeriodStrip;
exports.ensureSpace = ensureSpace;
exports.formatDateShort = formatDateShort;
exports.reportTableColAlign = reportTableColAlign;
/* eslint-disable @typescript-eslint/no-explicit-any */
const PDF = () => require('pdfkit');
// Paleta (sobre base blanca, tipografía oscura, acentos discretos)
const C = {
    ink: '#0f172a',
    muted: '#64748b',
    line: '#e2e8f0',
    headerBg: '#0f172a',
    headerText: '#ffffff',
    headerSub: '#94a3b8',
    tableHead: '#f1f5f9',
    rowA: '#ffffff',
    rowB: '#f8fafc',
    accent: '#2563eb',
    success: '#059669',
    danger: '#dc2626',
    pillBg: '#f1f5f9',
    brand: 'Paulino Finance',
};
exports.C = C;
const PAGE = { w: 595.28, h: 841.89 };
exports.PAGE = PAGE;
const M = 40;
exports.M = M;
const CONTENT = PAGE.w - 2 * M;
exports.CONTENT = CONTENT;
const BOTTOM_SAFE = 52;
function formatDateShort(s) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime()))
        return s;
    return d.toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: 'numeric' });
}
function ensureSpace(doc, y, need) {
    if (y + need > PAGE.h - BOTTOM_SAFE) {
        doc.addPage();
        return M + 24;
    }
    return y;
}
/** Cabecera principal (primera página) */
function drawTopBanner(doc, title, tagline) {
    doc.save();
    doc.rect(0, 0, PAGE.w, 108).fill(C.headerBg);
    doc.fillColor(C.headerText).font('Helvetica-Bold').fontSize(20).text(title, M, 36, { width: CONTENT, align: 'left' });
    doc.font('Helvetica').fontSize(9).fillColor(C.headerSub);
    doc.text(tagline, M, 64, { width: CONTENT, align: 'left' });
    const gen = new Date().toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
    doc.font('Helvetica').fontSize(7.5).fillColor(C.headerSub);
    doc.text(`Generado: ${gen}`, M, 86, { width: CONTENT, align: 'right' });
    doc.restore();
}
function drawPeriodStrip(doc, y, from, to, extra) {
    if (!from && !to && !extra)
        return y;
    doc.save();
    let text = '';
    const a = from ? formatDateShort(from) : '';
    const b = to ? formatDateShort(to) : '';
    if (a && b) {
        text = `Período: ${a}  —  ${b}`;
    }
    else if (a) {
        text = `Desde: ${a}`;
    }
    else if (b) {
        text = `Hasta: ${b}`;
    }
    if (extra)
        text = text ? `${text}  ·  ${extra}` : extra;
    y = ensureSpace(doc, y, 28);
    doc.roundedRect(M, y, CONTENT, 26, 4).fill(C.pillBg);
    doc.fillColor(C.ink).font('Helvetica').fontSize(9);
    doc.text(text, M + 12, y + 8, { width: CONTENT - 24, align: 'left', lineBreak: true, height: 18 });
    doc.restore();
    return y + 32;
}
function drawSectionLabel(doc, y, text) {
    y = ensureSpace(doc, y, 32);
    doc.save();
    doc.fillColor(C.accent);
    doc.rect(M, y, 3, 16).fill();
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(11);
    doc.text(text, M + 10, y + 1, { width: CONTENT - 10, lineBreak: true, height: 20 });
    doc.restore();
    return y + 24;
}
function drawKpiGrid(doc, y, kpis, cols = 2) {
    if (kpis.length === 0)
        return y;
    const n = cols;
    const gap = 10;
    const boxH = 52;
    const boxW = (CONTENT - (n - 1) * gap) / n;
    let i = 0;
    for (const k of kpis) {
        if (i % n === 0) {
            y = ensureSpace(doc, y, boxH + 10);
        }
        const col = i % n;
        const x = M + col * (boxW + gap);
        let vColor = C.ink;
        if (k.kind === 'pos')
            vColor = C.success;
        if (k.kind === 'neg')
            vColor = C.danger;
        if (k.kind === 'amber')
            vColor = '#b45309';
        doc.save();
        doc.roundedRect(x, y, boxW, boxH, 5).lineWidth(0.6).strokeColor(C.line).stroke();
        doc.fillColor(C.muted).font('Helvetica').fontSize(7.5);
        doc.text(k.label.toUpperCase(), x + 8, y + 8, {
            width: boxW - 16,
            align: 'left',
            lineBreak: true,
            height: 12,
        });
        doc.fillColor(vColor).font('Helvetica-Bold').fontSize(12);
        doc.text(k.value, x + 8, y + 24, {
            width: boxW - 16,
            align: 'left',
            lineBreak: true,
            height: boxH - 24 - 8,
        });
        doc.restore();
        if (col === n - 1 || i === kpis.length - 1)
            y += boxH + gap;
        i++;
    }
    return y;
}
/** Primera columna a la izquierda, última a la derecha, intermedias centradas. Una sola columna: izquierda. */
function reportTableColAlign(nCols, c) {
    if (nCols === 1)
        return 'left';
    if (c === 0)
        return 'left';
    if (c === nCols - 1)
        return 'center';
    return 'center';
}
const SINGLE_LINE_MIN_FS = 5;
/**
 * Un solo renglón en ancho fijo: baja el tamaño de fuente y, si hace falta, trunca con "…"
 * (evita el salto a dos líneas en columnas de montos largos, p. ej. Límites/Deudas en tarjetas).
 */
function singleLineCellMetrics(doc, text, maxW, bold) {
    const s0 = String(text);
    doc.fillColor(C.ink);
    for (let fs = 8; fs >= SINGLE_LINE_MIN_FS; fs -= 0.5) {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs);
        if (doc.widthOfString(s0) <= maxW) {
            return { fontSize: fs, h: doc.currentLineHeight(true), s: s0 };
        }
    }
    const ell = '…';
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(SINGLE_LINE_MIN_FS);
    if (doc.widthOfString(ell) > maxW) {
        return { fontSize: SINGLE_LINE_MIN_FS, h: doc.currentLineHeight(true), s: ell };
    }
    let lo = 0;
    let hi = s0.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const t = s0.slice(0, mid) + (mid < s0.length ? ell : '');
        if (doc.widthOfString(t) <= maxW)
            lo = mid;
        else
            hi = mid - 1;
    }
    const s = s0.slice(0, lo) + (lo < s0.length ? ell : '');
    return { fontSize: SINGLE_LINE_MIN_FS, h: doc.currentLineHeight(true), s };
}
/** Centra el bloque de texto en el alto útil de la celda (PDF). */
function verticalTextY(rowTop, cellTopPad, innerH, contentH) {
    const top = rowTop + cellTopPad;
    const h = Math.min(contentH, innerH);
    const yText = top + Math.max(0, (innerH - h) / 2);
    const textBoxH = rowTop + cellTopPad + innerH - yText;
    return { yText, textBoxH };
}
/** Insete desde el margen hacia el área útil de la tabla. */
const TABLE_INSET = 4;
/** Espacio entre borde de celda y texto (misma caja lógica en th y td). */
const CELL_H_PAD = 3;
/** Relleno arriba/abajo del bloque de texto dentro de la celda. */
const CELL_V_PAD = 4;
const MIN_HEAD_H = 20;
const MIN_ROW_H = 16;
const fontSize = 8;
/** Altura de texto a ancho fijo; restaura `doc.x`/`doc.y` (sin apilar save/restore por celda). */
function textHeight(doc, text, w, align, bold) {
    doc.fillColor(C.ink);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const ox = doc.x;
    const oy = doc.y;
    doc.x = 0;
    doc.y = 0;
    const h = doc.heightOfString(String(text), { width: w, align, lineBreak: true });
    doc.x = ox;
    doc.y = oy;
    const lineH = doc.currentLineHeight(true);
    return Math.max(h, lineH);
}
/**
 * Recorta con "…" si el bloque de texto excede `maxH` (misma medición que al dibujar).
 */
function clipTextToMaxHeight(doc, text, w, align, bold, maxH) {
    let s = String(text);
    if (textHeight(doc, s, w, align, bold) <= maxH)
        return s;
    if (!s.length)
        return s;
    const ell = '…';
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const t = s.slice(0, mid) + (mid < s.length ? ell : '');
        if (textHeight(doc, t, w, align, bold) <= maxH)
            lo = mid;
        else
            hi = mid - 1;
    }
    if (lo === 0)
        return ell;
    return s.slice(0, lo) + ell;
}
/**
 * Dibuja tabla: `colWidths` se escalan para ocupar exactamente el ancho interior;
 * th y td comparten la misma rejilla (posiciones X y anchos de texto idénticos).
 * Alineación: primera col. izq., última der., el resto centrado.
 * La altura de fila (y cabecera) sigue al contenido; las filas demasiado altas se recortan
 * a ~12 líneas para no desbordar la página.
 * `noWrapColumns`: índices de columna forzados a una sola línea (p. ej. montos DOP+USD en tarjetas).
 */
function drawTable(doc, y, headers, colWidths, rows, options) {
    const nCols = headers.length;
    if (nCols === 0 || colWidths.length !== nCols) {
        return y;
    }
    const noWrapSet = new Set(options?.noWrapColumns?.filter((i) => i >= 0 && i < nCols) ?? []);
    const sumW = colWidths.reduce((a, w) => a + w, 0) || 1;
    const innerW = CONTENT - 2 * TABLE_INSET;
    /** Ancho de cada columna: suma exacta = innerW */
    const wCols = colWidths.map((w) => (w / sumW) * innerW);
    const colLeft = [];
    let xAcc = M + TABLE_INSET;
    for (let c = 0; c < nCols; c++) {
        colLeft.push(xAcc);
        xAcc += wCols[c];
    }
    const textW = wCols.map((w) => Math.max(4, w - 2 * CELL_H_PAD));
    doc.save();
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const lineH = doc.currentLineHeight(true);
    doc.restore();
    const maxCellTextH = lineH * 12;
    const padRow = (row) => {
        const out = row.map((c) => String(c ?? ''));
        while (out.length < nCols)
            out.push('');
        return out.slice(0, nCols);
    };
    // Cabecera: altura = máx. contenido de columna
    let headContentH = 0;
    for (let c = 0; c < nCols; c++) {
        const a = reportTableColAlign(nCols, c);
        if (noWrapSet.has(c)) {
            const m = singleLineCellMetrics(doc, String(headers[c]), textW[c], true);
            headContentH = Math.max(headContentH, m.h);
        }
        else {
            headContentH = Math.max(headContentH, textHeight(doc, String(headers[c]), textW[c], a, true));
        }
    }
    const headH = Math.max(MIN_HEAD_H, Math.min(maxCellTextH, headContentH) + 2 * CELL_V_PAD);
    y = ensureSpace(doc, y, headH + 6);
    doc.save();
    doc.roundedRect(M, y, CONTENT, headH, 2).fill(C.tableHead);
    doc.lineWidth(0.35).strokeColor(C.line);
    for (let c = 1; c < nCols; c++) {
        const vx = colLeft[c];
        doc.moveTo(vx, y).lineTo(vx, y + headH).stroke();
    }
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(fontSize);
    for (let c = 0; c < nCols; c++) {
        const a = reportTableColAlign(nCols, c);
        const tx = colLeft[c] + CELL_H_PAD;
        const innerH = headH - 2 * CELL_V_PAD;
        const label = clipTextToMaxHeight(doc, String(headers[c]), textW[c], a, true, innerH);
        const blockH = textHeight(doc, label, textW[c], a, true);
        const { yText, textBoxH } = verticalTextY(y, CELL_V_PAD, innerH, blockH);
        doc.text(label, tx, yText, {
            width: textW[c],
            align: a,
            lineBreak: true,
            height: textBoxH,
        });
    }
    doc.restore();
    y += headH;
    rows.forEach((row, rIdx) => {
        const cells0 = padRow(row);
        let rowContentH = 0;
        for (let c = 0; c < nCols; c++) {
            const a = reportTableColAlign(nCols, c);
            if (noWrapSet.has(c)) {
                const m = singleLineCellMetrics(doc, cells0[c], textW[c], false);
                rowContentH = Math.max(rowContentH, m.h);
            }
            else {
                rowContentH = Math.max(rowContentH, textHeight(doc, cells0[c], textW[c], a, false));
            }
        }
        const cap = Math.min(maxCellTextH, rowContentH);
        const bodyInnerMax = cap;
        const rowH = Math.max(MIN_ROW_H, cap + 2 * CELL_V_PAD);
        y = ensureSpace(doc, y, rowH + 1);
        const fill = rIdx % 2 === 0 ? C.rowA : C.rowB;
        const cells = cells0.map((cell, c) => {
            const a = reportTableColAlign(nCols, c);
            if (noWrapSet.has(c))
                return cell;
            if (textHeight(doc, cell, textW[c], a, false) <= bodyInnerMax)
                return cell;
            return clipTextToMaxHeight(doc, cell, textW[c], a, false, bodyInnerMax);
        });
        doc.save();
        doc.rect(M, y, CONTENT, rowH).fill(fill);
        doc.lineWidth(0.25).strokeColor(C.line);
        for (let c = 1; c < nCols; c++) {
            const vx = colLeft[c];
            doc.moveTo(vx, y).lineTo(vx, y + rowH).stroke();
        }
        for (let c = 0; c < nCols; c++) {
            const a = reportTableColAlign(nCols, c);
            const tx = colLeft[c] + CELL_H_PAD;
            const rowTextH = rowH - 2 * CELL_V_PAD;
            if (noWrapSet.has(c)) {
                const m = singleLineCellMetrics(doc, cells0[c], textW[c], false);
                doc.fillColor(C.ink).font('Helvetica').fontSize(m.fontSize);
                const { yText, textBoxH } = verticalTextY(y, CELL_V_PAD, rowTextH, m.h);
                doc.text(m.s, tx, yText, { width: textW[c], align: a, lineBreak: false, height: textBoxH });
            }
            else {
                const blockH = textHeight(doc, cells[c], textW[c], a, false);
                doc.fillColor(C.ink).font('Helvetica').fontSize(fontSize);
                const { yText, textBoxH } = verticalTextY(y, CELL_V_PAD, rowTextH, blockH);
                doc.text(cells[c], tx, yText, { width: textW[c], align: a, lineBreak: true, height: textBoxH });
            }
        }
        doc.restore();
        y += rowH;
    });
    y += 10;
    // Evita dejar el cursor de pdfkit al final de un flujo de texto (reduce páginas fantasma)
    doc.x = M;
    doc.y = y;
    return y;
}
class ReportPdfSession {
    constructor(doc) {
        this.doc = doc;
        this.y = 124;
    }
    period(from, to, extra) {
        this.y = drawPeriodStrip(this.doc, this.y, from, to, extra);
    }
    section(title) {
        this.y = drawSectionLabel(this.doc, this.y, title);
    }
    note(message) {
        this.y = ensureSpace(this.doc, this.y, 24);
        this.doc.save();
        this.doc.fillColor(C.muted).font('Helvetica').fontSize(9);
        this.doc.text(message, M, this.y, { width: CONTENT, align: 'left', lineBreak: true, height: 48, ellipsis: true });
        this.doc.restore();
        this.y += 20;
    }
    kpis(items, cols = 2) {
        this.y = drawKpiGrid(this.doc, this.y, items, cols);
    }
    table(headers, colWidths, rows, options) {
        this.y = drawTable(this.doc, this.y, headers, colWidths, rows, options);
    }
}
exports.ReportPdfSession = ReportPdfSession;
/**
 * Crea un PDF de reporte y devuelve el buffer (sin pie de página para evitar hojas en blanco con solo texto legal).
 */
async function renderReportPdf(title, tagline, build) {
    const PDFDocument = PDF();
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: M, info: { Title: title, Author: C.brand } });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);
            drawTopBanner(doc, title, tagline);
            const s = new ReportPdfSession(doc);
            build(s);
            doc.x = M;
            doc.y = s.y;
            doc.end();
        }
        catch (e) {
            reject(e);
        }
    });
}
//# sourceMappingURL=reportPdfLayout.js.map