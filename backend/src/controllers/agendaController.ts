import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createAgendaItem,
  deleteAgendaItem,
  getAgendaItem,
  listAgendaConnections,
  listAgendaItems,
  parseAgendaKind,
  parseAgendaStatus,
  updateAgendaItem,
  type AgendaKind,
  type AgendaStatus,
} from '../services/agendaService';
import { agendaGoogleOAuthEnvConfigured } from '../services/agendaGoogleOAuthService';
import {
  enqueueAgendaOutboundSync,
  removeAgendaItemFromExternalCalendars,
} from '../services/agendaOutboundSync';
import { syncAgendaForUser, syncAgendaImportRange } from '../services/agendaSyncService';

/** Query ?kinds=EVENT,TASK o repetido ?kinds=EVENT */
function parseKindsQuery(raw: unknown): AgendaKind[] | undefined {
  if (raw == null || raw === '') return undefined;
  const chunks = Array.isArray(raw)
    ? raw.flatMap((x) => String(x).split(','))
    : String(raw).split(',');
  const out: AgendaKind[] = [];
  for (const chunk of chunks) {
    const k = parseAgendaKind(chunk.trim());
    if (k) out.push(k);
  }
  return out.length ? out : undefined;
}

export async function getItems(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!from || !to) {
      return res.status(400).json({ message: 'Se requiere ?from=&to= en formato ISO.' });
    }
    const kinds = parseKindsQuery(req.query.kinds);
    const items = await listAgendaItems(userId, {
      fromIso: from,
      toIso: to,
      kinds,
    });
    res.json({ success: true, items });
  } catch (e: any) {
    if (e?.message === 'INVALID_RANGE') {
      return res.status(400).json({ message: 'Rango de fechas inválido' });
    }
    console.error('agenda getItems error', e);
    res.status(500).json({ message: 'Error al listar ítems de Agenda' });
  }
}

export async function getOneItem(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });
    const item = await getAgendaItem(userId, id);
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    res.json({ success: true, item });
  } catch (e) {
    console.error('agenda getOne error', e);
    res.status(500).json({ message: 'Error al obtener ítem' });
  }
}

export async function postItem(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const kind = parseAgendaKind(req.body?.kind);
    if (!kind) return res.status(400).json({ message: 'kind inválido' });

    const title = typeof req.body?.title === 'string' ? req.body.title : '';
    if (!title.trim()) return res.status(400).json({ message: 'title es obligatorio' });

    let statusParsed: AgendaStatus | undefined = undefined;
    if (req.body?.status != null) {
      const s = parseAgendaStatus(req.body.status);
      if (!s) {
        return res.status(400).json({ message: 'status inválido' });
      }
      statusParsed = s;
    }

    const fid =
      req.body?.financeLinkId != null && req.body?.financeLinkId !== ''
        ? parseInt(String(req.body.financeLinkId), 10)
        : null;
    if (fid !== null && Number.isNaN(fid)) {
      return res.status(400).json({ message: 'financeLinkId inválido' });
    }

    const item = await createAgendaItem(userId, {
      kind,
      title,
      description: req.body?.description,
      location: req.body?.location,
      startsAt:
        typeof req.body?.startsAt === 'string' ? req.body.startsAt : String(req.body?.startsAt ?? ''),
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

    enqueueAgendaOutboundSync(userId, item.id);

    res.status(201).json({ success: true, item });
  } catch (e: any) {
    if (
      e?.message === 'INVALID_STARTS_AT' ||
      e?.message === 'INVALID_ENDS_AT' ||
      e?.message === 'INVALID_EXTERNAL_UPDATED_AT'
    ) {
      return res.status(400).json({ message: 'Fecha u horario inválido' });
    }
    console.error('agenda postItem error', e);
    res.status(500).json({ message: 'Error al crear ítem' });
  }
}

export async function patchItem(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

    const patch: Parameters<typeof updateAgendaItem>[2] = {};
    if ('kind' in (req.body || {})) {
      const k = parseAgendaKind(req.body.kind);
      if (!k) return res.status(400).json({ message: 'kind inválido' });
      patch.kind = k;
    }
    if ('title' in (req.body || {}) && typeof req.body.title === 'string') patch.title = req.body.title;
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
    if ('endsAt' in (req.body || {})) patch.endsAt = req.body.endsAt;
    if ('allDay' in (req.body || {})) patch.allDay = Boolean(req.body.allDay);
    if ('status' in (req.body || {})) {
      const s = parseAgendaStatus(req.body.status);
      if (!s) return res.status(400).json({ message: 'status inválido' });
      patch.status = s;
    }
    if ('recurrenceRule' in (req.body || {})) patch.recurrenceRule = req.body.recurrenceRule;
    if ('timezone' in (req.body || {}))
      patch.timezone = req.body.timezone == null ? null : String(req.body.timezone);
    if ('financeLinkType' in (req.body || {}))
      patch.financeLinkType =
        req.body.financeLinkType == null ? null : String(req.body.financeLinkType);
    if ('financeLinkId' in (req.body || {})) {
      if (req.body.financeLinkId == null || req.body.financeLinkId === '') {
        patch.financeLinkId = null;
      } else {
        const n = parseInt(String(req.body.financeLinkId), 10);
        if (Number.isNaN(n)) return res.status(400).json({ message: 'financeLinkId inválido' });
        patch.financeLinkId = n;
      }
    }
    if ('metadata' in (req.body || {}) && req.body.metadata && typeof req.body.metadata === 'object') {
      patch.metadata = req.body.metadata as Record<string, unknown>;
    }
    if ('syncToExternal' in (req.body || {})) patch.syncToExternal = Boolean(req.body.syncToExternal);
    if ('externalUpdatedAt' in (req.body || {}))
      patch.externalUpdatedAt =
        req.body.externalUpdatedAt == null ? null : String(req.body.externalUpdatedAt);
    if ('lastChangeOrigin' in (req.body || {}))
      patch.lastChangeOrigin =
        req.body.lastChangeOrigin == null ? null : String(req.body.lastChangeOrigin);
    if ('syncStatus' in (req.body || {}))
      patch.syncStatus = req.body.syncStatus == null ? null : String(req.body.syncStatus);

    const item = await updateAgendaItem(userId, id, patch);
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    enqueueAgendaOutboundSync(userId, id);
    res.json({ success: true, item });
  } catch (e: any) {
    if (
      e?.message === 'INVALID_STARTS_AT' ||
      e?.message === 'INVALID_ENDS_AT' ||
      e?.message === 'INVALID_EXTERNAL_UPDATED_AT'
    ) {
      return res.status(400).json({ message: 'Fecha u horario inválido' });
    }
    console.error('agenda patchItem error', e);
    res.status(500).json({ message: 'Error al actualizar ítem' });
  }
}

export async function removeItem(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'ID inválido' });
    await removeAgendaItemFromExternalCalendars(userId, id);
    const deleted = await deleteAgendaItem(userId, id);
    if (!deleted) return res.status(404).json({ message: 'No encontrado' });
    res.json({ success: true });
  } catch (e) {
    console.error('agenda delete error', e);
    res.status(500).json({ message: 'Error al eliminar ítem' });
  }
}

export async function getConnections(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const connections = await listAgendaConnections(userId);
    res.json({
      success: true,
      connections,
      syncEngines: [
        {
          provider: 'GOOGLE_CALENDAR',
          available: agendaGoogleOAuthEnvConfigured(),
          note: agendaGoogleOAuthEnvConfigured()
            ? 'Usuario puede conectar y replicar saliente desde Agenda.'
            : 'Defina AGENDA_GOOGLE_CLIENT_ID, AGENDA_GOOGLE_CLIENT_SECRET y AGENDA_GOOGLE_REDIRECT_URI.',
        },
        {
          provider: 'ICLOUD_CALDAV',
          available: true,
          note:
            'Apple ID + contraseña de app CalDAV (`caldav.icloud.com`). La agenda replica ítems con «sincronizar» externos en el collection elegido mediante ICS PUT.',
        },
      ],
    });
  } catch (e) {
    console.error('agenda connections error', e);
    res.status(500).json({ message: 'Error al obtener conexiones' });
  }
}

export async function postSync(req: AuthRequest, res: Response) {
  try {
    const result = await syncAgendaForUser(req.userId!);
    res.json({ success: true, result });
  } catch (e) {
    console.error('agenda sync error', e);
    res.status(500).json({ message: 'Error al sincronizar Agenda' });
  }
}

export async function postImportRange(req: AuthRequest, res: Response) {
  try {
    const provider = String(req.body?.provider || '').toUpperCase();
    if (provider !== 'GOOGLE_CALENDAR' && provider !== 'ICLOUD_CALDAV') {
      return res.status(400).json({ message: 'Proveedor de agenda inválido' });
    }
    const from = typeof req.body?.from === 'string' ? req.body.from : '';
    const to = typeof req.body?.to === 'string' ? req.body.to : '';
    const result = await syncAgendaImportRange(req.userId!, provider, from, to);
    res.json({ success: true, result });
  } catch (e: any) {
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
