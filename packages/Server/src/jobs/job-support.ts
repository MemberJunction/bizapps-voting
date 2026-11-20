/**
 * Shared plumbing for the voting scheduled jobs: the system-user context, election loading and failure summaries.
 */

import { type IMetadataProvider } from '@memberjunction/core';
import { type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import { type VotingContext, RunViewOf } from '../shared/types.js';
import { GetSystemUser } from '../shared/system-user.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { type JobElectionRow } from './job-selection.js';

const ELECTIONS_ENTITY = 'MJ_BizApps_Voting: Elections';
const AUDIT_ENTITY = 'MJ_BizApps_Voting: Election Audit Events';

/** The system user acting through the provider the scheduled job's own records belong to. */
export function BuildJobContext(context: ScheduledJobExecutionContext): VotingContext {
    return { ContextUser: GetSystemUser(), Provider: context.Schedule.ProviderToUse as unknown as IMetadataProvider };
}

/** Elections in the given statuses, with the columns the selection helpers need. */
export async function LoadElectionsByStatus(ctx: VotingContext, statuses: readonly string[]): Promise<JobElectionRow[]> {
    const list = statuses.map(SqlLiteral).join(',');
    const res = await RunViewOf(ctx).RunView<JobElectionRow>(
        {
            EntityName: ELECTIONS_ENTITY,
            ExtraFilter: `Status IN (${list})`,
            Fields: ['ID', 'Name', 'Status', 'OpensAt', 'ClosesAt', 'ResultsTiming', 'AssuranceTier', 'Configuration'],
            ResultType: 'simple',
        },
        ctx.ContextUser
    );
    if (!res.Success) throw new Error(res.ErrorMessage || 'The elections could not be read.');
    return res.Results;
}

/** The most recent audit event of a type per election (lower-cased election id). */
export async function LoadLastAuditTimes(ctx: VotingContext, electionIDs: readonly string[], eventType: string): Promise<Map<string, Date>> {
    const map = new Map<string, Date>();
    if (electionIDs.length === 0) return map;
    const ids = electionIDs.map(SqlLiteral).join(',');
    const res = await RunViewOf(ctx).RunView<{ ElectionID: string; OccurredAt: Date | string }>(
        {
            EntityName: AUDIT_ENTITY,
            ExtraFilter: `EventType = ${SqlLiteral(eventType)} AND ElectionID IN (${ids})`,
            Fields: ['ElectionID', 'OccurredAt'],
            ResultType: 'simple',
        },
        ctx.ContextUser
    );
    if (!res.Success) throw new Error(res.ErrorMessage || 'The audit events could not be read.');
    for (const row of res.Results) {
        const at = new Date(row.OccurredAt);
        const key = row.ElectionID.toLowerCase();
        const prior = map.get(key);
        if (!prior || at.getTime() > prior.getTime()) map.set(key, at);
    }
    return map;
}

/** One failed election in a job run. */
export interface JobFailure {
    ElectionID: string;
    Message: string;
}

/** `Failed: n` summary used as the job's ErrorMessage; undefined when nothing failed. */
export function SummarizeFailures(failures: readonly JobFailure[]): string | undefined {
    if (failures.length === 0) return undefined;
    return `${failures.length} election(s) failed: ` + failures.map((f) => `${f.ElectionID}: ${f.Message}`).join('; ');
}
