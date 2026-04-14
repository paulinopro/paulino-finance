/**
 * Envía correo de recuperación de contraseña si SMTP está configurado.
 * Si no hay SMTP_HOST, solo registra en consola (el enlace también se loguea en forgotPassword en desarrollo).
 */
export declare function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
//# sourceMappingURL=emailService.d.ts.map