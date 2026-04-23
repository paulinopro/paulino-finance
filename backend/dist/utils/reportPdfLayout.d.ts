/**
 * Layout unificado para reportes PDF (pdfkit) — estilo moderno y legible.
 */
declare const C: {
    ink: string;
    muted: string;
    line: string;
    headerBg: string;
    headerText: string;
    headerSub: string;
    tableHead: string;
    rowA: string;
    rowB: string;
    accent: string;
    success: string;
    danger: string;
    pillBg: string;
    brand: string;
};
declare const PAGE: {
    w: number;
    h: number;
};
declare const M = 40;
declare const CONTENT: number;
declare function formatDateShort(s: string): string;
declare function ensureSpace(doc: any, y: number, need: number): number;
declare function drawPeriodStrip(doc: any, y: number, from?: string, to?: string, extra?: string): number;
declare function drawSectionLabel(doc: any, y: number, text: string): number;
export type Kpi = {
    label: string;
    value: string;
    kind?: 'default' | 'pos' | 'neg' | 'amber';
};
declare function drawKpiGrid(doc: any, y: number, kpis: Kpi[], cols?: 2 | 3 | 4): number;
type ColAlign = 'left' | 'right' | 'center';
/** Primera columna a la izquierda, última a la derecha, intermedias centradas. Una sola columna: izquierda. */
declare function reportTableColAlign(nCols: number, c: number): ColAlign;
export type TableDrawOptions = {
    noWrapColumns?: number[];
};
/**
 * Dibuja tabla: `colWidths` se escalan para ocupar exactamente el ancho interior;
 * th y td comparten la misma rejilla (posiciones X y anchos de texto idénticos).
 * Alineación: primera col. izq., última der., el resto centrado.
 * La altura de fila (y cabecera) sigue al contenido; las filas demasiado altas se recortan
 * a ~12 líneas para no desbordar la página.
 * `noWrapColumns`: índices de columna forzados a una sola línea (p. ej. montos DOP+USD en tarjetas).
 */
declare function drawTable(doc: any, y: number, headers: string[], colWidths: number[], rows: (string | number)[][], options?: TableDrawOptions): number;
export declare class ReportPdfSession {
    doc: any;
    y: number;
    constructor(doc: any);
    period(from?: string, to?: string, extra?: string): void;
    section(title: string): void;
    note(message: string): void;
    kpis(items: Kpi[], cols?: 2 | 3 | 4): void;
    table(headers: string[], colWidths: number[], rows: (string | number)[][], options?: TableDrawOptions): void;
}
/**
 * Crea un PDF de reporte y devuelve el buffer (sin pie de página para evitar hojas en blanco con solo texto legal).
 */
export declare function renderReportPdf(title: string, tagline: string, build: (s: ReportPdfSession) => void): Promise<Buffer>;
export { drawSectionLabel, drawKpiGrid, drawTable, drawPeriodStrip, ensureSpace, C, M, CONTENT, formatDateShort, PAGE, reportTableColAlign };
//# sourceMappingURL=reportPdfLayout.d.ts.map