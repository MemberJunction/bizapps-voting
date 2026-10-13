/**
 * Entity server subclasses for BizApps Voting: the invariants of design §5, enforced in `ValidateAsync` / `Save` / `Delete`
 * so every caller gets them. Each decision is a pure helper in `entity-invariants.ts`; the classes here only read the
 * entity, load the parent rows (with the saving entity's own provider and context user), and apply the verdict.
 *
 * Every guarded class forces async validation on in `Save` (`WithValidation`), so a caller cannot skip a rule with
 * `SkipAsyncValidation: true`. A refused delete returns false with the reason on the result history, as MJ expects.
 */

import { BaseEntity, EntityPermissionType, LogError, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    CanTransition,
    IsConfigurationLocked,
    UndeclaredConfigurationKeys,
    ValidateResolvedConfiguration,
    mjBizAppsVotingBallotAttributionEntity,
    mjBizAppsVotingBallotDistributionEntity,
    mjBizAppsVotingBallotSelectionEntity,
    mjBizAppsVotingCastBallotEntity,
    mjBizAppsVotingContestEntity,
    mjBizAppsVotingContestOptionEntity,
    mjBizAppsVotingContestOptionResultEntity,
    mjBizAppsVotingContestResultEntity,
    mjBizAppsVotingContestRunningTallyEntity,
    mjBizAppsVotingElectionAnchorEntity,
    mjBizAppsVotingElectionAuditEventEntity,
    mjBizAppsVotingElectionEntity,
    mjBizAppsVotingElectionTypeEntity,
    mjBizAppsVotingEligibleVoterEntity,
    mjBizAppsVotingParticipationEntity,
    type ElectionStatus,
    type IElectionConfiguration,
    type mjBizAppsVotingElectionEntity as ElectionEntity,
} from '@mj-biz-apps/voting-entities';

import { BallotBoxWriteGuard, TallyWriteGuard } from './write-guards.js';
import { ElectionTypeDriverRegistry } from './drivers/election-type-driver-registry.js';
import {
    AsString,
    BuildConfigurationToValidate,
    ComputeCastBallotUpdateViolations,
    ComputeLockedFieldViolations,
    ComputeVoterRollViolations,
    DeriveElectionChangeAction,
    DescribeConfigurationLockRefusal,
    DescribeDistributionCreateRefusal,
    DescribeResultWriteRefusal,
    GetDirtyFieldNames,
    GetDirtyOldValues,
    GetOldFieldValue,
    IsFieldDirty,
    ParseConfiguration,
    type RuleViolation,
} from './entity-invariants.js';
import {
    ActingUser,
    FailDelete,
    FailSave,
    LoadElection,
    LoadElectionOfContest,
    LoadElectionOfContestResult,
    ParentIdsOf,
    Refuse,
    ResolveElectionType,
    WithValidation,
} from './entity-support.js';

type SaveOptions = Parameters<BaseEntity['Save']>[0];
type DeleteOptions = Parameters<BaseEntity['Delete']>[0];

// === Shared rules ===

/** Loads the election a child row points at (through `loadElection`) and says why the write is refused when that election is locked. */
async function electionLockRefusal(
    entity: BaseEntity,
    parentField: string,
    loadElection: (e: BaseEntity, id: string | null) => Promise<ElectionEntity | null>,
    what: string,
    verb: 'create' | 'change' | 'delete'
): Promise<string | null> {
    for (const id of ParentIdsOf(entity, parentField)) {
        const election = await loadElection(entity, id);
        if (!election) return `Cannot ${verb} ${what}: its election could not be read.`;
        const refusal = DescribeConfigurationLockRefusal(election.Status, what, verb);
        if (refusal) return refusal;
    }
    return null;
}

/**
 * Says why a delete of a child row is refused, deciding the caller's own DELETE permission first: a caller without it gets
 * MJ's standard permission refusal (from `super.Delete`) and learns nothing about the election's state. Null means proceed.
 */
async function deleteRefusal(
    entity: BaseEntity,
    parentField: string,
    loadElection: (e: BaseEntity, id: string | null) => Promise<ElectionEntity | null>,
    what: string
): Promise<string | null> {
    if (!entity.CheckPermissions(EntityPermissionType.Delete, false)) return null;
    return electionLockRefusal(entity, parentField, loadElection, what, 'delete');
}

/** Applies each rule violation to the validation result. */
function applyViolations(result: ValidationResult, violations: RuleViolation[]): ValidationResult {
    for (const v of violations) Refuse(result, v.Field, v.Message);
    return result;
}

/** Refuses a change to a saved row (any dirty field), for rows that are write-once. */
function refuseUpdate(entity: BaseEntity, result: ValidationResult, message: string): ValidationResult {
    const dirty = entity.IsSaved ? GetDirtyFieldNames(entity) : [];
    return dirty.length > 0 ? Refuse(result, dirty[0], message) : result;
}

/** Refuses creating a row outside the ballot-box guard. */
function requireBallotBoxForCreate(entity: BaseEntity, result: ValidationResult, message: string): ValidationResult {
    return !entity.IsSaved && !BallotBoxWriteGuard.HasBallotBoxAccess() ? Refuse(result, 'ID', message) : result;
}

// === Election ===

/** What an election save changes, read once before the save resets the dirty flags. */
interface ElectionChangeReading {
    isNew: boolean;
    changed: boolean;
    oldStatus: ElectionStatus | null;
    newStatus: ElectionStatus;
    oldValues: Record<string, unknown>;
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Elections')
export class ElectionEntityServer extends mjBizAppsVotingElectionEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    private readChange(): ElectionChangeReading {
        const isNew = !this.IsSaved;
        const statusDirty = IsFieldDirty(this, 'Status');
        const old = AsString(GetOldFieldValue(this, 'Status')) as ElectionStatus | null;
        return {
            isNew,
            changed: isNew || GetDirtyFieldNames(this).length > 0,
            oldStatus: isNew ? null : statusDirty ? old : this.Status,
            newStatus: this.Status,
            oldValues: isNew ? {} : GetDirtyOldValues(this),
        };
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const change = this.readChange();
        if (!change.changed) return result;
        if (!ActingUser(this)) return Refuse(result, 'ID', 'Election change refused: there is no signed-in user.');

        // (a) a new election starts as a Draft
        if (change.isNew && change.newStatus !== 'Draft') {
            Refuse(result, 'Status', 'A new election must start in Draft status.');
        }
        // (b) Status moves only along the state machine
        if (!change.isNew && IsFieldDirty(this, 'Status') && change.oldStatus && !CanTransition(change.oldStatus, change.newStatus)) {
            Refuse(result, 'Status', `Election cannot transition from ${change.oldStatus} to ${change.newStatus}.`);
        }
        // (c) once the configuration is locked, only a few fields may change
        if (!change.isNew && change.oldStatus && IsConfigurationLocked(change.oldStatus)) {
            const violations = ComputeLockedFieldViolations(change.oldStatus, GetDirtyFieldNames(this), change.oldValues);
            for (const field of violations) {
                Refuse(result, field, `Election configuration is locked (${change.oldStatus}). Only Status, ChallengeWindowEndsAt, and RollHash / RollFrozenAt (while still empty) may change; ElectionPublicKey only before Open.`);
            }
        }

        // (d) the resolved configuration must be consistent
        const resolved = await ResolveElectionType(this, this.ElectionTypeID);
        if (resolved.kind === 'refused') return Refuse(result, 'ElectionTypeID', resolved.message);
        const electionConfig = ParseConfiguration<IElectionConfiguration>(this.Configuration, 'The election configuration');
        if (electionConfig.Error) return Refuse(result, 'Configuration', electionConfig.Error);
        // Configuration is readable by members once the roll is frozen: only documented (or driver-declared) keys are stored.
        if (change.isNew || IsFieldDirty(this, 'Configuration')) {
            const undeclared = UndeclaredConfigurationKeys(electionConfig.Value, [...resolved.driver.ConfigurationKeys, ...(resolved.typeConfig?.OverridableKeys ?? [])]);
            if (undeclared.length > 0) {
                return Refuse(
                    result,
                    'Configuration',
                    `The election configuration has unrecognised key(s): ${undeclared.join(', ')}. It is readable by every member once the roll is frozen, so it accepts only the documented settings.`
                );
            }
        }
        const configuration = BuildConfigurationToValidate(resolved.typeConfig, electionConfig.Value, {
            SecrecyMode: this.SecrecyMode,
            AssuranceTier: this.AssuranceTier,
            ResultsTiming: this.ResultsTiming,
            ResultsAudience: this.ResultsAudience,
            ResultsMinCast: this.ResultsMinCast,
            AllowRevote: this.AllowRevote,
            WeightClassMinSize: this.WeightClassMinSize,
        });
        for (const message of ValidateResolvedConfiguration(configuration)) Refuse(result, 'Configuration', message);

        // (e) the type's driver has the last word, but is not asked about a change already refused
        if (result.Success) {
            const message = await resolved.driver.ValidateElectionChange({
                ContextUser: this.ContextCurrentUser,
                Provider: this.ProviderToUse,
                Election: this,
                ElectionType: resolved.type,
                Configuration: configuration,
                Action: DeriveElectionChangeAction(change.oldStatus, change.newStatus, change.isNew),
                oldValues: change.oldValues,
            });
            if (message) Refuse(result, 'Status', message);
        }
        return result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        const change = this.readChange();
        const ok = await super.Save(WithValidation(options));
        if (!ok || !change.changed) return ok;
        return this.reactToChange(change);
    }

    /** Tells the type's driver about a saved change. A driver that throws fails the save (inside the caller's transaction, it rolls back). */
    private async reactToChange(change: ElectionChangeReading): Promise<boolean> {
        try {
            const resolved = await ResolveElectionType(this, this.ElectionTypeID);
            if (resolved.kind === 'refused') return FailSave(this, resolved.message);
            const electionConfig = ParseConfiguration<IElectionConfiguration>(this.Configuration, 'The election configuration');
            const configuration = BuildConfigurationToValidate(resolved.typeConfig, electionConfig.Value, {
                SecrecyMode: this.SecrecyMode,
                AssuranceTier: this.AssuranceTier,
                ResultsTiming: this.ResultsTiming,
                ResultsAudience: this.ResultsAudience,
                ResultsMinCast: this.ResultsMinCast,
                AllowRevote: this.AllowRevote,
                WeightClassMinSize: this.WeightClassMinSize,
            });
            await resolved.driver.OnElectionChanged({
                ContextUser: this.ContextCurrentUser,
                Provider: this.ProviderToUse,
                Election: this,
                ElectionType: resolved.type,
                Configuration: configuration,
                Action: DeriveElectionChangeAction(change.oldStatus, change.newStatus, change.isNew),
                oldValues: change.oldValues,
            });
            return true;
        } catch (e) {
            const message = `The election type's OnElectionChanged failed: ${e instanceof Error ? e.message : String(e)}`;
            LogError(message);
            return FailSave(this, message);
        }
    }
}

// === Election-owned configuration (Contest, ContestOption, ElectionAnchor) ===

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contests')
export class ContestEntityServer extends mjBizAppsVotingContestEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved && GetDirtyFieldNames(this).length === 0) return result;
        const refusal = await electionLockRefusal(this, 'ElectionID', LoadElection, 'a contest', this.IsSaved ? 'change' : 'create');
        return refusal ? Refuse(result, 'ElectionID', refusal) : result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(options?: DeleteOptions): Promise<boolean> {
        const refusal = await deleteRefusal(this, 'ElectionID', LoadElection, 'a contest');
        return refusal ? FailDelete(this, refusal) : super.Delete(options);
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Options')
export class ContestOptionEntityServer extends mjBizAppsVotingContestOptionEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved && GetDirtyFieldNames(this).length === 0) return result;
        const refusal = await electionLockRefusal(this, 'ContestID', LoadElectionOfContest, 'a contest option', this.IsSaved ? 'change' : 'create');
        return refusal ? Refuse(result, 'ContestID', refusal) : result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(options?: DeleteOptions): Promise<boolean> {
        const refusal = await deleteRefusal(this, 'ContestID', LoadElectionOfContest, 'a contest option');
        return refusal ? FailDelete(this, refusal) : super.Delete(options);
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Anchors')
export class ElectionAnchorEntityServer extends mjBizAppsVotingElectionAnchorEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved && GetDirtyFieldNames(this).length === 0) return result;
        const refusal = await electionLockRefusal(this, 'ElectionID', LoadElection, 'an election anchor', this.IsSaved ? 'change' : 'create');
        return refusal ? Refuse(result, 'ElectionID', refusal) : result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(options?: DeleteOptions): Promise<boolean> {
        const refusal = await deleteRefusal(this, 'ElectionID', LoadElection, 'an election anchor');
        return refusal ? FailDelete(this, refusal) : super.Delete(options);
    }
}

// === Ballot distributions ===

/**
 * A distribution publishes the election's ballot at the public edge. Creating one (or pointing one at another election)
 * after the election closed, was tallied, certified or cancelled is refused here, so every caller (the Explorer settings
 * screen, raw GraphQL, server code) gets the rule. Pausing, retiring or editing an existing distribution stays allowed.
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Distributions')
export class BallotDistributionEntityServer extends mjBizAppsVotingBallotDistributionEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved && !IsFieldDirty(this, 'ElectionID')) return result;
        const election = await LoadElection(this, this.ElectionID);
        if (!election) return Refuse(result, 'ElectionID', 'Cannot create a ballot distribution: its election could not be read.');
        const refusal = DescribeDistributionCreateRefusal(election.Status);
        return refusal ? Refuse(result, 'ElectionID', refusal) : result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }
}

// === Voter roll ===

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Eligible Voters')
export class EligibleVoterEntityServer extends mjBizAppsVotingEligibleVoterEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const dirty = GetDirtyFieldNames(this);
        if (this.IsSaved && dirty.length === 0) return result;
        for (const electionId of ParentIdsOf(this, 'ElectionID')) {
            const election = await LoadElection(this, electionId);
            if (!election) return Refuse(result, 'ElectionID', 'Voter change refused: the election could not be read.');
            applyViolations(result, ComputeVoterRollViolations(!!election.RollFrozenAt, !this.IsSaved, this.AddedAfterFreeze, dirty));
        }
        return result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    /**
     * Roll rows are never deleted: the entity is created with AllowDeleteAPI = 0 (no delete procedure), and a voter leaves the roll
     * by status (Removed, with the audit entry), which keeps the roll hash reproducible. A refusal rather than the generated throw,
     * so the reason reaches the caller the same way every other roll rule does.
     */
    public override async Delete(): Promise<boolean> {
        return FailDelete(this, 'Roll rows are never deleted; mark the voter Removed instead.');
    }
}

// === Ballot box ===

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Cast Ballots')
export class CastBallotEntityServer extends mjBizAppsVotingCastBallotEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        requireBallotBoxForCreate(this, result, 'Ballots may only be created by the cast engine.');
        if (this.IsSaved) {
            const dirty = GetDirtyFieldNames(this);
            if (dirty.length > 0) {
                if (!BallotBoxWriteGuard.HasBallotBoxAccess()) {
                    Refuse(result, dirty[0], 'Ballots may only be changed by the cast engine.');
                }
                const oldStatus = AsString(GetOldFieldValue(this, 'Status'));
                applyViolations(result, ComputeCastBallotUpdateViolations(dirty, oldStatus, this.Status));
            }
        }
        return result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(): Promise<boolean> {
        return FailDelete(this, 'Cast ballots cannot be deleted.');
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Selections')
export class BallotSelectionEntityServer extends mjBizAppsVotingBallotSelectionEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        requireBallotBoxForCreate(this, result, 'Ballot selections may only be created by the cast engine.');
        return refuseUpdate(this, result, 'Ballot selections cannot be modified.');
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(): Promise<boolean> {
        return FailDelete(this, 'Ballot selections cannot be deleted.');
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Running Tallies')
export class ContestRunningTallyEntityServer extends mjBizAppsVotingContestRunningTallyEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        return requireBallotBoxForCreate(this, result, 'Running tallies may only be created by the cast engine.');
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Attributions')
export class BallotAttributionEntityServer extends mjBizAppsVotingBallotAttributionEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        return requireBallotBoxForCreate(this, result, 'Ballot attributions may only be created by the cast engine.');
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Participations')
export class ParticipationEntityServer extends mjBizAppsVotingParticipationEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        requireBallotBoxForCreate(this, result, 'Participation records may only be created by the cast engine.');
        return refuseUpdate(this, result, 'Participation records are immutable.');
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(): Promise<boolean> {
        return FailDelete(this, 'Participation records cannot be deleted.');
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Audit Events')
export class ElectionAuditEventEntityServer extends mjBizAppsVotingElectionAuditEventEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        return refuseUpdate(this, result, 'Audit events are append-only and cannot be modified.');
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }

    public override async Delete(): Promise<boolean> {
        return FailDelete(this, 'Audit events are append-only and cannot be deleted.');
    }
}

// === Results (tally engine only, once the election is Closed or Tallied) ===

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Results')
export class ContestResultEntityServer extends mjBizAppsVotingContestResultEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved && GetDirtyFieldNames(this).length === 0) return result;
        const election = await LoadElectionOfContest(this, this.ContestID);
        const refusal = DescribeResultWriteRefusal(TallyWriteGuard.HasTallyAccess(), election?.Status ?? null);
        return refusal ? Refuse(result, 'ContestID', refusal) : result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }
}

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Option Results')
export class ContestOptionResultEntityServer extends mjBizAppsVotingContestOptionResultEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (this.IsSaved && GetDirtyFieldNames(this).length === 0) return result;
        const election = await LoadElectionOfContestResult(this, this.ContestResultID);
        const refusal = DescribeResultWriteRefusal(TallyWriteGuard.HasTallyAccess(), election?.Status ?? null);
        return refusal ? Refuse(result, 'ContestResultID', refusal) : result;
    }

    public override async Save(options?: SaveOptions): Promise<boolean> {
        return super.Save(WithValidation(options));
    }
}

// === Election types ===

@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Types')
export class ElectionTypeEntityServer extends mjBizAppsVotingElectionTypeEntity {
    public override async Save(options?: SaveOptions): Promise<boolean> {
        const ok = await super.Save(options);
        // A type row may have changed its driver class: drop the cached driver instances
        if (ok) ElectionTypeDriverRegistry.Instance.Clear();
        return ok;
    }
}
