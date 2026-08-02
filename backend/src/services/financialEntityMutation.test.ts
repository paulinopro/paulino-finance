import {
  financialEntityUpdateRequiresActive,
} from './financialEntityMutation';
import {
  InactiveEntityError,
  requireEntityActiveForUpdate,
} from './entityActivation';

describe('financial entity mutation policy', () => {
  it.each([
    ['cards', { currentDebtDop: 10 }],
    ['loans', { paidInstallments: 2 }],
    ['income', { isReceived: true }],
    ['expenses', { isPaid: true }],
  ] as const)('requires an active %s entity for financial fields', (entity, body) => {
    expect(financialEntityUpdateRequiresActive(entity, body)).toBe(true);
  });

  it.each([
    ['cards', { cardName: 'Viajes' }],
    ['loans', { loanName: 'Casa' }],
    ['income', { description: 'Nómina corregida' }],
    ['expenses', { description: 'Compra corregida', category: 'Hogar' }],
  ] as const)('allows descriptive edits on inactive %s entities', (entity, body) => {
    expect(financialEntityUpdateRequiresActive(entity, body)).toBe(false);
  });
});

describe('transactional active entity lock', () => {
  it('locks the tenant-owned active row before financial writes', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const executor = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ is_active: true }] };
    };

    await expect(requireEntityActiveForUpdate('income', 12, 7, executor)).resolves.toBeUndefined();
    expect(calls[0].sql).toContain('FOR UPDATE');
    expect(calls[0].params).toEqual([12, 7]);
  });

  it('rejects an inactive row after acquiring the transactional lock', async () => {
    const executor = async () => ({ rows: [{ is_active: false }] });

    await expect(requireEntityActiveForUpdate('expenses', 12, 7, executor)).rejects.toBeInstanceOf(
      InactiveEntityError
    );
  });
});
