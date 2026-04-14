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
//# sourceMappingURL=calendarController.d.ts.map