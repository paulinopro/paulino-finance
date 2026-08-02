"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chooseLatestAgendaVersion = chooseLatestAgendaVersion;
function stampMs(value) {
    const raw = value.updatedAt;
    if (!raw)
        return 0;
    const date = raw instanceof Date ? raw : new Date(raw);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
}
function chooseLatestAgendaVersion(local, external) {
    return stampMs(external) > stampMs(local) ? external : local;
}
//# sourceMappingURL=agendaSyncTypes.js.map