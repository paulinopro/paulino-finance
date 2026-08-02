import { createEntityActiveStatusHandler } from './entityActiveStatus';

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

describe('entity active status handler', () => {
  it('updates an owned entity from a boolean request', async () => {
    const setter = async () => ({ id: 14, isActive: false });
    const handler = createEntityActiveStatusHandler('expenses', setter);
    const { res, state } = responseDouble();

    await handler({ userId: 7, params: { id: '14' }, body: { isActive: false } } as any, res);

    expect(state).toEqual({ status: 200, body: { id: 14, isActive: false } });
  });

  it('rejects non-boolean state', async () => {
    const handler = createEntityActiveStatusHandler('income', async () => ({ id: 2, isActive: true }));
    const { res, state } = responseDouble();

    await handler({ userId: 7, params: { id: '2' }, body: { isActive: 'false' } } as any, res);

    expect(state.status).toBe(400);
  });

  it('rejects an invalid identifier', async () => {
    const handler = createEntityActiveStatusHandler('cards', async () => ({ id: 2, isActive: true }));
    const { res, state } = responseDouble();

    await handler({ userId: 7, params: { id: 'x' }, body: { isActive: true } } as any, res);

    expect(state.status).toBe(400);
  });

  it('does not reveal a missing or foreign row', async () => {
    const handler = createEntityActiveStatusHandler('accounts', async () => null);
    const { res, state } = responseDouble();

    await handler({ userId: 7, params: { id: '99' }, body: { isActive: true } } as any, res);

    expect(state.status).toBe(404);
  });
});
