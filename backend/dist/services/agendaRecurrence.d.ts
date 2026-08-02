import type { AgendaItemRow } from './agendaService';
type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
interface ParsedRRule {
    freq: Frequency;
    interval: number;
    until: Date | null;
    count: number | null;
    byDay: number[] | null;
}
export declare function parseAgendaRRule(raw: string | null | undefined): ParsedRRule | null;
export declare function expandAgendaRecurrences(rows: AgendaItemRow[], range: {
    from: Date;
    to: Date;
}): AgendaItemRow[];
export {};
//# sourceMappingURL=agendaRecurrence.d.ts.map