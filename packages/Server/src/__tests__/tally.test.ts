import { describe, expect, it } from 'vitest';
import { GetTallyMethod } from '@mj-biz-apps/voting-entities/contracts';
import {
    type ContestPlan,
    type DecryptedBallot,
    BallotWeight,
    BuildContestInput,
    BuildContestResultRow,
    BuildTieBreakNotes,
    ComputeClassWeights,
    ContestNotesOf,
    CryptoShuffle,
    EligibleCountForContest,
    EligibleWeightForContest,
    EvaluateQuorum,
    GenerateTieBreakSeed,
    ParseSubmission,
    SelectionRowsForBallot,
} from '../engines/tally-pipeline.js';

const plan = (over: Partial<ContestPlan> = {}): ContestPlan => ({
    ContestID: 'C1',
    Kind: 'Office',
    Seats: 1,
    OptionIDs: ['A', 'B', 'C'],
    Threshold: 'None',
    CustomThreshold: null,
    ThresholdBasis: 'VotesCast',
    VotingClassFilter: null,
    TallyMethodCode: 'plurality',
    TieBreakMethod: 'Lot',
    ...over,
});

const ballot = (optionID: string | null, weightClass: string | null = '1', votingClass: string | null = null): DecryptedBallot => ({
    WeightClass: weightClass,
    VotingClass: votingClass,
    Submission: { Contests: [{ ContestID: 'C1', Abstain: optionID === null, Selections: optionID ? [{ OptionID: optionID }] : [] }] },
});

describe('CryptoShuffle', () => {
    it('is a permutation and leaves the input alone', () => {
        const input = Array.from({ length: 50 }, (_, i) => i);
        const out = CryptoShuffle(input);
        expect(out).toHaveLength(50);
        expect([...out].sort((a, b) => a - b)).toEqual(input);
        expect(input[0]).toBe(0);
    });

    it('uses the injected random source (Fisher-Yates)', () => {
        const out = CryptoShuffle([1, 2, 3, 4], () => 0);
        expect(out).toEqual([2, 3, 4, 1]);
    });

    it('actually reorders', () => {
        const input = Array.from({ length: 30 }, (_, i) => i);
        expect(CryptoShuffle(input)).not.toEqual(input);
    });
});

describe('seed', () => {
    it('is 32 hex chars and fresh each time', () => {
        const a = GenerateTieBreakSeed();
        expect(a).toMatch(/^[0-9a-f]{32}$/);
        expect(GenerateTieBreakSeed()).not.toBe(a);
    });
});

describe('weights and eligibility', () => {
    const roll = [
        { VotingClass: 'Member', Weight: 1 },
        { VotingClass: 'Member', Weight: 1 },
        { VotingClass: 'Org', Weight: 3 },
        { VotingClass: 'Org', Weight: 5 },
    ];
    it('computes representative weight per class', () => {
        const w = ComputeClassWeights(roll);
        expect(w['1']).toBe(1);
        expect(w['2-5']).toBe(4);
    });
    it('falls back to 1 for unknown classes', () => {
        expect(BallotWeight('2-5', { '2-5': 4 })).toBe(4);
        expect(BallotWeight('10-100', { '2-5': 4 })).toBe(1);
        expect(BallotWeight(null, {})).toBe(1);
    });
    it('sums eligible weight by the contest class filter', () => {
        expect(EligibleWeightForContest(roll, null)).toBe(10);
        expect(EligibleWeightForContest(roll, 'org')).toBe(8);
        expect(EligibleCountForContest(roll, 'Member')).toBe(2);
    });
});

describe('building contest input', () => {
    it('weights ballots by class and drops unknown options', () => {
        const input = BuildContestInput(plan(), [ballot('A', '2-5'), ballot('Z'), ballot(null)], { '2-5': 4, '1': 1 }, 10, 'seed');
        expect(input.Ballots).toHaveLength(3);
        expect(input.Ballots[0]).toEqual({ Weight: 4, Abstain: false, Selections: [{ OptionID: 'A' }] });
        expect(input.Ballots[1].Selections).toEqual([]);
        expect(input.Ballots[2].Abstain).toBe(true);
        expect(input.TieBreakSeed).toBe('seed');
        expect(input.EligibleWeight).toBe(10);
    });

    it('skips ballots whose class the contest does not apply to', () => {
        const input = BuildContestInput(plan({ VotingClassFilter: 'Org' }), [ballot('A', '1', 'Member'), ballot('B', '1', 'Org')], {}, 1, 's');
        expect(input.Ballots).toHaveLength(1);
        expect(input.Ballots[0].Selections[0].OptionID).toBe('B');
    });

    it('carries a custom threshold', () => {
        expect(BuildContestInput(plan({ CustomThreshold: 0.6, Threshold: 'Custom' }), [], {}, 0, 's').CustomThreshold).toBe(0.6);
    });
});

describe('end to end with the contracts tally', () => {
    it('produces result rows from decrypted ballots', () => {
        const p = plan();
        const ballots = [ballot('A'), ballot('A'), ballot('B'), ballot(null)];
        const input = BuildContestInput(p, ballots, {}, 10, 'seed-1');
        const method = GetTallyMethod('plurality');
        expect(method).not.toBeNull();
        const outcome = method!.Tally(input);
        const row = BuildContestResultRow(p, outcome, input, 10, true);
        expect(row.Outcome).toBe(outcome.Outcome);
        expect(row.BallotsCounted).toBe(4);
        expect(row.Abstentions).toBe(1);
        expect(row.VotesCast).toBe(3);
        expect(row.TieBreakSeed).toBe('seed-1');
        const a = row.Options.find((o) => o.OptionID === 'A');
        expect(a?.Votes).toBe(2);
        expect(a?.Outcome).toBe('Elected');
    });

    it('NoQuorum overrides the outcome and collapses option outcomes', () => {
        const p = plan();
        const input = BuildContestInput(p, [ballot('A')], {}, 10, 's');
        const outcome = GetTallyMethod('plurality')!.Tally(input);
        const row = BuildContestResultRow(p, outcome, input, 10, false);
        expect(row.Outcome).toBe('NoQuorum');
        expect(row.Options.every((o) => o.Outcome === 'Counted')).toBe(true);
        expect(row.TieBreakNotes).toContain('Quorum');
    });

    it('is deterministic for a fixed seed regardless of ballot order', () => {
        const p = plan();
        const set = [ballot('A'), ballot('B'), ballot('A'), ballot('B')];
        const run = (b: DecryptedBallot[]) => GetTallyMethod('plurality')!.Tally(BuildContestInput(p, b, {}, 4, 'fixed'));
        expect(run(set)).toEqual(run([...set].reverse()));
    });
});

describe('quorum', () => {
    it('is met when none is configured', () => {
        expect(EvaluateQuorum(undefined, 0, 10)).toEqual({ Required: false, Met: true });
    });
    it('counts ballots', () => {
        expect(EvaluateQuorum({ Kind: 'Count', Value: 5 }, 4, 100).Met).toBe(false);
        expect(EvaluateQuorum({ Kind: 'Count', Value: 5 }, 5, 100).Met).toBe(true);
    });
    it('uses a percent of the roll', () => {
        expect(EvaluateQuorum({ Kind: 'Percent', Value: 50 }, 49, 100).Met).toBe(false);
        expect(EvaluateQuorum({ Kind: 'Percent', Value: 50 }, 50, 100).Met).toBe(true);
        expect(EvaluateQuorum({ Kind: 'Percent', Value: 50 }, 1, 0).Met).toBe(false);
    });
});

describe('submission parsing and selection rows', () => {
    it('parses valid JSON and rejects junk', () => {
        expect(ParseSubmission(JSON.stringify({ Contests: [] }))).toEqual({ Contests: [] });
        expect(ParseSubmission('nope')).toBeNull();
        expect(ParseSubmission('{"Contests":[{"x":1}]}')).toBeNull();
    });

    it('builds rows that satisfy the one-choice rule', () => {
        const rows = SelectionRowsForBallot(
            {
                Contests: [
                    { ContestID: 'c1', Abstain: true, Selections: [] },
                    { ContestID: 'c2', Selections: [{ OptionID: 'o1', Rank: 1 }, { OptionID: 'o2', Rank: 0, WriteInText: '  ' }] },
                    { ContestID: 'other', Selections: [{ OptionID: 'x' }] },
                ],
            },
            new Set(['c1', 'c2'])
        );
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({ IsAbstain: true, ContestOptionID: null, WriteInText: null });
        expect(rows[1]).toMatchObject({ IsAbstain: false, ContestOptionID: 'o1', Rank: 1 });
        expect(rows[2]).toMatchObject({ Rank: null, WriteInText: null });
    });
});

describe('ContestNotesOf (the notes Tally and GetResults both report)', () => {
    it('carries the quorum note of a NoQuorum result exactly once', () => {
        const stored = BuildTieBreakNotes({ Outcome: 'Passed', VotesCast: 5, Abstentions: 0, Options: [], Rounds: [], TieBroken: false, Notes: [] }, plan(), false);
        const notes = ContestNotesOf({ Outcome: 'NoQuorum', TieBreakNotes: stored });
        expect(notes.filter((n) => /quorum/i.test(n))).toHaveLength(1);
    });
    it('adds a quorum note to a NoQuorum result stored without one', () => {
        expect(ContestNotesOf({ Outcome: 'NoQuorum', TieBreakNotes: null })).toEqual(['Quorum was not met.']);
    });
    it('passes the stored notes through otherwise', () => {
        expect(ContestNotesOf({ Outcome: 'Decided', TieBreakNotes: 'Tie broken by lot' })).toEqual(['Tie broken by lot']);
        expect(ContestNotesOf({ Outcome: 'Passed', TieBreakNotes: null })).toEqual([]);
    });
});
