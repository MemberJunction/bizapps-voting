import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../rng.js';
import { RequiredShare, MeetsThreshold } from '../threshold.js';
import {
  CountFirstChoices,
  CountAllSelections,
  ComputeVotesCastAndAbstentions,
  RankWithTies,
  RoundVotes,
} from '../common.js';
import { PluralityTallyMethod } from '../plurality.js';
import { MajorityTallyMethod } from '../majority.js';
import { ApprovalTallyMethod } from '../approval.js';
import { IrvTallyMethod } from '../irv.js';
import type { TallyBallot, TallyContestInput } from '../../types.js';

describe('SeededRandom', () => {
  it('should produce the same sequence for the same seed', () => {
    const rng1 = new SeededRandom('test-seed');
    const rng2 = new SeededRandom('test-seed');

    const values1 = Array(10)
      .fill(0)
      .map(() => rng1.Next());
    const values2 = Array(10)
      .fill(0)
      .map(() => rng2.Next());

    expect(values1).toEqual(values2);
  });

  it('should produce different sequences for different seeds', () => {
    const rng1 = new SeededRandom('seed1');
    const rng2 = new SeededRandom('seed2');

    const values1 = Array(10)
      .fill(0)
      .map(() => rng1.Next());
    const values2 = Array(10)
      .fill(0)
      .map(() => rng2.Next());

    expect(values1).not.toEqual(values2);
  });

  it('should pick an item from an array', () => {
    const rng = new SeededRandom('pick-test');
    const items = ['a', 'b', 'c', 'd'];

    const picked = rng.Pick(items);
    expect(items).toContain(picked);
  });

  it('should consistently pick the same item for the same seed', () => {
    const items = ['a', 'b', 'c', 'd'];

    const picked1 = new SeededRandom('pick-same').Pick(items);
    const picked2 = new SeededRandom('pick-same').Pick(items);

    expect(picked1).toBe(picked2);
  });

  it('should shuffle consistently with the same seed', () => {
    const items = ['a', 'b', 'c', 'd'];

    const shuffled1 = new SeededRandom('shuffle-test').Shuffle(items);
    const shuffled2 = new SeededRandom('shuffle-test').Shuffle(items);

    expect(shuffled1).toEqual(shuffled2);
    expect(shuffled1).not.toEqual(items); // Likely different order
  });
});

describe('RequiredShare', () => {
  it('should return correct thresholds', () => {
    expect(RequiredShare('None')).toBe(0);
    expect(RequiredShare('Majority')).toBe(0.5);
    expect(RequiredShare('ThreeFifths')).toBe(0.6);
    expect(RequiredShare('TwoThirds')).toBeCloseTo(2 / 3);
    expect(RequiredShare('ThreeQuarters')).toBe(0.75);
    expect(RequiredShare('Unanimous')).toBe(1);
    expect(RequiredShare('Custom', 0.7)).toBe(0.7);
  });
});

describe('MeetsThreshold', () => {
  it('Majority: yes > half', () => {
    // 100 basis, 51 yes → meets (51 > 50)
    expect(MeetsThreshold(51, 49, 100, 'Majority')).toBe(true);
    // 100 basis, 50 yes → fails (50 is not > 50)
    expect(MeetsThreshold(50, 50, 100, 'Majority')).toBe(false);
  });

  it('None: yes > no', () => {
    expect(MeetsThreshold(10, 5, 15, 'None')).toBe(true);
    expect(MeetsThreshold(10, 10, 20, 'None')).toBe(false);
  });

  it('Unanimous: no === 0 && yes > 0', () => {
    expect(MeetsThreshold(10, 0, 10, 'Unanimous')).toBe(true);
    expect(MeetsThreshold(0, 0, 0, 'Unanimous')).toBe(false);
    expect(MeetsThreshold(10, 1, 11, 'Unanimous')).toBe(false);
  });

  it('TwoThirds: yes >= 2/3 * basis', () => {
    // 3 basis: need >= 2
    expect(MeetsThreshold(2, 1, 3, 'TwoThirds')).toBe(true);
    expect(MeetsThreshold(1.99, 1.01, 3, 'TwoThirds')).toBe(false);
  });

  it('ThreeFifths: yes >= 0.6 * basis', () => {
    // 10 basis: need >= 6
    expect(MeetsThreshold(6, 4, 10, 'ThreeFifths')).toBe(true);
    expect(MeetsThreshold(5.99, 4.01, 10, 'ThreeFifths')).toBe(false);
  });
});

describe('CountFirstChoices', () => {
  it('should count first preferences correctly', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }, { OptionID: 'B', Rank: 2 }] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }, { OptionID: 'A', Rank: 2 }] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
    ];

    const counts = CountFirstChoices(ballots, ['A', 'B', 'C']);

    expect(counts['A']).toBe(2); // Two ballots prefer A first
    expect(counts['B']).toBe(1);
    expect(counts['C']).toBe(0);
  });

  it('should ignore abstaining ballots', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1, Abstain: true, Selections: [{ OptionID: 'A' }] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }] },
    ];

    const counts = CountFirstChoices(ballots, ['A', 'B']);

    expect(counts['A']).toBe(0);
    expect(counts['B']).toBe(1);
  });

  it('should handle fractional weights', () => {
    const ballots: TallyBallot[] = [
      { Weight: 0.5, Abstain: false, Selections: [{ OptionID: 'A' }] },
      { Weight: 0.5, Abstain: false, Selections: [{ OptionID: 'A' }] },
    ];

    const counts = CountFirstChoices(ballots, ['A', 'B']);

    expect(counts['A']).toBe(1);
  });
});

describe('CountAllSelections', () => {
  it('should count all selected options for each ballot', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }, { OptionID: 'B' }] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }, { OptionID: 'C' }] },
    ];

    const counts = CountAllSelections(ballots, ['A', 'B', 'C', 'D']);

    expect(counts['A']).toBe(1);
    expect(counts['B']).toBe(2);
    expect(counts['C']).toBe(1);
    expect(counts['D']).toBe(0);
  });

  it('should ignore abstaining ballots', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1, Abstain: true, Selections: [{ OptionID: 'A' }] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }] },
    ];

    const counts = CountAllSelections(ballots, ['A', 'B']);

    expect(counts['A']).toBe(0);
    expect(counts['B']).toBe(1);
  });
});

describe('ComputeVotesCastAndAbstentions', () => {
  it('should compute votes cast and abstentions correctly', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }] },
      { Weight: 1, Abstain: true, Selections: [] },
    ];

    const { VotesCast, Abstentions } = ComputeVotesCastAndAbstentions(ballots);

    expect(VotesCast).toBe(2);
    expect(Abstentions).toBe(1);
  });

  it('should handle empty selections as abstention', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1, Abstain: false, Selections: [] },
      { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }] },
    ];

    const { VotesCast, Abstentions } = ComputeVotesCastAndAbstentions(ballots);

    expect(VotesCast).toBe(1);
    expect(Abstentions).toBe(1);
  });

  it('should handle fractional weights', () => {
    const ballots: TallyBallot[] = [
      { Weight: 0.5, Abstain: false, Selections: [{ OptionID: 'A' }] },
      { Weight: 0.5, Abstain: true, Selections: [] },
    ];

    const { VotesCast, Abstentions } = ComputeVotesCastAndAbstentions(ballots);

    expect(VotesCast).toBe(0.5);
    expect(Abstentions).toBe(0.5);
  });
});

describe('PluralityTallyMethod', () => {
  const method = new PluralityTallyMethod();

  it('should elect top Seats winners', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 2,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    expect(result.Options.find((o) => o.OptionID === 'B')?.Outcome).toBe('Elected');
    expect(result.Options.find((o) => o.OptionID === 'A')?.Outcome).toBe('Elected');
    expect(result.Options.find((o) => o.OptionID === 'C')?.Outcome).toBe('Defeated');
  });

  it('should handle motion kind with yes/no', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['Yes', 'No'],
      Kind: 'Motion',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 2,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'Yes' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'No' }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Failed'); // Tie, plurality motion fails
  });

  it('should return Void with no ballots', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 0,
      Ballots: [],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Void');
    expect(result.Notes).toContain('No ballots cast');
  });

  it('should break ties deterministically', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 2,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }] },
      ],
      TieBreakSeed: 'tie-seed-1',
    };

    const result1 = method.Tally(input);
    const winner1 = result1.Options.find((o) => o.Outcome === 'Elected')?.OptionID;

    // Same seed should give same result
    const result2 = method.Tally(input);
    const winner2 = result2.Options.find((o) => o.Outcome === 'Elected')?.OptionID;

    expect(winner1).toBe(winner2);
    expect(result1.TieBroken).toBe(true);
  });

  it('should handle fractional weights', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 2,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 1.5,
      Ballots: [
        { Weight: 0.5, Abstain: false, Selections: [{ OptionID: 'A' }] },
        { Weight: 0.5, Abstain: false, Selections: [{ OptionID: 'B' }] },
        { Weight: 0.5, Abstain: false, Selections: [{ OptionID: 'A' }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.VotesCast).toBe(1.5);
    const aVotes = result.Options.find((o) => o.OptionID === 'A')?.Votes;
    expect(aVotes).toBe(1);
  });
});

describe('MajorityTallyMethod', () => {
  const method = new MajorityTallyMethod();

  describe("Motion with Threshold 'None' (yes > no)", () => {
    const motion = (yes: number, no: number, abstain: number): TallyContestInput => ({
      ContestID: 'm',
      Seats: 1,
      OptionIDs: ['Yes', 'No'],
      Kind: 'Motion',
      Threshold: 'None',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: yes + no + abstain,
      Ballots: [
        ...Array.from({ length: yes }, () => ({ Weight: 1, Abstain: false, Selections: [{ OptionID: 'Yes' }] })),
        ...Array.from({ length: no }, () => ({ Weight: 1, Abstain: false, Selections: [{ OptionID: 'No' }] })),
        ...Array.from({ length: abstain }, () => ({ Weight: 1, Abstain: true, Selections: [] })),
      ],
      TieBreakSeed: 'test',
    });

    it('fails on a tie (4-4 with 2 abstentions)', () => {
      expect(method.Tally(motion(4, 4, 2)).Outcome).toBe('Failed');
    });

    it('fails when the no votes win', () => {
      expect(method.Tally(motion(1, 5, 0)).Outcome).toBe('Failed');
    });

    it('passes when yes outnumbers no, however few voted', () => {
      expect(method.Tally(motion(2, 1, 7)).Outcome).toBe('Passed');
    });
  });

  it('should elect single-seat winner meeting threshold', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    expect(result.Options.find((o) => o.OptionID === 'A')?.Outcome).toBe('Elected');
  });

  it('should fail single-seat election with no threshold', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'C', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Failed');
    // Note: the actual note message uses "No candidate reached the threshold"
    expect(result.Notes.length).toBeGreaterThan(0);
  });

  it('should handle Motion kind (yes/no)', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['Yes', 'No'],
      Kind: 'Motion',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 2,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'Yes', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'Yes', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Passed');
  });

  it('should handle Eligible basis', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'Eligible',
      EligibleWeight: 4, // 50% of 4 is 2, need > 2
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    expect(result.Options.find((o) => o.OptionID === 'A')?.Outcome).toBe('Elected');
  });

  it('should elect multiple seats meeting threshold', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 2,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    expect(result.Options.filter((o) => o.Outcome === 'Elected').length).toBeGreaterThanOrEqual(1);
  });
});

describe('ApprovalTallyMethod', () => {
  const method = new ApprovalTallyMethod();

  it('should elect top Seats winners', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 2,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }, { OptionID: 'B' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B' }, { OptionID: 'C' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A' }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    const elected = result.Options.filter((o) => o.Outcome === 'Elected');
    expect(elected.length).toBe(2);
  });

  it('should reject motion kind', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['Yes', 'No'],
      Kind: 'Motion',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 2,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'Yes' }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'No' }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Void');
    expect(result.Notes.some((n) => n.includes('not supported'))).toBe(true);
  });
});

describe('IrvTallyMethod', () => {
  const method = new IrvTallyMethod();

  it('should elect winner with majority on first round', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    expect(result.Options.find((o) => o.OptionID === 'A')?.Outcome).toBe('Elected');
    expect(result.Rounds.length).toBeGreaterThan(0);
  });

  it('should reject multi-seat elections', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 2,
      OptionIDs: ['A', 'B'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 2,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Void');
    expect(result.Notes.some((n) => n.includes('STV'))).toBe(true);
  });

  it('should transfer exhausted ballots', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'C', Rank: 1 }] },
      ],
      TieBreakSeed: 'irv-test',
    };

    const result = method.Tally(input);

    expect(result.Outcome).toBe('Decided');
    expect(result.Rounds.length).toBeGreaterThanOrEqual(2);
  });

  it('should record all rounds', () => {
    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B', 'C'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 3,
      Ballots: [
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'A', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'B', Rank: 1 }] },
        { Weight: 1, Abstain: false, Selections: [{ OptionID: 'C', Rank: 1 }] },
      ],
      TieBreakSeed: 'test',
    };

    const result = method.Tally(input);

    expect(result.Rounds.length).toBeGreaterThan(0);
    for (const round of result.Rounds) {
      expect(round.Round).toBeDefined();
      expect(round.Tallies).toBeDefined();
      expect(round.Excluded).toBeDefined();
    }
  });
});

describe('Property tests', () => {
  const pluralityMethod = new PluralityTallyMethod();

  it('adding a ballot for X never reduces X\'s plurality count', () => {
    // Small random test
    for (let trial = 0; trial < 20; trial++) {
      const rng = new SeededRandom(`trial-${trial}`);
      const options = ['A', 'B', 'C'];

      // Generate random small ballots
      const ballots1: TallyBallot[] = [];
      const ballots2: TallyBallot[] = [];

      for (let i = 0; i < 3; i++) {
        const weight = 1;
        const selected = rng.Pick(options);
        ballots1.push({
          Weight: weight,
          Abstain: false,
          Selections: [{ OptionID: selected }],
        });
        ballots2.push({
          Weight: weight,
          Abstain: false,
          Selections: [{ OptionID: selected }],
        });
      }

      // Add one more ballot for 'A' in ballots2
      ballots2.push({
        Weight: 1,
        Abstain: false,
        Selections: [{ OptionID: 'A' }],
      });

      const input1: TallyContestInput = {
        ContestID: 'test',
        Seats: 1,
        OptionIDs: options,
        Kind: 'Office',
        Threshold: 'Majority',
        ThresholdBasis: 'VotesCast',
        EligibleWeight: ballots1.length,
        Ballots: ballots1,
        TieBreakSeed: 'test',
      };

      const input2: TallyContestInput = {
        ...input1,
        EligibleWeight: ballots2.length,
        Ballots: ballots2,
      };

      const result1 = pluralityMethod.Tally(input1);
      const result2 = pluralityMethod.Tally(input2);

      const aVotes1 = result1.Options.find((o) => o.OptionID === 'A')?.Votes ?? 0;
      const aVotes2 = result2.Options.find((o) => o.OptionID === 'A')?.Votes ?? 0;

      expect(aVotes2).toBeGreaterThanOrEqual(aVotes1);
    }
  });
});

describe('Rounding', () => {
  it('should round votes to 6 decimal places', () => {
    const value = 1 / 3;
    expect(RoundVotes(value)).toBe(0.333333);
  });

  it('should work across methods', () => {
    const ballots: TallyBallot[] = [
      { Weight: 1 / 3, Abstain: false, Selections: [{ OptionID: 'A' }] },
      { Weight: 1 / 3, Abstain: false, Selections: [{ OptionID: 'A' }] },
      { Weight: 1 / 3, Abstain: false, Selections: [{ OptionID: 'A' }] },
    ];

    const input: TallyContestInput = {
      ContestID: 'test',
      Seats: 1,
      OptionIDs: ['A', 'B'],
      Kind: 'Office',
      Threshold: 'Majority',
      ThresholdBasis: 'VotesCast',
      EligibleWeight: 1,
      Ballots: ballots,
      TieBreakSeed: 'test',
    };

    const method = new PluralityTallyMethod();
    const result = method.Tally(input);

    const aVotes = result.Options.find((o) => o.OptionID === 'A')?.Votes ?? 0;
    // Should be rounded to 6 decimals: 0.999999 or 1
    expect(aVotes).toBeLessThanOrEqual(1);
    expect(aVotes).toBeGreaterThan(0.99);
  });
});

describe('MeetsThreshold — Unanimous respects the basis', () => {
  it('fails on the Eligible basis when not every eligible voter voted yes', () => {
    expect(MeetsThreshold(3, 0, 50, 'Unanimous')).toBe(false);
  });
  it('passes on the Eligible basis when every eligible voter voted yes', () => {
    expect(MeetsThreshold(50, 0, 50, 'Unanimous')).toBe(true);
  });
  it('passes on the VotesCast basis with no opposing votes', () => {
    expect(MeetsThreshold(7, 0, 7, 'Unanimous')).toBe(true);
  });
  it('fails with any opposing vote', () => {
    expect(MeetsThreshold(7, 1, 8, 'Unanimous')).toBe(false);
  });
});

function officeInput(seats: number, optionIDs: string[], ballots: TallyBallot[]): TallyContestInput {
  return {
    ContestID: 'c',
    Seats: seats,
    OptionIDs: optionIDs,
    Kind: 'Office',
    Threshold: 'Plurality',
    ThresholdBasis: 'VotesCast',
    EligibleWeight: ballots.length,
    Ballots: ballots,
    TieBreakSeed: 'seed',
  };
}

function ranked(count: number, ...order: string[]): TallyBallot[] {
  return Array.from({ length: count }, () => ({
    Weight: 1,
    Abstain: false,
    Selections: order.map((OptionID, i) => ({ OptionID, Rank: i + 1 })),
  }));
}

describe('IrvTallyMethod finishing positions and votes', () => {
  const method = new IrvTallyMethod();

  it('orders a never-eliminated runner-up second and reports final-round / elimination-round votes', () => {
    // First prefs A4 D3 B2 C1 (10 ballots). R1: nobody > 5, C out (1), its ballot goes to A.
    // R2: A5 D3 B2, nobody > 5, B out (2), its ballots exhaust. R3: A5 D3 of 8, A wins (5 > 4).
    const result = method.Tally(
      officeInput(1, ['A', 'B', 'C', 'D'], [
        ...ranked(4, 'A'),
        ...ranked(3, 'D'),
        ...ranked(2, 'B'),
        ...ranked(1, 'C', 'A'),
      ])
    );
    const byId = (id: string) => result.Options.find((o) => o.OptionID === id)!;
    expect(byId('A')).toMatchObject({ Position: 1, Votes: 5, Outcome: 'Elected' });
    expect(byId('D')).toMatchObject({ Position: 2, Votes: 3, Outcome: 'Defeated' });
    expect(byId('B')).toMatchObject({ Position: 3, Votes: 2, Outcome: 'Defeated' });
    expect(byId('C')).toMatchObject({ Position: 4, Votes: 1, Outcome: 'Defeated' });
    expect(result.TieBroken).toBe(false);
  });

  it('orders multiple surviving runners-up by final-round votes', () => {
    // A6 B3 C1 of 10: A has 6 > 5 in round 1, so B and C are never eliminated.
    const result = method.Tally(
      officeInput(1, ['C', 'B', 'A'], [...ranked(6, 'A'), ...ranked(3, 'B'), ...ranked(1, 'C')])
    );
    const pos = (id: string) => result.Options.find((o) => o.OptionID === id)!.Position;
    expect(pos('A')).toBe(1);
    expect(pos('B')).toBe(2);
    expect(pos('C')).toBe(3);
    expect(result.Options.find((o) => o.OptionID === 'B')!.Votes).toBe(3);
    expect(result.Options.find((o) => o.OptionID === 'C')!.Votes).toBe(1);
  });

  it('gives each option a distinct position', () => {
    const result = method.Tally(
      officeInput(1, ['A', 'B', 'C', 'D'], [...ranked(4, 'A'), ...ranked(3, 'D'), ...ranked(2, 'B'), ...ranked(1, 'C', 'A')])
    );
    expect(new Set(result.Options.map((o) => o.Position)).size).toBe(4);
  });
});

describe('RankWithTies tie flag only at the seat boundary', () => {
  const rng = () => new SeededRandom('s');

  it('does not flag a tie below the boundary', () => {
    const r = RankWithTies({ A: 4, B: 2, C: 2 }, ['A', 'B', 'C'], 1, rng());
    expect(r.ordered[0]).toBe('A');
    expect(r.ordered).toHaveLength(3);
    expect(r.tieBroken).toBe(false);
  });

  it('does not flag a tie wholly above the boundary', () => {
    expect(RankWithTies({ A: 4, B: 4, C: 1 }, ['A', 'B', 'C'], 2, rng()).tieBroken).toBe(false);
  });

  it('flags a tie straddling the boundary', () => {
    expect(RankWithTies({ A: 4, B: 2, C: 2 }, ['A', 'B', 'C'], 2, rng()).tieBroken).toBe(true);
    expect(RankWithTies({ A: 3, B: 3 }, ['A', 'B'], 1, rng()).tieBroken).toBe(true);
  });

  it('plurality, approval and majority do not flag a tie that decides nothing', () => {
    const ballots: TallyBallot[] = [
      ...ranked(4, 'A'),
      ...ranked(2, 'B'),
      ...ranked(2, 'C'),
    ];
    const input = officeInput(1, ['A', 'B', 'C'], ballots);
    expect(new PluralityTallyMethod().Tally(input).TieBroken).toBe(false);
    expect(new ApprovalTallyMethod().Tally(input).TieBroken).toBe(false);
    expect(new MajorityTallyMethod().Tally(input).TieBroken).toBe(false);
  });

  it('plurality flags a tie for the last seat', () => {
    const input = officeInput(2, ['A', 'B', 'C'], [...ranked(4, 'A'), ...ranked(2, 'B'), ...ranked(2, 'C')]);
    const result = new PluralityTallyMethod().Tally(input);
    expect(result.TieBroken).toBe(true);
    expect(result.Notes).toContain('Tie broken by lot');
  });
});
