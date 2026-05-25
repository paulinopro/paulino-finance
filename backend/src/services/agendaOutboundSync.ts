import {
  enqueueAgendaGoogleCalendarSync,
  removeAgendaItemFromGoogleCalendar,
} from './agendaGooglePushService';
import {
  enqueueAgendaICloudCaldavSync,
  removeAgendaItemFromICloudCalDav,
} from './agendaICloudPushService';

/** Replica el ítem a todos los proveedores externos configurados y conectados. */
export function enqueueAgendaOutboundSync(userId: number, agendaItemId: number): void {
  enqueueAgendaGoogleCalendarSync(userId, agendaItemId);
  enqueueAgendaICloudCaldavSync(userId, agendaItemId);
}

/** Borra remotamente antes de eliminar la fila local (`agenda_item_sync_state` cascada). */
export async function removeAgendaItemFromExternalCalendars(
  userId: number,
  agendaItemId: number
): Promise<void> {
  await Promise.all([
    removeAgendaItemFromGoogleCalendar(userId, agendaItemId),
    removeAgendaItemFromICloudCalDav(userId, agendaItemId),
  ]);
}
