/**
 * Codifica valores sensibles antes de persistirlos (p. ej. refresh token OAuth).
 * Formato Base64 concatenando iv + authTag + cipher (AES-256-GCM).
 */
export declare function encryptAgendaSecret(plainText: string): string;
export declare function decryptAgendaSecret(stored: string): string | null;
//# sourceMappingURL=agendaTokenVault.d.ts.map