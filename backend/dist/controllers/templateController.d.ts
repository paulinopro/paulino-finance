import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
/**
 * Get all notification templates
 */
export declare const getTemplates: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * Get a specific template by type
 */
export declare const getTemplateByType: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Update a notification template
 */
export declare const updateTemplateByType: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Reset template to default
 */
export declare const resetTemplate: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Test template by sending a test message
 */
export declare const testTemplate: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=templateController.d.ts.map