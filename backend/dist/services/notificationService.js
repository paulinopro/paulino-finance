"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotificationScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../config/database");
const telegramService_1 = require("./telegramService");
const templateService_1 = require("./templateService");
const webPushService_1 = require("./webPushService");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
// Initialize Telegram Bot
(0, telegramService_1.initializeTelegramBot)();
function formatMoneyOpt(v) {
    if (v == null || v === '')
        return '';
    const n = parseFloat(String(v));
    if (Number.isNaN(n))
        return '';
    return n.toFixed(2);
}
/** Variables para plantillas de pago de tarjeta (alineado con credit_cards + condicionales por moneda). */
function buildCardPaymentTemplateVariables(card, days) {
    const ct = String(card.currency_type ?? '');
    const debtDop = parseFloat(String(card.current_debt_dop ?? 0));
    const debtUsd = parseFloat(String(card.current_debt_usd ?? 0));
    let debtText = '';
    if (ct === 'DOP') {
        debtText = `${debtDop.toFixed(2)} DOP`;
    }
    else if (ct === 'USD') {
        debtText = `${debtUsd.toFixed(2)} USD`;
    }
    else {
        debtText = `${debtDop.toFixed(2)} DOP / ${debtUsd.toFixed(2)} USD`;
    }
    const currencyTypeLabel = {
        DOP: 'DOP',
        USD: 'USD',
        DUAL: 'DOP y USD (dual)',
    };
    const hideDop = ct === 'USD';
    const hideUsd = ct === 'DOP';
    const dueDay = card.payment_due_day;
    return {
        cardName: String(card.card_name ?? ''),
        bankName: String(card.bank_name ?? ''),
        dueDay: String(dueDay ?? ''),
        days: String(days),
        debtText,
        currencyType: ct,
        currencyTypeLabel: currencyTypeLabel[ct] ?? ct,
        cutOffDay: String(card.cut_off_day ?? ''),
        creditLimitDop: hideDop ? '' : formatMoneyOpt(card.credit_limit_dop),
        creditLimitUsd: hideUsd ? '' : formatMoneyOpt(card.credit_limit_usd),
        currentDebtDop: hideDop ? '' : formatMoneyOpt(card.current_debt_dop),
        currentDebtUsd: hideUsd ? '' : formatMoneyOpt(card.current_debt_usd),
        minimumPaymentDop: hideDop ? '' : formatMoneyOpt(card.minimum_payment_dop),
        minimumPaymentUsd: hideUsd ? '' : formatMoneyOpt(card.minimum_payment_usd),
    };
}
const checkAndSendNotifications = async () => {
    try {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        // Get all users with notification settings enabled
        const usersResult = await (0, database_1.query)(`SELECT DISTINCT u.id, u.telegram_chat_id, u.exchange_rate_dop_usd
       FROM users u
       INNER JOIN notification_settings ns ON u.id = ns.user_id
       WHERE ns.enabled = true`, []);
        for (const user of usersResult.rows) {
            const userId = user.id;
            const telegramChatId = user.telegram_chat_id;
            // Get user's notification settings
            const settingsResult = await (0, database_1.query)(`SELECT notification_type, days_before, telegram_enabled
         FROM notification_settings
         WHERE user_id = $1 AND enabled = true`, [userId]);
            const settings = {};
            settingsResult.rows.forEach((row) => {
                settings[row.notification_type] = {
                    daysBefore: row.days_before || [3, 7],
                    telegramEnabled: row.telegram_enabled,
                };
            });
            // Check credit card payment due dates (in-app + push si aplica; Telegram opcional)
            if (settings['CARD_PAYMENT']?.enabled) {
                const cardsResult = await (0, database_1.query)(`SELECT id, bank_name, card_name, currency_type,
                  credit_limit_dop, credit_limit_usd,
                  current_debt_dop, current_debt_usd,
                  minimum_payment_dop, minimum_payment_usd,
                  cut_off_day, payment_due_day
           FROM credit_cards
           WHERE user_id = $1`, [userId]);
                for (const card of cardsResult.rows) {
                    const dueDay = card.payment_due_day;
                    const daysBefore = settings['CARD_PAYMENT'].daysBefore || [3, 7];
                    for (const days of daysBefore) {
                        const targetDate = new Date(currentYear, currentMonth - 1, dueDay);
                        targetDate.setDate(targetDate.getDate() - days);
                        if (targetDate.getDate() === currentDay &&
                            targetDate.getMonth() + 1 === currentMonth &&
                            targetDate.getFullYear() === currentYear) {
                            const template = await (0, templateService_1.getTemplate)(userId, 'CARD_PAYMENT');
                            const titleTemplate = template?.titleTemplate || 'Recordatorio de Pago de Tarjeta';
                            const messageTemplate = template?.messageTemplate ||
                                `🔔 <b>Recordatorio de Pago de Tarjeta</b> 🔔

<b>Banco:</b> {bankName}
<b>Tarjeta:</b> {cardName}
<b>Tipo de moneda:</b> {currencyTypeLabel}

{{#if creditLimitDop}}<b>Límite de crédito (DOP):</b> {creditLimitDop}{{/if}}
{{#if currentDebtDop}}<b>Deuda actual (DOP):</b> {currentDebtDop}{{/if}}
{{#if minimumPaymentDop}}<b>Pago mínimo (DOP):</b> {minimumPaymentDop}{{/if}}
{{#if creditLimitUsd}}<b>Límite de crédito (USD):</b> {creditLimitUsd}{{/if}}
{{#if currentDebtUsd}}<b>Deuda actual (USD):</b> {currentDebtUsd}{{/if}}
{{#if minimumPaymentUsd}}<b>Pago mínimo (USD):</b> {minimumPaymentUsd}{{/if}}

<b>Deuda resumida:</b> {debtText}
<b>Día de corte:</b> {cutOffDay}
<b>Día límite de pago:</b> {dueDay} de este mes
<b>Días restantes (recordatorio):</b> {days}`;
                            const title = (0, templateService_1.renderTemplate)(titleTemplate, {});
                            const message = (0, templateService_1.renderTemplate)(messageTemplate, buildCardPaymentTemplateVariables(card, days));
                            const plainTitle = title.replace(/<[^>]*>/g, '');
                            const ins = await (0, database_1.query)(`INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'CARD_PAYMENT', $2, $3, $4, 'CARD')
                 RETURNING id`, [userId, plainTitle, message, card.id]);
                            const nid = ins.rows[0]?.id;
                            if (nid != null) {
                                await (0, webPushService_1.sendPushForNotification)(userId, {
                                    title: plainTitle,
                                    message,
                                    notificationId: nid,
                                });
                            }
                            if (settings['CARD_PAYMENT']?.telegramEnabled && telegramChatId) {
                                await (0, telegramService_1.sendTelegramMessage)(telegramChatId, message);
                            }
                        }
                    }
                }
            }
            // Check loan payment due dates
            if (settings['LOAN_PAYMENT']?.enabled) {
                const loansResult = await (0, database_1.query)(`SELECT id, loan_name, installment_amount, paid_installments, total_installments, currency
           FROM loans
           WHERE user_id = $1 AND status = 'ACTIVE'`, [userId]);
                for (const loan of loansResult.rows) {
                    // Calculate next payment date (simplified: assume monthly payments)
                    const nextPaymentDate = new Date();
                    nextPaymentDate.setDate(1); // First day of next month
                    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
                    const daysBefore = settings['LOAN_PAYMENT'].daysBefore || [3, 7];
                    for (const days of daysBefore) {
                        const targetDate = new Date(nextPaymentDate);
                        targetDate.setDate(targetDate.getDate() - days);
                        if (targetDate.getDate() === currentDay &&
                            targetDate.getMonth() + 1 === currentMonth &&
                            targetDate.getFullYear() === currentYear) {
                            // Get template and render message
                            const template = await (0, templateService_1.getTemplate)(userId, 'LOAN_PAYMENT');
                            const titleTemplate = template?.titleTemplate || 'Recordatorio de Pago de Préstamo';
                            const messageTemplate = template?.messageTemplate ||
                                '🔔 <b>Recordatorio de Pago de Préstamo</b> 🔔\n\n<b>Préstamo:</b> {loanName}\n<b>Monto de cuota:</b> {installmentAmount} {currency}\n<b>Progreso:</b> {paidInstallments}/{totalInstallments} cuotas\n<b>Próximo pago:</b> {nextPaymentDate}\n<b>Días restantes:</b> {days}';
                            const title = (0, templateService_1.renderTemplate)(titleTemplate, {});
                            const message = (0, templateService_1.renderTemplate)(messageTemplate, {
                                loanName: loan.loan_name,
                                installmentAmount: parseFloat(loan.installment_amount).toFixed(2),
                                currency: loan.currency,
                                paidInstallments: loan.paid_installments,
                                totalInstallments: loan.total_installments,
                                nextPaymentDate: nextPaymentDate.toLocaleDateString('es-DO'),
                                days: days,
                            });
                            await (0, database_1.query)(`INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'LOAN_PAYMENT', $2, $3, $4, 'LOAN')
                 ON CONFLICT DO NOTHING`, [userId, title.replace(/<[^>]*>/g, ''), message, loan.id]);
                            await (0, telegramService_1.sendTelegramMessage)(telegramChatId, message);
                        }
                    }
                }
            }
            // Check recurring expenses
            if (settings['RECURRING_EXPENSE']?.enabled) {
                // Only check expenses that haven't been paid this month
                const expensesResult = await (0, database_1.query)(`SELECT id, description, amount, currency, payment_day, last_paid_month, last_paid_year,
                  nature, category, frequency, recurrence_type
           FROM expenses
           WHERE user_id = $1 
             AND recurrence_type = 'recurrent'
             AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'
             AND (last_paid_month IS NULL 
                  OR last_paid_month != $2 
                  OR last_paid_year != $3)`, [userId, currentMonth, currentYear]);
                for (const expense of expensesResult.rows) {
                    const paymentDay = expense.payment_day;
                    const daysBefore = settings['RECURRING_EXPENSE'].daysBefore || [3, 7];
                    for (const days of daysBefore) {
                        const targetDate = new Date(currentYear, currentMonth - 1, paymentDay);
                        targetDate.setDate(targetDate.getDate() - days);
                        if (targetDate.getDate() === currentDay &&
                            targetDate.getMonth() + 1 === currentMonth &&
                            targetDate.getFullYear() === currentYear) {
                            // Get template and render message
                            const template = await (0, templateService_1.getTemplate)(userId, 'RECURRING_EXPENSE');
                            const titleTemplate = template?.titleTemplate || 'Recordatorio de Gasto Recurrente';
                            const messageTemplate = template?.messageTemplate ||
                                `🔔 <b>Recordatorio de Gasto Recurrente</b> 🔔

<b>Calendario:</b> {expenseScheduleLabel}
{{#if category}}<b>Categoría:</b> {category}{{/if}}
<b>Descripción:</b> {description}
<b>Monto:</b> {amount} {currency}
<b>Fecha de pago:</b> {paymentDay} de este mes
<b>Días restantes:</b> {days}`;
                            const expenseScheduleLabel = (0, incomeExpenseTaxonomy_1.describeExpenseScheduleEs)(expense);
                            const title = (0, templateService_1.renderTemplate)(titleTemplate, {});
                            const message = (0, templateService_1.renderTemplate)(messageTemplate, {
                                description: expense.description,
                                amount: parseFloat(expense.amount).toFixed(2),
                                currency: expense.currency,
                                paymentDay: paymentDay,
                                days: days,
                                expenseScheduleLabel,
                                expenseTypeLabel: expenseScheduleLabel,
                                category: expense.category ? String(expense.category) : '',
                            });
                            const plainTitle = title.replace(/<[^>]*>/g, '');
                            const ins = await (0, database_1.query)(`INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'RECURRING_EXPENSE', $2, $3, $4, 'EXPENSE')
                 RETURNING id`, [userId, plainTitle, message, expense.id]);
                            const nid = ins.rows[0]?.id;
                            if (nid != null) {
                                await (0, webPushService_1.sendPushForNotification)(userId, {
                                    title: plainTitle,
                                    message,
                                    notificationId: nid,
                                });
                            }
                            if (settings['RECURRING_EXPENSE']?.telegramEnabled && telegramChatId) {
                                await (0, telegramService_1.sendTelegramMessage)(telegramChatId, message);
                            }
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        console.error('Error checking notifications:', error);
    }
};
const startNotificationScheduler = () => {
    // Run every day at 9:00 AM
    node_cron_1.default.schedule('0 9 * * *', () => {
        console.log('Running notification check...');
        checkAndSendNotifications();
    });
    // Also run immediately on startup (for testing)
    setTimeout(() => {
        checkAndSendNotifications();
    }, 5000);
    console.log('Notification scheduler configured to run daily at 9:00 AM');
};
exports.startNotificationScheduler = startNotificationScheduler;
//# sourceMappingURL=notificationService.js.map