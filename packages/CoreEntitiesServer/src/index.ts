/**
 * @mj-biz-apps/voting-core-entities-server — SERVER-ONLY entity subclasses
 * (OPTIONAL — delete if you have no server-side entity logic).
 *
 * Override generated entities here to add server-side behavior: validation,
 * cross-record invariants (ValidateAsync — not DB triggers), Save() hooks,
 * FK cleanup before delete. This package must NEVER be imported by client
 * code — it is a dependency of the Server package only.
 *
 * NOTE the dependency shape in package.json: the sibling app package
 * (@mj-biz-apps/voting-entities) is a HARD dependency pinned to the exact same
 * version (all app packages version together via changesets `fixed`), while
 * every @memberjunction/* package is a PEER (^X.Y.Z).
 */

// Entity server subclasses with invariants
export * from './entity-servers.js';
import {
    BallotAttributionEntityServer,
    BallotSelectionEntityServer,
    CastBallotEntityServer,
    ContestEntityServer,
    ContestOptionEntityServer,
    ContestOptionResultEntityServer,
    ContestResultEntityServer,
    ContestRunningTallyEntityServer,
    ElectionAnchorEntityServer,
    ElectionAuditEventEntityServer,
    ElectionEntityServer,
    ElectionTypeEntityServer,
    EligibleVoterEntityServer,
    ParticipationEntityServer,
} from './entity-servers.js';

// Write guards for ballot box and tally
export { BallotBoxWriteGuard, TallyWriteGuard } from './write-guards.js';

// Drivers
export { BaseElectionTypeServerDriver } from './drivers/base-election-type-server-driver.js';
export { ElectionTypeDriverRegistry } from './drivers/election-type-driver-registry.js';

// Invariant helpers (the state machine and lock rule themselves live in @mj-biz-apps/voting-entities)
export {
    AsString,
    BuildConfigurationToValidate,
    ComputeCastBallotUpdateViolations,
    ComputeLockedFieldViolations,
    ComputeVoterRollViolations,
    DeriveElectionChangeAction,
    DescribeConfigurationLockRefusal,
    DescribeResultWriteRefusal,
    DescribeVoterDeleteRefusal,
    GetAllowedLockedFieldChanges,
    GetDirtyFieldNames,
    GetDirtyOldValues,
    GetFieldValue,
    GetOldFieldValue,
    IsFieldDirty,
    ParseConfiguration,
    type RuleViolation,
} from './entity-invariants.js';

/**
 * Bootstrap function: loads all entity server subclasses so @RegisterClass decorators fire.
 * Called by the server's LoadBizAppsVotingServer bootstrap. Every class is referenced here so a bundler cannot
 * tree-shake a registration away.
 */
export function LoadBizAppsVotingEntitiesServer(): void {
    const classes: ReadonlyArray<unknown> = [
        ElectionEntityServer,
        ContestEntityServer,
        ContestOptionEntityServer,
        ElectionAnchorEntityServer,
        EligibleVoterEntityServer,
        CastBallotEntityServer,
        BallotSelectionEntityServer,
        ContestRunningTallyEntityServer,
        BallotAttributionEntityServer,
        ParticipationEntityServer,
        ElectionAuditEventEntityServer,
        ContestResultEntityServer,
        ContestOptionResultEntityServer,
        ElectionTypeEntityServer,
    ];
    void classes;
}
