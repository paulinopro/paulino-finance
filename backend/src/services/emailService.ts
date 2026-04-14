import nodemailer from 'nodemailer';

/**
 * Envía correo de recuperación de contraseña si SMTP está configurado.
 * Si no hay SMTP_HOST, solo registra en consola (el enlace también se loguea en forgotPassword en desarrollo).
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    console.warn(
      '[email] SMTP no configurado (SMTP_HOST). No se envió correo. Configura SMTP para producción.'
    );
    return;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? '';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  const from = process.env.SMTP_FROM?.trim() || user || 'noreply@localhost';

  await transporter.sendMail({
    from,
    to,
    subject: 'Restablecer contraseña — Paulino Finance',
    text: `Hola,\n\nPara restablecer tu contraseña, abre este enlace (válido 1 hora):\n${resetUrl}\n\nSi no solicitaste esto, ignora este correo.\n`,
    html: `<p>Hola,</p><p>Para restablecer tu contraseña, haz clic en el siguiente enlace (válido 1 hora):</p><p><a href="${resetUrl}">Restablecer contraseña</a></p><p>Si no solicitaste esto, ignora este correo.</p>`,
  });
}
