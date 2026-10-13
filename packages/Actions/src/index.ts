import './create-motion-vote.action.js';
import './open-election.action.js';
import './close-election.action.js';
import './get-turnout.action.js';
import './get-election-results.action.js';
import './tally-election.action.js';

export * from './create-motion-vote.action.js';
export * from './open-election.action.js';
export * from './close-election.action.js';
export * from './get-turnout.action.js';
export * from './get-election-results.action.js';
export * from './tally-election.action.js';

/**
 * @mj-biz-apps/voting-actions — the app's ACTIONS package.
 *
 * Actions are metadata-driven integration points for agents / workflows /
 * low-code — NOT for code-to-code calls (import classes directly for that).
 */
export function LoadBizAppsVotingActions(): void {
    // No-op: importing this module registers the action classes above.
}
