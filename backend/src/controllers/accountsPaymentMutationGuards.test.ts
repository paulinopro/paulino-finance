jest.mock('../config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../services/accountBalance', () => ({ applyBalanceDelta: jest.fn() }));

jest.mock('../services/accountsPaymentLinkSync', () => ({
  roundMoney: (value: number) => Math.round(Number(value) * 100) / 100,
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

import { getClient, query } from '../config/database';
import { applyBalanceDelta } from '../services/accountBalance';
import {
  deleteAccountPayablePayment,
  updateAccountPayable,
  updateAccountPayablePayment,
} from './accountsPayableController';
import {
  deleteAccountReceivablePayment,
  updateAccountReceivable,
  updateAccountReceivablePayment,
} from './accountsReceivableController';

function responseDouble() {
  const state = { status: 200, body: undefined as any };
  const res: any = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: any) {
      state.body = body;
      return res;
    },
  };
  return { res, state };
}

type PaymentScenario = {
  name: string;
  parentTable: 'accounts_payable' | 'accounts_receivable';
  paymentTable: 'accounts_payable_payments' | 'accounts_receivable_payments';
  derivedTable: 'expenses' | 'income';
  derivedIdColumn: 'expense_id' | 'income_id';
  updatePayment: typeof updateAccountPayablePayment;
  deletePayment: typeof deleteAccountPayablePayment;
  balanceReverse: number;
  balanceApply: number;
  terminalStatus: 'PAID' | 'RECEIVED';
};

const paymentScenarios: PaymentScenario[] = [
  {
    name: 'payable',
    parentTable: 'accounts_payable',
    paymentTable: 'accounts_payable_payments',
    derivedTable: 'expenses',
    derivedIdColumn: 'expense_id',
    updatePayment: updateAccountPayablePayment,
    deletePayment: deleteAccountPayablePayment,
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
    updatePayment: updateAccountReceivablePayment,
    deletePayment: deleteAccountReceivablePayment,
    balanceReverse: -25,
    balanceApply: 40,
    terminalStatus: 'RECEIVED',
  },
];

function parentRow(isActive: boolean) {
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
    (applyBalanceDelta as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    (console.error as any).mockRestore();
  });

  function configureLegacyPool(isActive: boolean, derivedId: number | null) {
    const parent = parentRow(isActive);
    (query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes(scenario.paymentTable) && sql.includes('SELECT')) {
        return { rows: [{ id: 31, amount: '25', [scenario.derivedIdColumn]: derivedId }] };
      }
      if (sql.includes(scenario.parentTable)) return { rows: [parent] };
      if (sql.includes(scenario.derivedTable)) return { rows: [{ bank_account_id: 5, description: 'Abono: Cuenta' }] };
      return { rows: [] };
    });
  }

  it.each([
    ['update', (s: PaymentScenario) => s.updatePayment, { amount: 40, paymentDate: '2026-08-03' }],
    ['delete', (s: PaymentScenario) => s.deletePayment, {}],
  ] as const)('%s rejects an inactive parent after acquiring the parent+payment lock', async (_operation, selectHandler, body) => {
    configureLegacyPool(false, null);
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ is_active: false }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    } as any;
    (getClient as jest.Mock).mockResolvedValue(client);
    const { res, state } = responseDouble();

    await selectHandler(scenario)(
      { userId: 3, params: { id: '7', paymentId: '31' }, body } as any,
      res
    );

    expect(state.status).toBe(409);
    expect(client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(client.query.mock.calls[1][0]).toContain(scenario.parentTable);
    expect(client.query.mock.calls[1][0]).toContain(scenario.paymentTable);
    expect(client.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(applyBalanceDelta).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('updates the payment, derived row, balances, total, and parent status before commit', async () => {
    configureLegacyPool(true, 90);
    const parent = parentRow(true);
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FOR UPDATE') && sql.includes(scenario.paymentTable)) {
          return { rows: [{ ...parent, payment_amount: '25', payment_date: '2026-08-02', derived_id: 90 }] };
        }
        if (sql.includes('FOR UPDATE') && sql.includes(scenario.derivedTable)) {
          return { rows: [{ bank_account_id: 5, description: 'Abono: Cuenta' }] };
        }
        if (sql.includes('COALESCE(SUM(amount)')) return { rows: [{ total: '20' }] };
        if (sql.includes(`UPDATE ${scenario.parentTable}`)) return { rows: [{ ...parent, status: 'PENDING' }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    } as any;
    (getClient as jest.Mock).mockResolvedValue(client);
    const { res, state } = responseDouble();

    await scenario.updatePayment(
      {
        userId: 3,
        params: { id: '7', paymentId: '31' },
        body: { amount: 40, paymentDate: '2026-08-03', bankAccountId: 6 },
      } as any,
      res
    );

    const sqlCalls = client.query.mock.calls.map(([sql]: [string]) => sql);
    expect(state.status).toBe(200);
    expect(applyBalanceDelta).toHaveBeenNthCalledWith(1, 3, 5, 'DOP', scenario.balanceReverse, client, expect.any(Object));
    expect(applyBalanceDelta).toHaveBeenNthCalledWith(2, 3, 6, 'DOP', scenario.balanceApply, client, expect.any(Object));
    expect(sqlCalls.some((sql: string) => sql.includes(`UPDATE ${scenario.paymentTable}`))).toBe(true);
    expect(sqlCalls.some((sql: string) => sql.includes(`UPDATE ${scenario.derivedTable}`))).toBe(true);
    expect(sqlCalls.some((sql: string) => sql.includes(`UPDATE ${scenario.parentTable}`))).toBe(true);
    expect(sqlCalls.indexOf('COMMIT')).toBeGreaterThan(sqlCalls.findIndex((sql: string) => sql.includes(`UPDATE ${scenario.parentTable}`)));
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes derived links and reverses balance before recalculating the parent in the same transaction', async () => {
    configureLegacyPool(true, 90);
    const parent = parentRow(true);
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FOR UPDATE') && sql.includes(scenario.paymentTable)) {
          return { rows: [{ ...parent, payment_amount: '25', payment_date: '2026-08-02', derived_id: 90 }] };
        }
        if (sql.includes('FOR UPDATE') && sql.includes(scenario.derivedTable)) {
          return { rows: [{ bank_account_id: 5 }] };
        }
        if (sql.includes('COALESCE(SUM(amount)')) return { rows: [{ total: '0' }] };
        if (sql.includes(`UPDATE ${scenario.parentTable}`)) return { rows: [{ ...parent, status: 'PENDING' }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    } as any;
    (getClient as jest.Mock).mockResolvedValue(client);
    const { res, state } = responseDouble();

    await scenario.deletePayment(
      { userId: 3, params: { id: '7', paymentId: '31' }, body: {} } as any,
      res
    );

    const sqlCalls = client.query.mock.calls.map(([sql]: [string]) => sql);
    expect(state.status).toBe(200);
    expect(applyBalanceDelta).toHaveBeenCalledWith(3, 5, 'DOP', scenario.balanceReverse, client, expect.any(Object));
    expect(sqlCalls.some((sql: string) => sql.includes('UPDATE calendar_events'))).toBe(true);
    expect(sqlCalls.some((sql: string) => sql.includes(`DELETE FROM ${scenario.derivedTable}`))).toBe(true);
    expect(sqlCalls.some((sql: string) => sql.includes(`DELETE FROM ${scenario.paymentTable}`))).toBe(true);
    expect(sqlCalls.some((sql: string) => sql.includes(`UPDATE ${scenario.parentTable}`))).toBe(true);
    expect(sqlCalls.indexOf('COMMIT')).toBeGreaterThan(sqlCalls.findIndex((sql: string) => sql.includes(`UPDATE ${scenario.parentTable}`)));
    expect(query).not.toHaveBeenCalled();
  });
});

describe.each([
  ['payable', updateAccountPayable, 'accounts_payable'],
  ['receivable', updateAccountReceivable, 'accounts_receivable'],
] as const)('%s inactive parent update policy', (_name, handler, table) => {
  beforeEach(() => {
    jest.clearAllMocks();
    (query as jest.Mock).mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT currency')) return { rows: [{ currency: 'DOP', is_active: false }] };
      if (sql.includes('SELECT is_active')) return { rows: [{ is_active: false }] };
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
    await handler({ userId: 3, params: { id: '7' }, body } as any, res);
    expect(state.status).toBe(409);
  });

  it('allows descriptive changes while preserving an inactive parent', async () => {
    const { res, state } = responseDouble();
    await handler(
      { userId: 3, params: { id: '7' }, body: { description: 'Texto corregido', category: 'General', notes: 'Nota' } } as any,
      res
    );

    const updateCall = (query as jest.Mock).mock.calls.find(([sql]: [string]) => sql.includes(`UPDATE ${table}`));
    expect(state.status).toBe(200);
    expect(updateCall?.[0]).toContain('is_active = TRUE');
    expect(updateCall?.[1]?.at(-1)).toBe(false);
  });
});
