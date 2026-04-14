import cron from 'node-cron';
import { query } from '../config/database';
import { sendTelegramMessage, initializeTelegramBot } from './telegramService';
import { getTemplate, renderTemplate } from './templateService';

// Initialize Telegram Bot
initializeTelegramBot();

const checkAndSendNotifications = async () => {
  try {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    // Get all users with notification settings enabled
    const usersResult = await query(
      `SELECT DISTINCT u.id, u.telegram_chat_id, u.exchange_rate_dop_usd
       FROM users u
       INNER JOIN notification_settings ns ON u.id = ns.user_id
       WHERE ns.enabled = true`,
      []
    );

    for (const user of usersResult.rows) {
      const userId = user.id;
      const telegramChatId = user.telegram_chat_id;

      if (!telegramChatId) {
        continue; // Skip users without Telegram chat ID
      }

      // Get user's notification settings
      const settingsResult = await query(
        `SELECT notification_type, days_before, telegram_enabled
         FROM notification_settings
         WHERE user_id = $1 AND enabled = true`,
        [userId]
      );

      const settings: { [key: string]: any } = {};
      settingsResult.rows.forEach((row) => {
        settings[row.notification_type] = {
          daysBefore: row.days_before || [3, 7],
          telegramEnabled: row.telegram_enabled,
        };
      });

      // Check credit card payment due dates
      if (settings['CARD_PAYMENT']?.telegramEnabled) {
        const cardsResult = await query(
          `SELECT id, bank_name, card_name, payment_due_day, current_debt_dop, current_debt_usd, currency_type
           FROM credit_cards
           WHERE user_id = $1`,
          [userId]
        );

        for (const card of cardsResult.rows) {
          const dueDay = card.payment_due_day;
          const daysBefore = settings['CARD_PAYMENT'].daysBefore || [3, 7];

          for (const days of daysBefore) {
            const targetDate = new Date(currentYear, currentMonth - 1, dueDay);
            targetDate.setDate(targetDate.getDate() - days);

            if (
              targetDate.getDate() === currentDay &&
              targetDate.getMonth() + 1 === currentMonth &&
              targetDate.getFullYear() === currentYear
            ) {
              const debtDop = parseFloat(card.current_debt_dop || 0);
              const debtUsd = parseFloat(card.current_debt_usd || 0);
              let debtText = '';
              if (card.currency_type === 'DOP') {
                debtText = `${debtDop.toFixed(2)} DOP`;
              } else if (card.currency_type === 'USD') {
                debtText = `${debtUsd.toFixed(2)} USD`;
              } else {
                debtText = `${debtDop.toFixed(2)} DOP / ${debtUsd.toFixed(2)} USD`;
              }

              // Get template and render message
              const template = await getTemplate(userId, 'CARD_PAYMENT');
              const titleTemplate = template?.titleTemplate || 'Recordatorio de Pago de Tarjeta';
              const messageTemplate = template?.messageTemplate || 
                '🔔 <b>Recordatorio de Pago de Tarjeta</b>\n\nTarjeta: {cardName} - {bankName}\nFecha límite: {dueDay} de este mes\nDeuda actual: {debtText}\nDías restantes: {days}';
              
              const title = renderTemplate(titleTemplate, {});
              const message = renderTemplate(messageTemplate, {
                cardName: card.card_name,
                bankName: card.bank_name,
                dueDay: dueDay,
                debtText: debtText,
                days: days,
              });

              // Create notification in database
              await query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'CARD_PAYMENT', $2, $3, $4, 'CARD')
                 ON CONFLICT DO NOTHING`,
                [userId, title.replace(/<[^>]*>/g, ''), message.replace(/<[^>]*>/g, ''), card.id]
              );

              // Send Telegram message
              await sendTelegramMessage(telegramChatId, message);
            }
          }
        }
      }

      // Check loan payment due dates
      if (settings['LOAN_PAYMENT']?.telegramEnabled) {
        const loansResult = await query(
          `SELECT id, loan_name, installment_amount, paid_installments, total_installments, currency
           FROM loans
           WHERE user_id = $1 AND status = 'ACTIVE'`,
          [userId]
        );

        for (const loan of loansResult.rows) {
          // Calculate next payment date (simplified: assume monthly payments)
          const nextPaymentDate = new Date();
          nextPaymentDate.setDate(1); // First day of next month
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

          const daysBefore = settings['LOAN_PAYMENT'].daysBefore || [3, 7];
          for (const days of daysBefore) {
            const targetDate = new Date(nextPaymentDate);
            targetDate.setDate(targetDate.getDate() - days);

            if (
              targetDate.getDate() === currentDay &&
              targetDate.getMonth() + 1 === currentMonth &&
              targetDate.getFullYear() === currentYear
            ) {
              // Get template and render message
              const template = await getTemplate(userId, 'LOAN_PAYMENT');
              const titleTemplate = template?.titleTemplate || 'Recordatorio de Pago de Préstamo';
              const messageTemplate = template?.messageTemplate || 
                '🔔 <b>Recordatorio de Pago de Préstamo</b>\n\nPréstamo: {loanName}\nMonto de cuota: {installmentAmount} {currency}\nProgreso: {paidInstallments}/{totalInstallments} cuotas\nPróximo pago: {nextPaymentDate}\nDías restantes: {days}';
              
              const title = renderTemplate(titleTemplate, {});
              const message = renderTemplate(messageTemplate, {
                loanName: loan.loan_name,
                installmentAmount: parseFloat(loan.installment_amount).toFixed(2),
                currency: loan.currency,
                paidInstallments: loan.paid_installments,
                totalInstallments: loan.total_installments,
                nextPaymentDate: nextPaymentDate.toLocaleDateString('es-DO'),
                days: days,
              });

              await query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'LOAN_PAYMENT', $2, $3, $4, 'LOAN')
                 ON CONFLICT DO NOTHING`,
                [userId, title.replace(/<[^>]*>/g, ''), message.replace(/<[^>]*>/g, ''), loan.id]
              );

              await sendTelegramMessage(telegramChatId, message);
            }
          }
        }
      }

      // Check recurring expenses
      if (settings['RECURRING_EXPENSE']?.telegramEnabled) {
        // Only check expenses that haven't been paid this month
        const expensesResult = await query(
          `SELECT id, description, amount, currency, payment_day, last_paid_month, last_paid_year
           FROM expenses
           WHERE user_id = $1 
             AND expense_type = 'RECURRING_MONTHLY' 
             AND (last_paid_month IS NULL 
                  OR last_paid_month != $2 
                  OR last_paid_year != $3)`,
          [userId, currentMonth, currentYear]
        );

        for (const expense of expensesResult.rows) {
          const paymentDay = expense.payment_day;
          const daysBefore = settings['RECURRING_EXPENSE'].daysBefore || [3, 7];

          for (const days of daysBefore) {
            const targetDate = new Date(currentYear, currentMonth - 1, paymentDay);
            targetDate.setDate(targetDate.getDate() - days);

            if (
              targetDate.getDate() === currentDay &&
              targetDate.getMonth() + 1 === currentMonth &&
              targetDate.getFullYear() === currentYear
            ) {
              // Get template and render message
              const template = await getTemplate(userId, 'RECURRING_EXPENSE');
              const titleTemplate = template?.titleTemplate || 'Recordatorio de Gasto Recurrente';
              const messageTemplate = template?.messageTemplate || 
                '🔔 <b>Recordatorio de Gasto Recurrente</b>\n\nDescripción: {description}\nMonto: {amount} {currency}\nFecha de pago: {paymentDay} de este mes\nDías restantes: {days}';
              
              const title = renderTemplate(titleTemplate, {});
              const message = renderTemplate(messageTemplate, {
                description: expense.description,
                amount: parseFloat(expense.amount).toFixed(2),
                currency: expense.currency,
                paymentDay: paymentDay,
                days: days,
              });

              await query(
                `INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'RECURRING_EXPENSE', $2, $3, $4, 'EXPENSE')
                 ON CONFLICT DO NOTHING`,
                [userId, title.replace(/<[^>]*>/g, ''), message.replace(/<[^>]*>/g, ''), expense.id]
              );

              await sendTelegramMessage(telegramChatId, message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking notifications:', error);
  }
};

export const startNotificationScheduler = () => {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', () => {
    console.log('Running notification check...');
    checkAndSendNotifications();
  });

  // Also run immediately on startup (for testing)
  setTimeout(() => {
    checkAndSendNotifications();
  }, 5000);

  console.log('Notification scheduler configured to run daily at 9:00 AM');
};
