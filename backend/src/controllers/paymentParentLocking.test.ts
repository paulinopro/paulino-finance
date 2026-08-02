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

import { getClient, query } from '../config/database';
import { applyBalanceDelta } from '../services/accountBalance';
import { deleteCardPayment } from './cardController';
import { deletePayment, updatePayment } from './loanController';

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

describe('payment mutations lock the active parent', () => {
  const getClientMock = getClient as jest.MockedFunction<typeof getClient>;
  const poolQueryMock = query as jest.MockedFunction<typeof query>;
  const balanceMock = applyBalanceDelta as jest.MockedFunction<typeof applyBalanceDelta>;

  beforeEach(() => {
    jest.clearAllMocks();
    poolQueryMock.mockResolvedValue({ rows: [{ is_active: false }] } as any);
  });

  it.each([
    ['card payment delete', deleteCardPayment, { params: { paymentId: '31' }, body: {} }],
    ['loan payment delete', deletePayment, { params: { paymentId: '31' }, body: {} }],
    [
      'loan payment update',
      updatePayment,
      { params: { paymentId: '31' }, body: { amount: 100, paymentDate: '2026-08-02' } },
    ],
  ] as const)('%s rolls back when deactivation wins the lock', async (_label, handler, request) => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ is_active: false }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() } as any;
    getClientMock.mockResolvedValue(client);
    const { res, state } = responseDouble();

    await handler({ userId: 7, ...request } as any, res);

    expect(state.status).toBe(409);
    expect(getClientMock).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(clientQuery.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(balanceMock).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
