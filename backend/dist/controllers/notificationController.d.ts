import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getNotifications: (req: AuthRequest, res: Response) => Promise<void>;
export declare const markAsRead: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getNotificationSettings: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateNotificationSettings: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const markAllAsRead: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteNotification: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const testNotification: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=notificationController.d.ts.map