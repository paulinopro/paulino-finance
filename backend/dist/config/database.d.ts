import { Pool, PoolClient } from 'pg';
declare const pool: Pool;
export declare const query: (text: string, params?: any[]) => Promise<import("pg").QueryResult<any>>;
export declare const getClient: () => Promise<PoolClient>;
export declare const syncSuperAdminsFromEnv: () => Promise<void>;
export declare const initializeDatabase: () => Promise<void>;
export default pool;
//# sourceMappingURL=database.d.ts.map