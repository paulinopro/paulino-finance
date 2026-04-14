import { query } from '../config/database';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NotificationTemplateType,
} from '../constants/defaultNotificationTemplates';

const TYPES: NotificationTemplateType[] = ['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'];

/**
 * Inserta las 3 plantillas por defecto para un usuario si faltan (tras migración o registro).
 */
export async function seedDefaultTemplatesForUser(userId: number): Promise<void> {
  for (const type of TYPES) {
    const d = DEFAULT_NOTIFICATION_TEMPLATES[type];
    await query(
      `INSERT INTO notification_templates (user_id, notification_type, title_template, message_template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, notification_type) DO NOTHING`,
      [userId, type, d.title, d.message]
    );
  }
}

/**
 * Asegura plantillas por defecto para todos los usuarios que no las tengan completas.
 */
export async function seedDefaultTemplatesForAllUsers(): Promise<void> {
  const users = await query(`SELECT id FROM users`);
  for (const row of users.rows) {
    await seedDefaultTemplatesForUser(row.id as number);
  }
}
