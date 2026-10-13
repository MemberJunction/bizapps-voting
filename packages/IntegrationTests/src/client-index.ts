/**
 * Client-safe entry of the wire tier. Do NOT import the support/, __tests__/ or provision/ folders from here: they load the
 * voting SERVER packages, whose entity subclasses throw on a GraphQL provider (and a browser has none of them).
 */
import '@memberjunction/core-entities';
import '@mj-biz-apps/common-entities';
import { LoadElectionSubtypeResolver } from '@mj-biz-apps/voting-entities';

LoadElectionSubtypeResolver();

import './checks/wire-smoke.checks.js';
import './checks/wire-trustee.checks.js';
import './checks/wire-tally.checks.js';
import './checks/wire-lifecycle.checks.js';
import './checks/wire-access.checks.js';
import './checks/wire-secrecy.checks.js';
import './checks/wire-edge.checks.js';
import './checks/wire-volume.checks.js';
import './checks/wire-world.checks.js';

export * from './wire/persona-model.js';
export * from './wire/persona-store.js';
export * from './wire/wire-config.js';
export * from './wire/wire-client.js';
export * from './wire/wire-cast.js';
export * from './wire/election-world.js';
export * from './wire/guest-session.js';
export * from './wire/raw-graphql.js';
export * from './wire/vote-world.js';
export * from './world/voting-world.js';
export * from './wire/wire-kit.js';

export function LoadVotingWireIntegrationTests(): void {}
export * from './wire/magic-link-session.js';
