"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgendaRRule = parseAgendaRRule;
exports.expandAgendaRecurrences = expandAgendaRecurrences;
const WEEKDAY_TO_UTC_DAY = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
};
function asDate(value) {
    return value instanceof Date ? value : new Date(value);
}
function parseRRuleDate(raw) {
    const v = raw.trim();
    if (/^\d{8}$/.test(v)) {
        const y = Number(v.slice(0, 4));
        const m = Number(v.slice(4, 6));
        const d = Number(v.slice(6, 8));
        const dt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (m) {
        const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
        return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? null : dt;
}
function parseAgendaRRule(raw) {
    if (!raw)
        return null;
    const line = raw
        .split(/\r?\n/)
        .map((x) => x.trim())
        .find((x) => x.toUpperCase().startsWith('RRULE:') || x.toUpperCase().startsWith('FREQ='));
    if (!line)
        return null;
    const body = line.toUpperCase().startsWith('RRULE:') ? line.slice(6) : line;
    const parts = new Map();
    for (const chunk of body.split(';')) {
        const idx = chunk.indexOf('=');
        if (idx <= 0)
            continue;
        parts.set(chunk.slice(0, idx).toUpperCase(), chunk.slice(idx + 1).toUpperCase());
    }
    const freqRaw = parts.get('FREQ');
    if (!freqRaw || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freqRaw))
        return null;
    const intervalRaw = Number(parts.get('INTERVAL') || '1');
    const countRaw = parts.get('COUNT') ? Number(parts.get('COUNT')) : null;
    const byDayRaw = parts.get('BYDAY');
    const byDay = byDayRaw
        ? byDayRaw
            .split(',')
            .map((token) => token.trim().replace(/^[+-]?\d+/, ''))
            .map((token) => WEEKDAY_TO_UTC_DAY[token])
            .filter((n) => Number.isInteger(n))
        : null;
    return {
        freq: freqRaw,
        interval: Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.floor(intervalRaw) : 1,
        until: parts.get('UNTIL') ? parseRRuleDate(parts.get('UNTIL')) : null,
        count: countRaw != null && Number.isFinite(countRaw) && countRaw > 0 ? Math.floor(countRaw) : null,
        byDay: byDay && byDay.length ? byDay : null,
    };
}
function addUtcDays(d, days) {
    const out = new Date(d);
    out.setUTCDate(out.getUTCDate() + days);
    return out;
}
function addUtcMonthsClamped(d, months) {
    const out = new Date(d);
    const wantedDay = out.getUTCDate();
    out.setUTCDate(1);
    out.setUTCMonth(out.getUTCMonth() + months);
    const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
    out.setUTCDate(Math.min(wantedDay, last));
    return out;
}
function addUtcYearsClamped(d, years) {
    const out = new Date(d);
    const wantedDay = out.getUTCDate();
    out.setUTCDate(1);
    out.setUTCFullYear(out.getUTCFullYear() + years);
    const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
    out.setUTCDate(Math.min(wantedDay, last));
    return out;
}
function stepOccurrence(anchor, rule, index) {
    if (rule.freq === 'DAILY')
        return addUtcDays(anchor, index * rule.interval);
    if (rule.freq === 'WEEKLY')
        return addUtcDays(anchor, index * rule.interval * 7);
    if (rule.freq === 'MONTHLY')
        return addUtcMonthsClamped(anchor, index * rule.interval);
    return addUtcYearsClamped(anchor, index * rule.interval);
}
function weeklyByDayOccurrences(anchor, rule, rangeEnd) {
    if (rule.freq !== 'WEEKLY' || !rule.byDay?.length)
        return [];
    const out = [];
    const anchorWeekStart = addUtcDays(anchor, -anchor.getUTCDay());
    const maxIterations = 3700;
    for (let weekIndex = 0; weekIndex < maxIterations; weekIndex += rule.interval) {
        const weekStart = addUtcDays(anchorWeekStart, weekIndex * 7);
        if (weekStart >= rangeEnd)
            break;
        for (const day of rule.byDay) {
            const candidate = addUtcDays(weekStart, day);
            candidate.setUTCHours(anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds());
            if (candidate >= anchor)
                out.push(candidate);
        }
    }
    return out.sort((a, b) => a.getTime() - b.getTime());
}
function expandAgendaRecurrences(rows, range) {
    const expanded = [];
    for (const row of rows) {
        const rule = parseAgendaRRule(row.recurrence_rule);
        if (!rule) {
            expanded.push(row);
            continue;
        }
        const anchorStart = asDate(row.starts_at);
        const anchorEnd = row.ends_at ? asDate(row.ends_at) : null;
        const durationMs = anchorEnd ? Math.max(0, anchorEnd.getTime() - anchorStart.getTime()) : 0;
        const candidates = rule.freq === 'WEEKLY' && rule.byDay?.length ? weeklyByDayOccurrences(anchorStart, rule, range.to) : null;
        const maxIterations = 5000;
        let emitted = 0;
        for (let i = 0; i < maxIterations; i += 1) {
            const occurrenceStart = candidates ? candidates[i] : stepOccurrence(anchorStart, rule, i);
            if (!occurrenceStart)
                break;
            if (rule.count != null && i >= rule.count)
                break;
            if (rule.until && occurrenceStart > rule.until)
                break;
            if (occurrenceStart >= range.to)
                break;
            const occurrenceEnd = anchorEnd ? new Date(occurrenceStart.getTime() + durationMs) : null;
            if ((occurrenceEnd ?? occurrenceStart) >= range.from && occurrenceStart < range.to) {
                expanded.push({
                    ...row,
                    starts_at: occurrenceStart,
                    ends_at: occurrenceEnd,
                    metadata: {
                        ...(row.metadata ?? {}),
                        recurrenceMasterId: row.id,
                        recurrenceOriginalStartsAt: anchorStart.toISOString(),
                    },
                });
                emitted += 1;
            }
        }
        if (emitted === 0 && anchorStart >= range.from && anchorStart < range.to) {
            expanded.push(row);
        }
    }
    return expanded.sort((a, b) => {
        const aTime = asDate(a.starts_at).getTime();
        const bTime = asDate(b.starts_at).getTime();
        return aTime === bTime ? a.id - b.id : aTime - bTime;
    });
}
//# sourceMappingURL=agendaRecurrence.js.map