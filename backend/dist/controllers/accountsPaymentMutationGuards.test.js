"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../config/database', () => ({
    query: jest.fn(),
    getClient: jest.fn(),
}));
jest.mock('../services/accountBalance', () => ({ applyBalanceDelta: jest.fn() }));
jest.mock('../services/accountsPaymentLinkSync', () => ({
    roundMoney: (value) => Math.round(Number(value) * 100) / 100,
    getTotalPaidPayable: jest.fn().mockResolvedValue(25),
    getTotalReceivedReceivable: jest.fn().mockResolvedValue(25),
    recalculatePayableStatus: jest.fn(),
    recalculateReceivableStatus: jest.fn(),
    expenseDescriptionForPayable: jest.fn().mockResolvedValue('Abono: Cuenta'),
    incomeDescriptionForReceivable: jest.fn().mockResolvedValue('Abono: Cuenta'),
}));
jest.mock('../services/calendarService', () => ({ deleteCalendarEventsForRelated: jest.fn() }));
jest.mock('../utils/userCurrencyPair', () => ({
    getUserCurrencyPair: jest.fn().mockResolvedValue({ primary: 'DOP', secondary: 'USD' }),
    isCurrencyInUserPair: jest.fn().mockReturnValue(true),
}));
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const accountsPayableController_1 = require("./accountsPayableController");
const accountsReceivableController_1 = require("./accountsReceivableController");
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
const paymentScenarios = [
    {
        name: 'payable',
        parentTable: 'accounts_payable',
        paymentTable: 'accounts_payable_payments',
        derivedTable: 'expenses',
        derivedIdColumn: 'expense_id',
        updatePayment: accountsPayableController_1.updateAccountPayablePayment,
        deletePayment: accountsPayableController_1.deleteAccountPayablePayment,
        balanceReverse: 25,
        balanceApply: -40,
        terminalStatus: 'PAID',
    },
    {
        name: 'receivable',
        parentTable: 'accounts_receivable',
        paymentTable: 'accounts_receivable_payments',
        derivedTable: 'income',
        derivedIdColumn: 'income_id',
        updatePayment: accountsReceivableController_1.updateAccountReceivablePayment,
        deletePayment: accountsReceivableController_1.deleteAccountReceivablePayment,
        balanceReverse: -25,
        balanceApply: 40,
        terminalStatus: 'RECEIVED',
    },
];
function parentRow(isActive) {
    return {
        id: 7,
        description: 'Cuenta',
        amount: '100',
        currency: 'DOP',
        due_date: '2026-08-20',
        status: 'PENDING',
        category: 'General',
        notes: null,
        paid_date: null,
        received_date: null,
        is_active: isActive,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
    };
}
describe.each(paymentScenarios)('$name payment update/delete atomicity', (scenario) => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        accountBalance_1.applyBalanceDelta.mockResolvedValue(undefined);
    });
    afterEach(() => {
        console.error.mockRestore();
    });
    function configureLegacyPool(isActive, derivedId) {
        const parent = parentRow(isActive);
        database_1.query.mockImplementation(async (sql) => {
            if (sql.includes(scenario.paymentTable) && sql.includes('SELECT')) {
                return { rows: [{ id: 31, amount: '25', [scenario.derivedIdColumn]: derivedId }] };
            }
            if (sql.includes(scenario.parentTable))
                return { rows: [parent] };
            if (sql.includes(scenario.derivedTable))
                return { rows: [{ bank_account_id: 5, description: 'Abono: Cuenta' }] };
            return { rows: [] };
        });
    }
    it.each([
        ['update', (s) => s.updatePayment, { amount: 40, paymentDate: '2026-08-03' }],
        ['delete', (s) => s.deletePayment, {}],
    ])('%s rejects an inactive parent after acquiring the parent+payment lock', async (_operation, selectHandler, body) => {
        configureLegacyPool(false, null);
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ is_active: false }] })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        const { res, state } = responseDouble();
        await selectHandler(scenario)({ userId: 3, params: { id: '7', paymentId: '31' }, body }, res);
        expect(state.status).toBe(409);
        expect(client.query.mock.calls[0][0]).toBe('BEGIN');
        expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
        expect(client.query.mock.calls[1][0]).toContain(scenario.parentTable);
        expect(client.query.mock.calls[1][0]).toContain(scenario.paymentTable);
        expect(client.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        expect(accountBalance_1.applyBalanceDelta).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });
    it('updates the payment, derived row, balances, total, and parent status before commit', async () => {
        configureLegacyPool(true, 90);
        const parent = parentRow(true);
        const client = {
            query: jest.fn(async (sql) => {
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK')
                    return { rows: [] };
                if (sql.includes('FOR UPDATE') && sql.includes(scenario.paymentTable)) {
                    return { rows: [{ ...parent, payment_amount: '25', payment_date: '2026-08-02', derived_id: 90 }] };
                }
                if (sql.includes('FOR UPDATE') && sql.includes(scenario.derivedTable)) {
                    return { rows: [{ bank_account_id: 5, description: 'Abono: Cuenta' }] };
                }
                if (sql.includes('COALESCE(SUM(amount)'))
                    return { rows: [{ total: '20' }] };
                if (sql.includes(`UPDATE ${scenario.parentTable}`))
                    return { rows: [{ ...parent, status: 'PENDING' }] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        const { res, state } = responseDouble();
        await scenario.updatePayment({
            userId: 3,
            params: { id: '7', paymentId: '31' },
            body: { amount: 40, paymentDate: '2026-08-03', bankAccountId: 6 },
        }, res);
        const sqlCalls = client.query.mock.calls.map(([sql]) => sql);
        expect(state.status).toBe(200);
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenNthCalledWith(1, 3, 5, 'DOP', scenario.balanceReverse, client, expect.any(Object));
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenNthCalledWith(2, 3, 6, 'DOP', scenario.balanceApply, client, expect.any(Object));
        expect(sqlCalls.some((sql) => sql.includes(`UPDATE ${scenario.paymentTable}`))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes(`UPDATE ${scenario.derivedTable}`))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes(`UPDATE ${scenario.parentTable}`))).toBe(true);
        expect(sqlCalls.indexOf('COMMIT')).toBeGreaterThan(sqlCalls.findIndex((sql) => sql.includes(`UPDATE ${scenario.parentTable}`)));
        expect(database_1.query).not.toHaveBeenCalled();
    });
    it('deletes derived links and reverses balance before recalculating the parent in the same transaction', async () => {
        configureLegacyPool(true, 90);
        const parent = parentRow(true);
        const client = {
            query: jest.fn(async (sql) => {
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK')
                    return { rows: [] };
                if (sql.includes('FOR UPDATE') && sql.includes(scenario.paymentTable)) {
                    return { rows: [{ ...parent, payment_amount: '25', payment_date: '2026-08-02', derived_id: 90 }] };
                }
                if (sql.includes('FOR UPDATE') && sql.includes(scenario.derivedTable)) {
                    return { rows: [{ bank_account_id: 5 }] };
                }
                if (sql.includes('COALESCE(SUM(amount)'))
                    return { rows: [{ total: '0' }] };
                if (sql.includes(`UPDATE ${scenario.parentTable}`))
                    return { rows: [{ ...parent, status: 'PENDING' }] };
                return { rows: [] };
            }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        const { res, state } = responseDouble();
        await scenario.deletePayment({ userId: 3, params: { id: '7', paymentId: '31' }, body: {} }, res);
        const sqlCalls = client.query.mock.calls.map(([sql]) => sql);
        expect(state.status).toBe(200);
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenCalledWith(3, 5, 'DOP', scenario.balanceReverse, client, expect.any(Object));
        expect(sqlCalls.some((sql) => sql.includes('UPDATE calendar_events'))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes(`DELETE FROM ${scenario.derivedTable}`))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes(`DELETE FROM ${scenario.paymentTable}`))).toBe(true);
        expect(sqlCalls.some((sql) => sql.includes(`UPDATE ${scenario.parentTable}`))).toBe(true);
        expect(sqlCalls.indexOf('COMMIT')).toBeGreaterThan(sqlCalls.findIndex((sql) => sql.includes(`UPDATE ${scenario.parentTable}`)));
        expect(database_1.query).not.toHaveBeenCalled();
    });
});
describe.each([
    ['payable', accountsPayableController_1.updateAccountPayable, 'accounts_payable'],
    ['receivable', accountsReceivableController_1.updateAccountReceivable, 'accounts_receivable'],
])('%s inactive parent update policy', (_name, handler, table) => {
    beforeEach(() => {
        jest.clearAllMocks();
        database_1.query.mockImplementation(async (sql, params) => {
            if (sql.includes('SELECT currency'))
                return { rows: [{ currency: 'DOP', is_active: false }] };
            if (sql.includes('SELECT is_active'))
                return { rows: [{ is_active: false }] };
            if (sql.includes(`UPDATE ${table}`)) {
                return { rows: [{ ...parentRow(false), description: params?.[0] || 'Cuenta' }] };
            }
            return { rows: [] };
        });
    });
    it.each([
        ['amount', { amount: 120 }],
        ['currency', { currency: 'USD' }],
        ['due date', { dueDate: '2026-09-01' }],
    ])('rejects inactive financial %s changes', async (_field, body) => {
        const { res, state } = responseDouble();
        await handler({ userId: 3, params: { id: '7' }, body }, res);
        expect(state.status).toBe(409);
    });
    it('allows descriptive changes while preserving an inactive parent', async () => {
        const { res, state } = responseDouble();
        await handler({ userId: 3, params: { id: '7' }, body: { description: 'Texto corregido', category: 'General', notes: 'Nota' } }, res);
        const updateCall = database_1.query.mock.calls.find(([sql]) => sql.includes(`UPDATE ${table}`));
        expect(state.status).toBe(200);
        expect(updateCall?.[0]).toContain('is_active = TRUE');
        expect(updateCall?.[1]?.at(-1)).toBe(false);
    });
});
//# sourceMappingURL=accountsPaymentMutationGuards.test.js.map