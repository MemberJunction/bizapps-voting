/**
 * Integration harness: connects the MJ SQL Server provider to the private `MJ_Voting_Dev` database, loads the user
 * cache (so the system user exists) and imports the voting server package so every @RegisterClass registration,
 * including the invariant-enforcing entity server classes, is active.
 *
 * Connection settings come from the repo `.env` (via dotenv). No value from it is ever printed.
 */

import './env-setup.js';
import sql from 'mssql';

/** The only database this suite may touch (env-setup pins DB_DATABASE to it). */
export const TEST_DATABASE = 'MJ_Voting_Dev';

import { type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
// Importing the server package registers the engines' drivers and (through it) the invariant entity classes.
import { type VotingContext } from '@mj-biz-apps/voting-server';
import '@mj-biz-apps/voting-server';
// Registers the typed Person entity class.
import '@mj-biz-apps/common-entities';

export interface Harness {
    Pool: sql.ConnectionPool;
    Provider: SQLServerDataProvider;
    /** The MJ system user: an administrator, and the only identity allowed to touch the ballot box. */
    System: UserInfo;
    /** Administrator context (the system user). */
    Ctx: VotingContext;
    CoreSchema: string;
}

let cached: Promise<Harness | null> | null = null;

/** Describes a connection failure without echoing credentials or hosts. */
function describeFailure(e: unknown): string {
    if (e && typeof e === 'object') {
        const code = (e as { code?: unknown }).code;
        if (typeof code === 'string') return code;
        const name = (e as { name?: unknown }).name;
        if (typeof name === 'string') return name;
    }
    return 'unknown error';
}

async function connect(): Promise<Harness | null> {
    const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE } = process.env;
    if (!DB_HOST || !DB_USERNAME || !DB_PASSWORD) {
        console.warn('[voting-it] SKIPPED: database settings are not present in the repo .env.');
        return null;
    }
    const pool = new sql.ConnectionPool({
        server: DB_HOST,
        port: Number(DB_PORT ?? 1433),
        database: TEST_DATABASE,
        user: DB_USERNAME,
        password: DB_PASSWORD,
        options: { trustServerCertificate: DB_TRUST_SERVER_CERTIFICATE !== 'false', encrypt: false },
        pool: { max: 10, min: 1 },
        connectionTimeout: 8000,
        requestTimeout: 120_000,
    });
    try {
        await pool.connect();
        const db = await pool.request().query('SELECT DB_NAME() AS Name');
        if (db.recordset[0].Name !== TEST_DATABASE) throw new Error('wrong database');
    } catch (e) {
        console.warn(`[voting-it] SKIPPED: database ${TEST_DATABASE} is unreachable (${describeFailure(e)}).`);
        try {
            await pool.close();
        } catch {
            // already closed
        }
        return null;
    }
    const coreSchema = process.env.MJ_CORE_SCHEMA || '__mj';
    try {
        const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, coreSchema));
        await UserCache.Instance.Refresh(pool);
        const system = UserCache.Instance.GetSystemUser();
        if (!system) {
            console.warn('[voting-it] SKIPPED: the MJ system user is not present in the database.');
            return null;
        }
        return { Pool: pool, Provider: provider, System: system, Ctx: { ContextUser: system, Provider: provider as IMetadataProvider }, CoreSchema: coreSchema };
    } catch (e) {
        console.warn(`[voting-it] SKIPPED: the MJ provider could not start (${describeFailure(e)}).`);
        return null;
    }
}

/** The shared harness for this test file, or null (with the reason already printed) when the database is unavailable. */
export function GetHarness(): Promise<Harness | null> {
    cached ??= connect();
    return cached;
}
