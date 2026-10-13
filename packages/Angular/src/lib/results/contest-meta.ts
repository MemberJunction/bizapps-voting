/**
 * Loads the contest definitions an election's results need alongside the outcomes: names, kinds,
 * thresholds, the tally method and option labels. Keys are lower-cased IDs.
 */
import { IMetadataProvider, RunView } from '@memberjunction/core';
import type { VotingThresholdBasis, VotingThresholdKind } from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import type { ContestResultMeta } from './contest-outcome.component';

export type ContestMetaWithSequence = ContestResultMeta & { Sequence: number };

interface ContestRow {
    ID: string;
    Name: string;
    Kind: string;
    Seats: number;
    Sequence: number;
    TallyMethodID: string;
    Threshold: VotingThresholdKind;
    CustomThreshold: number | null;
    ThresholdBasis: VotingThresholdBasis;
}

interface OptionRow {
    ID: string;
    ContestID: string;
    Label: string;
}

export async function LoadContestMeta(provider: IMetadataProvider, electionId: string): Promise<Map<string, ContestMetaWithSequence>> {
    const rv = RunView.FromMetadataProvider(provider);
    const contestRes = await rv.RunView<ContestRow>({
        EntityName: 'MJ_BizApps_Voting: Contests',
        ExtraFilter: `ElectionID='${electionId}'`,
        OrderBy: 'Sequence',
        ResultType: 'simple',
        Fields: ['ID', 'Name', 'Kind', 'Seats', 'Sequence', 'TallyMethodID', 'Threshold', 'CustomThreshold', 'ThresholdBasis'],
    });
    if (!contestRes.Success) {
        throw new Error(contestRes.ErrorMessage || 'Contest definitions could not be loaded.');
    }
    const contests = contestRes.Results;
    const optionsByContest = new Map<string, Record<string, string>>();
    if (contests.length > 0) {
        const idList = contests.map((c) => `'${c.ID}'`).join(',');
        const optRes = await rv.RunView<OptionRow>({
            EntityName: 'MJ_BizApps_Voting: Contest Options',
            ExtraFilter: `ContestID IN (${idList})`,
            ResultType: 'simple',
            Fields: ['ID', 'ContestID', 'Label'],
        });
        if (!optRes.Success) {
            throw new Error(optRes.ErrorMessage || 'Contest options could not be loaded.');
        }
        for (const o of optRes.Results) {
            const key = o.ContestID.toLowerCase();
            const labels = optionsByContest.get(key) ?? {};
            labels[o.ID.toLowerCase()] = o.Label;
            optionsByContest.set(key, labels);
        }
    }
    await VotingEngineBase.Instance.Config(false, undefined, provider);
    const engine = VotingEngineBase.Instance;
    const out = new Map<string, ContestMetaWithSequence>();
    for (const c of contests) {
        const method = engine.GetTallyMethodByID(c.TallyMethodID);
        out.set(c.ID.toLowerCase(), {
            ContestID: c.ID,
            Name: c.Name,
            Kind: c.Kind,
            Seats: c.Seats,
            Threshold: c.Threshold,
            CustomThreshold: c.CustomThreshold,
            ThresholdBasis: c.ThresholdBasis,
            TallyMethodName: method?.Name ?? 'Tally',
            IsRanked: method?.IsRanked ?? false,
            OptionLabels: optionsByContest.get(c.ID.toLowerCase()) ?? {},
            Sequence: c.Sequence,
        });
    }
    return out;
}

/** Placeholder meta for an outcome whose contest definition was not found. */
export function FallbackContestMeta(contestId: string): ContestMetaWithSequence {
    return {
        ContestID: contestId,
        Name: 'Contest',
        Kind: 'Contest',
        Seats: 1,
        Threshold: 'None',
        CustomThreshold: null,
        ThresholdBasis: 'VotesCast',
        TallyMethodName: '',
        IsRanked: false,
        OptionLabels: {},
        Sequence: Number.MAX_SAFE_INTEGER,
    };
}
