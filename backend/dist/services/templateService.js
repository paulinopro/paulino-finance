"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultTemplate = exports.renderTemplate = exports.updateTemplate = exports.getAllTemplates = exports.getTemplate = void 0;
const database_1 = require("../config/database");
const defaultNotificationTemplates_1 = require("../constants/defaultNotificationTemplates");
const notificationTemplateSeed_1 = require("./notificationTemplateSeed");
async function ensureTemplates(userId) {
    await (0, notificationTemplateSeed_1.seedDefaultTemplatesForUser)(userId);
}
/**
 * Plantilla por usuario y tipo
 */
const getTemplate = async (userId, notificationType) => {
    await ensureTemplates(userId);
    try {
        const result = await (0, database_1.query)('SELECT * FROM notification_templates WHERE user_id = $1 AND notification_type = $2', [userId, notificationType]);
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
    }
    catch (error) {
        console.error('Error getting template:', error);
        return null;
    }
};
exports.getTemplate = getTemplate;
const getAllTemplates = async (userId) => {
    await ensureTemplates(userId);
    try {
        const result = await (0, database_1.query)('SELECT * FROM notification_templates WHERE user_id = $1 ORDER BY notification_type', [userId]);
        return result.rows.map((row) => ({
            id: row.id,
            notificationType: row.notification_type,
            titleTemplate: row.title_template,
            messageTemplate: row.message_template,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    catch (error) {
        console.error('Error getting all templates:', error);
        return [];
    }
};
exports.getAllTemplates = getAllTemplates;
const updateTemplate = async (userId, notificationType, titleTemplate, messageTemplate) => {
    await ensureTemplates(userId);
    try {
        const result = await (0, database_1.query)(`INSERT INTO notification_templates (user_id, notification_type, title_template, message_template)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, notification_type)
       DO UPDATE SET
         title_template = EXCLUDED.title_template,
         message_template = EXCLUDED.message_template,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`, [userId, notificationType, titleTemplate, messageTemplate]);
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
    }
    catch (error) {
        console.error('Error updating template:', error);
        throw error;
    }
};
exports.updateTemplate = updateTemplate;
const renderTemplate = (template, variables) => {
    let rendered = template;
    Object.keys(variables).forEach((key) => {
        const value = variables[key];
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        rendered = rendered.replace(regex, String(value));
    });
    return rendered;
};
exports.renderTemplate = renderTemplate;
const getDefaultTemplate = (notificationType) => {
    return defaultNotificationTemplates_1.DEFAULT_NOTIFICATION_TEMPLATES[notificationType] ?? { title: '', message: '' };
};
exports.getDefaultTemplate = getDefaultTemplate;
//# sourceMappingURL=templateService.js.map