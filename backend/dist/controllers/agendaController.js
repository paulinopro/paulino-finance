"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getItems = getItems;
exports.getOneItem = getOneItem;
exports.postItem = postItem;
exports.patchItem = patchItem;
exports.removeItem = removeItem;
exports.getConnections = getConnections;
exports.postSync = postSync;
exports.postImportRange = postImportRange;
const agendaService_1 = require("../services/agendaService");
const agendaGoogleOAuthService_1 = require("../services/agendaGoogleOAuthService");
const agendaOutboundSync_1 = require("../services/agendaOutboundSync");
const agendaSyncService_1 = require("../services/agendaSyncService");
/** Query ?kinds=EVENT,TASK o repetido ?kinds=EVENT */
function parseKindsQuery(raw) {
    if (raw == null || raw === '')
        return undefined;
    const chunks = Array.isArray(raw)
        ? raw.flatMap((x) => String(x).split(','))
        : String(raw).split(',');
    const out = [];
    for (const chunk of chunks) {
        const k = (0, agendaService_1.parseAgendaKind)(chunk.trim());
        if (k)
            out.push(k);
    }
    return out.length ? out : undefined;
}
async function getItems(req, res) {
    try {
        const userId = req.userId;
        const from = typeof req.query.from === 'string' ? req.query.from : '';
        const to = typeof req.query.to === 'string' ? req.query.to : '';
        if (!from || !to) {
            return res.status(400).json({ message: 'Se requiere ?from=&to= en formato ISO.' });
        }
        const kinds = parseKindsQuery(req.query.kinds);
        const items = await (0, agendaService_1.listAgendaItems)(userId, {
            fromIso: from,
            toIso: to,
            kinds,
        });
        res.json({ success: true, items });
    }
    catch (e) {
        if (e?.message === 'INVALID_RANGE') {
            return res.status(400).json({ message: 'Rango de fechas inválido' });
        }
        console.error('agenda getItems error', e);
        res.status(500).json({ message: 'Error al listar ítems de Agenda' });
    }
}
async function getOneItem(req, res) {
    try {
        const userId = req.userId;
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ message: 'ID inválido' });
        const item = await (0, agendaService_1.getAgendaItem)(userId, id);
        if (!item)
            return res.status(404).json({ message: 'No encontrado' });
        res.json({ success: true, item });
    }
    catch (e) {
        console.error('agenda getOne error', e);
        res.status(500).json({ message: 'Error al obtener ítem' });
    }
}
async function postItem(req, res) {
    try {
        const userId = req.userId;
        const kind = (0, agendaService_1.parseAgendaKind)(req.body?.kind);
        if (!kind)
            return res.status(400).json({ message: 'kind inválido' });
        const title = typeof req.body?.title === 'string' ? req.body.title : '';
        if (!title.trim())
            return res.status(400).json({ message: 'title es obligatorio' });
        let statusParsed = undefined;
        if (req.body?.status != null) {
            const s = (0, agendaService_1.parseAgendaStatus)(req.body.status);
            if (!s) {
                return res.status(400).json({ message: 'status inválido' });
            }
            statusParsed = s;
        }
        const fid = req.body?.financeLinkId != null && req.body?.financeLinkId !== ''
            ? parseInt(String(req.body.financeLinkId), 10)
            : null;
        if (fid !== null && Number.isNaN(fid)) {
            return res.status(400).json({ message: 'financeLinkId inválido' });
        }
        const item = await (0, agendaService_1.createAgendaItem)(userId, {
            kind,
            title,
            description: req.body?.description,
            location: req.body?.location,
            startsAt: typeof req.body?.startsAt === 'string' ? req.body.startsAt : String(req.body?.startsAt ?? ''),
            endsAt: req.body?.endsAt,
            allDay: Boolean(req.body?.allDay),
            status: statusParsed,
            recurrenceRule: req.body?.recurrenceRule,
            timezone: req.body?.timezone,
            financeLinkType: req.body?.financeLinkType ?? null,
            financeLinkId: fid,
            metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
            syncToExternal: req.body?.syncToExternal !== false,
            externalUpdatedAt: req.body?.externalUpdatedAt,
            lastChangeOrigin: req.body?.lastChangeOrigin,
            syncStatus: req.body?.syncStatus,
        });
        (0, agendaOutboundSync_1.enqueueAgendaOutboundSync)(userId, item.id);
        res.status(201).json({ success: true, item });
    }
    catch (e) {
        if (e?.message === 'INVALID_STARTS_AT' ||
            e?.message === 'INVALID_ENDS_AT' ||
            e?.message === 'INVALID_EXTERNAL_UPDATED_AT') {
            return res.status(400).json({ message: 'Fecha u horario inválido' });
        }
        console.error('agenda postItem error', e);
        res.status(500).json({ message: 'Error al crear ítem' });
    }
}
async function patchItem(req, res) {
    try {
        const userId = req.userId;
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ message: 'ID inválido' });
        const patch = {};
        if ('kind' in (req.body || {})) {
            const k = (0, agendaService_1.parseAgendaKind)(req.body.kind);
            if (!k)
                return res.status(400).json({ message: 'kind inválido' });
            patch.kind = k;
        }
        if ('title' in (req.body || {}) && typeof req.body.title === 'string')
            patch.title = req.body.title;
        if ('description' in (req.body || {}))
            patch.description = req.body.description == null ? null : String(req.body.description);
        if ('location' in (req.body || {}))
            patch.location = req.body.location == null ? null : String(req.body.location);
        if ('startsAt' in (req.body || {}))
            patch.startsAt =
                typeof req.body.startsAt === 'string'
                    ? req.body.startsAt
                    : req.body.startsAt != null
                        ? String(req.body.startsAt)
                        : '';
        if ('endsAt' in (req.body || {}))
            patch.endsAt = req.body.endsAt;
        if ('allDay' in (req.body || {}))
            patch.allDay = Boolean(req.body.allDay);
        if ('status' in (req.body || {})) {
            const s = (0, agendaService_1.parseAgendaStatus)(req.body.status);
            if (!s)
                return res.status(400).json({ message: 'status inválido' });
            patch.status = s;
        }
        if ('recurrenceRule' in (req.body || {}))
            patch.recurrenceRule = req.body.recurrenceRule;
        if ('timezone' in (req.body || {}))
            patch.timezone = req.body.timezone == null ? null : String(req.body.timezone);
        if ('financeLinkType' in (req.body || {}))
            patch.financeLinkType =
                req.body.financeLinkType == null ? null : String(req.body.financeLinkType);
        if ('financeLinkId' in (req.body || {})) {
            if (req.body.financeLinkId == null || req.body.financeLinkId === '') {
                patch.financeLinkId = null;
            }
            else {
                const n = parseInt(String(req.body.financeLinkId), 10);
                if (Number.isNaN(n))
                    return res.status(400).json({ message: 'financeLinkId inválido' });
                patch.financeLinkId = n;
            }
        }
        if ('metadata' in (req.body || {}) && req.body.metadata && typeof req.body.metadata === 'object') {
            patch.metadata = req.body.metadata;
        }
        if ('syncToExternal' in (req.body || {}))
            patch.syncToExternal = Boolean(req.body.syncToExternal);
        if ('externalUpdatedAt' in (req.body || {}))
            patch.externalUpdatedAt =
                req.body.externalUpdatedAt == null ? null : String(req.body.externalUpdatedAt);
        if ('lastChangeOrigin' in (req.body || {}))
            patch.lastChangeOrigin =
                req.body.lastChangeOrigin == null ? null : String(req.body.lastChangeOrigin);
        if ('syncStatus' in (req.body || {}))
            patch.syncStatus = req.body.syncStatus == null ? null : String(req.body.syncStatus);
        const item = await (0, agendaService_1.updateAgendaItem)(userId, id, patch);
        if (!item)
            return res.status(404).json({ message: 'No encontrado' });
        (0, agendaOutboundSync_1.enqueueAgendaOutboundSync)(userId, id);
        res.json({ success: true, item });
    }
    catch (e) {
        if (e?.message === 'INVALID_STARTS_AT' ||
            e?.message === 'INVALID_ENDS_AT' ||
            e?.message === 'INVALID_EXTERNAL_UPDATED_AT') {
            return res.status(400).json({ message: 'Fecha u horario inválido' });
        }
        console.error('agenda patchItem error', e);
        res.status(500).json({ message: 'Error al actualizar ítem' });
    }
}
async function removeItem(req, res) {
    try {
        const userId = req.userId;
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id))
            return res.status(400).json({ message: 'ID inválido' });
        await (0, agendaOutboundSync_1.removeAgendaItemFromExternalCalendars)(userId, id);
        const deleted = await (0, agendaService_1.deleteAgendaItem)(userId, id);
        if (!deleted)
            return res.status(404).json({ message: 'No encontrado' });
        res.json({ success: true });
    }
    catch (e) {
        console.error('agenda delete error', e);
        res.status(500).json({ message: 'Error al eliminar ítem' });
    }
}
async function getConnections(req, res) {
    try {
        const userId = req.userId;
        const connections = await (0, agendaService_1.listAgendaConnections)(userId);
        res.json({
            success: true,
            connections,
            syncEngines: [
                {
                    provider: 'GOOGLE_CALENDAR',
                    available: (0, agendaGoogleOAuthService_1.agendaGoogleOAuthEnvConfigured)(),
                    note: (0, agendaGoogleOAuthService_1.agendaGoogleOAuthEnvConfigured)()
                        ? 'Usuario puede conectar y replicar saliente desde Agenda.'
                        : 'Defina AGENDA_GOOGLE_CLIENT_ID, AGENDA_GOOGLE_CLIENT_SECRET y AGENDA_GOOGLE_REDIRECT_URI.',
                },
                {
                    provider: 'ICLOUD_CALDAV',
                    available: true,
                    note: 'Apple ID + contraseña de app CalDAV (`caldav.icloud.com`). La agenda replica ítems con «sincronizar» externos en el collection elegido mediante ICS PUT.',
                },
            ],
        });
    }
    catch (e) {
        console.error('agenda connections error', e);
        res.status(500).json({ message: 'Error al obtener conexiones' });
    }
}
async function postSync(req, res) {
    try {
        const result = await (0, agendaSyncService_1.syncAgendaForUser)(req.userId);
        res.json({ success: true, result });
    }
    catch (e) {
        console.error('agenda sync error', e);
        res.status(500).json({ message: 'Error al sincronizar Agenda' });
    }
}
async function postImportRange(req, res) {
    try {
        const provider = String(req.body?.provider || '').toUpperCase();
        if (provider !== 'GOOGLE_CALENDAR' && provider !== 'ICLOUD_CALDAV') {
            return res.status(400).json({ message: 'Proveedor de agenda inválido' });
        }
        const from = typeof req.body?.from === 'string' ? req.body.from : '';
        const to = typeof req.body?.to === 'string' ? req.body.to : '';
        const result = await (0, agendaSyncService_1.syncAgendaImportRange)(req.userId, provider, from, to);
        res.json({ success: true, result });
    }
    catch (e) {
        if (e?.message === 'INVALID_IMPORT_RANGE') {
            return res.status(400).json({ message: 'Rango de importación inválido' });
        }
        if (e?.message === 'PROVIDER_NOT_CONNECTED') {
            return res.status(412).json({ message: 'Proveedor no conectado' });
        }
        console.error('agenda import range error', e);
        res.status(500).json({ message: 'Error al importar agenda' });
    }
}
//# sourceMappingURL=agendaController.js.map