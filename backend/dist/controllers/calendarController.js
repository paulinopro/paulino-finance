"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshEvents = exports.updateStatus = exports.getSummary = exports.getEvents = void 0;
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
        const { status } = req.body;
        if (!status || !['PENDING', 'PAID', 'RECEIVED', 'OVERDUE', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ message: 'Valid status is required' });
        }
        const updatedEvent = await (0, calendarService_1.updateEventStatus)(userId, parseInt(id), status);
        if (!updatedEvent) {
            return res.status(404).json({ message: 'Event not found' });
        }
        res.json({ success: true, event: updatedEvent, message: 'Event status updated successfully' });
    }
    catch (error) {
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
        await (0, calendarService_1.generateCalendarEvents)(userId, start, end);
        res.json({ success: true, message: 'Calendar events refreshed successfully' });
    }
    catch (error) {
        console.error('Refresh calendar events error:', error);
        res.status(500).json({ message: 'Error refreshing calendar events', error: error.message });
    }
};
exports.refreshEvents = refreshEvents;
//# sourceMappingURL=calendarController.js.map