import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
/**
 * Get calendar events for a date range
 */
export declare const getEvents: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Get financial summary for a date range
 */
export declare const getSummary: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Update event status
 */
export declare const updateStatus: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Generate/refresh calendar events
 */
export declare const refreshEvents: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Lista eventos huérfanos (origen ya no existe en ingresos/gastos/préstamos/tarjetas). No modifica datos.
 * Al cargar el calendario se ocultan automáticamente del calendario (`show_on_calendar = false`) sin borrar la fila.
 */
export declare const listOrphanEvents: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * Eventos archivados en el rango (no visibles en el calendario; conservan título, monto y fecha para historial).
 */
export declare const getHistory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=calendarController.d.ts.map