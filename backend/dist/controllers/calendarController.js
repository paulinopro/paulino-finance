"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = exports.listOrphanEvents = exports.refreshEvents = exports.updateStatus = exports.getSummary = exports.getEvents = void 0;
const dateUtils_1 = require("../utils/dateUtils");
const calendarService_1 = require("../services/calendarService");
/**
 * Get calendar events for a date range
 */
const getEvents = async (req, res) => {
    try {
        const userId = req.userId;
        const { start, end, eventTypes, status, showPaid } = req.query;
        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end dates are required' });
        }
        // Generate events from financial data if needed
        await (0, calendarService_1.generateCalendarEvents)(userId, start, end);
        // Get events with filters
        const filters = {};
        if (eventTypes) {
            filters.eventTypes = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
        }
        if (status) {
            filters.status = Array.isArray(status) ? status : [status];
        }
        if (showPaid !== undefined) {
            filters.showPaid = showPaid === 'true';
        }
        const events = await (0, calendarService_1.getCalendarEvents)(userId, start, end, filters);
        res.json({ success: true, events });
    }
    catch (error) {
        console.error('Get calendar events error:', error);
        res.status(500).json({ message: 'Error fetching calendar events', error: error.message });
    }
};
exports.getEvents = getEvents;
/**
 * Get financial summary for a date range
 */
const getSummary = async (req, res) => {
    try {
        const userId = req.userId;
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end dates are required' });
        }
        await (0, calendarService_1.generateCalendarEvents)(userId, start, end);
        const summary = await (0, calendarService_1.getFinancialSummary)(userId, start, end);
        res.json({ success: true, summary });
    }
    catch (error) {
        console.error('Get financial summary error:', error);
        res.status(500).json({ message: 'Error fetching financial summary', error: error.message });
    }
};
exports.getSummary = getSummary;
/**
 * Update event status
 */
const updateStatus = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { status, actualAmount } = req.body;
        if (!status || !['PENDING', 'PAID', 'RECEIVED', 'OVERDUE', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ message: 'Valid status is required' });
        }
        const updatedEvent = await (0, calendarService_1.updateEventStatus)(userId, parseInt(id), status, {
            actualAmount: actualAmount !== undefined && actualAmount !== null && actualAmount !== ''
                ? actualAmount
                : undefined,
        });
        if (!updatedEvent) {
            return res.status(404).json({ message: 'Event not found' });
        }
        res.json({ success: true, event: updatedEvent, message: 'Event status updated successfully' });
    }
    catch (error) {
        if (error?.message === 'INVALID_ACTUAL_AMOUNT') {
            return res.status(400).json({ message: 'actualAmount must be a positive number' });
        }
        console.error('Update event status error:', error);
        res.status(500).json({ message: 'Error updating event status', error: error.message });
    }
};
exports.updateStatus = updateStatus;
/**
 * Generate/refresh calendar events
 */
const refreshEvents = async (req, res) => {
    try {
        const userId = req.userId;
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end dates are required' });
        }
        const { orphansHidden } = await (0, calendarService_1.generateCalendarEvents)(userId, start, end);
        res.json({
            success: true,
            message: 'Calendar events refreshed successfully',
            orphansHidden,
            orphansPurged: orphansHidden,
        });
    }
    catch (error) {
        console.error('Refresh calendar events error:', error);
        res.status(500).json({ message: 'Error refreshing calendar events', error: error.message });
    }
};
exports.refreshEvents = refreshEvents;
/**
 * Lista eventos huérfanos (origen ya no existe en ingresos/gastos/préstamos/tarjetas). No modifica datos.
 * Al cargar el calendario se ocultan automáticamente del calendario (`show_on_calendar = false`) sin borrar la fila.
 */
const listOrphanEvents = async (req, res) => {
    try {
        const userId = req.userId;
        const rows = await (0, calendarService_1.listOrphanCalendarEvents)(userId);
        res.json({
            success: true,
            count: rows.length,
            orphans: rows.map((r) => ({
                id: r.id,
                eventType: r.event_type,
                relatedId: r.related_id,
                relatedType: r.related_type,
                eventDate: (0, dateUtils_1.toYmdFromPgDate)(r.event_date),
                title: r.title,
                amount: parseFloat(String(r.amount)),
                currency: r.currency || 'DOP',
                status: r.status,
            })),
        });
    }
    catch (error) {
        console.error('List orphan calendar events error:', error);
        res.status(500).json({ message: 'Error listing orphan calendar events', error: error.message });
    }
};
exports.listOrphanEvents = listOrphanEvents;
/**
 * Eventos archivados en el rango (no visibles en el calendario; conservan título, monto y fecha para historial).
 */
const getHistory = async (req, res) => {
    try {
        const userId = req.userId;
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ message: 'Start and end dates are required' });
        }
        await (0, calendarService_1.generateCalendarEvents)(userId, start, end);
        const events = await (0, calendarService_1.getHiddenCalendarEvents)(userId, start, end);
        res.json({ success: true, count: events.length, events });
    }
    catch (error) {
        console.error('Get calendar history error:', error);
        res.status(500).json({ message: 'Error fetching calendar history', error: error.message });
    }
};
exports.getHistory = getHistory;
//# sourceMappingURL=calendarController.js.map