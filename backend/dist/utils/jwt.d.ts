export interface AuthJwtPayload {
    userId: number;
    isSuperAdmin?: boolean;
    impersonatedBy?: number;
}
export declare function signAuthToken(payload: AuthJwtPayload): string;
//# sourceMappingURL=jwt.d.ts.map