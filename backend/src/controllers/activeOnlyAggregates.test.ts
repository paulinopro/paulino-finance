import * as database from '../config/database';
import * as currencyConversion from '../services/userCurrencyConversion';
import { getBudgets } from './budgetController';
import { getCashFlow } from './cashFlowController';

function responseDouble() {
  const res: any = {
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
    const queryMock = jest.spyOn(database, 'query').mockImplementation(async (sql: any) => {
      const statement = String(sql);
      if (statement.includes('FROM budgets')) return { rows: [budget] } as any;
      if (statement.includes('SUM(')) return { rows: [{ total: '0' }] } as any;
      return { rows: [] } as any;
    });

    await getBudgets({ userId: 7, query: {} } as any, responseDouble());

    const statements = queryMock.mock.calls.map(([sql]) => String(sql));
    const expenseAggregate = statements.find((sql) => sql.includes('FROM expenses')) || '';
    const payableAggregate = statements.find((sql) => sql.includes('FROM accounts_payable')) || '';

    expect(expenseAggregate).toMatch(/FROM expenses e[\s\S]*e\.is_active = TRUE/);
    expect(payableAggregate).toMatch(/FROM accounts_payable ap[\s\S]*ap\.is_active = TRUE/);
  });

  it('qualifies active expense and loan filters in cash-flow aggregates', async () => {
    const queryMock = jest.spyOn(database, 'query').mockResolvedValue({ rows: [] } as any);
    jest.spyOn(currencyConversion, 'getConversionContextForUser').mockResolvedValue({
      pair: { primary: 'DOP', secondary: 'USD' },
    } as any);
    jest.spyOn(currencyConversion, 'amountToPrimary').mockImplementation((amount: number) => amount);
    jest.spyOn(currencyConversion, 'bankBalancesToPrimary').mockReturnValue(0);

    await getCashFlow(
      { userId: 7, query: { startDate: '2026-02-01', endDate: '2026-02-28' } } as any,
      responseDouble()
    );

    const statements = queryMock.mock.calls.map(([sql]) => String(sql));
    const expenseNatureAggregate = statements.find(
      (sql) => sql.includes('FROM expenses e') && sql.includes('GROUP BY e.nature')
    ) || '';
    const loanAmortizationAggregate = statements.find(
      (sql) => sql.includes('FROM amortization_schedule a') && sql.includes('INNER JOIN loans l')
    ) || '';

    expect(expenseNatureAggregate).toMatch(/WHERE e\.user_id = \$1 AND e\.is_active = TRUE/);
    expect(loanAmortizationAggregate).toMatch(/WHERE l\.user_id = \$1[\s\S]*l\.is_active = TRUE/);
  });
});
