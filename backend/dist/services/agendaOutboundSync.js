"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueAgendaOutboundSync = enqueueAgendaOutboundSync;
exports.removeAgendaItemFromExternalCalendars = removeAgendaItemFromExternalCalendars;
const agendaGooglePushService_1 = require("./agendaGooglePushService");
const agendaICloudPushService_1 = require("./agendaICloudPushService");
/** Replica el ítem a todos los proveedores externos configurados y conectados. */
function enqueueAgendaOutboundSync(userId, agendaItemId) {
    (0, agendaGooglePushService_1.enqueueAgendaGoogleCalendarSync)(userId, agendaItemId);
    (0, agendaICloudPushService_1.enqueueAgendaICloudCaldavSync)(userId, agendaItemId);
}
/** Borra remotamente antes de eliminar la fila local (`agenda_item_sync_state` cascada). */
async function removeAgendaItemFromExternalCalendars(userId, agendaItemId) {
    await Promise.all([
        (0, agendaGooglePushService_1.removeAgendaItemFromGoogleCalendar)(userId, agendaItemId),
        (0, agendaICloudPushService_1.removeAgendaItemFromICloudCalDav)(userId, agendaItemId),
    ]);
}
//# sourceMappingURL=agendaOutboundSync.js.map