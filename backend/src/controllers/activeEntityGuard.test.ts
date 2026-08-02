import { InactiveEntityError } from '../services/entityActivation';
import { respondInactiveEntityError } from './activeEntityGuard';

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

describe('inactive entity HTTP response', () => {
  it('maps the shared inactive domain error to HTTP 409', () => {
    const { res, state } = responseDouble();

    expect(respondInactiveEntityError(new InactiveEntityError(), res)).toBe(true);
    expect(state.status).toBe(409);
    expect(state.body).toMatchObject({ message: expect.any(String) });
  });

  it('leaves unrelated errors for the caller to handle', () => {
    const { res, state } = responseDouble();

    expect(respondInactiveEntityError(new Error('boom'), res)).toBe(false);
    expect(state).toEqual({ status: 200, body: undefined });
  });
});
