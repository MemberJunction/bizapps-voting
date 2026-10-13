/**
 * BallotStyleBuilder: the ballot a particular voter is shown. Built entirely server-side from configuration; the
 * voter submits the style's hash back with the ballot and the cast engine rebuilds and compares.
 *
 * Pipeline: contests in Sequence order that apply to the voter's class -> Active options in Sequence order ->
 * the election type's driver may adjust -> Hash = ComputeBallotStyleHash(style without Hash).
 */

import { BaseSingleton } from '@memberjunction/global';
import { ElectionTypeDriverRegistry } from '@mj-biz-apps/voting-core-entities-server';
import {
    type BallotStyle,
    type BallotStyleContest,
    type BallotStyleOption,
    ComputeBallotStyleHash,
    ContestAppliesToVoter,
} from '@mj-biz-apps/voting-entities';
import { type ElectionGraph, OptionsOf, TallyCodeOf } from '../shared/election-graph.js';
import { type VotingContext } from '../shared/types.js';

/** Tally methods that take ranked ballots. */
export const RANKED_METHOD_CODES: ReadonlyArray<string> = ['irv', 'stv'];
/** Tally methods where a voter may pick several options. */
const MULTI_CHOICE_METHOD_CODES: ReadonlyArray<string> = ['approval'];

export const DEFAULT_BALLOT_LANGUAGE = 'en';

export function IsRankedMethod(code: string): boolean {
    return RANKED_METHOD_CODES.includes(code);
}

/** Hash of a style, computed over the style without its Hash. */
export function HashOfStyle(style: BallotStyle): string {
    const { Hash: _omit, ...rest } = style;
    void _omit;
    return ComputeBallotStyleHash(rest);
}

/** The structural style, before any driver adjustment or hashing. Pure. */
export function BuildBaseStyle(graph: ElectionGraph, voterClass: string | null, language: string): BallotStyle {
    const election = graph.Election;
    const secret = election.SecrecyMode === 'Secret';
    const contests: BallotStyleContest[] = [];
    for (const contest of graph.Contests) {
        if (!ContestAppliesToVoter(contest.VotingClassFilter, voterClass)) continue;
        const options = OptionsOf(graph, contest.ID)
            .filter((o) => o.Status === 'Active')
            .slice()
            .sort((a, b) => a.Sequence - b.Sequence);
        const code = TallyCodeOf(graph, contest.ID);
        const ranked = IsRankedMethod(code);
        const defaultMax = ranked || MULTI_CHOICE_METHOD_CODES.includes(code) ? options.length : Math.max(1, contest.Seats);
        const styleOptions: BallotStyleOption[] = options.map((o) => {
            const so: BallotStyleOption = { OptionID: o.ID, Label: o.Label, IsWriteIn: o.IsWriteIn };
            if (o.Description) so.Description = o.Description;
            return so;
        });
        const styleContest: BallotStyleContest = {
            ContestID: contest.ID,
            Name: contest.Name,
            Kind: contest.Kind,
            Seats: contest.Seats,
            IsRanked: ranked,
            AllowAbstain: contest.AllowAbstain,
            AllowWriteIn: contest.AllowWriteIn,
            MinSelections: contest.MinSelections,
            MaxSelections: contest.MaxSelections ?? defaultMax,
            Options: styleOptions,
        };
        if (contest.Description) styleContest.Description = contest.Description;
        // Standards ballots: the second option is Disapprove, which must be justified.
        if (contest.Kind === 'StandardsItem' && options.length >= 2) styleContest.RequireCommentOnOptionIDs = [options[1].ID];
        contests.push(styleContest);
    }
    const style: BallotStyle = {
        ElectionID: election.ID,
        ElectionName: election.Name,
        SecrecyMode: election.SecrecyMode,
        AllowRevote: election.AllowRevote && !secret,
        Language: language,
        Contests: contests,
        Hash: '',
    };
    if (election.Description) style.Description = election.Description;
    if (election.ClosesAt) style.ClosesAt = election.ClosesAt.toISOString();
    return style;
}

export class BallotStyleBuilder extends BaseSingleton<BallotStyleBuilder> {
    protected constructor() {
        super();
    }

    public static get Instance(): BallotStyleBuilder {
        return super.getInstance<BallotStyleBuilder>();
    }

    /** The finished, hashed style for one voter. */
    public async Build(graph: ElectionGraph, voterClass: string | null, language: string, ctx: VotingContext): Promise<BallotStyle> {
        const base = BuildBaseStyle(graph, voterClass, language || DEFAULT_BALLOT_LANGUAGE);
        const { driver, error } = ElectionTypeDriverRegistry.Instance.GetDriver(graph.ElectionType);
        if (!driver) throw new Error(error ?? 'The election type driver is not available.');
        const adjusted = await driver.BuildBallotStyle({
            ContextUser: ctx.ContextUser,
            Provider: ctx.Provider,
            Election: graph.Election,
            ElectionType: graph.ElectionType,
            Configuration: graph.Configuration,
            Style: base,
        });
        return { ...adjusted, Hash: HashOfStyle(adjusted) };
    }
}
