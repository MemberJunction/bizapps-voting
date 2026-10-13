/**
 * Shared helpers for the Remote Operations. Everything decision-shaped is a pure function (unit-tested);
 * the few async helpers do one narrow read and say so.
 */

import { LogError } from '@memberjunction/core';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { VOTER_CREDENTIALS_ENTITY } from '../credentials/credential-store.js';
import type { ResultsViewer } from '../engines/results-engine.js';
import type { MyParticipation } from '../engines/cast-engine.js';
import {
    IsGuestPrincipal,
    ParseGuestResource,
    RunViewOf,
    SystemContext,
    VoterIdentityResolver,
    type VoterIdentity,
    type VotingContext,
} from '../shared/index.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import type { UserInfo } from '@memberjunction/core';

/** What a caller sees when an operation fails for a reason that is not a designed engine failure. */
export const GENERIC_FAILURE_MESSAGE = 'The operation could not be completed.';

/** The failure arm every operation output shares. */
export interface OperationFailure {
    Success: false;
    Message: string;
}

/** The error's class name only; safe to log even when the message could echo caller input. */
export function ErrorName(error: unknown): string {
    return error instanceof Error ? error.name : 'unknown';
}

/**
 * Logs an unexpected exception and returns the generic caller-facing failure. The raw exception text is never
 * returned. `NameOnly` is for operations that carry ballot content, keys or shares: a driver or database message
 * could echo them, so only the error name is logged. Engine failures (EngineResult.ErrorMessage) do not come here.
 */
export function FailOperation(operation: string, error: unknown, options?: { NameOnly?: boolean }): OperationFailure {
    const detail = !options?.NameOnly && error instanceof Error && error.message ? `: ${error.message}` : '';
    LogError(`${operation} failed (${ErrorName(error)})${detail}`);
    return { Success: false, Message: GENERIC_FAILURE_MESSAGE };
}

/** A guest must hold a well-formed ballot-session scope; a non-guest always passes (the roll check happens later). */
export function HoldsBallotSession(user: UserInfo | undefined | null): boolean {
    if (!IsGuestPrincipal(user)) return true;
    const scope = user?.MagicLinkScope;
    return !!scope && scope.ResourceType === VoterIdentityResolver.GuestResourceType && ParseGuestResource(scope.ResourceID) !== null;
}

/** What GetMyBallot reports about the voter's own state. The receipt is present only when the engine supplied one. */
export function DescribeMyBallotState(participation: MyParticipation): { HasVoted: boolean; CanRevote: boolean; ReceiptCode: string | null } {
    return { HasVoted: participation.HasVoted, CanRevote: participation.CanRevote, ReceiptCode: participation.ReceiptCode ?? null };
}

/** Facts about the caller that decide results visibility. */
export interface ViewerFacts {
    IsAdministrator: boolean;
    /** A scope-limited (guest) principal. */
    IsGuest: boolean;
    /** Whether a real, signed-in MJ user is calling. */
    HasUserID: boolean;
    /** The resolved roll entry; null when the caller is not on the roll. */
    Identity: Pick<VoterIdentity, 'EligibleVoterID'> | null;
    HasVoted: boolean;
}

/**
 * Builds the results viewer. Host membership is approximated as "a signed-in, non-guest user of this MJ instance":
 * the voting app has no host-membership concept of its own, so the host's own sign-in is the membership test.
 * A caller with no roll entry is not eligible and has not voted.
 */
export function BuildResultsViewer(facts: ViewerFacts): ResultsViewer {
    const eligible = facts.Identity !== null;
    return {
        IsAdministrator: facts.IsAdministrator,
        IsEligible: eligible,
        HasVoted: eligible && facts.HasVoted,
        IsHostMember: !facts.IsGuest && facts.HasUserID,
        EligibleVoterID: facts.Identity?.EligibleVoterID,
    };
}

/** A redeemed credential's method and when it was redeemed. */
export interface RedeemedCredential {
    VoterCredentialMethodID: string;
    RedeemedAt: Date | string | null;
}

function timeOf(value: Date | string | null): number {
    if (!value) return Number.NEGATIVE_INFINITY;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** The method of the most recently redeemed credential, or undefined when none was redeemed. */
export function MostRecentRedeemedMethodID(credentials: ReadonlyArray<RedeemedCredential>): string | undefined {
    let best: RedeemedCredential | undefined;
    for (const c of credentials) {
        if (timeOf(c.RedeemedAt) === Number.NEGATIVE_INFINITY) continue;
        if (!best || timeOf(c.RedeemedAt) > timeOf(best.RedeemedAt)) best = c;
    }
    return best?.VoterCredentialMethodID;
}

/**
 * Which credential method vouched for this cast. An MJ-session voter used the 'mj-session' method; a guest session
 * does not carry its method in the token, so it is the method of the voter's most recently redeemed credential.
 */
export function ChooseCredentialMethodID(
    via: VoterIdentity['Via'],
    mjSessionMethodID: string | undefined,
    redeemed: ReadonlyArray<RedeemedCredential>
): string | undefined {
    return via === 'MJSession' ? mjSessionMethodID : MostRecentRedeemedMethodID(redeemed);
}

/** Resolves the credential method for a cast. One system-context read of the voter's redeemed credentials (guests only). */
export async function ResolveCredentialMethodID(identity: VoterIdentity, ctx: VotingContext): Promise<string | undefined> {
    await VotingEngineBase.Instance.Config(false, ctx.ContextUser, ctx.Provider);
    const mjSession = VotingEngineBase.Instance.GetVoterCredentialMethodByCode('mj-session')?.ID;
    if (identity.Via === 'MJSession') return ChooseCredentialMethodID(identity.Via, mjSession, []);
    const sys = SystemContext(ctx);
    const result = await RunViewOf(sys).RunView<RedeemedCredential>(
        {
            EntityName: VOTER_CREDENTIALS_ENTITY,
            ExtraFilter: `EligibleVoterID = ${SqlLiteral(identity.EligibleVoterID)} AND RedeemedAt IS NOT NULL`,
            Fields: ['VoterCredentialMethodID', 'RedeemedAt'],
            OrderBy: 'RedeemedAt DESC',
            MaxRows: 5,
            ResultType: 'simple',
        },
        sys.ContextUser
    );
    return ChooseCredentialMethodID(identity.Via, mjSession, result.Success ? result.Results : []);
}
