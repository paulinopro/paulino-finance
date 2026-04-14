"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDefaultTemplatesForUser = seedDefaultTemplatesForUser;
exports.seedDefaultTemplatesForAllUsers = seedDefaultTemplatesForAllUsers;
const database_1 = require("../config/database");
const defaultNotificationTemplates_1 = require("../constants/defaultNotificationTemplates");
const TYPES = ['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'];
/**
 * Inserta las 3 plantillas por defecto para un usuario si faltan (tras migración o registro).
 */
async function seedDefaultTemplatesForUser(userId) {
    for (const type of TYPES) {
        const d = defaultNotificationTemplates_1.DEFAULT_NOTIFICATION_TEMPLATES[type];
        await (0, database_1.query)(`INSERT INTO notification_templates (user_id, notification_type, title_template, message_template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, notification_type) DO NOTHING`, [userId, type, d.title, d.message]);
    }
}
/**
 * Asegura plantillas por defecto para todos los usuarios que no las tengan completas.
 */
async function seedDefaultTemplatesForAllUsers() {
    const users = await (0, database_1.query)(`SELECT id FROM users`);
    for (const row of users.rows) {
        await seedDefaultTemplatesForUser(row.id);
    }
}
//# sourceMappingURL=notificationTemplateSeed.js.map