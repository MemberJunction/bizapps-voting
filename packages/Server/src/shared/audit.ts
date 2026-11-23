/**
 * Append-only election audit trail. Details never contain ballot content: callers pass counts, ids and codes only.
 */

import { LogError } from '@memberjunction/core';
import { type mjBizAppsVotingElectionAuditEventEntity } from '@mj-biz-apps/voting-entities';
import { IsGuestPrincipal } from './principal.js';
import { type VotingContext } from './types.js';
import { GetSystemUser } from './system-user.js';
import { UUIDsEqual } from '@memberjunction/global';

const AUDIT_ENTITY = 'MJ_BizApps_Voting: Election Audit Events';

/**
 * The MJ user an audit row names. A system-principal context opened for an authorized caller names that caller
 * (`ctx.Actor`); otherwise the context user, except guests and the system user (no actor).
 */
export function ActorIdFor(ctx: VotingContext): string | null {
    if (ctx.Actor) return ctx.Actor.UserID ?? null;
    const user = ctx.ContextUser;
    if (!user?.ID || IsGuestPrincipal(user)) return null;
    try {
        if (UUIDsEqual(GetSystemUser().ID, user.ID)) return null;
    } catch {
        // no system user available: fall through and record the actor
    }
    return user.ID;
}

/**
 * The audit payload. A guest ballot session has no MJ user to name, so the roll entry its signed scope is bound to is
 * recorded instead (`ActorEligibleVoterID`). Callers pass counts, ids and codes only; ballot choices never come here.
 */
export function AuditDetails(ctx: VotingContext, details?: Record<string, unknown>): string | null {
    const guest = ctx.Actor?.GuestEligibleVoterID;
    const all = guest ? { ...details, ActorEligibleVoterID: guest } : details;
    return all ? JSON.stringify(all) : null;
}

export class ElectionAudit {
    /** Writes one audit row. An audit failure is logged, never thrown: it must not undo the action it describes. */
    public static async Record(
        ctx: VotingContext,
        electionID: string,
        eventType: string,
        details?: Record<string, unknown>
    ): Promise<void> {
        try {
            const row = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionAuditEventEntity>(AUDIT_ENTITY, ctx.ContextUser);
            row.NewRecord();
            row.ElectionID = electionID;
            row.EventType = eventType;
            row.ActorUserID = ActorIdFor(ctx);
            row.OccurredAt = new Date();
            row.Details = AuditDetails(ctx, details);
            if (!(await row.Save())) {
                LogError(`Voting audit: could not record "${eventType}" for election ${electionID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (e) {
            LogError(`Voting audit: could not record "${eventType}" for election ${electionID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
