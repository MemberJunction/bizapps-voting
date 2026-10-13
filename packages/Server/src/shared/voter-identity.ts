/**
 * Resolves who the voter is for an election: a guest ballot session (scope-limited principal minted by the public edge)
 * or an ordinary MJ session matched to the roll through the bizapps-common Person.
 *
 * The CLAIMS come from the caller (the signed session scope, the MJ user id, the user's email). The roll and Person
 * lookups that those claims are matched against run as the system principal: neither a guest nor an ordinary member
 * holds any entity permission on the roll (it is closed to everyone but administrators and the engines), so reading it
 * as the caller would refuse every voter. Nothing but the matched EligibleVoterID leaves this class.
 */

import { UUIDsEqual } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { IsGuestPrincipal } from './principal.js';
import { type mjBizAppsVotingEligibleVoterEntity } from '@mj-biz-apps/voting-entities';
import { type VotingContext, RunViewOf } from './types.js';
import { SystemContext } from './system-user.js';

export interface VoterIdentity {
    ElectionID: string;
    EligibleVoterID: string;
    Via: 'GuestSession' | 'MJSession';
    CredentialMethodCode: string;
}

const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
const ELIGIBLE_VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';

/** Escapes a value for a single-quoted SQL literal in an ExtraFilter. */
export function SqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** A guest scope's parts. */
export interface GuestScope {
    ElectionID: string;
    EligibleVoterID: string;
}

/** Parses a guest session resource id (`electionId:eligibleVoterId`). Null when it is not that shape. */
export function ParseGuestResource(resourceID: string | undefined | null): GuestScope | null {
    if (!resourceID) return null;
    const idx = resourceID.indexOf(':');
    if (idx <= 0 || idx === resourceID.length - 1 || resourceID.indexOf(':', idx + 1) !== -1) return null;
    const electionID = resourceID.slice(0, idx).trim();
    const voterID = resourceID.slice(idx + 1).trim();
    return electionID && voterID ? { ElectionID: electionID, EligibleVoterID: voterID } : null;
}

/**
 * Authorization gate for voter operations. A non-guest principal passes here (the roll check
 * happens when the voter is resolved). A guest passes only when its signed scope is a ballot
 * session (ResourceType VoterIdentityResolver.GuestResourceType) for exactly this election.
 */
export function GuestMayAccessElection(user: UserInfo | undefined | null, electionID: string | undefined | null): boolean {
    if (!IsGuestPrincipal(user)) return true;
    const scope = user?.MagicLinkScope;
    if (!scope || scope.ResourceType !== VoterIdentityResolver.GuestResourceType || !electionID) return false;
    const parsed = ParseGuestResource(scope.ResourceID);
    return !!parsed && UUIDsEqual(parsed.ElectionID, electionID);
}

export class VoterIdentityResolver {
    public static readonly GuestResourceType = 'VotingBallotSession';

    /** The resource id a guest ballot session is scoped to. */
    public static EncodeGuestResource(electionID: string, eligibleVoterID: string): string {
        return `${electionID}:${eligibleVoterID}`;
    }

    /**
     * Guest principal: the scope's ResourceType must be the ballot session type and its election must be this election.
     * MJ session: the Person linked to the user (LinkedUserID, else email), then that Person's Eligible roll entry. Null when not on the roll.
     */
    public static async Resolve(electionID: string, ctx: VotingContext): Promise<VoterIdentity | null> {
        const user = ctx.ContextUser;
        if (IsGuestPrincipal(user)) {
            return VoterIdentityResolver.resolveGuest(electionID, ctx);
        }
        return VoterIdentityResolver.resolveMJSession(electionID, ctx);
    }

    private static async resolveGuest(electionID: string, ctx: VotingContext): Promise<VoterIdentity | null> {
        const scope = ctx.ContextUser.MagicLinkScope;
        if (!scope || scope.ResourceType !== VoterIdentityResolver.GuestResourceType) return null;
        const parsed = ParseGuestResource(scope.ResourceID);
        if (!parsed || !UUIDsEqual(parsed.ElectionID, electionID)) return null;
        // The scope was minted by the edge after verifying the voter; confirm the roll entry still stands.
        const voter = await VoterIdentityResolver.loadEligibleVoter(electionID, parsed.EligibleVoterID, SystemContext(ctx));
        if (!voter) return null;
        return { ElectionID: electionID, EligibleVoterID: voter.ID, Via: 'GuestSession', CredentialMethodCode: 'guest-session' };
    }

    private static async resolveMJSession(electionID: string, ctx: VotingContext): Promise<VoterIdentity | null> {
        const sys = SystemContext(ctx);
        const personID = await VoterIdentityResolver.findPersonID(ctx.ContextUser, sys);
        if (!personID) return null;
        const rv = RunViewOf(sys);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: ELIGIBLE_VOTERS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND PersonID = ${SqlLiteral(personID)} AND Status = 'Eligible'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            sys.ContextUser
        );
        const row = result.Success ? result.Results[0] : undefined;
        return row ? { ElectionID: electionID, EligibleVoterID: row.ID, Via: 'MJSession', CredentialMethodCode: 'mj-session' } : null;
    }

    private static async loadEligibleVoter(
        electionID: string,
        eligibleVoterID: string,
        ctx: VotingContext
    ): Promise<Pick<mjBizAppsVotingEligibleVoterEntity, 'ID'> | null> {
        const rv = RunViewOf(ctx);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: ELIGIBLE_VOTERS_ENTITY,
                ExtraFilter: `ID = ${SqlLiteral(eligibleVoterID)} AND ElectionID = ${SqlLiteral(electionID)} AND Status = 'Eligible'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        return result.Success && result.Results[0] ? result.Results[0] : null;
    }

    /** The Person behind the calling user: `user` supplies the claims, `reader` (the system context) runs the lookups. */
    private static async findPersonID(user: UserInfo, reader: VotingContext): Promise<string | null> {
        const rv = RunViewOf(reader);
        if (user.ID) {
            const linked = await rv.RunView<{ ID: string }>(
                { EntityName: PEOPLE_ENTITY, ExtraFilter: `LinkedUserID = ${SqlLiteral(user.ID)}`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
                reader.ContextUser
            );
            if (linked.Success && linked.Results[0]) return linked.Results[0].ID;
        }
        const email = user.Email?.trim();
        if (!email) return null;
        const byEmail = await rv.RunView<{ ID: string }>(
            { EntityName: PEOPLE_ENTITY, ExtraFilter: `LOWER(Email) = ${SqlLiteral(email.toLowerCase())}`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
            reader.ContextUser
        );
        return byEmail.Success && byEmail.Results[0] ? byEmail.Results[0].ID : null;
    }
}
