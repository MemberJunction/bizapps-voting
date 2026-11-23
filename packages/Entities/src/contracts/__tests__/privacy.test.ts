/**
 * Tests for results visibility and privacy policies.
 */

import { describe, it, expect } from 'vitest';
import { ResultsVisible, PollBookVisible, FirstPreferencesOnly } from '../privacy.js';
import type { ResultsVisibilityParams, TallyBallot } from '../types.js';

describe('privacy.ts', () => {
  const baseParams: ResultsVisibilityParams = {
    Timing: 'AfterClose',
    Audience: 'Voters',
    Status: 'Open',
    ViewerIsAdministrator: false,
    ViewerHasVoted: false,
    ViewerIsEligible: true,
    ViewerIsHostMember: false,
    BallotCount: 10,
    MinCast: 5,
    SecrecyMode: 'Secret',
  };

  describe('ResultsVisible', () => {
    describe('AfterClose timing', () => {
      it('should hide results while voting is open', () => {
        const result = ResultsVisible({ ...baseParams, Timing: 'AfterClose', Status: 'Open' });
        expect(result.Visible).toBe(false);
        expect(result.RunningResults).toBe(false);
      });

      it('should hide results while Closed (before Tallied)', () => {
        const result = ResultsVisible({ ...baseParams, Timing: 'AfterClose', Status: 'Closed' });
        expect(result.Visible).toBe(false);
      });

      it('should show results after Tallied to authorized audience', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AfterClose',
          Status: 'Tallied',
          ViewerIsEligible: true,
        });
        expect(result.Visible).toBe(true);
        expect(result.RunningResults).toBe(false);
      });

      it('should hide results from unauthorized audience', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AfterClose',
          Status: 'Tallied',
          Audience: 'Administrators',
          ViewerIsAdministrator: false,
        });
        expect(result.Visible).toBe(false);
      });
    });

    describe('AfterVoting timing', () => {
      it('should hide results from non-voters while open', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AfterVoting',
          Status: 'Open',
          ViewerHasVoted: false,
        });
        expect(result.Visible).toBe(false);
        expect(result.RunningResults).toBe(true);
      });

      it('should show running results to voters who have voted', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AfterVoting',
          Status: 'Open',
          ViewerHasVoted: true,
          BallotCount: 5,
        });
        expect(result.Visible).toBe(true);
        expect(result.RunningResults).toBe(true);
      });

      it('should hide results below minimum cast threshold', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AfterVoting',
          Status: 'Open',
          ViewerHasVoted: true,
          BallotCount: 2,
          MinCast: 5,
        });
        expect(result.Visible).toBe(false);
      });
    });

    describe('Live timing', () => {
      it('should hide results before voting opens', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'Live',
          Status: 'Draft',
        });
        expect(result.Visible).toBe(false);
      });

      it('should show live results to authorized audience during voting', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'Live',
          Status: 'Open',
          Audience: 'Public',
          BallotCount: 10,
        });
        expect(result.Visible).toBe(true);
        expect(result.RunningResults).toBe(true);
      });

      it('should hide live results from unauthorized audience', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'Live',
          Status: 'Open',
          Audience: 'Administrators',
          ViewerIsAdministrator: false,
        });
        expect(result.Visible).toBe(false);
      });

      it('should respect minimum cast threshold', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'Live',
          Status: 'Open',
          Audience: 'Public',
          BallotCount: 2,
          MinCast: 5,
        });
        expect(result.Visible).toBe(false);
      });

      it('should hide results after voting closes', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'Live',
          Status: 'Closed',
          Audience: 'Public',
        });
        expect(result.Visible).toBe(false);
      });

      it('shows the final result to the audience once tallied, even below the minimum-cast threshold (as AfterClose does)', () => {
        for (const Status of ['Tallied', 'Certified'] as const) {
          const live = ResultsVisible({ ...baseParams, Timing: 'Live', Status, Audience: 'Eligible', ViewerIsEligible: true, BallotCount: 1, MinCast: 5 });
          const afterClose = ResultsVisible({ ...baseParams, Timing: 'AfterClose', Status, Audience: 'Eligible', ViewerIsEligible: true, BallotCount: 1, MinCast: 5 });
          expect(live).toMatchObject({ Visible: true, RunningResults: false });
          expect(live.Visible).toBe(afterClose.Visible);
        }
      });

      it('still applies the audience to the final result', () => {
        const result = ResultsVisible({ ...baseParams, Timing: 'Live', Status: 'Tallied', Audience: 'Administrators', ViewerIsAdministrator: false, BallotCount: 10 });
        expect(result.Visible).toBe(false);
      });
    });

    describe('AdministratorsOnly timing', () => {
      it('should show to admins while voting is open', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AdministratorsOnly',
          Status: 'Open',
          ViewerIsAdministrator: true,
          BallotCount: 5,
        });
        expect(result.Visible).toBe(true);
        expect(result.RunningResults).toBe(true);
      });

      it('should hide from non-admins while voting is open', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AdministratorsOnly',
          Status: 'Open',
          ViewerIsAdministrator: false,
        });
        expect(result.Visible).toBe(false);
      });

      it('should show to everyone after Tallied', () => {
        const result = ResultsVisible({
          ...baseParams,
          Timing: 'AdministratorsOnly',
          Status: 'Tallied',
          ViewerIsAdministrator: false,
        });
        expect(result.Visible).toBe(true);
      });
    });

    describe('Audience rules', () => {
      it('should restrict to Voters/Eligible for Eligible audience', () => {
        const result = ResultsVisible({
          ...baseParams,
          Status: 'Tallied',
          Audience: 'Eligible',
          ViewerIsEligible: false,
        });
        expect(result.Visible).toBe(false);
      });

      it('should restrict to HostMembers', () => {
        const result = ResultsVisible({
          ...baseParams,
          Status: 'Tallied',
          Audience: 'HostMembers',
          ViewerIsHostMember: false,
        });
        expect(result.Visible).toBe(false);
      });

      it('should allow Public audience to everyone', () => {
        const result = ResultsVisible({
          ...baseParams,
          Status: 'Tallied',
          Audience: 'Public',
        });
        expect(result.Visible).toBe(true);
      });

      it('should restrict Administrators to admins only', () => {
        const result = ResultsVisible({
          ...baseParams,
          Status: 'Tallied',
          Audience: 'Administrators',
          ViewerIsAdministrator: false,
        });
        expect(result.Visible).toBe(false);
      });
    });
  });

  describe('PollBookVisible', () => {
    it('should always allow admins to see poll book', () => {
      const result = PollBookVisible({
        ...baseParams,
        ViewerIsAdministrator: true,
      });
      expect(result.Visible).toBe(true);
    });

    it('should allow poll book in Open mode to authorized audience', () => {
      const result = PollBookVisible({
        ...baseParams,
        SecrecyMode: 'Open',
        Audience: 'Voters',
        ViewerIsEligible: true,
      });
      expect(result.Visible).toBe(true);
    });

    it('should deny poll book to audiences that see live results', () => {
      const result = PollBookVisible({
        ...baseParams,
        Timing: 'Live',
        Status: 'Open',
        SecrecyMode: 'Secret',
        Audience: 'Public',
      });
      expect(result.Visible).toBe(false);
      expect(result.Reason).toContain('ballot secrecy');
    });

    it('should deny poll book in general case', () => {
      const result = PollBookVisible({
        ...baseParams,
        SecrecyMode: 'Secret',
        ViewerIsAdministrator: false,
      });
      expect(result.Visible).toBe(false);
    });
  });

  describe('FirstPreferencesOnly', () => {
    it('should keep selections without rank', () => {
      const ballots: TallyBallot[] = [
        {
          Weight: 1,
          Abstain: false,
          Selections: [{ OptionID: 'opt1' }],
        },
      ];
      const filtered = FirstPreferencesOnly(ballots);
      expect(filtered[0].Selections).toHaveLength(1);
      expect(filtered[0].Selections[0].OptionID).toBe('opt1');
    });

    it('should keep only rank 1 selections', () => {
      const ballots: TallyBallot[] = [
        {
          Weight: 1,
          Abstain: false,
          Selections: [
            { OptionID: 'opt1', Rank: 1 },
            { OptionID: 'opt2', Rank: 2 },
            { OptionID: 'opt3', Rank: 3 },
          ],
        },
      ];
      const filtered = FirstPreferencesOnly(ballots);
      expect(filtered[0].Selections).toHaveLength(1);
      expect(filtered[0].Selections[0].OptionID).toBe('opt1');
    });

    it('should preserve weight and abstain status', () => {
      const ballots: TallyBallot[] = [
        {
          Weight: 2.5,
          Abstain: true,
          Selections: [{ OptionID: 'opt1', Rank: 1 }],
        },
      ];
      const filtered = FirstPreferencesOnly(ballots);
      expect(filtered[0].Weight).toBe(2.5);
      expect(filtered[0].Abstain).toBe(true);
    });

    it('should handle multiple ballots', () => {
      const ballots: TallyBallot[] = [
        {
          Weight: 1,
          Abstain: false,
          Selections: [
            { OptionID: 'opt1', Rank: 1 },
            { OptionID: 'opt2', Rank: 2 },
          ],
        },
        {
          Weight: 1,
          Abstain: false,
          Selections: [
            { OptionID: 'opt3', Rank: 1 },
            { OptionID: 'opt1', Rank: 2 },
          ],
        },
      ];
      const filtered = FirstPreferencesOnly(ballots);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].Selections).toHaveLength(1);
      expect(filtered[1].Selections).toHaveLength(1);
      expect(filtered[0].Selections[0].OptionID).toBe('opt1');
      expect(filtered[1].Selections[0].OptionID).toBe('opt3');
    });

    it('should handle empty ballots', () => {
      const ballots: TallyBallot[] = [
        {
          Weight: 1,
          Abstain: true,
          Selections: [],
        },
      ];
      const filtered = FirstPreferencesOnly(ballots);
      expect(filtered[0].Selections).toHaveLength(0);
    });
  });
});

describe('ResultsVisible — final results for administrators', () => {
  const base = {
    Timing: 'AfterClose' as const, Audience: 'Voters' as const, ViewerHasVoted: false, ViewerIsEligible: false,
    ViewerIsHostMember: false, BallotCount: 10, MinCast: 5, SecrecyMode: 'Secret' as const,
  };
  it('shows final results to an administrator who is not on the roll', () => {
    const r = ResultsVisible({ ...base, Status: 'Tallied', ViewerIsAdministrator: true });
    expect(r.Visible).toBe(true);
    expect(r.RunningResults).toBe(false);
  });
  it('still hides results from an administrator before the tally', () => {
    expect(ResultsVisible({ ...base, Status: 'Closed', ViewerIsAdministrator: true }).Visible).toBe(false);
    expect(ResultsVisible({ ...base, Status: 'Open', ViewerIsAdministrator: true }).Visible).toBe(false);
  });
  it('does not widen the audience for non-administrators', () => {
    expect(ResultsVisible({ ...base, Status: 'Certified', ViewerIsAdministrator: false }).Visible).toBe(false);
  });
});

