/**
 * @mj-biz-apps/voting-server — the SERVER BOOTSTRAP package.
 *
 * Named in mj-app.json under packages.server with role "bootstrap": MJAPI's dynamic package
 * loader imports this module and calls `LoadBizAppsVotingServer()` (the "startupExport").
 * Importing is what fires the @RegisterClass decorators; the Load* calls keep a bundler or
 * tree-shaker from concluding those modules are unused.
 *
 * Registered here:
 *   - entity classes (generated) and their server subclasses with the voting invariants
 *   - the Voting Remote Operations (the API surface; logic lives in the engines)
 *   - eligibility source and sign-in method drivers
 *   - the public ballot edge (`/vote`, a pre-auth server extension — see MJ_SERVER_EXTENSIONS)
 *   - scheduled jobs (open/close elections, result snapshots, reminders)
 *   - Actions for agents and workflows
 *   - the generated GraphQL resolvers
 */

// Generated entity classes, then the server subclasses: the later registration wins, so the
// invariant-enforcing classes replace the generated ones.
import '@mj-biz-apps/voting-entities';
import { LoadElectionSubtypeResolver } from '@mj-biz-apps/voting-entities';
import { LoadBizAppsVotingEntitiesServer } from '@mj-biz-apps/voting-core-entities-server';
import { LoadBizAppsVotingActions } from '@mj-biz-apps/voting-actions';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';

import { LoadVotingOperations } from './operations/index.js';
import './eligibility/index.js';
import './credentials/index.js';
import { BallotEdgeExtension } from './edge/index.js';
import { LoadVotingJobs } from './jobs/index.js';

// Generated GraphQL resolvers.
import './generated/generated.js';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export { MJ_SERVER_EXTENSIONS } from './edge/index.js';
export * from './engines/index.js';
export * from './shared/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Absolute paths to the resolver files, for hosts that pass resolver globs to createMJServer().
 */
export const RESOLVER_PATHS = [resolve(__dirname, 'generated/generated.{js,ts}')];

export function LoadBizAppsVotingServer(): void {
    LoadElectionSubtypeResolver();
    LoadBizAppsVotingEntitiesServer();
    LoadBizAppsVotingActions();
    LoadVotingOperations();
    LoadVotingJobs();
    // Referenced so the edge module (and its @RegisterClass) is never dropped as unused.
    void BallotEdgeExtension;
    // The engine base is RegisterForStartup; referencing it keeps the registration.
    void VotingEngineBase;
}
