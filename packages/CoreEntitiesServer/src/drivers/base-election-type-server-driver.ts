/**
 * BaseElectionTypeServerDriver
 * Extensibility plan § 6 of the design document.
 * Each hook defaults to allow/no-op; a type driver overrides only what it needs.
 */

import { type IEntityDataProvider, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { type mjBizAppsVotingElectionEntity, type mjBizAppsVotingElectionTypeEntity, type mjBizAppsVotingEligibleVoterEntity, type mjBizAppsVotingContestEntity, type IElectionTypeConfiguration, type BallotStyle, type BallotSubmission, type ValidationIssue } from '@mj-biz-apps/voting-entities';

export interface DriverValidationResult {
    ok: boolean;
    message?: string;
    field?: string;
}

export interface DriverBaseContext {
    ContextUser: UserInfo;
    Provider: IMetadataProvider | IEntityDataProvider;
    Election: mjBizAppsVotingElectionEntity;
    ElectionType: mjBizAppsVotingElectionTypeEntity;
    Configuration: IElectionTypeConfiguration;
}

export type ElectionChangeAction = 'Create' | 'Update' | 'Open' | 'Close' | 'Cancel' | 'Tally' | 'Certify';

export interface ElectionChangeContext extends DriverBaseContext {
    Action: ElectionChangeAction;
    oldValues?: Record<string, unknown>;
}

export type RollChangeAction = 'Freeze' | 'Amend' | 'Challenge';

export interface RollChangeContext extends DriverBaseContext {
    Action: RollChangeAction;
    oldValues?: Record<string, unknown>;
}

export interface BallotStyleContext extends DriverBaseContext {
    Style: BallotStyle;
}

export interface CastValidationContext extends DriverBaseContext {
    Submission: BallotSubmission;
    VotingClass: string | null;
    WeightClass: string;
}

export interface ContestResultSummary {
    ContestID: string;
    ContestName: string;
    Outcome: 'Passed' | 'Failed' | 'Decided' | 'Tied' | 'Void';
}

export interface ElectionResultsContext extends DriverBaseContext {
    PrimaryAnchor: { EntityName: string; RecordID: string } | null;
    Results: ContestResultSummary[];
}

/**
 * BaseElectionTypeServerDriver — extensibility point for election types.
 * Every hook has a working default (allow/no-op). A type's driver overrides only what it needs.
 * All validation hooks are async; reactions may be sync or async.
 */
export class BaseElectionTypeServerDriver {
    /**
     * Validate a change to an election (Create, Update, Open, Close, Cancel, Tally, Certify).
     * Return null (ok) or an error message.
     */
    public async ValidateElectionChange(ctx: ElectionChangeContext): Promise<string | null> {
        return null;
    }

    /**
     * React to a successful election change (after Save).
     * Runs inside the save's transaction.
     */
    public async OnElectionChanged(ctx: ElectionChangeContext): Promise<void> {
        // no-op
    }

    /**
     * Validate a change to the voter roll (Freeze, Amend, Challenge).
     * Return null (ok) or an error message.
     */
    public async ValidateRollChange(ctx: RollChangeContext): Promise<string | null> {
        return null;
    }

    /**
     * React to the roll being frozen (after Save).
     * Runs inside the save's transaction.
     */
    public async OnRollFrozen(ctx: RollChangeContext): Promise<void> {
        // no-op
    }

    /**
     * Validate the ballot style that will be built.
     * Return null (ok) or an error message.
     */
    public async ValidateBallotStyle(ctx: BallotStyleContext): Promise<string | null> {
        return null;
    }

    /**
     * Build (or adjust) the ballot style.
     * Default returns the style unchanged.
     * Runs before the voter sees or submits the ballot.
     */
    public async BuildBallotStyle(ctx: BallotStyleContext): Promise<BallotStyle> {
        return ctx.Style;
    }

    /**
     * Validate a ballot cast.
     * The context includes the submission, voting class and weight class, but never the voter's identity in Secret mode.
     * Return null (ok) or an error message.
     */
    public async ValidateCast(ctx: CastValidationContext): Promise<string | null> {
        return null;
    }

    /**
     * React to results being tallied (after the tally engine completes).
     * Runs inside the tally transaction.
     */
    public async OnResultsTallied(ctx: ElectionResultsContext): Promise<void> {
        // no-op
    }

    /**
     * React to results being certified (after the certification engine completes).
     * Runs inside the certification transaction.
     */
    public async OnResultsCertified(ctx: ElectionResultsContext): Promise<void> {
        // no-op
    }
}
