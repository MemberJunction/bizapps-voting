/**
 * Database lookups that tie an asserted identity to one election's roll.
 */

import { type mjBizAppsVotingEligibleVoterEntity } from '@mj-biz-apps/voting-entities';
import { SqlLiteral, type VotingContext, RunViewOf } from '../shared/index.js';
import { type RollFinders } from './credential-crypto.js';

const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
export const ELIGIBLE_VOTERS_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';

/** Finders over the roll of one election. Only voters with Status 'Eligible' can sign in. */
export function CreateRollFinders(electionID: string, ctx: VotingContext): RollFinders {
    return {
        BySourceKey: async (sourceKey: string): Promise<string[]> => {
            const rv = RunViewOf(ctx);
            const result = await rv.RunView<{ ID: string }>(
                {
                    EntityName: ELIGIBLE_VOTERS_ENTITY,
                    ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Eligible' AND SourceKey = ${SqlLiteral(sourceKey)}`,
                    Fields: ['ID'],
                    MaxRows: 3,
                    ResultType: 'simple',
                },
                ctx.ContextUser
            );
            return result.Success ? result.Results.map((r) => r.ID) : [];
        },
        ByEmail: async (email: string): Promise<string[]> => {
            const rv = RunViewOf(ctx);
            const people = await rv.RunView<{ ID: string }>(
                { EntityName: PEOPLE_ENTITY, ExtraFilter: `LOWER(Email) = ${SqlLiteral(email.toLowerCase())}`, Fields: ['ID'], MaxRows: 5, ResultType: 'simple' },
                ctx.ContextUser
            );
            if (!people.Success || people.Results.length === 0) return [];
            const ids = people.Results.map((p) => SqlLiteral(p.ID)).join(', ');
            const voters = await rv.RunView<{ ID: string }>(
                {
                    EntityName: ELIGIBLE_VOTERS_ENTITY,
                    ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Eligible' AND PersonID IN (${ids})`,
                    Fields: ['ID'],
                    MaxRows: 3,
                    ResultType: 'simple',
                },
                ctx.ContextUser
            );
            return voters.Success ? voters.Results.map((v) => v.ID) : [];
        },
    };
}

/** Loads one roll entry as a mutable entity, or null. */
export async function LoadEligibleVoter(eligibleVoterID: string, ctx: VotingContext): Promise<mjBizAppsVotingEligibleVoterEntity | null> {
    const entity = await ctx.Provider.GetEntityObject<mjBizAppsVotingEligibleVoterEntity>(ELIGIBLE_VOTERS_ENTITY, ctx.ContextUser);
    return (await entity.Load(eligibleVoterID)) ? entity : null;
}
