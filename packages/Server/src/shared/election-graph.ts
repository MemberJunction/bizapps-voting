/**
 * Loads an election with everything the engines reason about: type, contests, options, tally method codes and the
 * resolved configuration. Configuration-only data; no ballot-box rows.
 */

import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { BuildConfigurationToValidate, ParseConfiguration } from '@mj-biz-apps/voting-core-entities-server';
import {
    type IElectionConfiguration,
    type ResolvedElectionConfiguration,
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingContestOptionEntity,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingElectionTypeEntity,
} from '@mj-biz-apps/voting-entities';
import { type EngineResult, type VotingContext, Fail, Ok, RunViewOf } from './types.js';
import { SqlLiteral } from './voter-identity.js';

/**
 * NOTE: the three maps below are keyed by the LOWER-CASED contest id. Use the helpers (OptionsOf, TallyCodeOf,
 * VotingClassFilterOf) rather than indexing directly.
 */
export interface ElectionGraph {
    Election: mjBizAppsVotingElectionEntity;
    ElectionType: mjBizAppsVotingElectionTypeEntity;
    Contests: mjBizAppsVotingContestEntity[];
    OptionsByContestID: Map<string, mjBizAppsVotingContestOptionEntity[]>;
    TallyMethodCodeByContestID: Map<string, string>;
    Configuration: ResolvedElectionConfiguration;
    ContestVotingClassFilters: Record<string, string | null>;
}

const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const CONTESTS = 'MJ_BizApps_Voting: Contests';
const OPTIONS = 'MJ_BizApps_Voting: Contest Options';

export async function LoadElectionGraph(electionID: string, ctx: VotingContext): Promise<EngineResult<ElectionGraph>> {
    await VotingEngineBase.Instance.Config(false, ctx.ContextUser, ctx.Provider);
    const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS, ctx.ContextUser);
    if (!(await election.Load(electionID))) return Fail('ElectionNotFound', 'The election was not found.');

    const type = VotingEngineBase.Instance.GetElectionTypeByID(election.ElectionTypeID);
    if (!type) return Fail('ElectionTypeNotFound', 'The election type was not found.');

    const parsed = ParseConfiguration<IElectionConfiguration>(election.Configuration, 'The election configuration');
    if (parsed.Error) return Fail('InvalidConfiguration', parsed.Error);
    const configuration = BuildConfigurationToValidate(
        VotingEngineBase.Instance.GetElectionTypeConfiguration(type.ID) ?? undefined,
        parsed.Value,
        {
            SecrecyMode: election.SecrecyMode,
            AssuranceTier: election.AssuranceTier,
            ResultsTiming: election.ResultsTiming,
            ResultsAudience: election.ResultsAudience,
            ResultsMinCast: election.ResultsMinCast,
            AllowRevote: election.AllowRevote,
            WeightClassMinSize: election.WeightClassMinSize,
        }
    );

    const rv = RunViewOf(ctx);
    const contestsRes = await rv.RunView<mjBizAppsVotingContestEntity>(
        { EntityName: CONTESTS, ExtraFilter: `ElectionID = ${SqlLiteral(election.ID)}`, OrderBy: 'Sequence', ResultType: 'entity_object' },
        ctx.ContextUser
    );
    if (!contestsRes.Success) return Fail('LoadFailed', 'The election contests could not be loaded.');
    const contestIDs = contestsRes.Results.map((c) => SqlLiteral(c.ID));
    const optionsRes = contestIDs.length
        ? await rv.RunView<mjBizAppsVotingContestOptionEntity>(
              { EntityName: OPTIONS, ExtraFilter: `ContestID IN (${contestIDs.join(',')})`, OrderBy: 'Sequence', ResultType: 'entity_object' },
              ctx.ContextUser
          )
        : { Success: true, Results: [] as mjBizAppsVotingContestOptionEntity[] };
    if (!optionsRes.Success) return Fail('LoadFailed', 'The election options could not be loaded.');

    const contests = contestsRes.Results;
    const options = optionsRes.Results;
    const optionsByContest = new Map<string, mjBizAppsVotingContestOptionEntity[]>();
    const tallyCodes = new Map<string, string>();
    const filters: Record<string, string | null> = {};
    for (const contest of contests) {
        optionsByContest.set(contest.ID.toLowerCase(), []);
        const method = VotingEngineBase.Instance.GetTallyMethodByID(contest.TallyMethodID);
        tallyCodes.set(contest.ID.toLowerCase(), method?.Code ?? '');
        filters[contest.ID.toLowerCase()] = contest.VotingClassFilter;
    }
    for (const option of options) optionsByContest.get(option.ContestID.toLowerCase())?.push(option);

    return Ok({
        Election: election,
        ElectionType: type,
        Contests: contests,
        OptionsByContestID: optionsByContest,
        TallyMethodCodeByContestID: tallyCodes,
        Configuration: configuration,
        ContestVotingClassFilters: filters,
    });
}

/** Active and withdrawn options of a contest, in Sequence order. */
export function OptionsOf(graph: ElectionGraph, contestID: string): mjBizAppsVotingContestOptionEntity[] {
    return graph.OptionsByContestID.get(contestID.toLowerCase()) ?? [];
}

/** The tally method code of a contest ('' when unknown). */
export function TallyCodeOf(graph: ElectionGraph, contestID: string): string {
    return graph.TallyMethodCodeByContestID.get(contestID.toLowerCase()) ?? '';
}

/** The contest's voting-class filter (null = all voters). */
export function VotingClassFilterOf(graph: ElectionGraph, contestID: string): string | null {
    return graph.ContestVotingClassFilters[contestID.toLowerCase()] ?? null;
}
