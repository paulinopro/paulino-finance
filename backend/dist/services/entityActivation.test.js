"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const entityActivation_1 = require("./entityActivation");
describe('entity activation service', () => {
    it('updates only the allow-listed table and maps the database status', async () => {
        const calls = [];
        const executor = async (sql, params) => {
            calls.push({ sql, params });
            return { rows: [{ id: 42, is_active: false }] };
        };
        await expect((0, entityActivation_1.setEntityActiveStatus)('income', 42, 7, false, executor)).resolves.toEqual({
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
        await expect((0, entityActivation_1.setEntityActiveStatus)('cards', 9, 7, true, executor)).resolves.toBeNull();
    });
    it('accepts an active owned row', async () => {
        const executor = async () => ({ rows: [{ is_active: true }] });
        await expect((0, entityActivation_1.requireEntityActive)('loans', 3, 7, executor)).resolves.toBeUndefined();
    });
    it('rejects an inactive owned row with a domain error', async () => {
        const executor = async () => ({ rows: [{ is_active: false }] });
        await expect((0, entityActivation_1.requireEntityActive)('loans', 3, 7, executor)).rejects.toMatchObject({
            name: 'InactiveEntityError',
            code: 'ENTITY_INACTIVE',
        });
    });
    it('returns false when the owned row does not exist', async () => {
        const executor = async () => ({ rows: [] });
        await expect((0, entityActivation_1.requireEntityActive)('accountsReceivable', 3, 7, executor)).resolves.toBe(false);
    });
    it('exports the inactive error class for controller discrimination', () => {
        expect(new entityActivation_1.InactiveEntityError()).toBeInstanceOf(Error);
    });
});
//# sourceMappingURL=entityActivation.test.js.map