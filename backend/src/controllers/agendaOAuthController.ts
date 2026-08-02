import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  agendaFrontendBaseUrl,
  agendaGoogleOAuthEnvConfigured,
  buildGoogleAuthorizeUrl,
  disconnectGoogleCalendar,
  listGoogleWritableCalendars,
  persistGoogleOAuthTokens,
  setGoogleDefaultCalendar,
  buildOAuth2Client,
} from '../services/agendaGoogleOAuthService';
import { verifyGoogleAgendaOAuthState } from '../utils/jwt';

export async function googleCalendarOAuthCallbackPublic(req: Request, res: Response) {
  const base = `${agendaFrontendBaseUrl().replace(/\/+$/, '')}/settings`;

  try {
    const oauthErr = typeof req.query.error === 'string' ? req.query.error : '';
    if (oauthErr) {
      return res.redirect(`${base}?google=cancel`);
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    const userId = verifyGoogleAgendaOAuthState(state);
    if (userId == null) {
      return res.redirect(`${base}?google=state_invalid`);
    }

    if (!agendaGoogleOAuthEnvConfigured()) {
      return res.redirect(`${base}?google=not_configured`);
    }

    const client = buildOAuth2Client();
    const { tokens } = await client.getToken(code);

    await persistGoogleOAuthTokens({
      userId,
      tokens: {
        access_token: tokens.access_token ?? null,
        refresh_token: tokens.refresh_token ?? null,
        expiry_date: tokens.expiry_date ?? null,
      },
    });

    return res.redirect(`${base}?google=connected`);
  } catch (e) {
    console.error('Google Calendar OAuth callback', e);
    return res.redirect(`${base}?google=error`);
  }
}

export async function googleCalendarAuthorizeStart(req: AuthRequest, res: Response) {
  try {
    if (!agendaGoogleOAuthEnvConfigured()) {
      return res.status(503).json({
        message: 'Google Calendar no está configurado en el servidor (AGENDA_GOOGLE_* env).',
        code: 'AGENDA_GOOGLE_NOT_CONFIGURED',
      });
    }
    const uid = req.userId!;
    const { authorizationUrl } = buildGoogleAuthorizeUrl(uid);
    return res.json({ success: true, authorizationUrl });
  } catch (e) {
    console.error('Google Calendar authorize start', e);
    return res.status(500).json({ message: 'Error al iniciar OAuth con Google Calendar' });
  }
}

export async function googleCalendarDisconnect(req: AuthRequest, res: Response) {
  try {
    await disconnectGoogleCalendar(req.userId!);
    return res.json({ success: true });
  } catch (e) {
    console.error('Google Calendar disconnect', e);
    return res.status(500).json({ message: 'No se pudo desconectar Google Calendar' });
  }
}

export async function googleCalendarListWritable(req: AuthRequest, res: Response) {
  try {
    if (!agendaGoogleOAuthEnvConfigured()) {
      return res.status(503).json({
        message: 'Google Calendar no está configurado en el servidor.',
        code: 'AGENDA_GOOGLE_NOT_CONFIGURED',
      });
    }
    const rows = await listGoogleWritableCalendars(req.userId!);
    if (rows === null) {
      return res.status(412).json({
        message:
          'No hay conexión válida con Google Calendar. Conéctese primero o vuelva a autorizar cuando el estado sea ERROR.',
        code: 'AGENDA_GOOGLE_NOT_READY',
      });
    }
    return res.json({ success: true, calendars: rows });
  } catch (e) {
    console.error('Google Calendar list calendars', e);
    return res.status(500).json({ message: 'Error al listar calendarios de Google' });
  }
}

export async function googleCalendarSetDefault(req: AuthRequest, res: Response) {
  try {
    if (!agendaGoogleOAuthEnvConfigured()) {
      return res.status(503).json({
        message: 'Google Calendar no está configurado en el servidor.',
        code: 'AGENDA_GOOGLE_NOT_CONFIGURED',
      });
    }
    const raw = typeof req.body?.calendarId === 'string' ? req.body.calendarId.trim() : '';
    if (!raw) {
      return res.status(400).json({ message: 'calendarId es obligatorio' });
    }

    const ok = await setGoogleDefaultCalendar(req.userId!, raw);
    if (!ok) {
      return res.status(412).json({
        message: 'No se pudo actualizar: ¿conectó Google antes?',
        code: 'AGENDA_GOOGLE_UPDATE_FAILED',
      });
    }

    return res.json({ success: true, calendarId: raw.slice(0, 512) });
  } catch (e) {
    console.error('Google Calendar set default', e);
    return res.status(500).json({ message: 'No se pudo guardar el calendario elegido' });
  }
}
