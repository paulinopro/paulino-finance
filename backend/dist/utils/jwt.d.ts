export interface AuthJwtPayload {
    userId: number;
    isSuperAdmin?: boolean;
    impersonatedBy?: number;
}
/** Token corto de estado OAuth (solo enlaza cuenta Google al usuario tras callback). */
export declare function signGoogleAgendaOAuthState(userId: number): string;
export declare function verifyGoogleAgendaOAuthState(token: string): number | null;
export declare function signAuthToken(payload: AuthJwtPayload): string;
//# sourceMappingURL=jwt.d.ts.map