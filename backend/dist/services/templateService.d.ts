import { NotificationTemplateType } from '../constants/defaultNotificationTemplates';
export interface NotificationTemplate {
    id: number;
    notificationType: NotificationTemplateType;
    titleTemplate: string;
    messageTemplate: string;
    createdAt: string;
    updatedAt: string;
}
export interface TemplateVariables {
    [key: string]: string | number | undefined;
}
/**
 * Plantilla por usuario y tipo
 */
export declare const getTemplate: (userId: number, notificationType: NotificationTemplateType) => Promise<NotificationTemplate | null>;
export declare const getAllTemplates: (userId: number) => Promise<NotificationTemplate[]>;
export declare const updateTemplate: (userId: number, notificationType: NotificationTemplateType, titleTemplate: string, messageTemplate: string) => Promise<NotificationTemplate | null>;
export declare const renderTemplate: (template: string, variables: TemplateVariables) => string;
export declare const getDefaultTemplate: (notificationType: NotificationTemplateType) => {
    title: string;
    message: string;
};
//# sourceMappingURL=templateService.d.ts.map