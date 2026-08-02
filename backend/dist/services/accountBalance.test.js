"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../config/database', () => ({
    query: jest.fn(),
}));
jest.mock('../utils/userCurrencyPair', () => ({
    getUserCurrencyPair: jest.fn().mockResolvedValue({ primary: 'DOP', secondary: 'USD' }),
}));
const database_1 = require("../config/database");
const entityActivation_1 = require("./entityActivation");
const accountBalance_1 = require("./accountBalance");
const accountRow = {
    id: 12,
    user_id: 7,
    balance_dop: '1000.00',
    balance_usd: '0.00',
    currency_type: 'DOP',
    account_kind: 'bank',
    bank_name: 'Cuenta de prueba',
};
describe('account balance active-account authority', () => {
    const queryMock = database_1.query;
    beforeEach(() => {
        queryMock.mockReset();
    });
    it('rejects an inactive owned account before changing its balance', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ ...accountRow, is_active: false }] });
        await expect((0, accountBalance_1.applyBalanceDelta)(7, 12, 'DOP', -100)).rejects.toBeInstanceOf(entityActivation_1.InactiveEntityError);
        expect(queryMock).toHaveBeenCalledTimes(1);
    });
    it('rejects when the account becomes inactive before the guarded update', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ ...accountRow, is_active: true }] })
            .mockResolvedValueOnce({ rows: [] });
        await expect((0, accountBalance_1.applyBalanceDelta)(7, 12, 'DOP', -100)).rejects.toBeInstanceOf(entityActivation_1.InactiveEntityError);
        expect(queryMock).toHaveBeenCalledTimes(2);
    });
});
//# sourceMappingURL=accountBalance.test.js.map