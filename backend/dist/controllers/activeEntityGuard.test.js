"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const entityActivation_1 = require("../services/entityActivation");
const activeEntityGuard_1 = require("./activeEntityGuard");
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
describe('inactive entity HTTP response', () => {
    it('maps the shared inactive domain error to HTTP 409', () => {
        const { res, state } = responseDouble();
        expect((0, activeEntityGuard_1.respondInactiveEntityError)(new entityActivation_1.InactiveEntityError(), res)).toBe(true);
        expect(state.status).toBe(409);
        expect(state.body).toMatchObject({ message: expect.any(String) });
    });
    it('leaves unrelated errors for the caller to handle', () => {
        const { res, state } = responseDouble();
        expect((0, activeEntityGuard_1.respondInactiveEntityError)(new Error('boom'), res)).toBe(false);
        expect(state).toEqual({ status: 200, body: undefined });
    });
});
//# sourceMappingURL=activeEntityGuard.test.js.map