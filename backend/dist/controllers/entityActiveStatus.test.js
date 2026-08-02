"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const entityActiveStatus_1 = require("./entityActiveStatus");
function responseDouble() {
    const state = { status: 200, body: undefined };
    const res = {
        status(code) {
            state.status = code;
            return res;
        },
        json(body) {
            state.body = body;
            return res;
        },
    };
    return { res, state };
}
describe('entity active status handler', () => {
    it('updates an owned entity from a boolean request', async () => {
        const setter = async () => ({ id: 14, isActive: false });
        const handler = (0, entityActiveStatus_1.createEntityActiveStatusHandler)('expenses', setter);
        const { res, state } = responseDouble();
        await handler({ userId: 7, params: { id: '14' }, body: { isActive: false } }, res);
        expect(state).toEqual({ status: 200, body: { id: 14, isActive: false } });
    });
    it('rejects non-boolean state', async () => {
        const handler = (0, entityActiveStatus_1.createEntityActiveStatusHandler)('income', async () => ({ id: 2, isActive: true }));
        const { res, state } = responseDouble();
        await handler({ userId: 7, params: { id: '2' }, body: { isActive: 'false' } }, res);
        expect(state.status).toBe(400);
    });
    it('rejects an invalid identifier', async () => {
        const handler = (0, entityActiveStatus_1.createEntityActiveStatusHandler)('cards', async () => ({ id: 2, isActive: true }));
        const { res, state } = responseDouble();
        await handler({ userId: 7, params: { id: 'x' }, body: { isActive: true } }, res);
        expect(state.status).toBe(400);
    });
    it('does not reveal a missing or foreign row', async () => {
        const handler = (0, entityActiveStatus_1.createEntityActiveStatusHandler)('accounts', async () => null);
        const { res, state } = responseDouble();
        await handler({ userId: 7, params: { id: '99' }, body: { isActive: true } }, res);
        expect(state.status).toBe(404);
    });
});
//# sourceMappingURL=entityActiveStatus.test.js.map