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

/** Whether the audit row should name the acting user (guests and the system user are recorded as no actor). */
export function ActorIdFor(ctx: VotingContext): string | null {
    const user = ctx.ContextUser;
    if (!user?.ID || IsGuestPrincipal(user)) return null;
    try {
        if (UUIDsEqual(GetSystemUser().ID, user.ID)) return null;
    } catch {
        // no system user available: fall through and record the actor
    }
    return user.ID;
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
            row.Details = details ? JSON.stringify(details) : null;
            if (!(await row.Save())) {
                LogError(`Voting audit: could not record "${eventType}" for election ${electionID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (e) {
            LogError(`Voting audit: could not record "${eventType}" for election ${electionID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
