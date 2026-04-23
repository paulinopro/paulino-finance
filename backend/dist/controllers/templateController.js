"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testTemplate = exports.resetTemplate = exports.updateTemplateByType = exports.getTemplateByType = exports.getTemplates = void 0;
const database_1 = require("../config/database");
const templateService_1 = require("../services/templateService");
const telegramService_1 = require("../services/telegramService");
/**
 * Get all notification templates
 */
const getTemplates = async (req, res) => {
    try {
        const userId = req.userId;
        const templates = await (0, templateService_1.getAllTemplates)(userId);
        res.json({ success: true, templates });
    }
    catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ message: 'Error fetching templates', error: error.message });
    }
};
exports.getTemplates = getTemplates;
/**
 * Get a specific template by type
 */
const getTemplateByType = async (req, res) => {
    try {
        const { type } = req.params;
        if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
            return res.status(400).json({ message: 'Invalid notification type' });
        }
        const userId = req.userId;
        const template = await (0, templateService_1.getTemplate)(userId, type);
        if (!template) {
            const defaultTemplate = (0, templateService_1.getDefaultTemplate)(type);
            return res.json({
                success: true,
                template: {
                    notificationType: type,
                    titleTemplate: defaultTemplate.title,
                    messageTemplate: defaultTemplate.message,
                },
            });
        }
        res.json({ success: true, template });
    }
    catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ message: 'Error fetching template', error: error.message });
    }
};
exports.getTemplateByType = getTemplateByType;
/**
 * Update a notification template
 */
const updateTemplateByType = async (req, res) => {
    try {
        const { type } = req.params;
        const { titleTemplate, messageTemplate } = req.body;
        if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
            return res.status(400).json({ message: 'Invalid notification type' });
        }
        if (!titleTemplate || !messageTemplate) {
            return res.status(400).json({ message: 'Title and message templates are required' });
        }
        const userId = req.userId;
        const updatedTemplate = await (0, templateService_1.updateTemplate)(userId, type, titleTemplate, messageTemplate);
        if (!updatedTemplate) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json({ success: true, template: updatedTemplate, message: 'Template updated successfully' });
    }
    catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ message: 'Error updating template', error: error.message });
    }
};
exports.updateTemplateByType = updateTemplateByType;
/**
 * Reset template to default
 */
const resetTemplate = async (req, res) => {
    try {
        const { type } = req.params;
        if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
            return res.status(400).json({ message: 'Invalid notification type' });
        }
        const userId = req.userId;
        const defaultTemplate = (0, templateService_1.getDefaultTemplate)(type);
        const updatedTemplate = await (0, templateService_1.updateTemplate)(userId, type, defaultTemplate.title, defaultTemplate.message);
        if (!updatedTemplate) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json({ success: true, template: updatedTemplate, message: 'Template reset to default' });
    }
    catch (error) {
        console.error('Reset template error:', error);
        res.status(500).json({ message: 'Error resetting template', error: error.message });
    }
};
exports.resetTemplate = resetTemplate;
/**
 * Test template by sending a test message
 */
const testTemplate = async (req, res) => {
    try {
        const userId = req.userId;
        const { type } = req.params;
        if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
            return res.status(400).json({ message: 'Invalid notification type' });
        }
        // Check if Telegram Bot Token is configured
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!telegramToken || telegramToken === 'your-telegram-bot-token' || telegramToken.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Telegram Bot Token no está configurado. Por favor, configura TELEGRAM_BOT_TOKEN en las variables de entorno.',
            });
        }
        // Get user's telegram chat ID
        const userResult = await (0, database_1.query)('SELECT telegram_chat_id FROM users WHERE id = $1', [userId]);
        if (!userResult.rows[0]?.telegram_chat_id) {
            return res.status(400).json({
                success: false,
                message: 'Telegram Chat ID no está configurado. Por favor, configura tu Chat ID en Configuración.',
            });
        }
        const telegramChatId = userResult.rows[0].telegram_chat_id;
        const template = await (0, templateService_1.getTemplate)(userId, type);
        const defaultTemplate = (0, templateService_1.getDefaultTemplate)(type);
        const titleTemplate = template?.titleTemplate || defaultTemplate.title;
        const messageTemplate = template?.messageTemplate || defaultTemplate.message;
        // Create test variables based on type
        let testVariables = {};
        if (type === 'CARD_PAYMENT') {
            testVariables = {
                cardName: 'Tarjeta Oro',
                bankName: 'Banco de Prueba',
                dueDay: '25',
                days: '7',
                debtText: '12,500.00 DOP / 200.00 USD',
                currencyType: 'DUAL',
                currencyTypeLabel: 'DOP y USD (dual)',
                cutOffDay: '12',
                creditLimitDop: '50000.00',
                creditLimitUsd: '2000.00',
                currentDebtDop: '12500.00',
                currentDebtUsd: '200.00',
                minimumPaymentDop: '500.00',
                minimumPaymentUsd: '25.00',
            };
        }
        else if (type === 'LOAN_PAYMENT') {
            testVariables = {
                loanName: 'Préstamo de Prueba',
                installmentAmount: '3,500.00',
                currency: 'DOP',
                paidInstallments: '5',
                totalInstallments: '36',
                nextPaymentDate: new Date().toLocaleDateString('es-DO'),
                days: '7',
            };
        }
        else if (type === 'RECURRING_EXPENSE') {
            testVariables = {
                description: 'Gasto Recurrente de Prueba',
                amount: '2500.00',
                currency: 'DOP',
                paymentDay: '15',
                days: '7',
                expenseScheduleLabel: 'Recurrente mensual',
                expenseTypeLabel: 'Recurrente mensual',
                category: 'Servicios',
            };
        }
        // Render templates with test variables
        const title = (0, templateService_1.renderTemplate)(titleTemplate, {});
        const message = (0, templateService_1.renderTemplate)(messageTemplate, testVariables);
        // Send test message
        const sent = await (0, telegramService_1.sendTelegramMessage)(telegramChatId, message);
        if (sent) {
            res.json({
                success: true,
                message: 'Mensaje de prueba enviado exitosamente. Revisa tu Telegram.',
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Error al enviar mensaje de prueba. Verifica que:\n1. El Telegram Bot Token esté configurado correctamente\n2. Tu Chat ID sea correcto\n3. Hayas iniciado una conversación con el bot primero',
            });
        }
    }
    catch (error) {
        console.error('Test template error:', error);
        res.status(500).json({ message: 'Error testing template', error: error.message });
    }
};
exports.testTemplate = testTemplate;
//# sourceMappingURL=templateController.js.map