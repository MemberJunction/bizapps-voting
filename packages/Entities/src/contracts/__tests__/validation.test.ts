/**
 * Tests for ballot submission validation.
 */

import { describe, it, expect } from 'vitest';
import { ValidateSubmission } from '../validation.js';
import type { BallotStyle, BallotSubmission } from '../types.js';

describe('validation.ts', () => {
  // Sample ballot style for testing
  const sampleStyle: BallotStyle = {
    ElectionID: 'election-1',
    ElectionName: 'Board Election 2026',
    SecrecyMode: 'Secret',
    AllowRevote: false,
    Language: 'en',
    Hash: 'hash123',
    Contests: [
      {
        ContestID: 'director',
        Name: 'Director',
        Kind: 'Office',
        Seats: 1,
        IsRanked: false,
        AllowAbstain: true,
        AllowWriteIn: false,
        MinSelections: 0,
        MaxSelections: 1,
        Options: [
          { OptionID: 'alice', Label: 'Alice' },
          { OptionID: 'bob', Label: 'Bob' },
        ],
      },
      {
        ContestID: 'motion-1',
        Name: 'Motion to Increase Budget',
        Kind: 'Motion',
        Seats: 1,
        IsRanked: false,
        AllowAbstain: true,
        AllowWriteIn: false,
        MinSelections: 1,
        MaxSelections: 1,
        Options: [
          { OptionID: 'yes', Label: 'Yes' },
          { OptionID: 'no', Label: 'No' },
        ],
      },
    ],
  };

  describe('ValidateSubmission', () => {
    it('should accept an empty submission', () => {
      const submission: BallotSubmission = { Contests: [] };
      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toHaveLength(1); // Missing motion-1 (MinSelections=1)
    });

    it('should accept a valid submission with selections', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'alice' }],
          },
          {
            ContestID: 'motion-1',
            Selections: [{ OptionID: 'yes' }],
          },
        ],
      };
      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toHaveLength(0);
    });

    it('should accept abstain when allowed', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Abstain: true,
            Selections: [],
          },
          {
            ContestID: 'motion-1',
            Selections: [{ OptionID: 'yes' }],
          },
        ],
      };
      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toHaveLength(0);
    });

    it('should reject unknown contest', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'unknown-contest',
            Selections: [],
          },
        ],
      };
      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(
        expect.objectContaining({
          Code: 'UnknownContest',
          ContestID: 'unknown-contest',
        })
      );
    });

    it('should reject duplicate contest in submission', () => {
      const submission: BallotSubmission = {
        Contests: [
          { ContestID: 'director', Selections: [{ OptionID: 'alice' }] },
          { ContestID: 'director', Selections: [{ OptionID: 'bob' }] },
        ],
      };
      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'DuplicateContest' }));
    });

    it('should reject missing required contest', () => {
      const submission: BallotSubmission = {
        Contests: [
          { ContestID: 'director', Selections: [] },
          // motion-1 missing
        ],
      };
      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'MissingContest' }));
    });

    it('should reject abstain when not allowed', () => {
      const styleNoAbstain: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            AllowAbstain: false,
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          { ContestID: 'director', Abstain: true, Selections: [] },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(styleNoAbstain, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'AbstainNotAllowed' }));
    });

    it('should reject abstain with selections', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Abstain: true,
            Selections: [{ OptionID: 'alice' }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'AbstainWithSelections' }));
    });

    it('should reject unknown option', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'unknown' }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'UnknownOption' }));
    });

    it('should reject duplicate options', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'alice' }, { OptionID: 'alice' }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'DuplicateOption' }));
    });

    it('should reject too few selections', () => {
      const submission: BallotSubmission = {
        Contests: [
          { ContestID: 'director', Selections: [] },
          { ContestID: 'motion-1', Selections: [] }, // motion requires ≥1
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'TooFewSelections' }));
    });

    it('should reject too many selections', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'alice' }, { OptionID: 'bob' }], // director allows max 1
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'TooManySelections' }));
    });

    it('should reject missing rank in ranked contest', () => {
      const rankedStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            IsRanked: true,
            MaxSelections: 2,
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'alice' }, { OptionID: 'bob' }], // Missing ranks
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(rankedStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'RankMissing' }));
    });

    it('should accept valid ranks in ranked contest', () => {
      const rankedStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            IsRanked: true,
            MaxSelections: 2,
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [
              { OptionID: 'alice', Rank: 1 },
              { OptionID: 'bob', Rank: 2 },
            ],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(rankedStyle, submission);
      expect(issues).toHaveLength(0);
    });

    it('should reject non-contiguous ranks', () => {
      const rankedStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            IsRanked: true,
            MaxSelections: 2,
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [
              { OptionID: 'alice', Rank: 1 },
              { OptionID: 'bob', Rank: 3 }, // Should be 2
            ],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(rankedStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'RankInvalid' }));
    });

    it('should reject rank in non-ranked contest', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'alice', Rank: 1 }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'RankNotAllowed' }));
    });

    it('should reject write-in text on non-write-in option', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'alice', WriteInText: 'Custom text' }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'WriteInNotAllowed' }));
    });

    it('should reject missing write-in text', () => {
      const writeInStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            AllowWriteIn: true,
            Options: [
              { OptionID: 'alice', Label: 'Alice' },
              { OptionID: 'write-in', Label: 'Write-in', IsWriteIn: true },
            ],
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'write-in' }], // Missing write-in text
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(writeInStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'WriteInRequired' }));
    });

    it('should accept valid write-in text', () => {
      const writeInStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            AllowWriteIn: true,
            Options: [
              { OptionID: 'alice', Label: 'Alice' },
              { OptionID: 'write-in', Label: 'Write-in', IsWriteIn: true },
            ],
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'write-in', WriteInText: 'Charlie' }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(writeInStyle, submission);
      expect(issues).toHaveLength(0);
    });

    it('should reject write-in text exceeding 500 chars', () => {
      const writeInStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [
          {
            ...sampleStyle.Contests[0],
            AllowWriteIn: true,
            Options: [
              { OptionID: 'write-in', Label: 'Write-in', IsWriteIn: true },
            ],
          },
          sampleStyle.Contests[1],
        ],
      };

      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'write-in', WriteInText: 'a'.repeat(501) }],
          },
          { ContestID: 'motion-1', Selections: [{ OptionID: 'yes' }] },
        ],
      };

      const issues = ValidateSubmission(writeInStyle, submission);
      expect(issues).toContainEqual(expect.objectContaining({ Code: 'WriteInTooLong' }));
    });

    it('should report all issues found', () => {
      const submission: BallotSubmission = {
        Contests: [
          {
            ContestID: 'director',
            Selections: [{ OptionID: 'unknown' }, { OptionID: 'unknown' }],
          },
          { ContestID: 'motion-1', Selections: [] }, // Too few
        ],
      };

      const issues = ValidateSubmission(sampleStyle, submission);
      expect(issues.length).toBeGreaterThan(1);
    });
  });
});
