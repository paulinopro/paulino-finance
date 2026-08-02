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
describe('payment mutations lock the active parent', () => {
    const getClientMock = database_1.getClient;
    const poolQueryMock = database_1.query;
    const balanceMock = accountBalance_1.applyBalanceDelta;
    beforeEach(() => {
        jest.clearAllMocks();
        poolQueryMock.mockResolvedValue({ rows: [{ is_active: false }] });
    });
    it.each([
        ['card payment delete', cardController_1.deleteCardPayment, { params: { paymentId: '31' }, body: {} }],
        ['loan payment delete', loanController_1.deletePayment, { params: { paymentId: '31' }, body: {} }],
        [
            'loan payment update',
            loanController_1.updatePayment,
            { params: { paymentId: '31' }, body: { amount: 100, paymentDate: '2026-08-02' } },
        ],
    ])('%s rolls back when deactivation wins the lock', async (_label, handler, request) => {
        const clientQuery = jest
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ is_active: false }] })
            .mockResolvedValueOnce({ rows: [] });
        const client = { query: clientQuery, release: jest.fn() };
        getClientMock.mockResolvedValue(client);
        const { res, state } = responseDouble();
        await handler({ userId: 7, ...request }, res);
        expect(state.status).toBe(409);
        expect(getClientMock).toHaveBeenCalledTimes(1);
        expect(clientQuery.mock.calls[0][0]).toBe('BEGIN');
        expect(clientQuery.mock.calls[1][0]).toContain('FOR UPDATE');
        expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        expect(balanceMock).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=paymentParentLocking.test.js.map