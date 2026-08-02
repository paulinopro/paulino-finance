"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const financialEntityMutation_1 = require("./financialEntityMutation");
const entityActivation_1 = require("./entityActivation");
describe('financial entity mutation policy', () => {
    it.each([
        ['cards', { currentDebtDop: 10 }],
        ['loans', { paidInstallments: 2 }],
        ['income', { isReceived: true }],
        ['expenses', { isPaid: true }],
    ])('requires an active %s entity for financial fields', (entity, body) => {
        expect((0, financialEntityMutation_1.financialEntityUpdateRequiresActive)(entity, body)).toBe(true);
    });
    it.each([
        ['cards', { cardName: 'Viajes' }],
        ['loans', { loanName: 'Casa' }],
        ['income', { description: 'Nómina corregida' }],
        ['expenses', { description: 'Compra corregida', category: 'Hogar' }],
    ])('allows descriptive edits on inactive %s entities', (entity, body) => {
        expect((0, financialEntityMutation_1.financialEntityUpdateRequiresActive)(entity, body)).toBe(false);
    });
});
describe('transactional active entity lock', () => {
    it('locks the tenant-owned active row before financial writes', async () => {
        const calls = [];
        const executor = async (sql, params) => {
            calls.push({ sql, params });
            return { rows: [{ is_active: true }] };
        };
        await expect((0, entityActivation_1.requireEntityActiveForUpdate)('income', 12, 7, executor)).resolves.toBeUndefined();
        expect(calls[0].sql).toContain('FOR UPDATE');
        expect(calls[0].params).toEqual([12, 7]);
    });
    it('rejects an inactive row after acquiring the transactional lock', async () => {
        const executor = async () => ({ rows: [{ is_active: false }] });
        await expect((0, entityActivation_1.requireEntityActiveForUpdate)('expenses', 12, 7, executor)).rejects.toBeInstanceOf(entityActivation_1.InactiveEntityError);
    });
});
//# sourceMappingURL=financialEntityMutation.test.js.map