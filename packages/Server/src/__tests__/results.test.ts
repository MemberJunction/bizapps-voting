import { describe, expect, it } from 'vitest';
import {
    BuildSnapshotPayload,
    ComputeTurnout,
    CountByWeightClass,
    DescribeResultsTimingDisclosure,
    EvaluateClassSuppression,
    ParseSnapshotPayload,
    ShouldPublishSnapshot,
    SnapshotToContestOutcomes,
} from '../engines/results-policy.js';

const T0 = new Date('2026-01-01T12:00:00Z');
const minutesLater = (m: number) => new Date(T0.getTime() + m * 60000);

describe('snapshot batching', () => {
    const base = { MinCast: 5, EveryBallots: 10, MinMinutes: 15 };

    it('waits for the minimum cast', () => {
        expect(ShouldPublishSnapshot({ ...base, BallotCount: 4, Last: null, Now: T0 }).Publish).toBe(false);
        expect(ShouldPublishSnapshot({ ...base, BallotCount: 5, Last: null, Now: T0 }).Publish).toBe(true);
    });

    it('needs both enough new ballots and enough time', () => {
        const last = { BallotCount: 20, SnapshotAt: T0 };
        expect(ShouldPublishSnapshot({ ...base, BallotCount: 29, Last: last, Now: minutesLater(60) }).Publish).toBe(false);
        expect(ShouldPublishSnapshot({ ...base, BallotCount: 30, Last: last, Now: minutesLater(14) }).Publish).toBe(false);
        expect(ShouldPublishSnapshot({ ...base, BallotCount: 30, Last: last, Now: minutesLater(15) }).Publish).toBe(true);
    });

    it('uses safe defaults, never per ballot', () => {
        const last = { BallotCount: 20, SnapshotAt: T0 };
        const d = (n: number, m: number) => ShouldPublishSnapshot({ MinCast: 5, EveryBallots: null, MinMinutes: null, BallotCount: n, Last: last, Now: minutesLater(m) }).Publish;
        expect(d(21, 60)).toBe(false);
        expect(d(25, 4)).toBe(false);
        expect(d(25, 5)).toBe(true);
    });
});

describe('weight-class suppression', () => {
    it('counts by class with null as 1', () => {
        expect(CountByWeightClass(['1', null, '2-5'])).toEqual([
            { WeightClass: '1', Count: 2 },
            { WeightClass: '2-5', Count: 1 },
        ]);
    });
    it('withholds totals when a class among several is too small', () => {
        const r = EvaluateClassSuppression([{ WeightClass: '1', Count: 40 }, { WeightClass: '100+', Count: 2 }], 5);
        expect(r.Allowed).toBe(false);
        expect(r.SuppressedClasses).toEqual(['100+']);
    });
    it('allows a single class (ResultsMinCast guards it) and well-populated classes', () => {
        expect(EvaluateClassSuppression([{ WeightClass: '1', Count: 3 }], 5).Allowed).toBe(true);
        expect(EvaluateClassSuppression([{ WeightClass: '1', Count: 8 }, { WeightClass: '2-5', Count: 5 }], 5).Allowed).toBe(true);
    });
});

describe('snapshot payload', () => {
    const plans = [
        { ContestID: 'C1', IsRanked: false, OptionIDs: ['A', 'B'] },
        { ContestID: 'C2', IsRanked: true, OptionIDs: ['X', 'Y'] },
    ];
    const rows = [
        { ContestID: 'c1', ContestOptionID: 'a', VoteCount: 3 },
        { ContestID: 'C1', ContestOptionID: 'B', VoteCount: 5 },
        { ContestID: 'C1', ContestOptionID: null, VoteCount: 2 },
        { ContestID: 'C2', ContestOptionID: 'X', VoteCount: 1 },
    ];

    it('assembles totals, abstentions and zero-fills options', () => {
        const p = BuildSnapshotPayload(plans, rows, [{ WeightClass: '1', Count: 10 }]);
        expect(p.Contests[0]).toMatchObject({ VotesCast: 8, Abstentions: 2, IsFirstPreferencesOnly: false });
        expect(p.Contests[1].Options).toEqual([{ OptionID: 'X', Votes: 1 }, { OptionID: 'Y', Votes: 0 }]);
        expect(p.Contests[1].IsFirstPreferencesOnly).toBe(true);
    });

    it('round-trips and shapes output with positions and notes', () => {
        const p = ParseSnapshotPayload(JSON.stringify(BuildSnapshotPayload(plans, rows, [])));
        expect(p).not.toBeNull();
        const out = SnapshotToContestOutcomes(p!);
        expect(out[0].Options.map((o) => [o.OptionID, o.Position])).toEqual([['B', 1], ['A', 2]]);
        expect(out[1].Notes?.some((n) => n.includes('First preferences'))).toBe(true);
        expect(out[0].Outcome).toBe('Running');
    });

    it('ties share a position; junk is rejected', () => {
        const p = BuildSnapshotPayload([{ ContestID: 'C', IsRanked: false, OptionIDs: ['A', 'B', 'C'] }], [
            { ContestID: 'C', ContestOptionID: 'A', VoteCount: 2 },
            { ContestID: 'C', ContestOptionID: 'B', VoteCount: 2 },
        ], []);
        expect(SnapshotToContestOutcomes(p)[0].Options.map((o) => o.Position)).toEqual([1, 1, 3]);
        expect(ParseSnapshotPayload('{"Version":2}')).toBeNull();
        expect(ParseSnapshotPayload('x')).toBeNull();
    });
});

describe('turnout', () => {
    const rows = [
        { Channel: 'Online', VoterCredentialMethodID: 'm1' },
        { Channel: 'Online', VoterCredentialMethodID: 'm1' },
        { Channel: 'Paper', VoterCredentialMethodID: null },
    ];
    const code = (id: string) => (id === 'm1' ? 'emailed-link' : null);

    it('counts by channel and method from the poll book', () => {
        const t = ComputeTurnout(10, rows, code, undefined);
        expect(t).toMatchObject({ Eligible: 10, Voted: 3, TurnoutPercent: 30, ByChannel: { Online: 2, Paper: 1 }, ByMethod: { 'emailed-link': 2, none: 1 } });
        expect(t.QuorumMet).toBeUndefined();
    });

    it('reports the quorum flag only when configured', () => {
        expect(ComputeTurnout(10, rows, code, { Kind: 'Count', Value: 3 }).QuorumMet).toBe(true);
        expect(ComputeTurnout(10, rows, code, { Kind: 'Percent', Value: 40 }).QuorumMet).toBe(false);
    });

    it('handles an empty roll', () => {
        expect(ComputeTurnout(0, [], code, undefined).TurnoutPercent).toBe(0);
    });
});

describe('disclosure', () => {
    it('states the timing that applied', () => {
        const live = DescribeResultsTimingDisclosure({ Timing: 'Live', Audience: 'Voters', MinCast: 5, SecrecyMode: 'Secret', AssuranceTier: 'Standard', SnapshotCount: 4 });
        expect(live).toContain('Live');
        expect(live).toContain('4 published');
        const after = DescribeResultsTimingDisclosure({ Timing: 'AfterClose', Audience: 'Voters', MinCast: 5, SecrecyMode: 'Secret', AssuranceTier: 'Standard', SnapshotCount: 0 });
        expect(after).toContain('only turnout');
        expect(after).not.toContain('snapshots');
    });
});
