"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const database = __importStar(require("../config/database"));
const currencyConversion = __importStar(require("../services/userCurrencyConversion"));
const budgetController_1 = require("./budgetController");
const cashFlowController_1 = require("./cashFlowController");
function responseDouble() {
    const res = {
        json: jest.fn(),
        status: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
}
describe('active-only controller aggregates', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });
    it('qualifies active expense and payable filters in budget spent aggregates', async () => {
        const budget = {
            id: 11,
            name: 'Monthly',
            category: null,
            amount: '5000',
            currency: 'DOP',
            period_type: 'MONTHLY',
            period_month: 2,
            period_year: 2026,
            spent: '0',
            created_at: new Date('2026-02-01'),
            updated_at: new Date('2026-02-01'),
        };
        const queryMock = jest.spyOn(database, 'query').mockImplementation(async (sql) => {
            const statement = String(sql);
            if (statement.includes('FROM budgets'))
                return { rows: [budget] };
            if (statement.includes('SUM('))
                return { rows: [{ total: '0' }] };
            return { rows: [] };
        });
        await (0, budgetController_1.getBudgets)({ userId: 7, query: {} }, responseDouble());
        const statements = queryMock.mock.calls.map(([sql]) => String(sql));
        const expenseAggregate = statements.find((sql) => sql.includes('FROM expenses')) || '';
        const payableAggregate = statements.find((sql) => sql.includes('FROM accounts_payable')) || '';
        expect(expenseAggregate).toMatch(/FROM expenses e[\s\S]*e\.is_active = TRUE/);
        expect(payableAggregate).toMatch(/FROM accounts_payable ap[\s\S]*ap\.is_active = TRUE/);
    });
    it('qualifies active expense and loan filters in cash-flow aggregates', async () => {
        const queryMock = jest.spyOn(database, 'query').mockResolvedValue({ rows: [] });
        jest.spyOn(currencyConversion, 'getConversionContextForUser').mockResolvedValue({
            pair: { primary: 'DOP', secondary: 'USD' },
        });
        jest.spyOn(currencyConversion, 'amountToPrimary').mockImplementation((amount) => amount);
        jest.spyOn(currencyConversion, 'bankBalancesToPrimary').mockReturnValue(0);
        await (0, cashFlowController_1.getCashFlow)({ userId: 7, query: { startDate: '2026-02-01', endDate: '2026-02-28' } }, responseDouble());
        const statements = queryMock.mock.calls.map(([sql]) => String(sql));
        const expenseNatureAggregate = statements.find((sql) => sql.includes('FROM expenses e') && sql.includes('GROUP BY e.nature')) || '';
        const loanAmortizationAggregate = statements.find((sql) => sql.includes('FROM amortization_schedule a') && sql.includes('INNER JOIN loans l')) || '';
        expect(expenseNatureAggregate).toMatch(/WHERE e\.user_id = \$1 AND e\.is_active = TRUE/);
        expect(loanAmortizationAggregate).toMatch(/WHERE l\.user_id = \$1[\s\S]*l\.is_active = TRUE/);
    });
});
//# sourceMappingURL=activeOnlyAggregates.test.js.map