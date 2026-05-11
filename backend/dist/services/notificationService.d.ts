/** Cron diario revisión tarjetas / préstamos / gastos recurrentes (hora local del proceso o TZ). */
export declare const NOTIFICATION_DAILY_CRON = "0 9 * * *";
export type NotificationSchedulerSweepStatus = {
    startedAt: string;
    finishedAt: string;
    ok: boolean;
    errorMessage?: string;
};
export type NotificationSchedulerRuntimeStatus = {
    cronExpression: string;
    expressionValid: boolean;
    schedulerRegistered: boolean;
    schedulerConfiguredAt: string | null;
    timezone: string | null;
    /** Explicación corta sobre interpretación horaria para super admin */
    cronTimeNoteEs: string;
    dailyJobActive: boolean;
    lastSweep: NotificationSchedulerSweepStatus | null;
};
/** Estado del job programado `node-cron` (solo lectura, para panel super admin). */
export declare function getNotificationSchedulerStatus(): NotificationSchedulerRuntimeStatus;
export declare const startNotificationScheduler: () => void;
//# sourceMappingURL=notificationService.d.ts.map