export declare function initWebPush(): void;
export declare function isWebPushConfigured(): boolean;
export declare function getVapidPublicKey(): string | null;
export declare function sendPushForNotification(userId: number, params: {
    title: string;
    message: string;
    notificationId: number;
}): Promise<void>;
//# sourceMappingURL=webPushService.d.ts.map