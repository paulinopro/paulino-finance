"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../config/database', () => ({
    query: jest.fn(),
    getClient: jest.fn(),
}));
jest.mock('../services/accountBalance', () => ({ applyBalanceDelta: jest.fn() }));
jest.mock('./activeEntityGuard', () => ({
    ensureActiveEntity: jest.fn().mockResolvedValue(true),
    respondInactiveEntityError: jest.fn().mockReturnValue(false),
}));
jest.mock('../services/accountsPaymentLinkSync', () => ({
    roundMoney: (value) => Math.round(Number(value) * 100) / 100,
    getTotalPaidPayable: jest.fn().mockResolvedValue(0),
    getTotalReceivedReceivable: jest.fn().mockResolvedValue(0),
    recalculatePayableStatus: jest.fn(),
    recalculateReceivableStatus: jest.fn(),
    expenseDescriptionForPayable: jest.fn(),
    incomeDescriptionForReceivable: jest.fn(),
}));
jest.mock('../services/calendarService', () => ({ deleteCalendarEventsForRelated: jest.fn() }));
jest.mock('../utils/userCurrencyPair', () => ({
    getUserCurrencyPair: jest.fn(),
    isCurrencyInUserPair: jest.fn(),
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
describe.each([
    {
        name: 'payable payment',
        handler: accountsPayableController_1.addAccountPayablePayment,
        fullHandler: accountsPayableController_1.payAccountPayable,
        accountTable: 'accounts_payable',
        derivedTable: 'expenses',
        accountRow: { id: 7, description: 'Proveedor', amount: '100', currency: 'DOP', category: null, status: 'PENDING', is_active: true },
    },
    {
        name: 'receivable collection',
        handler: accountsReceivableController_1.addAccountReceivablePayment,
        fullHandler: accountsReceivableController_1.receiveAccountReceivable,
        accountTable: 'accounts_receivable',
        derivedTable: 'income',
        accountRow: { id: 7, description: 'Cliente', amount: '100', currency: 'DOP', category: null, status: 'PENDING', is_active: true },
    },
])('$name atomicity', ({ handler, fullHandler, accountTable, accountRow, derivedTable }) => {
    let consoleErrorSpy;
    beforeEach(() => {
        jest.clearAllMocks();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });
    it('rolls back the derived row and balance mutation when the payment link insert fails', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [accountRow] })
                .mockResolvedValueOnce({ rows: [{ total: '0' }] })
                .mockResolvedValueOnce({ rows: [{ id: 99 }] })
                .mockRejectedValueOnce(new Error('payment link insert failed'))
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        accountBalance_1.applyBalanceDelta.mockResolvedValue(undefined);
        // This sequence reproduces the pre-fix autocommit flow.
        database_1.query
            .mockResolvedValueOnce({ rows: [accountRow] })
            .mockResolvedValueOnce({ rows: [{ id: 99 }] })
            .mockRejectedValueOnce(new Error('payment link insert failed'));
        const req = {
            userId: 3,
            params: { id: '7' },
            body: { amount: 25, paymentDate: '2026-08-02', bankAccountId: 5 },
        };
        const { res, state } = responseDouble();
        await handler(req, res);
        expect(database_1.getClient).toHaveBeenCalledTimes(1);
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query).not.toHaveBeenCalledWith('COMMIT');
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenCalledWith(3, 5, 'DOP', accountTable === 'accounts_payable' ? -25 : 25, client, expect.any(Object));
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes(`INSERT INTO ${derivedTable}`))).toBe(true);
        expect(state.status).toBe(500);
    });
    it('rolls back the full settlement when the parent status update fails', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [accountRow] })
                .mockResolvedValueOnce({ rows: [{ total: '0' }] })
                .mockResolvedValueOnce({ rows: [{ id: 99 }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockRejectedValueOnce(new Error('parent status update failed'))
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn(),
        };
        database_1.getClient.mockResolvedValue(client);
        accountBalance_1.applyBalanceDelta.mockResolvedValue(undefined);
        const req = {
            userId: 3,
            params: { id: '7' },
            body: { paymentDate: '2026-08-02', bankAccountId: 5 },
        };
        const { res, state } = responseDouble();
        await fullHandler(req, res);
        expect(database_1.getClient).toHaveBeenCalledTimes(1);
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query).not.toHaveBeenCalledWith('COMMIT');
        expect(accountBalance_1.applyBalanceDelta).toHaveBeenCalledWith(3, 5, 'DOP', accountTable === 'accounts_payable' ? -100 : 100, client, expect.any(Object));
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ' + derivedTable))).toBe(true);
        expect(state.status).toBe(500);
    });
});
//# sourceMappingURL=accountsPaymentAtomicity.test.js.map