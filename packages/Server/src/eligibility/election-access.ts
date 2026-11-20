/**
 * Small election-loading helpers shared by the roll and credential engines.
 */

import { type mjBizAppsVotingElectionEntity } from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { ElectionTypeDriverRegistry, type BaseElectionTypeServerDriver } from '@mj-biz-apps/voting-core-entities-server';

/** The hook context every type-driver hook extends (derived from the driver's own signature). */
export type DriverBaseContext = Omit<Parameters<BaseElectionTypeServerDriver['ValidateRollChange']>[0], 'Action' | 'oldValues'>;
/** The roll hook context. */
export type RollChangeContext = Parameters<BaseElectionTypeServerDriver['ValidateRollChange']>[0];
import { type EngineResult, Fail, Ok, type VotingContext } from '../shared/index.js';

export const ELECTIONS_ENTITY = 'MJ_BizApps_Voting: Elections';

/** Loads an election as a mutable entity. */
export async function LoadElectionEntity(electionID: string, ctx: VotingContext): Promise<EngineResult<mjBizAppsVotingElectionEntity>> {
    const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS_ENTITY, ctx.ContextUser);
    if (!(await election.Load(electionID))) return Fail('ElectionNotFound', 'The election was not found.');
    return Ok(election);
}

/** The type driver and a ready-made base context for its hooks. */
export interface DriverBinding {
    Driver: BaseElectionTypeServerDriver;
    Base: DriverBaseContext;
}

/** Resolves the election type's server driver (refusing, with the registry's message, when the named class is not registered). */
export async function BindTypeDriver(election: mjBizAppsVotingElectionEntity, ctx: VotingContext): Promise<EngineResult<DriverBinding>> {
    const engine = VotingEngineBase.Instance;
    await engine.Config(false, ctx.ContextUser, ctx.Provider);
    const type = engine.GetElectionTypeByID(election.ElectionTypeID);
    if (!type) return Fail('ElectionTypeNotFound', 'The election type was not found.');
    const resolved = ElectionTypeDriverRegistry.Instance.GetDriver(type);
    if (!resolved.driver) return Fail('DriverNotRegistered', resolved.error ?? 'The election type driver is not registered.');
    return Ok({
        Driver: resolved.driver,
        Base: {
            ContextUser: ctx.ContextUser,
            Provider: ctx.Provider,
            Election: election,
            ElectionType: type,
            Configuration: engine.GetElectionTypeConfiguration(type.ID) ?? {},
        },
    });
}
