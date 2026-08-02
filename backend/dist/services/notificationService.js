"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotificationScheduler = exports.NOTIFICATION_DAILY_CRON = void 0;
exports.getNotificationSchedulerStatus = getNotificationSchedulerStatus;
const node_cron_1 = __importDefault(require("node-cron"));
const database_1 = require("../config/database");
const telegramService_1 = require("./telegramService");
const templateService_1 = require("./templateService");
const webPushService_1 = require("./webPushService");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
const intlFormat_1 = require("../utils/intlFormat");
const userCurrencyPair_1 = require("../utils/userCurrencyPair");
/** Cron diario revisión tarjetas / préstamos / gastos recurrentes (hora local del proceso o TZ). */
exports.NOTIFICATION_DAILY_CRON = '0 9 * * *';
let schedulerConfiguredAtIso = null;
let dailyNotificationCronTask = null;
let lastNotificationSweep = null;
function finalizeNotificationSweep(startedAt, ok, errorMessage) {
    lastNotificationSweep = {
        startedAt,
        finishedAt: new Date().toISOString(),
        ok,
        ...(errorMessage ? { errorMessage } : {}),
    };
}
/** Estado del job programado `node-cron` (solo lectura, para panel super admin). */
function getNotificationSchedulerStatus() {
    const expressionValid = node_cron_1.default.validate(exports.NOTIFICATION_DAILY_CRON);
    const schedulerRegistered = dailyNotificationCronTask != null;
    return {
        cronExpression: exports.NOTIFICATION_DAILY_CRON,
        expressionValid,
        schedulerRegistered,
        schedulerConfiguredAt: schedulerConfiguredAtIso,
        timezone: typeof process.env.TZ === 'string' && process.env.TZ.trim() !== '' ? process.env.TZ.trim() : null,
        cronTimeNoteEs: 'Ejecución diaria a las 9:00 según la zona del proceso Node: variable TZ si existe; si no, la zona local del servidor.',
        dailyJobActive: expressionValid && schedulerRegistered,
        lastSweep: lastNotificationSweep,
    };
}
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
/** Variables para plantillas de pago de tarjeta (rails DOP/USD en BD = moneda principal/secundaria del usuario). */
function buildCardPaymentTemplateVariables(card, days, localePreference, pair) {
    const localeTag = (0, intlFormat_1.localeTagFromUiLanguage)(localePreference ?? undefined);
    const ct = String(card.currency_type ?? '');
    const debtPrimaryRail = parseFloat(String(card.current_debt_dop ?? 0));
    const debtSecondaryRail = parseFloat(String(card.current_debt_usd ?? 0));
    const primaryIso = pair.primary;
    const secondaryIso = pair.secondary;
    let debtText = '';
    if (ct === 'DOP') {
        debtText = (0, intlFormat_1.formatCurrencyAmount)(debtPrimaryRail, primaryIso, localeTag);
    }
    else if (ct === 'USD') {
        debtText = (0, intlFormat_1.formatCurrencyAmount)(debtSecondaryRail, secondaryIso, localeTag);
    }
    else {
        debtText = `${(0, intlFormat_1.formatCurrencyAmount)(debtPrimaryRail, primaryIso, localeTag)} / ${(0, intlFormat_1.formatCurrencyAmount)(debtSecondaryRail, secondaryIso, localeTag)}`;
    }
    const currencyTypeLabel = {
        DOP: primaryIso,
        USD: secondaryIso,
        DUAL: `${primaryIso} y ${secondaryIso} (dual)`,
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
        primaryCurrency: primaryIso,
        secondaryCurrency: secondaryIso,
        creditLimitDop: hideDop ? '' : formatMoneyOpt(card.credit_limit_dop),
        creditLimitUsd: hideUsd ? '' : formatMoneyOpt(card.credit_limit_usd),
        currentDebtDop: hideDop ? '' : formatMoneyOpt(card.current_debt_dop),
        currentDebtUsd: hideUsd ? '' : formatMoneyOpt(card.current_debt_usd),
        minimumPaymentDop: hideDop ? '' : formatMoneyOpt(card.minimum_payment_dop),
        minimumPaymentUsd: hideUsd ? '' : formatMoneyOpt(card.minimum_payment_usd),
    };
}
const checkAndSendNotifications = async () => {
    const sweepStartedAt = new Date().toISOString();
    try {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        // Get all users with notification settings enabled
        const usersResult = await (0, database_1.query)(`SELECT DISTINCT u.id, u.telegram_chat_id, u.locale_preference
       FROM users u
       INNER JOIN notification_settings ns ON u.id = ns.user_id
       WHERE ns.enabled = true`, []);
        for (const user of usersResult.rows) {
            const userId = user.id;
            const telegramChatId = user.telegram_chat_id;
            const localeTag = (0, intlFormat_1.localeTagFromUiLanguage)(user.locale_preference);
            const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
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
            // settings solo incluye tipos con enabled=true en BD (query arriba); no hay propiedad .enabled en el objeto.
            if (settings['CARD_PAYMENT']) {
                const cardsResult = await (0, database_1.query)(`SELECT id, bank_name, card_name, currency_type,
                  credit_limit_dop, credit_limit_usd,
                  current_debt_dop, current_debt_usd,
                  minimum_payment_dop, minimum_payment_usd,
                  cut_off_day, payment_due_day
           FROM credit_cards
           WHERE user_id = $1 AND is_active = TRUE`, [userId]);
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

{{#if creditLimitDop}}<b>Límite de crédito ({primaryCurrency}):</b> {creditLimitDop}{{/if}}
{{#if currentDebtDop}}<b>Deuda actual ({primaryCurrency}):</b> {currentDebtDop}{{/if}}
{{#if minimumPaymentDop}}<b>Pago mínimo ({primaryCurrency}):</b> {minimumPaymentDop}{{/if}}
{{#if creditLimitUsd}}<b>Límite de crédito ({secondaryCurrency}):</b> {creditLimitUsd}{{/if}}
{{#if currentDebtUsd}}<b>Deuda actual ({secondaryCurrency}):</b> {currentDebtUsd}{{/if}}
{{#if minimumPaymentUsd}}<b>Pago mínimo ({secondaryCurrency}):</b> {minimumPaymentUsd}{{/if}}

<b>Deuda resumida:</b> {debtText}
<b>Día de corte:</b> {cutOffDay}
<b>Día límite de pago:</b> {dueDay} de este mes
<b>Días restantes (recordatorio):</b> {days}`;
                            const title = (0, templateService_1.renderTemplate)(titleTemplate, {});
                            const message = (0, templateService_1.renderTemplate)(messageTemplate, buildCardPaymentTemplateVariables(card, days, user.locale_preference, pair));
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
            if (settings['LOAN_PAYMENT']) {
                const loansResult = await (0, database_1.query)(`SELECT id, loan_name, installment_amount, paid_installments, total_installments, currency
           FROM loans
           WHERE user_id = $1 AND is_active = TRUE AND status = 'ACTIVE'`, [userId]);
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
                                '🔔 <b>Recordatorio de Pago de Préstamo</b> 🔔\n\n<b>Préstamo:</b> {loanName}\n<b>Monto de cuota:</b> {installmentAmountFormatted}\n<b>Progreso:</b> {paidInstallments}/{totalInstallments} cuotas\n<b>Próximo pago:</b> {nextPaymentDate}\n<b>Días restantes:</b> {days}';
                            const loanCurRaw = String(loan.currency ?? '').trim().toUpperCase();
                            const loanCurrencyIso = loanCurRaw || pair.primary;
                            const installmentAmountFormatted = (0, intlFormat_1.formatCurrencyAmount)(parseFloat(String(loan.installment_amount ?? 0)), loanCurrencyIso, localeTag);
                            const title = (0, templateService_1.renderTemplate)(titleTemplate, {});
                            const message = (0, templateService_1.renderTemplate)(messageTemplate, {
                                loanName: loan.loan_name,
                                installmentAmount: parseFloat(String(loan.installment_amount ?? 0)).toFixed(2),
                                installmentAmountFormatted,
                                currency: loanCurrencyIso,
                                paidInstallments: loan.paid_installments,
                                totalInstallments: loan.total_installments,
                                nextPaymentDate: nextPaymentDate.toLocaleDateString(localeTag),
                                days: days,
                            });
                            const plainTitle = title.replace(/<[^>]*>/g, '').trim();
                            const ins = await (0, database_1.query)(`INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
                 VALUES ($1, 'LOAN_PAYMENT', $2, $3, $4, 'LOAN')
                 RETURNING id`, [userId, plainTitle, message, loan.id]);
                            const nid = ins.rows[0]?.id;
                            if (nid != null) {
                                await (0, webPushService_1.sendPushForNotification)(userId, {
                                    title: plainTitle,
                                    message,
                                    notificationId: nid,
                                });
                            }
                            if (settings['LOAN_PAYMENT']?.telegramEnabled && telegramChatId) {
                                await (0, telegramService_1.sendTelegramMessage)(telegramChatId, message);
                            }
                        }
                    }
                }
            }
            // Check recurring expenses
            if (settings['RECURRING_EXPENSE']) {
                // Only check expenses that haven't been paid this month
                const expensesResult = await (0, database_1.query)(`SELECT id, description, amount, currency, payment_day, last_paid_month, last_paid_year,
                  nature, category, frequency, recurrence_type
           FROM expenses
           WHERE user_id = $1 AND is_active = TRUE
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
                                amount: (0, intlFormat_1.formatCurrencyAmount)(parseFloat(expense.amount), String(expense.currency || pair.primary), localeTag),
                                currency: '',
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
        finalizeNotificationSweep(sweepStartedAt, false, error?.message ?? String(error));
        return;
    }
    finalizeNotificationSweep(sweepStartedAt, true);
};
const startNotificationScheduler = () => {
    if (!node_cron_1.default.validate(exports.NOTIFICATION_DAILY_CRON)) {
        console.error('[notifications] Expresión cron inválida (no se registró el job):', exports.NOTIFICATION_DAILY_CRON);
        dailyNotificationCronTask = null;
        schedulerConfiguredAtIso = null;
        return;
    }
    dailyNotificationCronTask = node_cron_1.default.schedule(exports.NOTIFICATION_DAILY_CRON, () => {
        console.log('Running notification check...');
        void checkAndSendNotifications();
    });
    schedulerConfiguredAtIso = new Date().toISOString();
    // También ejecutar poco después del arranque del API (útiles para pruebas / primer barrido).
    setTimeout(() => void checkAndSendNotifications(), 5000);
    console.log('Notification scheduler configured to run daily at 9:00 AM (timezone del proceso / TZ)');
};
exports.startNotificationScheduler = startNotificationScheduler;
//# sourceMappingURL=notificationService.js.map