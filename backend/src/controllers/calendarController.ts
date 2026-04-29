import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { toYmdFromPgDate } from '../utils/dateUtils';
import {
  getCalendarEvents,
  generateCalendarEvents,
  updateEventStatus,
  getFinancialSummary,
  listOrphanCalendarEvents,
  getHiddenCalendarEvents,
} from '../services/calendarService';

/**
 * Get calendar events for a date range
 */
export const getEvents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { start, end, eventTypes, status, showPaid } = req.query;

    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    // Generate events from financial data if needed
    await generateCalendarEvents(userId, start as string, end as string);

    // Get events with filters
    const filters: any = {};
    if (eventTypes) {
      filters.eventTypes = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    }
    if (status) {
      filters.status = Array.isArray(status) ? status : [status];
    }
    if (showPaid !== undefined) {
      filters.showPaid = showPaid === 'true';
    }

    const events = await getCalendarEvents(userId, start as string, end as string, filters);

    res.json({ success: true, events });
  } catch (error: any) {
    console.error('Get calendar events error:', error);
    res.status(500).json({ message: 'Error fetching calendar events', error: error.message });
  }
};

/**
 * Get financial summary for a date range
 */
export const getSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    await generateCalendarEvents(userId, start as string, end as string);
    const summary = await getFinancialSummary(userId, start as string, end as string);

    res.json({ success: true, summary });
  } catch (error: any) {
    console.error('Get financial summary error:', error);
    res.status(500).json({ message: 'Error fetching financial summary', error: error.message });
  }
};

/**
 * Update event status
 */
export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['PENDING', 'PAID', 'RECEIVED', 'OVERDUE', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Valid status is required' });
    }

    const updatedEvent = await updateEventStatus(userId, parseInt(id), status);

    if (!updatedEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ success: true, event: updatedEvent, message: 'Event status updated successfully' });
  } catch (error: any) {
    console.error('Update event status error:', error);
    res.status(500).json({ message: 'Error updating event status', error: error.message });
  }
};

/**
 * Generate/refresh calendar events
 */
export const refreshEvents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    const { orphansHidden } = await generateCalendarEvents(userId, start as string, end as string);

    res.json({
      success: true,
      message: 'Calendar events refreshed successfully',
      orphansHidden,
      orphansPurged: orphansHidden,
    });
  } catch (error: any) {
    console.error('Refresh calendar events error:', error);
    res.status(500).json({ message: 'Error refreshing calendar events', error: error.message });
  }
};

/**
 * Lista eventos huérfanos (origen ya no existe en ingresos/gastos/préstamos/tarjetas). No modifica datos.
 * Al cargar el calendario se ocultan automáticamente del calendario (`show_on_calendar = false`) sin borrar la fila.
 */
export const listOrphanEvents = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const rows = await listOrphanCalendarEvents(userId);
    res.json({
      success: true,
      count: rows.length,
      orphans: rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        relatedId: r.related_id,
        relatedType: r.related_type,
        eventDate: toYmdFromPgDate(r.event_date),
        title: r.title,
        amount: parseFloat(String(r.amount)),
        currency: r.currency || 'DOP',
        status: r.status,
      })),
    });
  } catch (error: any) {
    console.error('List orphan calendar events error:', error);
    res.status(500).json({ message: 'Error listing orphan calendar events', error: error.message });
  }
};

/**
 * Eventos archivados en el rango (no visibles en el calendario; conservan título, monto y fecha para historial).
 */
export const getHistory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ message: 'Start and end dates are required' });
    }

    await generateCalendarEvents(userId, start as string, end as string);
    const events = await getHiddenCalendarEvents(userId, start as string, end as string);

    res.json({ success: true, count: events.length, events });
  } catch (error: any) {
    console.error('Get calendar history error:', error);
    res.status(500).json({ message: 'Error fetching calendar history', error: error.message });
  }
};
