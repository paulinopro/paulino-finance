"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.icloudCalendarConnect = icloudCalendarConnect;
exports.icloudCalendarDisconnect = icloudCalendarDisconnect;
exports.icloudCalendarListWritable = icloudCalendarListWritable;
exports.icloudCalendarSetDefault = icloudCalendarSetDefault;
const agendaICloudCaldavService_1 = require("../services/agendaICloudCaldavService");
/** Conecta Apple ID + contraseña de aplicación (CalDAV Basic). Las credenciales se cifran en reposo (`oauth_refresh_token`). */
async function icloudCalendarConnect(req, res) {
    try {
        const appleIdRaw = typeof req.body?.appleId === 'string' ? req.body.appleId : '';
        const appPasswordRaw = typeof req.body?.appPassword === 'string' ? req.body.appPassword : typeof req.body?.app_password === 'string'
            ? req.body.app_password
            : '';
        const out = await (0, agendaICloudCaldavService_1.connectOrUpdateICloudCaldav)(req.userId, appleIdRaw, appPasswordRaw);
        if (!out.ok) {
            const status = out.code?.endsWith('BAD_APPLE_ID') || out.code?.endsWith('BAD_APP_PASSWORD') ? 400 : 401;
            return res.status(status).json({ message: out.message, code: out.code });
        }
        return res.json({ success: true });
    }
    catch (e) {
        console.error('iCloud CalDAV connect', e);
        return res.status(500).json({ message: 'Error al guardar la conexión con iCloud' });
    }
}
async function icloudCalendarDisconnect(req, res) {
    try {
        await (0, agendaICloudCaldavService_1.disconnectICloudCalendar)(req.userId);
        return res.json({ success: true });
    }
    catch (e) {
        console.error('iCloud Calendar disconnect', e);
        return res.status(500).json({ message: 'No se pudo desconectar iCloud' });
    }
}
async function icloudCalendarListWritable(req, res) {
    try {
        const rows = await (0, agendaICloudCaldavService_1.listICloudWritableCalendars)(req.userId);
        if (rows === null) {
            return res.status(412).json({
                message: 'No hay conexión válida con iCloud CalDAV. Conéctese primero con Apple ID y contraseña de app, o corrige el último error de la cuenta.',
                code: 'AGENDA_ICLOUD_NOT_READY',
            });
        }
        return res.json({ success: true, calendars: rows });
    }
    catch (e) {
        console.error('iCloud CalDAV list calendars', e);
        return res.status(500).json({ message: 'Error al listar calendarios de iCloud' });
    }
}
async function icloudCalendarSetDefault(req, res) {
    try {
        const raw = typeof req.body?.calendarId === 'string' ? req.body.calendarId.trim() : '';
        if (!raw) {
            return res.status(400).json({ message: 'calendarId es obligatorio' });
        }
        const ok = await (0, agendaICloudCaldavService_1.setICloudDefaultCalendar)(req.userId, raw);
        if (!ok) {
            return res.status(412).json({
                message: 'No se pudo actualizar: ¿conectó iCloud antes?',
                code: 'AGENDA_ICLOUD_UPDATE_FAILED',
            });
        }
        return res.json({ success: true, calendarId: raw.slice(0, 512) });
    }
    catch (e) {
        console.error('iCloud CalDAV set default', e);
        return res.status(500).json({ message: 'No se pudo guardar el calendario elegido' });
    }
}
//# sourceMappingURL=agendaICloudController.js.map