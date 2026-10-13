/**
 * Voting-only test MJAPI host (port 4104 by default).
 *
 *   node packages/TestHost/src/start-host.mjs            (or: pnpm --filter @mj-biz-apps/voting-test-host start)
 *
 * Mirrors MJ/packages/MJAPI/src/index.ts: MJ's prebuilt class registrations + createMJServer(). The Open App packages
 * (bizapps-common, voting) come from mj.config.cjs dynamicPackages. Env comes from the voting repo .env; the database
 * is pinned to MJ_Voting_Dev. No secret is ever printed.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const hostDir = resolve(here, '..');
const repoRoot = resolve(hostDir, '../..');

// cosmiconfig (MJServer config.ts, server-bootstrap) searches from the working directory: make that this package.
process.chdir(hostDir);
dotenv.config({ path: resolve(repoRoot, '.env'), quiet: true });

const TEST_DATABASE = 'MJ_Voting_Dev';
if (process.env.DB_DATABASE && process.env.DB_DATABASE !== TEST_DATABASE) {
    console.warn(`[voting-test-host] DB_DATABASE is overridden to ${TEST_DATABASE}; this host never serves another database.`);
}
process.env.DB_DATABASE = TEST_DATABASE;

const port = process.env.VOTING_WIRE_PORT ?? '4104';
process.env.GRAPHQL_PORT = port;
process.env.GRAPHQL_ROOT_PATH = process.env.GRAPHQL_ROOT_PATH ?? '/';
process.env.MJAPI_PUBLIC_URL = process.env.MJAPI_PUBLIC_URL ?? `http://localhost:${port}`;
process.env.GRAPHQL_BASE_URL = process.env.GRAPHQL_BASE_URL ?? 'http://localhost';
// The scheduler / task-graph dispatchers must not race the tests that assert on election state.
process.env.MJ_DISABLE_TASK_GRAPH_DISPATCHER = process.env.MJ_DISABLE_TASK_GRAPH_DISPATCHER ?? '1';

for (const key of ['MJ_API_KEY', 'MJ_MAGIC_LINK_PRIVATE_KEY', 'VOTING_SELECTIONS_KEY', 'DB_HOST', 'DB_USERNAME', 'DB_PASSWORD']) {
    if (!process.env[key]) {
        console.error(`[voting-test-host] ${key} is missing from the voting repo .env (names only; values are never printed).`);
        process.exit(1);
    }
}

// Static imports would be hoisted above the env setup, and MJServer validates its configuration at import time.
const { CreateMJServer } = await import('@memberjunction/server-bootstrap');
await import('@memberjunction/server-bootstrap/mj-class-registrations');

// resolverPaths: [] -> none of MJAPI's app-level generated resolver globs; core resolvers ship inside MJServer and the
// Open App resolvers are added from each package's RESOLVER_PATHS by the dynamic-package loader.
CreateMJServer({ resolverPaths: [] }).catch((err) => {
    console.error('[voting-test-host] failed to start:', err instanceof Error ? err.message : err);
    process.exit(1);
});
