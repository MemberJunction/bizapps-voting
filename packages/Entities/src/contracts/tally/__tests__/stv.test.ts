import { describe, expect, it } from 'vitest';
import { StvTallyMethod } from '../stv.js';
import type { TallyBallot, TallyContestInput, TallyOutcome } from '../../types.js';

const stv = new StvTallyMethod();

/** n identical ballots of the given weight, ranking the given options in order. */
function ballots(n: number, ranking: string[], weight = 1): TallyBallot[] {
    return Array.from({ length: n }, () => ({
        Weight: weight,
        Abstain: false,
        Selections: ranking.map((OptionID, i) => ({ OptionID, Rank: i + 1 }))
    }));
}

function contest(seats: number, options: string[], b: TallyBallot[], seed = 'seed'): TallyContestInput {
    return {
        ContestID: 'c1',
        Seats: seats,
        OptionIDs: options,
        Kind: 'Office',
        Threshold: 'None',
        ThresholdBasis: 'VotesCast',
        EligibleWeight: b.length,
        Ballots: b,
        TieBreakSeed: seed
    };
}

const electedIds = (o: TallyOutcome): string[] => o.Options.filter(x => x.Outcome === 'Elected').map(x => x.OptionID);

describe('StvTallyMethod', () => {
    it('has Code stv', () => {
        expect(stv.Code).toBe('stv');
    });

    it('computes the Droop quota floor(valid/(seats+1))+1 for integer weights', () => {
        // 100 valid, 2 seats: floor(100/3)+1 = 34
        const r = stv.Tally(contest(2, ['A', 'B', 'C'], [...ballots(50, ['A']), ...ballots(30, ['B']), ...ballots(20, ['C'])]));
        expect(r.Notes[0]).toContain('quota 34 ');
        // 80 valid, 3 seats: floor(80/4)+1 = 21
        const r2 = stv.Tally(contest(3, ['A', 'B', 'C', 'D'], [...ballots(40, ['A']), ...ballots(20, ['B']), ...ballots(10, ['C']), ...ballots(10, ['D'])]));
        expect(r2.Notes[0]).toContain('quota 21 ');
    });

    it('computes the quota to 5 decimals plus 0.00001 for fractional weights', () => {
        // total 10, 2 seats: 10/3 = 3.33333 (truncated) + 0.00001 = 3.33334
        const b = [...ballots(1, ['A', 'B'], 2.5), ...ballots(1, ['A', 'C'], 2.5), ...ballots(1, ['B'], 2), ...ballots(1, ['C'], 3)];
        const r = stv.Tally(contest(2, ['A', 'B', 'C'], b));
        expect(r.Notes[0]).toContain('quota 3.33334 ');
    });

    it('classic 2-seat count with a surplus transfer, worked by hand', () => {
        // 100 ballots: 30 A>B, 10 A>C, 20 B, 25 C>D, 15 D>C. Quota = floor(100/3)+1 = 34.
        // Stage 1: A=40 reaches 34, elected. Surplus 40-34 = 6; transfer value 6/40 = 0.15 per ballot.
        //   30 A>B ballots -> B gets 30*0.15 = 4.5;  10 A>C ballots -> C gets 10*0.15 = 1.5.
        // Stage 2: A=34 (settled at quota), B=20+4.5=24.5, C=25+1.5=26.5, D=15. Nobody at quota, no surplus.
        //   Exclude lowest D (15); its 15 D>C ballots move to C at value 1 -> C=26.5+15=41.5.
        // Stage 3: C=41.5 >= 34, elected; both seats filled. B (24.5) is defeated.
        const b = [...ballots(30, ['A', 'B']), ...ballots(10, ['A', 'C']), ...ballots(20, ['B']), ...ballots(25, ['C', 'D']), ...ballots(15, ['D', 'C'])];
        const r = stv.Tally(contest(2, ['A', 'B', 'C', 'D'], b));
        expect(r.Outcome).toBe('Decided');
        expect(r.VotesCast).toBe(100);
        expect(r.Rounds).toHaveLength(3);
        expect(r.Rounds[0].Tallies).toEqual({ A: 40, B: 20, C: 25, D: 15 });
        expect(r.Rounds[0].Elected).toEqual(['A']);
        expect(r.Rounds[0].Transfers).toEqual({ B: 4.5, C: 1.5 });
        expect(r.Rounds[0].Exhausted).toBe(0);
        expect(r.Rounds[1].Tallies).toEqual({ A: 34, B: 24.5, C: 26.5, D: 15 });
        expect(r.Rounds[1].Excluded).toEqual(['D']);
        expect(r.Rounds[1].Transfers).toEqual({ C: 15 });
        expect(r.Rounds[2].Tallies).toEqual({ A: 34, B: 24.5, C: 41.5, D: 0 });
        expect(r.Rounds[2].Elected).toEqual(['C']);
        expect(r.Options.map(o => [o.OptionID, o.Position, o.Outcome])).toEqual([
            ['A', 1, 'Elected'],
            ['C', 2, 'Elected'],
            ['B', 3, 'Defeated'],
            ['D', 4, 'Excluded']
        ]);
        expect(r.Options[0].Votes).toBe(34);
        expect(r.Options[1].Votes).toBe(41.5);
        expect(r.TieBroken).toBe(false);
    });

    it('3-seat count with exclusions and an exhausting surplus, worked by hand', () => {
        // 80 ballots: 20 A, 18 B, 16 C, 14 D>C, 12 E>B. Quota = floor(80/4)+1 = 21.
        // Stage 1: A20 B18 C16 D14 E12, none at 21. Exclude E (12); its ballots go to B -> B=30.
        // Stage 2: B=30 >= 21, elected. Surplus 9; value 9/30 = 0.3 per ballot. All 30 B ballots have no
        //   further preference, so 30*0.3 = 9 is exhausted.
        // Stage 3: A20 C16 D14, B settled at 21. Open seats 2, continuing 3. Exclude D (14) -> C=30.
        // Stage 4: C=30 >= 21 elected. Then continuing {A} equals the 1 open seat: A elected without quota.
        const b = [...ballots(20, ['A']), ...ballots(18, ['B']), ...ballots(16, ['C']), ...ballots(14, ['D', 'C']), ...ballots(12, ['E', 'B'])];
        const r = stv.Tally(contest(3, ['A', 'B', 'C', 'D', 'E'], b));
        expect(r.Rounds).toHaveLength(4);
        expect(r.Rounds[0].Excluded).toEqual(['E']);
        expect(r.Rounds[1].Tallies.B).toBe(30);
        expect(r.Rounds[1].Elected).toEqual(['B']);
        expect(r.Rounds[1].Exhausted).toBe(9);
        expect(r.Rounds[2].Excluded).toEqual(['D']);
        expect(r.Rounds[3].Elected).toEqual(['C', 'A']);
        expect(r.Rounds[3].Note).toContain('seats remaining');
        expect(electedIds(r)).toEqual(['B', 'C', 'A']);
        expect(r.Options.map(o => o.OptionID)).toEqual(['B', 'C', 'A', 'D', 'E']);
        expect(r.Options[3]).toMatchObject({ OptionID: 'D', Outcome: 'Excluded' });
        expect(r.Options[4]).toMatchObject({ OptionID: 'E', Outcome: 'Excluded' });
    });

    it('records exhausted value when an excluded candidate ballots have no further preference', () => {
        // 3 A, 3 B, 1 C (only), 2 D>A. Quota = floor(9/2)+1 = 5, 1 seat.
        // Stage 1: exclude C (1): exhausted 1. Stage 2: A3 B3 D2: exclude D -> A=5.  Stage 3: A=5 elected.
        const b = [...ballots(3, ['A']), ...ballots(3, ['B']), ...ballots(1, ['C']), ...ballots(2, ['D', 'A'])];
        const r = stv.Tally(contest(1, ['A', 'B', 'C', 'D'], b));
        expect(r.Rounds[0].Excluded).toEqual(['C']);
        expect(r.Rounds[0].Exhausted).toBe(1);
        expect(r.Rounds[2].Tallies.A).toBe(5);
        expect(electedIds(r)).toEqual(['A']);
        expect(r.TieBroken).toBe(false);
    });

    it('works with fractional weights and truncates transfer values to 5 decimals', () => {
        // Weights 2.5 A>B, 2.5 A>C, 2 B, 3 C; total 10; 2 seats; quota 3.33334.
        // Stage 1: A=5 elected. Surplus 5-3.33334 = 1.66666. Value per ballot 2.5*1.66666/5 = 0.83333 exactly.
        // Stage 2: B=2+0.83333=2.83333, C=3+0.83333=3.83333 >= 3.33334 -> C elected, seats filled.
        const b = [...ballots(1, ['A', 'B'], 2.5), ...ballots(1, ['A', 'C'], 2.5), ...ballots(1, ['B'], 2), ...ballots(1, ['C'], 3)];
        const r = stv.Tally(contest(2, ['A', 'B', 'C'], b));
        expect(r.Rounds[0].Tallies).toEqual({ A: 5, B: 2, C: 3 });
        expect(r.Rounds[0].Transfers).toEqual({ B: 0.83333, C: 0.83333 });
        expect(r.Rounds[1].Tallies).toEqual({ A: 3.33334, B: 2.83333, C: 3.83333 });
        expect(electedIds(r)).toEqual(['A', 'C']);
    });

    it('truncates (not rounds) the transfer value: 3/7 becomes 0.42857', () => {
        // 7 A>B, 1 B, 1 C; 2 seats; quota floor(9/3)+1 = 4. A=7 elected, surplus 3, value 3/7 -> 0.42857.
        // 7 ballots * 0.42857 = 2.99999 to B, so B=1+2.99999=3.99999 (just short of 4).
        // Stage 2: exclude C (1, exhausted). Stage 3: continuing {B} equals 1 open seat -> B elected.
        const b = [...ballots(7, ['A', 'B']), ...ballots(1, ['B']), ...ballots(1, ['C'])];
        const r = stv.Tally(contest(2, ['A', 'B', 'C'], b));
        expect(r.Rounds[0].Transfers).toEqual({ B: 2.99999 });
        expect(r.Rounds[1].Tallies.B).toBe(3.99999);
        expect(r.Rounds[1].Excluded).toEqual(['C']);
        expect(electedIds(r)).toEqual(['A', 'B']);
    });

    it('is deterministic: same seed, same result, including lot-broken ties', () => {
        const b = [...ballots(1, ['A']), ...ballots(1, ['B'])];
        const a1 = stv.Tally(contest(1, ['A', 'B'], b, 'seed-x'));
        const a2 = stv.Tally(contest(1, ['A', 'B'], b, 'seed-x'));
        expect(a2).toEqual(a1);
        expect(a1.TieBroken).toBe(true);
        expect(a1.Notes.some(n => n.startsWith('Tie by lot'))).toBe(true);
    });

    it('different seeds can break the same tie differently, and both outcomes occur', () => {
        const b = [...ballots(1, ['A']), ...ballots(1, ['B'])];
        const winners = new Set<string>();
        for (let i = 0; i < 40; i++) winners.add(electedIds(stv.Tally(contest(1, ['A', 'B'], b, `s${i}`)))[0]);
        expect(winners).toEqual(new Set(['A', 'B']));
    });

    it('breaks a tie by earlier-stage totals before resorting to lot', () => {
        // 1 seat, quota floor(11/2)+1 = 6. Ballots: 5 A, 2 B>C, 3 C, 1 D>B.
        // Stage 1: A5 B2 C3 D1 -> exclude D (1); D ballot goes to B.
        // Stage 2: A5 B3 C3: B and C tie for lowest, but B had 2 and C had 3 at stage 1 -> B excluded, no lot.
        // Stage 3: B's 3 ballots (B>C or D>B>C...) go to C only if ranked; give them B>C: C=3+3=6 elected.
        const b = [...ballots(5, ['A']), ...ballots(2, ['B', 'C']), ...ballots(3, ['C']), ...ballots(1, ['D', 'B', 'C'])];
        const r = stv.Tally(contest(1, ['A', 'B', 'C', 'D'], b));
        expect(r.Rounds[0].Excluded).toEqual(['D']);
        expect(r.Rounds[1].Tallies).toEqual({ A: 5, B: 3, C: 3, D: 0 });
        expect(r.Rounds[1].Excluded).toEqual(['B']);
        expect(electedIds(r)).toEqual(['C']);
        expect(r.TieBroken).toBe(false);
    });

    it('single-seat STV gives the same winner as instant runoff', () => {
        // 100 ballots, 1 seat, quota 51: A 35, B 30 (B>C), C 25 (C>B), D 10 (D>C>A)
        // IRV: exclude D -> C 35. A35 B30 C35. Exclude B (30) -> C 35+30 = 65 >= 51. C wins although A led round 1.
        const b = [...ballots(35, ['A']), ...ballots(30, ['B', 'C']), ...ballots(25, ['C', 'B']), ...ballots(10, ['D', 'C', 'A'])];
        const r = stv.Tally(contest(1, ['A', 'B', 'C', 'D'], b));
        expect(electedIds(r)).toEqual(['C']);
        expect(r.Rounds).toHaveLength(3);
        expect(r.Rounds[0].Tallies).toEqual({ A: 35, B: 30, C: 25, D: 10 });
        expect(r.Rounds[1].Tallies).toEqual({ A: 35, B: 30, C: 35, D: 0 });
        expect(r.Rounds[2].Tallies.C).toBe(65);
    });

    it('single seat with a first-round majority ends immediately', () => {
        const r = stv.Tally(contest(1, ['A', 'B'], [...ballots(6, ['A']), ...ballots(4, ['B'])]));
        expect(r.Rounds).toHaveLength(1);
        expect(electedIds(r)).toEqual(['A']);
        expect(r.Options[1]).toMatchObject({ OptionID: 'B', Outcome: 'Defeated', Position: 2 });
    });

    it('elects the continuing candidates when they equal the seats remaining', () => {
        // 2 seats, A 3 B 2 C 1 (quota floor(6/3)+1 = 3). A elected with zero surplus (no transfer needed).
        // Exclude C (1, no further prefs), leaving only B for the last seat: elected via the shortcut.
        const r = stv.Tally(contest(2, ['A', 'B', 'C'], [...ballots(3, ['A']), ...ballots(2, ['B']), ...ballots(1, ['C'])]));
        // Round 1 elects A and (no surplus to transfer) excludes C in the same stage; round 2 elects B.
        expect(r.Rounds).toHaveLength(2);
        expect(r.Rounds[0].Elected).toEqual(['A']);
        expect(r.Rounds[0].Excluded).toEqual(['C']);
        expect(r.Rounds[1].Elected).toEqual(['B']);
        expect(r.Rounds[1].Note).toContain('seats remaining');
        expect(electedIds(r)).toEqual(['A', 'B']);
    });

    it('elects everyone with a note when seats exceed or equal the candidates', () => {
        const r = stv.Tally(contest(3, ['A', 'B'], [...ballots(3, ['A']), ...ballots(1, ['B'])]));
        expect(r.Outcome).toBe('Decided');
        expect(electedIds(r)).toEqual(['A', 'B']);
        expect(r.Rounds[0].Note).toContain('seats remaining');
    });

    it('is Void with no ballots, and counts all-abstain ballots as abstentions', () => {
        const none = stv.Tally(contest(1, ['A', 'B'], []));
        expect(none.Outcome).toBe('Void');
        expect(none.VotesCast).toBe(0);
        const abstain: TallyBallot[] = [
            { Weight: 2, Abstain: true, Selections: [] },
            { Weight: 1, Abstain: false, Selections: [] }
        ];
        const r = stv.Tally(contest(1, ['A', 'B'], abstain));
        expect(r.Outcome).toBe('Void');
        expect(r.Abstentions).toBe(3);
        expect(r.Options.map(o => o.Position)).toEqual([1, 2]);
    });

    it('excludes abstentions from the valid total and quota', () => {
        const b = [...ballots(6, ['A']), ...ballots(4, ['B']), { Weight: 5, Abstain: true, Selections: [] }];
        const r = stv.Tally(contest(1, ['A', 'B'], b));
        expect(r.VotesCast).toBe(10);
        expect(r.Abstentions).toBe(5);
        expect(r.Notes[0]).toContain('quota 6 ');
    });

    it('orders preferences by Rank, ignores unknown options and duplicates', () => {
        const b: TallyBallot = {
            Weight: 1,
            Abstain: false,
            Selections: [
                { OptionID: 'B', Rank: 2 },
                { OptionID: 'ZZZ', Rank: 1 },
                { OptionID: 'A', Rank: 1 },
                { OptionID: 'A', Rank: 3 }
            ]
        };
        const r = stv.Tally(contest(1, ['A', 'B'], [b]));
        expect(r.Rounds[0].Tallies).toEqual({ A: 1, B: 0 });
        expect(electedIds(r)).toEqual(['A']);
    });

    it('treats an integer weight w like w identical ballots', () => {
        const unit = [...ballots(30, ['A', 'B']), ...ballots(10, ['A', 'C']), ...ballots(20, ['B']), ...ballots(25, ['C', 'D']), ...ballots(15, ['D', 'C'])];
        const weighted = [...ballots(3, ['A', 'B'], 10), ...ballots(1, ['A', 'C'], 10), ...ballots(2, ['B'], 10), ...ballots(5, ['C', 'D'], 5), ...ballots(3, ['D', 'C'], 5)];
        const r1 = stv.Tally(contest(2, ['A', 'B', 'C', 'D'], unit));
        const r2 = stv.Tally(contest(2, ['A', 'B', 'C', 'D'], weighted));
        expect(r2.Options).toEqual(r1.Options);
        expect(r2.Rounds.map(x => x.Tallies)).toEqual(r1.Rounds.map(x => x.Tallies));
    });

    it('is Void when there are no seats', () => {
        expect(stv.Tally(contest(0, ['A'], ballots(2, ['A']))).Outcome).toBe('Void');
    });
});
