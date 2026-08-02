"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../config/database', () => ({
    query: jest.fn(),
    getClient: jest.fn(),
}));
jest.mock('../services/accountBalance', () => ({
    applyBalanceDelta: jest.fn(),
}));
jest.mock('../services/amortizationService', () => ({
    generateAmortizationSchedule: jest.fn(),
    processPayment: jest.fn(),
    saveAmortizationSchedule: jest.fn(),
}));
jest.mock('../utils/userCurrencyPair', () => ({
    getUserCurrencyPair: jest.fn().mockResolvedValue({ primary: 'DOP', secondary: 'USD' }),
    isCurrencyInUserPair: jest.fn().mockReturnValue(true),
    validateLedgerCurrencyForUser: jest.fn().mockReturnValue(null),
}));
jest.mock('../services/calendarService', () => ({
    deleteCalendarEventsForRelated: jest.fn(),
}));
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const amortizationService_1 = require("../services/amortizationService");
const cardController_1 = require("./cardController");
const loanController_1 = require("./loanController");
function responseDouble() {
    const state = { status: 200, body: undefined };
    const res = {
        status(code) {
            state.status = code;
            return res;
        },
        json(body) {
            state.body = body;
            return res;
        },
    };
    return { res, state };
}
const cardRow = {
    id: 12,
    bank_name: 'Banco',
    card_name: 'Visa',
    current_debt_dop: '500',
    current_debt_usd: '0',
    currency_type: 'DOP',
    is_active: true,
};
const loanRow = {
    id: 12,
    loan_name: 'Vehiculo',
    paid_installments: 0,
    total_installments: 12,
    payment_day: 15,
    currency: 'DOP',
    is_active: true,
};
const paymentRow = {
    id: 44,
    payment_date: '2026-08-02',
    amount: '100',
    principal_amount: '80',
    interest_amount: '15',
    charge_amount: '5',
    late_fee: '0',
    installment_number: 1,
    outstanding_balance: '920',
    payment_type: 'COMPLETE',
    notes: null,
    bank_account_id: 5,
    created_at: '2026-08-02T00:00:00.000Z',
};
describe('payment creation atomicity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        console.error.mockRestore();
    });
    it('rolls back card payment, debt, and balance together after locking the tenant card', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                if (sql === 'BEGIN' || sql === 'ROLLBACK')
                    return { rows: [] };
                if (sql.includes('FOR UPDATE'))
                    return { rows: [cardRow] };
                if (sql.includes('INSERT INTO credit_card_payments'))
                    return { rows: [{ id: 44, created_at: paymentRow.created_at }] };
                if (sql.includes('UPDATE credit_cards'))
                    return { rows: [{ id: 12 }] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        database_1.query.mockImplementation(async (sql) => {
            if (sql.includes('SELECT is_active FROM credit_cards'))
                return { rows: [{ is_active: true }] };
            if (sql.includes('FROM credit_cards'))
                return { rows: [cardRow] };
            if (sql.includes('INSERT INTO credit_card_payments'))
                return { rows: [{ id: 44, created_at: paymentRow.created_at }] };
            if (sql.includes('UPDATE credit_cards'))
                return { rows: [{ id: 12 }] };
            return { rows: [] };
        });
        accountBalance_1.applyBalanceDelta.mockRejectedValue(new Error('ACCOUNT_NOT_FOUND'));
        const { res, state } = responseDouble();
        await (0, cardController_1.recordCardPayment)({ userId: 7, params: { id: '12' }, body: { amount: 100, currency: 'DOP', bankAccountId: 5 } }, res);
        expect(state.status).toBe(400);
        expect(database_1.getClient).toHaveBeenCalledTimes(1);
        expect(client.query.mock.calls[0][0]).toBe('BEGIN');
        expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
        expect(client.query.mock.calls[1][0]).toContain('user_id = $2');
        expect(client.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenCalledWith(7, 5, 'DOP', -100, client, expect.any(Object));
        expect(database_1.query).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });
    it('rolls back loan calculation, payment, loan, schedule, and balance under one locked loan', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                if (sql === 'BEGIN' || sql === 'ROLLBACK')
                    return { rows: [] };
                if (sql.includes('FOR UPDATE'))
                    return { rows: [loanRow] };
                if (sql.includes('INSERT INTO loan_payments'))
                    return { rows: [paymentRow] };
                if (sql.includes('UPDATE loans'))
                    return { rows: [{ id: 12 }] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        database_1.query.mockImplementation(async (sql) => {
            if (sql.includes('SELECT is_active FROM loans'))
                return { rows: [{ is_active: true }] };
            if (sql.includes('FROM loans WHERE'))
                return { rows: [loanRow] };
            if (sql.includes('INSERT INTO loan_payments'))
                return { rows: [paymentRow] };
            if (sql.includes('UPDATE loans'))
                return { rows: [{ id: 12 }] };
            return { rows: [] };
        });
        amortizationService_1.processPayment.mockResolvedValue({
            principalAmount: 80,
            interestAmount: 15,
            chargeAmount: 5,
            lateFee: 0,
            outstandingBalance: 920,
            installmentNumber: 1,
        });
        const schedule = [
            { installmentNumber: 1, status: 'PAID' },
            { installmentNumber: 2, status: 'PENDING', dueDate: '2026-09-15', totalDue: 100, principalAmount: 80, interestAmount: 15 },
        ];
        amortizationService_1.generateAmortizationSchedule.mockResolvedValue(schedule);
        amortizationService_1.saveAmortizationSchedule.mockResolvedValue(undefined);
        accountBalance_1.applyBalanceDelta.mockRejectedValue(new Error('ACCOUNT_NOT_FOUND'));
        const { res, state } = responseDouble();
        await (0, loanController_1.recordPayment)({
            userId: 7,
            params: { id: '12' },
            body: { paymentDate: '2026-08-02', amount: 100, paymentType: 'COMPLETE', bankAccountId: 5 },
        }, res);
        expect(state.status).toBe(400);
        expect(database_1.getClient).toHaveBeenCalledTimes(1);
        expect(client.query.mock.calls[0][0]).toBe('BEGIN');
        expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
        expect(client.query.mock.calls[1][0]).toContain('user_id = $2');
        expect(client.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
        expect(amortizationService_1.processPayment).toHaveBeenCalledWith(12, '2026-08-02', 100, 'COMPLETE', undefined, client);
        expect(amortizationService_1.generateAmortizationSchedule).toHaveBeenCalledWith(12, 7, client);
        expect(amortizationService_1.saveAmortizationSchedule).toHaveBeenCalledWith(12, schedule, client);
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenCalledWith(7, 5, 'DOP', -100, client, expect.any(Object));
        expect(database_1.query).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=paymentCreationAtomicity.test.js.map