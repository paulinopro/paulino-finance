import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { getAllTemplates, getTemplate, updateTemplate, getDefaultTemplate, renderTemplate } from '../services/templateService';
import { sendTelegramMessage } from '../services/telegramService';

/**
 * Get all notification templates
 */
export const getTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const templates = await getAllTemplates(userId);
    res.json({ success: true, templates });
  } catch (error: any) {
    console.error('Get templates error:', error);
    res.status(500).json({ message: 'Error fetching templates', error: error.message });
  }
};

/**
 * Get a specific template by type
 */
export const getTemplateByType = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    
    if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
      return res.status(400).json({ message: 'Invalid notification type' });
    }

    const userId = req.userId!;
    const template = await getTemplate(userId, type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE');

    if (!template) {
      const defaultTemplate = getDefaultTemplate(type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE');
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
  } catch (error: any) {
    console.error('Get template error:', error);
    res.status(500).json({ message: 'Error fetching template', error: error.message });
  }
};

/**
 * Update a notification template
 */
export const updateTemplateByType = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;
    const { titleTemplate, messageTemplate } = req.body;

    if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
      return res.status(400).json({ message: 'Invalid notification type' });
    }

    if (!titleTemplate || !messageTemplate) {
      return res.status(400).json({ message: 'Title and message templates are required' });
    }

    const userId = req.userId!;
    const updatedTemplate = await updateTemplate(
      userId,
      type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE',
      titleTemplate,
      messageTemplate
    );

    if (!updatedTemplate) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ success: true, template: updatedTemplate, message: 'Template updated successfully' });
  } catch (error: any) {
    console.error('Update template error:', error);
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
};

/**
 * Reset template to default
 */
export const resetTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.params;

    if (!['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].includes(type)) {
      return res.status(400).json({ message: 'Invalid notification type' });
    }

    const userId = req.userId!;
    const defaultTemplate = getDefaultTemplate(type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE');

    const updatedTemplate = await updateTemplate(
      userId,
      type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE',
      defaultTemplate.title,
      defaultTemplate.message
    );

    if (!updatedTemplate) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ success: true, template: updatedTemplate, message: 'Template reset to default' });
  } catch (error: any) {
    console.error('Reset template error:', error);
    res.status(500).json({ message: 'Error resetting template', error: error.message });
  }
};

/**
 * Test template by sending a test message
 */
export const testTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
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
    const userResult = await query(
      'SELECT telegram_chat_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.telegram_chat_id) {
      return res.status(400).json({
        success: false,
        message: 'Telegram Chat ID no está configurado. Por favor, configura tu Chat ID en Configuración.',
      });
    }

    const telegramChatId = userResult.rows[0].telegram_chat_id;

    const template = await getTemplate(userId, type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE');
    const defaultTemplate = getDefaultTemplate(type as 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE');
    
    const titleTemplate = template?.titleTemplate || defaultTemplate.title;
    const messageTemplate = template?.messageTemplate || defaultTemplate.message;

    // Create test variables based on type
    let testVariables: any = {};
    if (type === 'CARD_PAYMENT') {
      testVariables = {
        cardName: 'Tarjeta de Prueba',
        bankName: 'Banco de Prueba',
        dueDay: '25',
        debtText: '15,000.00 DOP',
        days: '7',
      };
    } else if (type === 'LOAN_PAYMENT') {
      testVariables = {
        loanName: 'Préstamo de Prueba',
        installmentAmount: '3,500.00',
        currency: 'DOP',
        paidInstallments: '5',
        totalInstallments: '36',
        nextPaymentDate: new Date().toLocaleDateString('es-DO'),
        days: '7',
      };
    } else if (type === 'RECURRING_EXPENSE') {
      testVariables = {
        description: 'Gasto Recurrente de Prueba',
        amount: '2,500.00',
        currency: 'DOP',
        paymentDay: '15',
        days: '7',
      };
    }

    // Render templates with test variables
    const title = renderTemplate(titleTemplate, {});
    const message = renderTemplate(messageTemplate, testVariables);

    // Send test message
    const sent = await sendTelegramMessage(telegramChatId, message);

    if (sent) {
      res.json({
        success: true,
        message: 'Mensaje de prueba enviado exitosamente. Revisa tu Telegram.',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error al enviar mensaje de prueba. Verifica que:\n1. El Telegram Bot Token esté configurado correctamente\n2. Tu Chat ID sea correcto\n3. Hayas iniciado una conversación con el bot primero',
      });
    }
  } catch (error: any) {
    console.error('Test template error:', error);
    res.status(500).json({ message: 'Error testing template', error: error.message });
  }
};
