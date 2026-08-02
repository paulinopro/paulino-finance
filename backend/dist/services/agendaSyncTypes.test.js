"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const agendaSyncTypes_1 = require("./agendaSyncTypes");
describe('chooseLatestAgendaVersion', () => {
    it('keeps local when local updatedAt is newer', () => {
        const chosen = (0, agendaSyncTypes_1.chooseLatestAgendaVersion)({ source: 'local', updatedAt: '2026-05-25T12:00:00.000Z' }, { source: 'external', updatedAt: '2026-05-25T11:59:59.000Z' });
        expect(chosen.source).toBe('local');
    });
    it('uses external when external updatedAt is newer', () => {
        const chosen = (0, agendaSyncTypes_1.chooseLatestAgendaVersion)({ source: 'local', updatedAt: '2026-05-25T12:00:00.000Z' }, { source: 'external', updatedAt: '2026-05-25T12:00:01.000Z' });
        expect(chosen.source).toBe('external');
    });
});
//# sourceMappingURL=agendaSyncTypes.test.js.map