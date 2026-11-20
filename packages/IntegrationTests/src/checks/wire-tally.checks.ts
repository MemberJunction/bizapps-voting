/**
 * wire-tally: elections voted over the wire whose outcomes were WORKED BY HAND (the arithmetic is in the comments next to
 * each fixture; nothing here calls the tally contracts). Each check builds its own election as the admin persona, casts
 * through persona API keys (member1..4, trustee1..3) and guest edge sessions (world people), closes, tallies as the admin,
 * and compares the labelled result with the hand-worked numbers.
 *
 *   WT1   plurality, one seat (4/2/1), result of record equals what GetResults returns
 *   WT2   plurality, two seats
 *   WT3   plurality tie at the seat boundary: broken by lot from the seed, deterministic, both outcomes reachable
 *   WT4   plurality tie BELOW the seat boundary is not a tie-break
 *   WT5   majority motions: thresholds Majority / TwoThirds / ThreeFifths / ThreeQuarters / Unanimous / Custom / None, both bases
 *   WT6   quorum: Count and Percent rules, met and not met (NoQuorum), turnout reports QuorumMet
 *   WT7   approval voting, two seats
 *   WT8   instant runoff, three rounds (two eliminations then a majority)
 *   WT9   instant runoff with ballot exhaustion
 *   WT10  Scottish STV, two seats, one surplus transfer and two exclusions
 *   WT11  Scottish STV, three seats, two surpluses with fixed-point truncation
 *   WT12  weighted roll: a heavy voter swings a motion that a headcount would lose
 *   WT13  weight classes count at the CLASS MEAN weight, not the individual weight
 *   WT14  results audiences: who sees the final result of each audience (admin, inspector, voter, non-voting eligible, guest, outsiders)
 *   WT15  results timing: AfterVoting, AdministratorsOnly and Live explain themselves while voting is open
 *   WT16  Scottish STV ties: a lot that cannot change who is elected is noted but not flagged; a decisive one is flagged
 */
import { Assert, AssertEqual, IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration/registry';
import type { VotingContestSpec, VotingCreateElectionInput } from '@mj-biz-apps/voting-entities';
import { LoadVotingWorld } from '../world/voting-world.js';
import {
    AssertClose,
    Canon,
    AssertOutcomeSet,
    AssertVotes,
    CastAll,
    CreateLiveElection,
    MotionSpec,
    Ok,
    PersonaVoter,
    Tagged,
    Times,
    WorldGuest,
    type BallotPlan,
    type ContestPick,
    type LabelledContest,
    type LiveElection,
    type WireVoterSpec,
} from '../wire/wire-kit.js';
import type { PersonaKey } from '../wire/persona-model.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-tally';
const API_VOTERS: PersonaKey[] = ['member1', 'member2', 'member3', 'member4', 'trustee1', 'trustee2', 'trustee3'];

let cast: WireCast | undefined;
let admin: WireClient | undefined;
const made: LiveElection[] = [];

const C = (): WireCast => {
    if (!cast) throw new Error('wire-tally setup did not run');
    return cast;
};
const A = (): WireClient => {
    if (!admin) throw new Error('wire-tally setup did not run');
    return admin;
};

/** `n` voters: the persona voters first (API keys), then world guests numbered from `firstWorld`. */
function Roster(n: number, firstWorld = 1, weights: number[] = []): WireVoterSpec[] {
    return Array.from({ length: n }, (_, i) => {
        const extra = weights[i] !== undefined ? { Weight: weights[i], VotingClass: 'W' + weights[i] } : {};
        return i < API_VOTERS.length ? PersonaVoter(C(), API_VOTERS[i], i, extra) : WorldGuest(firstWorld + (i - API_VOTERS.length), extra);
    });
}

async function Fixture(name: string, typeCode: string, contests: VotingContestSpec[], voters: WireVoterSpec[], extra: Partial<VotingCreateElectionInput> = {}): Promise<LiveElection> {
    const e = await CreateLiveElection(C(), A(), { TypeCode: typeCode, Name: Tagged(name), Voters: voters, Contests: contests, Extra: { SecrecyMode: 'Secret', ...extra } });
    made.push(e);
    return e;
}

function Office(name: string, tally: string, seats: number, candidates: string[], extra: Partial<VotingContestSpec> = {}): VotingContestSpec {
    return { Name: name, Kind: 'Office', TallyMethodCode: tally, Seats: seats, AllowAbstain: true, Options: candidates.map((Label) => ({ Label })), ...extra };
}

/** Expands `[count, pick]` pairs into ballots for one contest. */
function Ballots(contest: string, groups: Array<[number, ContestPick]>): BallotPlan[] {
    return groups.flatMap(([n, pick]) => Times(n, { [contest]: pick }));
}

function Contest(results: Map<string, LabelledContest>, name: string): LabelledContest {
    const c = results.get(name);
    if (!c) throw new Error(`no result for contest "${name}"`);
    return c;
}

/** Tallies as the admin (honest: the admin persona must be able to) and labels the result. */
async function Tally(e: LiveElection, seed = 'wire-tally-seed'): Promise<Map<string, LabelledContest>> {
    const labelled = await e.CloseAndTally(seed);
    return new Map(labelled.map((c) => [c.Name, c]));
}

/** The result of record read back through GetResults (as the admin) must equal the tally's own output. */
async function AssertResultsEqualTally(e: LiveElection, tallied: Map<string, LabelledContest>): Promise<void> {
    const res = await e.ResultsFor(A());
    Assert(res.Success && res.Output?.Success === true && res.Output.Visible === true, `admin GetResults after the tally (${res.ErrorMessage ?? res.Output?.Reason})`);
    const read = e.LabelAll(res.Output?.Contests);
    AssertEqual(read.size, tallied.size, 'GetResults returns every tallied contest');
    for (const [name, t] of tallied) {
        const r = Contest(read, name);
        AssertEqual(r.Outcome, t.Outcome, `${name}: outcome in GetResults vs the tally`);
        AssertEqual(r.VotesCast, t.VotesCast, `${name}: votes cast in GetResults vs the tally`);
        AssertEqual(Canon(r.Options), Canon(t.Options), `${name}: option results in GetResults vs the tally`);
    }
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.WT1`,
        Name: 'WT1 - plurality, one seat: A 4, B 2, C 1 => A elected; GetResults equals the tally',
        Fn: async () => {
            // 7 ballots: A x4, B x2, C x1.   A=4 > B=2 > C=1, no tie, seat 1 => A.
            const e = await Fixture('Wire plurality 1', 'board-election', [Office('Seat', 'plurality', 1, ['A', 'B', 'C'])], Roster(7));
            await CastAll(e, Ballots('Seat', [[4, ['A']], [2, ['B']], [1, ['C']]]));
            const t = await Tally(e);
            const seat = Contest(t, 'Seat');
            AssertEqual(seat.Outcome, 'Decided', 'outcome');
            AssertVotes(seat, { A: 4, B: 2, C: 1 });
            AssertEqual(seat.VotesCast, 7, 'votes cast');
            AssertEqual(seat.Abstentions, 0, 'abstentions');
            AssertOutcomeSet(seat, 'Elected', ['A']);
            AssertOutcomeSet(seat, 'Defeated', ['B', 'C']);
            AssertEqual(seat.Order.join(','), 'A,B,C', 'finishing order');
            AssertEqual(seat.TieBroken, false, 'no tie');
            await AssertResultsEqualTally(e, t);
        },
    },
    {
        Id: `${BUNDLE}.WT2`,
        Name: 'WT2 - plurality, two seats: each ballot approves up to two; A 5, B 4, C 3, D 2, E 1 => A and B elected',
        Fn: async () => {
            // 9 ballots, up to 2 picks each:  [A,B] x3, [A,C] x2, [B,C] x1, [D] x2, [E] x1
            //   A = 3+2 = 5   B = 3+1 = 4   C = 2+1 = 3   D = 2   E = 1      (all distinct, seats 2 => A, B)
            const e = await Fixture('Wire plurality 2', 'board-election', [Office('Two seats', 'plurality', 2, ['A', 'B', 'C', 'D', 'E'])], Roster(9));
            await CastAll(e, Ballots('Two seats', [[3, ['A', 'B']], [2, ['A', 'C']], [1, ['B', 'C']], [2, ['D']], [1, ['E']]]));
            const seat = Contest(await Tally(e), 'Two seats');
            AssertVotes(seat, { A: 5, B: 4, C: 3, D: 2, E: 1 });
            AssertOutcomeSet(seat, 'Elected', ['A', 'B']);
            AssertEqual(seat.Order.join(','), 'A,B,C,D,E', 'finishing order');
            AssertEqual(seat.VotesCast, 9, 'ballots counted (a ballot with two picks is one vote cast)');
            AssertEqual(seat.TieBroken, false, 'no tie');
        },
    },
    {
        Id: `${BUNDLE}.WT3`,
        Name: 'WT3 - plurality tie for the only seat: broken by lot from the seed; same seed => same winner; both winners reachable',
        Fn: async () => {
            // 6 ballots: A x3, B x3, C x0.  A and B tie for the single seat.
            const voters = Roster(6);
            const e = await Fixture('Wire tie', 'board-election', [Office('Tied seat', 'plurality', 1, ['A', 'B', 'C'])], voters);
            await CastAll(e, Ballots('Tied seat', [[3, ['A']], [3, ['B']]]));
            const first = Contest(await Tally(e, 'tie-seed-1'), 'Tied seat');
            AssertEqual(first.TieBroken, true, 'a tie at the seat boundary is flagged as broken by lot');
            Assert(first.Notes.some((n) => /lot/i.test(n)), `the notes say the tie was broken by lot (got ${JSON.stringify(first.Notes)})`);
            AssertVotes(first, { A: 3, B: 3, C: 0 });
            const elected = Object.entries(first.Options).filter(([, o]) => o.Outcome === 'Elected').map(([l]) => l);
            AssertEqual(elected.length, 1, 'exactly one candidate is elected');
            Assert(elected[0] === 'A' || elected[0] === 'B', 'the winner is one of the tied candidates');
            AssertEqual(first.Options[elected[0]].Position, 1, 'the winner is first');

            // the same seed gives the same lot (re-tally of the same election)
            const winnerFor = async (seed: string): Promise<string> => {
                const out = Ok('Voting.Tally', await e.TallyAs(A(), seed));
                const c = Contest(e.LabelAll(out.Contests), 'Tied seat');
                return Object.entries(c.Options).filter(([, o]) => o.Outcome === 'Elected').map(([l]) => l)[0];
            };
            AssertEqual(await winnerFor('tie-seed-1'), elected[0], 're-tally with the same seed gives the same winner');
            // different seeds draw different lots: across eight seeds both A and B must win at least once
            const winners = new Set<string>();
            for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) winners.add(await winnerFor(seed));
            AssertEqual([...winners].sort().join(','), 'A,B', 'the lot can go either way (and never to the candidate with no votes)');
        },
    },
    {
        Id: `${BUNDLE}.WT4`,
        Name: 'WT4 - plurality: a tie that does not decide a seat is not a tie-break (A 4, B 2, C 2 for one seat)',
        Fn: async () => {
            // 8 ballots: A x4, B x2, C x2.  B and C tie for second place, but only first place is a seat.
            // The documented rule: "Ties at the seat boundary are broken by lot". The tie below the boundary changes nothing.
            const e = await Fixture('Wire tie below seat', 'board-election', [Office('Seat', 'plurality', 1, ['A', 'B', 'C'])], Roster(8));
            await CastAll(e, Ballots('Seat', [[4, ['A']], [2, ['B']], [2, ['C']]]));
            const seat = Contest(await Tally(e, 'below-seed'), 'Seat');
            AssertOutcomeSet(seat, 'Elected', ['A']);
            AssertEqual(seat.TieBroken, false, 'no lot was needed to decide the seat, so no tie-break is reported');
        },
    },
    {
        Id: `${BUNDLE}.WT5`,
        Name: 'WT5 - majority motions: every threshold kind and basis, including the exact boundaries',
        Fn: async () => {
            // 10 voters (roll weight 10), 11 motion contests. Each row gives (yes, no, abstain) and the hand-worked verdict.
            //  M1  Majority / VotesCast       Y4 N3 A3   votes cast 7;  need > 3.5;  4 > 3.5                      => Passed
            //  M2  TwoThirds / VotesCast      Y6 N3 A1   votes cast 9;  need >= 6.0;  6 >= 6.0 (boundary)         => Passed
            //  M3  TwoThirds / VotesCast      Y5 N4 A1   votes cast 9;  need >= 6.0;  5 < 6                       => Failed
            //  M4  ThreeFifths / Eligible     Y5 N5 A0   eligible 10;   need >= 6;    5 < 6                       => Failed
            //  M5  ThreeFifths / Eligible     Y6 N4 A0   eligible 10;   need >= 6;    6 >= 6 (boundary)           => Passed
            //  M6  Unanimous / VotesCast      Y9 N0 A1   no "No" votes, yes covers every vote cast               => Passed
            //  M7  Unanimous / VotesCast      Y9 N1 A0   one "No"                                                  => Failed
            //  M8  Majority / Eligible        Y5 N0 A5   eligible 10;   need > 5;     5 is not > 5 (strict)       => Failed
            //  M9  Custom 0.55 / VotesCast    Y6 N4 A0   votes cast 10; need >= 5.5;  6 >= 5.5                   => Passed
            //  M10 None / VotesCast           Y4 N4 A2   plain yes > no; a tie fails                              => Failed
            //  M11 ThreeQuarters / VotesCast  Y6 N2 A2   votes cast 8;  need >= 6.0;  6 >= 6.0 (boundary)         => Passed
            type Row = { Name: string; Spec: Partial<VotingContestSpec>; Y: number; N: number; A: number; Verdict: 'Passed' | 'Failed' };
            const rows: Row[] = [
                { Name: 'M1', Spec: { Threshold: 'Majority', ThresholdBasis: 'VotesCast' }, Y: 4, N: 3, A: 3, Verdict: 'Passed' },
                { Name: 'M2', Spec: { Threshold: 'TwoThirds', ThresholdBasis: 'VotesCast' }, Y: 6, N: 3, A: 1, Verdict: 'Passed' },
                { Name: 'M3', Spec: { Threshold: 'TwoThirds', ThresholdBasis: 'VotesCast' }, Y: 5, N: 4, A: 1, Verdict: 'Failed' },
                { Name: 'M4', Spec: { Threshold: 'ThreeFifths', ThresholdBasis: 'Eligible' }, Y: 5, N: 5, A: 0, Verdict: 'Failed' },
                { Name: 'M5', Spec: { Threshold: 'ThreeFifths', ThresholdBasis: 'Eligible' }, Y: 6, N: 4, A: 0, Verdict: 'Passed' },
                { Name: 'M6', Spec: { Threshold: 'Unanimous', ThresholdBasis: 'VotesCast' }, Y: 9, N: 0, A: 1, Verdict: 'Passed' },
                { Name: 'M7', Spec: { Threshold: 'Unanimous', ThresholdBasis: 'VotesCast' }, Y: 9, N: 1, A: 0, Verdict: 'Failed' },
                { Name: 'M8', Spec: { Threshold: 'Majority', ThresholdBasis: 'Eligible' }, Y: 5, N: 0, A: 5, Verdict: 'Failed' },
                { Name: 'M9', Spec: { Threshold: 'Custom', CustomThreshold: 0.55, ThresholdBasis: 'VotesCast' }, Y: 6, N: 4, A: 0, Verdict: 'Passed' },
                { Name: 'M10', Spec: { Threshold: 'None', ThresholdBasis: 'VotesCast' }, Y: 4, N: 4, A: 2, Verdict: 'Failed' },
                { Name: 'M11', Spec: { Threshold: 'ThreeQuarters', ThresholdBasis: 'VotesCast' }, Y: 6, N: 2, A: 2, Verdict: 'Passed' },
            ];
            const contests = rows.map((r) => MotionSpec(r.Name, r.Spec));
            const e = await Fixture('Wire majority matrix', 'motion', contests, Roster(10));
            const ballots: BallotPlan[] = Array.from({ length: 10 }, (_, voter) => {
                const plan: BallotPlan = {};
                for (const r of rows) plan[r.Name] = voter < r.Y ? ['Yes'] : voter < r.Y + r.N ? ['No'] : 'abstain';
                return plan;
            });
            await CastAll(e, ballots);
            const t = await Tally(e);
            for (const r of rows) {
                const c = Contest(t, r.Name);
                AssertEqual(c.Outcome, r.Verdict, `${r.Name} (${JSON.stringify(r.Spec)} Y${r.Y} N${r.N} A${r.A}): verdict`);
                AssertVotes(c, { Yes: r.Y, No: r.N });
                AssertEqual(c.Abstentions, r.A, `${r.Name}: abstentions`);
                AssertEqual(c.VotesCast, r.Y + r.N, `${r.Name}: votes cast excludes abstentions`);
            }
            await AssertResultsEqualTally(e, t);
        },
    },
    {
        Id: `${BUNDLE}.WT6`,
        Name: 'WT6 - quorum: Count 8 and Percent 60 unmet => NoQuorum; Percent 50 met at exactly 5 of 10; turnout reports QuorumMet',
        Fn: async () => {
            // Roll of 10; five voters cast Yes (member1..4, trustee1). Without quorum the motion would pass (5-0).
            const quorumCase = async (label: string, quorum: { Kind: 'Count' | 'Percent'; Value: number }, met: boolean): Promise<void> => {
                const e = await Fixture(`Wire quorum ${label}`, 'motion', [MotionSpec('Quorum motion')], Roster(10), { Configuration: { Quorum: quorum } });
                await CastAll(e, Times(5, { 'Quorum motion': ['Yes'] }));
                const turnout = Ok('turnout', await e.Turnout());
                AssertEqual(turnout.Voted, 5, `${label}: five of ten voted`);
                AssertEqual(turnout.QuorumMet, met, `${label}: turnout reports QuorumMet`);
                const motion = Contest(await Tally(e), 'Quorum motion');
                AssertEqual(motion.Outcome, met ? 'Passed' : 'NoQuorum', `${label}: outcome`);
                AssertVotes(motion, { Yes: 5, No: 0 });
                if (!met) {
                    Assert(motion.Notes.some((n) => /quorum/i.test(n)), `${label}: notes say the quorum was not met (${JSON.stringify(motion.Notes)})`);
                    AssertOutcomeSet(motion, 'Elected', []);
                }
            };
            await quorumCase('count 8', { Kind: 'Count', Value: 8 }, false);
            await quorumCase('count 5', { Kind: 'Count', Value: 5 }, true);
            await quorumCase('percent 60', { Kind: 'Percent', Value: 60 }, false);
            await quorumCase('percent 50', { Kind: 'Percent', Value: 50 }, true);
        },
    },
    {
        Id: `${BUNDLE}.WT7`,
        Name: 'WT7 - approval voting, two seats: A 5, B 4, D 3, C 2 => A and B elected',
        Fn: async () => {
            // 8 ballots of approvals:  {A,B} {A,C} {A} {B} {A,B,C} {D} {A,D} {B,D}
            //   A: 1,2,3,5,7 = 5    B: 1,4,5,8 = 4    D: 6,7,8 = 3    C: 2,5 = 2      seats 2 => A, B
            const e = await Fixture('Wire approval', 'organization-election', [Office('Panel', 'approval', 2, ['A', 'B', 'C', 'D'])], Roster(8));
            await CastAll(e, Ballots('Panel', [[1, ['A', 'B']], [1, ['A', 'C']], [1, ['A']], [1, ['B']], [1, ['A', 'B', 'C']], [1, ['D']], [1, ['A', 'D']], [1, ['B', 'D']]]));
            const c = Contest(await Tally(e), 'Panel');
            AssertVotes(c, { A: 5, B: 4, D: 3, C: 2 });
            AssertOutcomeSet(c, 'Elected', ['A', 'B']);
            AssertEqual(c.Order.join(','), 'A,B,D,C', 'finishing order');
            AssertEqual(c.VotesCast, 8, 'eight ballots');
        },
    },
    {
        Id: `${BUNDLE}.WT8`,
        Name: 'WT8 - instant runoff, 12 ballots, three rounds: C out, B out, A wins 7-5 over D',
        Fn: async () => {
            // 12 ballots (rank order):  4 x A>B>C>D   3 x B>C>A>D   2 x C>D>B>A   1 x D>C>B>A   2 x D>B>C>A
            // Round 1: A4 B3 C2 D3 (12; majority needs > 6)  => no winner, C (2) out. C's two ballots go to D.
            // Round 2: A4 B3 D5                              => no winner, B (3) out. B's three ballots (B>C>A, C gone) go to A.
            // Round 3: A7 D5                                 => A holds 7 > 6.   A elected.
            const e = await Fixture('Wire IRV', 'board-election', [Office('Chair', 'irv', 1, ['A', 'B', 'C', 'D'])], Roster(12));
            await CastAll(
                e,
                Ballots('Chair', [
                    [4, ['A', 'B', 'C', 'D']],
                    [3, ['B', 'C', 'A', 'D']],
                    [2, ['C', 'D', 'B', 'A']],
                    [1, ['D', 'C', 'B', 'A']],
                    [2, ['D', 'B', 'C', 'A']],
                ])
            );
            const chair = Contest(await Tally(e), 'Chair');
            AssertEqual(chair.Outcome, 'Decided', 'outcome');
            AssertEqual(chair.VotesCast, 12, 'votes cast');
            AssertOutcomeSet(chair, 'Elected', ['A']);
            AssertEqual(chair.Rounds.length, 3, 'three rounds');
            const [r1, r2, r3] = chair.Rounds;
            AssertEqual(Canon(r1.Tallies), Canon({ A: 4, B: 3, C: 2, D: 3 }), 'round 1 tallies');
            AssertEqual(r1.Excluded.join(','), 'C', 'round 1 excludes C');
            AssertEqual(r1.Elected.length, 0, 'round 1 elects nobody');
            AssertEqual(Canon(r2.Tallies), Canon({ A: 4, B: 3, D: 5 }), 'round 2 tallies');
            AssertEqual(r2.Excluded.join(','), 'B', 'round 2 excludes B');
            AssertEqual(Canon(r3.Tallies), Canon({ A: 7, D: 5 }), 'round 3 tallies');
            AssertEqual(r3.Elected.join(','), 'A', 'round 3 elects A');
            AssertClose(r1.Exhausted, 0, 'round 1 exhausted');
            AssertClose(r3.Exhausted, 0, 'round 3 exhausted');
            AssertClose(chair.Options['A'].Votes, 7, 'A final votes');
            // "Votes: weighted votes (final round for ranked methods)": the runner-up's last-round count is its result, not zero.
            AssertClose(chair.Options['D'].Votes, 5, 'D (runner-up) final-round votes');
            AssertEqual(chair.Options['A'].Position, 1, 'A is first');
            // Finishing order by the method's own rule: winner, then the last survivor (D), then reverse elimination order (B, C).
            // Every candidate must hold a distinct position, the winner first, the earlier-eliminated ranked below the later.
            const positions = Object.values(chair.Options).map((o) => o.Position);
            AssertEqual(new Set(positions).size, 4, 'four distinct finishing positions');
            Assert(chair.Options['D'].Position < chair.Options['B'].Position, `D (runner-up, never eliminated) finishes above B (eliminated in round 2): D=${chair.Options['D'].Position} B=${chair.Options['B'].Position}`);
            Assert(chair.Options['B'].Position < chair.Options['C'].Position, `B (out in round 2) finishes above C (out in round 1): B=${chair.Options['B'].Position} C=${chair.Options['C'].Position}`);
        },
    },
    {
        Id: `${BUNDLE}.WT9`,
        Name: 'WT9 - instant runoff with an exhausted ballot: Q wins 4 of 7 continuing after R is eliminated',
        Fn: async () => {
            // 8 ballots: 3 x P   3 x Q   1 x R>Q   1 x R
            // Round 1: P3 Q3 R2 (8; majority needs > 4)  => R (2) out. The R>Q ballot moves to Q; the lone R ballot has no next choice.
            // Round 2: P3 Q4, one ballot exhausted (7 continuing; majority needs > 3.5)  => Q elected with 4.
            const e = await Fixture('Wire IRV exhaust', 'board-election', [Office('Chair', 'irv', 1, ['P', 'Q', 'R'])], Roster(8));
            await CastAll(e, Ballots('Chair', [[3, ['P']], [3, ['Q']], [1, ['R', 'Q']], [1, ['R']]]));
            const chair = Contest(await Tally(e), 'Chair');
            AssertOutcomeSet(chair, 'Elected', ['Q']);
            AssertEqual(chair.Rounds.length, 2, 'two rounds');
            AssertEqual(Canon(chair.Rounds[0].Tallies), Canon({ P: 3, Q: 3, R: 2 }), 'round 1 tallies');
            AssertEqual(chair.Rounds[0].Excluded.join(','), 'R', 'R is eliminated');
            AssertClose(chair.Rounds[0].Exhausted, 0, 'nothing exhausted in round 1');
            AssertEqual(Canon(chair.Rounds[1].Tallies), Canon({ P: 3, Q: 4 }), 'round 2 tallies');
            AssertClose(chair.Rounds[1].Exhausted, 1, 'one ballot exhausted in round 2');
            AssertClose(chair.Options['Q'].Votes, 4, 'Q final votes');
            AssertClose(chair.Options['P'].Votes, 3, 'P (runner-up) final-round votes');
            Assert(chair.Options['P'].Position < chair.Options['R'].Position, `P (the last survivor) finishes above R (eliminated): P=${chair.Options['P'].Position} R=${chair.Options['R'].Position}`);
        },
    },
    {
        Id: `${BUNDLE}.WT10`,
        Name: 'WT10 - Scottish STV, two seats, 10 ballots: A elected on a 4 quota with a 1.0 surplus; D then C excluded; B fills the last seat',
        Fn: async () => {
            // 10 ballots: 3 x A>B   2 x A>C   2 x B>D   2 x C>D   1 x D          seats 2, Droop quota = floor(10/3)+1 = 4
            // Round 1: A5 B2 C2 D1. A reaches the quota (5 >= 4): elected, surplus 5-4 = 1.0.
            //          Inclusive Gregory: all 5 A ballots transfer at 1/5 = 0.2 each: 3 to B (+0.6), 2 to C (+0.4).
            // Round 2: B2.6 C2.4 D1.  Nobody at quota, no surplus left: D (1.0) is excluded; D's own ballot has no next choice (exhausted 1).
            // Round 3: B2.6 C2.4.     C is excluded; its 2 C>D ballots (D gone) and 2 A>C ballots at 0.2 are exhausted (2.0 + 0.4 = 2.4).
            // Round 4: B alone for the last open seat: elected without reaching the quota.
            const e = await Fixture('Wire STV 2', 'organization-election', [Office('Council', 'stv', 2, ['A', 'B', 'C', 'D'])], Roster(10));
            await CastAll(e, Ballots('Council', [[3, ['A', 'B']], [2, ['A', 'C']], [2, ['B', 'D']], [2, ['C', 'D']], [1, ['D']]]));
            const c = Contest(await Tally(e), 'Council');
            AssertEqual(c.Outcome, 'Decided', 'outcome');
            AssertEqual(c.VotesCast, 10, 'valid votes');
            AssertEqual(c.Rounds.length, 4, 'four rounds');
            const [r1, r2, r3, r4] = c.Rounds;
            AssertEqual(Canon(r1.Tallies), Canon({ A: 5, B: 2, C: 2, D: 1 }), 'round 1 tallies');
            AssertEqual(r1.Elected.join(','), 'A', 'round 1 elects A');
            AssertClose(r1.Transfers?.['B'], 0.6, 'round 1 surplus to B');
            AssertClose(r1.Transfers?.['C'], 0.4, 'round 1 surplus to C');
            AssertClose(r2.Tallies['B'], 2.6, 'round 2: B');
            AssertClose(r2.Tallies['C'], 2.4, 'round 2: C');
            AssertClose(r2.Tallies['D'], 1, 'round 2: D');
            AssertEqual(r2.Excluded.join(','), 'D', 'round 2 excludes D');
            AssertClose(r2.Exhausted, 1, 'round 2 exhausted');
            AssertEqual(r3.Excluded.join(','), 'C', 'round 3 excludes C');
            AssertClose(r3.Exhausted, 2.4, 'round 3 exhausted (2.0 + 0.4)');
            AssertEqual(r4.Elected.join(','), 'B', 'round 4 elects B');
            AssertOutcomeSet(c, 'Elected', ['A', 'B']);
            AssertOutcomeSet(c, 'Excluded', ['C', 'D']);
            AssertClose(c.Options['A'].Votes, 4, 'A is shown at the quota once the surplus has moved');
            AssertClose(c.Options['B'].Votes, 2.6, 'B final count');
            AssertEqual(c.Order.join(','), 'A,B,C,D', 'finishing order: elected in order, then last excluded first');
        },
    },
    {
        Id: `${BUNDLE}.WT11`,
        Name: 'WT11 - Scottish STV, three seats, 16 ballots: two surpluses with 5-decimal truncation, D excluded, C fills the last seat',
        Fn: async () => {
            // 16 ballots: 7 x A>C   6 x B>D   2 x C   1 x D        seats 3, Droop quota = floor(16/4)+1 = 5
            // Round 1: A7 B6 C2 D1. A (7) and B (6) reach the quota: elected, largest first (A, B). Largest surplus is A's: 2.
            //          A's 7 ballots move to C at 2/7 truncated to 0.28571 each = +1.99997 (the 0.00003 lost to truncation is not a vote).
            // Round 2: B still holds a surplus of 1 (6 - 5). Its 6 ballots move to D at 1/6 truncated to 0.16666 each = +0.99996.
            //          Counts now: C 3.99997, D 1.99996.
            // Round 3: nobody at quota; D (lowest) is excluded. D's own ballot (1.0) and the 6 B>D ballots (0.99996) are exhausted: 1.99996.
            // Round 4: C alone for the last open seat: elected without reaching the quota.
            const e = await Fixture('Wire STV 3', 'organization-election', [Office('Council', 'stv', 3, ['A', 'B', 'C', 'D'])], Roster(16));
            await CastAll(e, Ballots('Council', [[7, ['A', 'C']], [6, ['B', 'D']], [2, ['C']], [1, ['D']]]));
            const c = Contest(await Tally(e), 'Council');
            AssertEqual(c.VotesCast, 16, 'valid votes');
            AssertEqual(c.Rounds.length, 4, 'four rounds');
            const [r1, r2, r3, r4] = c.Rounds;
            AssertEqual(r1.Elected.join(','), 'A,B', 'round 1 elects A then B');
            AssertClose(r1.Transfers?.['C'], 1.99997, 'A surplus to C, truncated');
            AssertEqual(r2.Elected.length, 0, 'round 2 elects nobody');
            AssertClose(r2.Transfers?.['D'], 0.99996, 'B surplus to D, truncated');
            AssertClose(r3.Tallies['C'], 3.99997, 'round 3: C');
            AssertClose(r3.Tallies['D'], 1.99996, 'round 3: D');
            AssertEqual(r3.Excluded.join(','), 'D', 'round 3 excludes D');
            AssertClose(r3.Exhausted, 1.99996, 'round 3 exhausted');
            AssertEqual(r4.Elected.join(','), 'C', 'round 4 elects C');
            AssertOutcomeSet(c, 'Elected', ['A', 'B', 'C']);
            AssertEqual(c.Order.join(','), 'A,B,C,D', 'finishing order');
            AssertClose(c.Options['A'].Votes, 5, 'A at the quota');
            AssertClose(c.Options['B'].Votes, 5, 'B at the quota');
            AssertClose(c.Options['C'].Votes, 3.99997, 'C final');
        },
    },
    {
        Id: `${BUNDLE}.WT12`,
        Name: 'WT12 - weighted roll: a weight-3 voter carries a motion that a headcount would tie',
        Fn: async () => {
            // Roll weights: member1 3, member2 1, member3 1, member4 1 (classes "2-5" = {3} and "1" = {1,1,1}: class means 3 and 1).
            // Ballots: member1 Yes, member2 No, member3 No, member4 Yes.   Weighted: Yes 3+1 = 4, No 1+1 = 2 => Passed. Headcount: 2-2.
            const voters: WireVoterSpec[] = [
                PersonaVoter(C(), 'member1', 0, { Weight: 3, VotingClass: 'Heavy' }),
                PersonaVoter(C(), 'member2', 1, { Weight: 1, VotingClass: 'Light' }),
                PersonaVoter(C(), 'member3', 2, { Weight: 1, VotingClass: 'Light' }),
                PersonaVoter(C(), 'member4', 3, { Weight: 1, VotingClass: 'Light' }),
            ];
            const e = await Fixture('Wire weighted', 'motion', [MotionSpec('Weighted motion')], voters);
            await CastAll(e, [{ 'Weighted motion': ['Yes'] }, { 'Weighted motion': ['No'] }, { 'Weighted motion': ['No'] }, { 'Weighted motion': ['Yes'] }]);
            const c = Contest(await Tally(e), 'Weighted motion');
            AssertVotes(c, { Yes: 4, No: 2 });
            AssertEqual(c.Outcome, 'Passed', 'the weighted majority passes');
            AssertEqual(c.VotesCast, 6, 'votes cast is total weight');
        },
    },
    {
        Id: `${BUNDLE}.WT13`,
        Name: 'WT13 - weight classes count at the class MEAN: weights 3 and 5 both count 4 (privacy by design)',
        Fn: async () => {
            // Roll: member1 weight 3 and member2 weight 5 share the class "2-5" (mean 4); member3 weight 1 is class "1"; member4 weight 1.
            // Ballots: member1 Yes, member2 No, member3 Yes, member4 abstains.
            //   Representative weights: Yes = 4 + 1 = 5, No = 4  => Passed.      (individual weights would give Yes 4, No 5 => Failed)
            const voters: WireVoterSpec[] = [
                PersonaVoter(C(), 'member1', 0, { Weight: 3, VotingClass: 'Mid' }),
                PersonaVoter(C(), 'member2', 1, { Weight: 5, VotingClass: 'Mid' }),
                PersonaVoter(C(), 'member3', 2, { Weight: 1, VotingClass: 'Low' }),
                PersonaVoter(C(), 'member4', 3, { Weight: 1, VotingClass: 'Low' }),
            ];
            const e = await Fixture('Wire class mean', 'motion', [MotionSpec('Class motion')], voters);
            await CastAll(e, [{ 'Class motion': ['Yes'] }, { 'Class motion': ['No'] }, { 'Class motion': ['Yes'] }, { 'Class motion': 'abstain' }]);
            const c = Contest(await Tally(e), 'Class motion');
            AssertVotes(c, { Yes: 5, No: 4 });
            AssertEqual(c.Outcome, 'Passed', 'outcome at class-mean weights');
            AssertClose(c.Abstentions, 1, 'abstention counted at weight 1');
        },
    },
    {
        Id: `${BUNDLE}.WT14`,
        Name: 'WT14 - results audiences: who may read the final result of each audience setting',
        Fn: async () => {
            // For each audience: roll = member1, member2, trustee1 (never votes) + guest w40; member1, member2, w40 vote (Yes, Yes, No).
            // Viewers: admin, inspector, member1 (voted), trustee1 (eligible, did not vote), guest w40, outsider (user, no Person),
            // outsider-known (Person, not on the roll), member3 (Person, not on the roll).
            type Viewer = 'admin' | 'inspector' | 'member1' | 'trustee1' | 'guest' | 'outsider' | 'outsider-known' | 'member3';
            const everyone: Viewer[] = ['admin', 'inspector', 'member1', 'trustee1', 'guest', 'outsider', 'outsider-known', 'member3'];
            const allowed: Record<string, Viewer[]> = {
                Voters: ['admin', 'inspector', 'member1', 'trustee1', 'guest'],
                Eligible: ['admin', 'inspector', 'member1', 'trustee1', 'guest'],
                HostMembers: ['admin', 'inspector', 'member1', 'trustee1', 'outsider', 'outsider-known', 'member3'],
                Public: everyone,
                Administrators: ['admin', 'inspector'],
            };
            const denial: Record<string, string> = {
                Voters: 'only eligible voters',
                Eligible: 'only eligible voters',
                HostMembers: 'only members of the host',
                Administrators: 'only administrators',
            };
            for (const audience of ['Voters', 'Eligible', 'HostMembers', 'Public', 'Administrators'] as const) {
                const voters: WireVoterSpec[] = [PersonaVoter(C(), 'member1', 0), PersonaVoter(C(), 'member2', 1), PersonaVoter(C(), 'trustee1', 2), WorldGuest(40)];
                const e = await Fixture(`Wire audience ${audience}`, 'motion', [MotionSpec('Audience motion')], voters, { ResultsAudience: audience, ResultsTiming: 'AfterClose' });
                await CastAll(e, [{ 'Audience motion': ['Yes'] }, { 'Audience motion': ['Yes'] }, { 'Audience motion': ['No'] }], [voters[0].Email, voters[1].Email, voters[3].Email]);
                await Tally(e);
                const clientFor = async (v: Viewer): Promise<WireClient> => {
                    if (v === 'admin') return A();
                    if (v === 'guest') return (await e.Session(voters[3].Email)).Client;
                    return C().As(v);
                };
                for (const v of everyone) {
                    const res = await e.ResultsFor(await clientFor(v));
                    Assert(res.Success && res.Output?.Success === true, `${audience}/${v}: GetResults answers (${res.ResultCode} ${res.ErrorMessage ?? res.Output?.Message})`);
                    const shouldSee = allowed[audience].includes(v);
                    AssertEqual(res.Output?.Visible, shouldSee, `${audience}/${v}: visible (reason: ${res.Output?.Reason})`);
                    if (shouldSee) {
                        const motion = e.LabelAll(res.Output?.Contests).get('Audience motion');
                        AssertEqual(motion?.Outcome, 'Passed', `${audience}/${v}: sees Passed`);
                        AssertVotes(motion as LabelledContest, { Yes: 2, No: 1 });
                    } else {
                        AssertEqual((res.Output?.Contests ?? []).length, 0, `${audience}/${v}: no contest data leaks`);
                        Assert((res.Output?.Reason ?? '').toLowerCase().includes(denial[audience]), `${audience}/${v}: reason mentions "${denial[audience]}" (got "${res.Output?.Reason}")`);
                    }
                }
            }
        },
    },
    {
        Id: `${BUNDLE}.WT15`,
        Name: 'WT15 - results timing while voting is open: AfterVoting, AdministratorsOnly and Live say why nothing is shown',
        Fn: async () => {
            const mk = async (label: string, timing: 'AfterVoting' | 'AdministratorsOnly' | 'Live', audience: 'Voters' | 'Administrators' = 'Voters', minCast = 5): Promise<LiveElection> =>
                Fixture(`Wire timing ${label}`, 'motion', [MotionSpec('Timing motion')], Roster(4), { ResultsTiming: timing, ResultsAudience: audience, SecrecyMode: 'Confidential', Configuration: { ResultsMinCast: minCast } });
            const reason = async (e: LiveElection, client: WireClient): Promise<{ Visible?: boolean; Reason?: string; Contests: number }> => {
                const res = await e.ResultsFor(client);
                Assert(res.Success && res.Output?.Success === true, `GetResults answers (${res.ResultCode} ${res.ErrorMessage ?? res.Output?.Message})`);
                return { Visible: res.Output?.Visible, Reason: res.Output?.Reason, Contests: (res.Output?.Contests ?? []).length };
            };
            // AfterVoting: a voter sees results only after voting; a non-voter is told so.
            const av = await mk('after voting', 'AfterVoting');
            const nonVoter = await reason(av, await C().As('trustee1'));
            AssertEqual(nonVoter.Visible, false, 'AfterVoting: a voter who has not voted sees nothing');
            Assert((nonVoter.Reason ?? '').toLowerCase().includes('only after you vote'), `AfterVoting reason (got "${nonVoter.Reason}")`);
            const outsiderAV = await reason(av, await C().As('outsider'));
            AssertEqual(outsiderAV.Visible, false, 'AfterVoting: an outsider sees nothing');
            AssertEqual(outsiderAV.Contests, 0, 'AfterVoting: no data for an outsider');

            // AdministratorsOnly: voters are told only administrators may look while voting is open.
            const ao = await mk('admins only', 'AdministratorsOnly', 'Administrators');
            const member = await reason(ao, await C().As('member1'));
            AssertEqual(member.Visible, false, 'AdministratorsOnly: a member sees nothing while open');
            Assert((member.Reason ?? '').toLowerCase().includes('only administrators may view results while voting is open'), `AdministratorsOnly reason (got "${member.Reason}")`);

            // Live with a minimum of 3 ballots: below the minimum nobody sees a number (k-anonymity).
            const live = await mk('live', 'Live', 'Voters', 3);
            await (await live.Session(C().Record('member1').Email)).MustCast({ 'Timing motion': ['Yes'] });
            const early = await reason(live, await C().As('member1'));
            AssertEqual(early.Visible, false, 'Live: one ballot is below the minimum of three');
            Assert((early.Reason ?? '').toLowerCase().includes('at least 3 ballots'), `Live reason (got "${early.Reason}")`);
            AssertEqual(early.Contests, 0, 'Live: no counts below the minimum');
        },
    },
    {
        Id: `${BUNDLE}.WT16`,
        Name: 'WT16 - Scottish STV: TieBroken only when the lot decided who was elected (one quiet tie, one decisive tie)',
        Fn: async () => {
            // Two one-seat STV contests on the same 7 ballots, Droop quota floor(7/2)+1 = 4 in both.
            // Quiet:    3 x A, 2 x D, 1 x B, 1 x C.  Stage 1: nobody at quota; B and C tie for the exclusion with no earlier
            //           stage, so a lot excludes one (its ballot exhausts), then the other, then D: A wins every way. Not flagged.
            // Decisive: 3 x C, 2 x A>B, 2 x B>A.     Stage 1: C3 A2 B2; A and B tie for the exclusion. Excluding A gives B 4
            //           (elected), excluding B gives A 4 (elected): the lot decides the seat. Flagged.
            const e = await Fixture('Wire STV ties', 'organization-election', [Office('Quiet', 'stv', 1, ['A', 'B', 'C', 'D']), Office('Decisive', 'stv', 1, ['A', 'B', 'C'])], Roster(7));
            const plans: BallotPlan[] = [
                ...Times(3, { Quiet: ['A'], Decisive: ['C'] }),
                ...Times(2, { Quiet: ['D'], Decisive: ['A', 'B'] }),
                { Quiet: ['B'], Decisive: ['B', 'A'] },
                { Quiet: ['C'], Decisive: ['B', 'A'] },
            ];
            await CastAll(e, plans);
            const t = await Tally(e, 'stv-tie-seed');
            const quiet = Contest(t, 'Quiet');
            AssertOutcomeSet(quiet, 'Elected', ['A']);
            Assert(quiet.Notes.some((n) => /Tie by lot \(exclusion\)/.test(n)), `the quiet contest notes its lot (got ${JSON.stringify(quiet.Notes)})`);
            AssertEqual(quiet.TieBroken, false, 'a lot that could not change the winner is not reported as a tie-break');
            const decisive = Contest(t, 'Decisive');
            AssertEqual(decisive.TieBroken, true, 'the lot that decided the seat is reported');
            const winner = Object.entries(decisive.Options).filter(([, o]) => o.Outcome === 'Elected').map(([l]) => l);
            Assert(winner.length === 1 && (winner[0] === 'A' || winner[0] === 'B'), `the decisive seat goes to A or B (got ${winner.join(',')})`);
        },
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async () => {
        cast = await WireCast.Create();
        admin = await cast.As('admin');
        await LoadVotingWorld(cast);
        made.length = 0;
    },
    Teardown: async () => {
        if (admin) for (const e of made) await e.Cleanup();
        made.length = 0;
        cast = undefined;
        admin = undefined;
    },
});
