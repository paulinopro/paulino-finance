import {
  InactiveEntityError,
  requireEntityActive,
  setEntityActiveStatus,
} from './entityActivation';

describe('entity activation service', () => {
  it('updates only the allow-listed table and maps the database status', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const executor = async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rows: [{ id: 42, is_active: false }] };
    };

    await expect(setEntityActiveStatus('income', 42, 7, false, executor)).resolves.toEqual({
      id: 42,
      isActive: false,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('UPDATE income');
    expect(calls[0].sql).not.toContain('UPDATE expenses');
    expect(calls[0].params).toEqual([false, 42, 7]);
  });

  it('returns null when the row is missing or belongs to another user', async () => {
    const executor = async () => ({ rows: [] });
    await expect(setEntityActiveStatus('cards', 9, 7, true, executor)).resolves.toBeNull();
  });

  it('accepts an active owned row', async () => {
    const executor = async () => ({ rows: [{ is_active: true }] });
    await expect(requireEntityActive('loans', 3, 7, executor)).resolves.toBeUndefined();
  });

  it('rejects an inactive owned row with a domain error', async () => {
    const executor = async () => ({ rows: [{ is_active: false }] });
    await expect(requireEntityActive('loans', 3, 7, executor)).rejects.toMatchObject({
      name: 'InactiveEntityError',
      code: 'ENTITY_INACTIVE',
    });
  });

  it('returns false when the owned row does not exist', async () => {
    const executor = async () => ({ rows: [] });
    await expect(requireEntityActive('accountsReceivable', 3, 7, executor)).resolves.toBe(false);
  });

  it('exports the inactive error class for controller discrimination', () => {
    expect(new InactiveEntityError()).toBeInstanceOf(Error);
  });
});
