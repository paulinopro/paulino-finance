import { Response } from 'express';
import { getClient, query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { sendWhatsAppMessage } from '../services/openWaService';
import { normalizeWhatsAppPhone } from '../services/whatsappPhone';

type WhatsAppUserRow = {
  whatsapp_phone: string | null;
  whatsapp_consent_at: Date | string | null;
  whatsapp_verified_at: Date | string | null;
};

type WhatsAppUserConfiguration = {
  phone: string | null;
  consented: boolean;
  verified: boolean;
  consentedAt: string | null;
  verifiedAt: string | null;
};

function toIsoDate(value: Date | string | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function toConfiguration(row: WhatsAppUserRow): WhatsAppUserConfiguration {
  return {
    phone: row.whatsapp_phone,
    consented: row.whatsapp_consent_at !== null,
    verified: row.whatsapp_verified_at !== null,
    consentedAt: toIsoDate(row.whatsapp_consent_at),
    verifiedAt: toIsoDate(row.whatsapp_verified_at),
  };
}

export const getWhatsAppConfiguration = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT whatsapp_phone, whatsapp_consent_at, whatsapp_verified_at
       FROM users
       WHERE id = $1`,
      [req.userId!]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, whatsapp: toConfiguration(result.rows[0]) });
  } catch (error: any) {
    console.error('Get WhatsApp configuration error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching WhatsApp configuration' });
  }
};

export const updateWhatsAppConfiguration = async (req: AuthRequest, res: Response) => {
  const consent = req.body?.consent;
  if (typeof consent !== 'boolean') {
    return res.status(400).json({ success: false, message: 'WhatsApp consent must be a boolean' });
  }

  let phone: string | null;
  try {
    phone = normalizeWhatsAppPhone(req.body?.phone);
  } catch (_error) {
    return res.status(400).json({ success: false, message: 'Invalid WhatsApp phone number' });
  }
  if (consent && !phone) {
    return res.status(400).json({ success: false, message: 'A WhatsApp phone number is required for consent' });
  }

  let client: Awaited<ReturnType<typeof getClient>> | null = null;
  let transactionStarted = false;
  try {
    client = await getClient();
    await client.query('BEGIN');
    transactionStarted = true;
    const lockedUser = await client.query(
      `SELECT whatsapp_phone, whatsapp_consent_at, whatsapp_verified_at
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [req.userId!]
    );
    if (!lockedUser.rows[0]) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let updated;
    if (consent) {
      updated = await client.query(
        `UPDATE users
         SET whatsapp_phone = $1,
             whatsapp_consent_at = CASE
               WHEN whatsapp_phone IS DISTINCT FROM $1 OR whatsapp_consent_at IS NULL THEN CURRENT_TIMESTAMP
               ELSE whatsapp_consent_at
             END,
             whatsapp_verified_at = CASE
               WHEN whatsapp_phone IS DISTINCT FROM $1 THEN NULL
               ELSE whatsapp_verified_at
             END
         WHERE id = $2
         RETURNING whatsapp_phone, whatsapp_consent_at, whatsapp_verified_at`,
        [phone, req.userId!]
      );
    } else {
      updated = await client.query(
        `UPDATE users
         SET whatsapp_phone = $1,
             whatsapp_consent_at = NULL,
             whatsapp_verified_at = NULL
         WHERE id = $2
         RETURNING whatsapp_phone, whatsapp_consent_at, whatsapp_verified_at`,
        [phone, req.userId!]
      );
      await client.query(
        `UPDATE notification_settings
         SET whatsapp_enabled = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [req.userId!]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return res.json({ success: true, whatsapp: toConfiguration(updated.rows[0]) });
  } catch (error: any) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback WhatsApp configuration error:', rollbackError);
      }
    }
    console.error('Update WhatsApp configuration error:', error);
    return res.status(500).json({ success: false, message: 'Error updating WhatsApp configuration' });
  } finally {
    client?.release();
  }
};

export const testWhatsAppNotification = async (req: AuthRequest, res: Response) => {
  try {
    const configurationResult = await query(
      `SELECT whatsapp_phone, whatsapp_consent_at, whatsapp_verified_at
       FROM users
       WHERE id = $1`,
      [req.userId!]
    );
    const configuration = configurationResult.rows[0] as WhatsAppUserRow | undefined;
    if (!configuration?.whatsapp_phone || !configuration.whatsapp_consent_at) {
      return res.status(400).json({
        success: false,
        message: 'A consented WhatsApp phone number is required before sending a test',
      });
    }

    const phone = configuration.whatsapp_phone;
    const sendResult = await sendWhatsAppMessage(
      phone,
      'Prueba de WhatsApp de Paulino Finance. Si recibes este mensaje, las notificaciones estan configuradas correctamente.'
    );
    if (!sendResult.ok) {
      return res.status(502).json({ success: false, message: sendResult.message });
    }

    let client: Awaited<ReturnType<typeof getClient>> | null = null;
    let transactionStarted = false;
    try {
      client = await getClient();
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query(
        `SELECT id
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [req.userId!]
      );
      const verified = await client.query(
        `UPDATE users
         SET whatsapp_verified_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND whatsapp_phone = $2
           AND whatsapp_consent_at IS NOT NULL
         RETURNING whatsapp_verified_at`,
        [req.userId!, phone]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      if (!verified.rows[0]) {
        return res.status(409).json({
          success: false,
          message: 'WhatsApp configuration changed before verification could be recorded',
        });
      }
      return res.json({ success: true, message: 'WhatsApp test message sent successfully' });
    } catch (error: any) {
      if (client && transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Rollback WhatsApp verification error:', rollbackError);
        }
      }
      console.error('Verify WhatsApp test error:', error);
      return res.status(500).json({ success: false, message: 'Error recording WhatsApp verification' });
    } finally {
      client?.release();
    }
  } catch (error: any) {
    console.error('Test WhatsApp notification error:', error);
    return res.status(500).json({ success: false, message: 'Error sending WhatsApp test notification' });
  }
};
