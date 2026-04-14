import { query } from '../config/database';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NotificationTemplateType,
} from '../constants/defaultNotificationTemplates';
import { seedDefaultTemplatesForUser } from './notificationTemplateSeed';

export interface NotificationTemplate {
  id: number;
  notificationType: NotificationTemplateType;
  titleTemplate: string;
  messageTemplate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariables {
  [key: string]: string | number;
}

async function ensureTemplates(userId: number): Promise<void> {
  await seedDefaultTemplatesForUser(userId);
}

/**
 * Plantilla por usuario y tipo
 */
export const getTemplate = async (
  userId: number,
  notificationType: NotificationTemplateType
): Promise<NotificationTemplate | null> => {
  await ensureTemplates(userId);
  try {
    const result = await query(
      'SELECT * FROM notification_templates WHERE user_id = $1 AND notification_type = $2',
      [userId, notificationType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      notificationType: row.notification_type,
      titleTemplate: row.title_template,
      messageTemplate: row.message_template,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    console.error('Error getting template:', error);
    return null;
  }
};

export const getAllTemplates = async (userId: number): Promise<NotificationTemplate[]> => {
  await ensureTemplates(userId);
  try {
    const result = await query(
      'SELECT * FROM notification_templates WHERE user_id = $1 ORDER BY notification_type',
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      notificationType: row.notification_type,
      titleTemplate: row.title_template,
      messageTemplate: row.message_template,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Error getting all templates:', error);
    return [];
  }
};

export const updateTemplate = async (
  userId: number,
  notificationType: NotificationTemplateType,
  titleTemplate: string,
  messageTemplate: string
): Promise<NotificationTemplate | null> => {
  await ensureTemplates(userId);
  try {
    const result = await query(
      `INSERT INTO notification_templates (user_id, notification_type, title_template, message_template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, notification_type)
       DO UPDATE SET
         title_template = EXCLUDED.title_template,
         message_template = EXCLUDED.message_template,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, notificationType, titleTemplate, messageTemplate]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      notificationType: row.notification_type,
      titleTemplate: row.title_template,
      messageTemplate: row.message_template,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    console.error('Error updating template:', error);
    throw error;
  }
};

export const renderTemplate = (template: string, variables: TemplateVariables): string => {
  let rendered = template;

  Object.keys(variables).forEach((key) => {
    const value = variables[key];
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    rendered = rendered.replace(regex, String(value));
  });

  return rendered;
};

export const getDefaultTemplate = (
  notificationType: NotificationTemplateType
): { title: string; message: string } => {
  return DEFAULT_NOTIFICATION_TEMPLATES[notificationType] ?? { title: '', message: '' };
};
