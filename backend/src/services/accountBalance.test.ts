jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../utils/userCurrencyPair', () => ({
  getUserCurrencyPair: jest.fn().mockResolvedValue({ primary: 'DOP', secondary: 'USD' }),
}));

import { query } from '../config/database';
import { InactiveEntityError } from './entityActivation';
import { applyBalanceDelta } from './accountBalance';

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
  const queryMock = query as jest.MockedFunction<typeof query>;

  beforeEach(() => {
    queryMock.mockReset();
  });

  it('rejects an inactive owned account before changing its balance', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...accountRow, is_active: false }] } as any);

    await expect(applyBalanceDelta(7, 12, 'DOP', -100)).rejects.toBeInstanceOf(
      InactiveEntityError
    );
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when the account becomes inactive before the guarded update', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ ...accountRow, is_active: true }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await expect(applyBalanceDelta(7, 12, 'DOP', -100)).rejects.toBeInstanceOf(
      InactiveEntityError
    );
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
