/**
 * Tests for eligibility filtering and contest applicability.
 */

import { describe, it, expect } from 'vitest';
import { ContestAppliesToVoter, FilterBallotStyleForVoter } from '../eligibility.js';
import type { BallotStyle } from '../types.js';

describe('eligibility.ts', () => {
  describe('ContestAppliesToVoter', () => {
    it('should allow contest with no filter', () => {
      expect(ContestAppliesToVoter(null, 'Member')).toBe(true);
      expect(ContestAppliesToVoter(undefined, 'Member')).toBe(true);
      expect(ContestAppliesToVoter('', 'Member')).toBe(true);
    });

    it('should allow matching voting class (case-insensitive)', () => {
      expect(ContestAppliesToVoter('Member', 'Member')).toBe(true);
      expect(ContestAppliesToVoter('member', 'MEMBER')).toBe(true);
      expect(ContestAppliesToVoter('MEMBER', 'member')).toBe(true);
    });

    it('should reject non-matching voting class', () => {
      expect(ContestAppliesToVoter('Member', 'Director')).toBe(false);
      expect(ContestAppliesToVoter('Class A', 'Class B')).toBe(false);
    });

    it('should reject filter when voter has no class', () => {
      expect(ContestAppliesToVoter('Member', null)).toBe(false);
      expect(ContestAppliesToVoter('Member', undefined)).toBe(false);
    });

    it('should allow filter when voter has no class if filter is empty', () => {
      expect(ContestAppliesToVoter(null, null)).toBe(true);
      expect(ContestAppliesToVoter('', null)).toBe(true);
    });

    it('should reject empty voter class with non-empty filter', () => {
      expect(ContestAppliesToVoter('Member', '')).toBe(false);
    });
  });

  describe('FilterBallotStyleForVoter', () => {
    const sampleStyle: BallotStyle = {
      ElectionID: 'election-1',
      ElectionName: 'Annual Meeting',
      SecrecyMode: 'Secret',
      AllowRevote: false,
      Language: 'en',
      Hash: 'hash123',
      Contests: [
        {
          ContestID: 'president',
          Name: 'President',
          Kind: 'Office',
          Seats: 1,
          IsRanked: false,
          AllowAbstain: true,
          AllowWriteIn: false,
          MinSelections: 1,
          MaxSelections: 1,
          Options: [{ OptionID: 'alice', Label: 'Alice' }],
        },
        {
          ContestID: 'board',
          Name: 'Board Member',
          Kind: 'Office',
          Seats: 3,
          IsRanked: false,
          AllowAbstain: true,
          AllowWriteIn: false,
          MinSelections: 1,
          MaxSelections: 3,
          Options: [{ OptionID: 'bob', Label: 'Bob' }],
        },
        {
          ContestID: 'motion',
          Name: 'Motion to Amend Bylaws',
          Kind: 'Motion',
          Seats: 1,
          IsRanked: false,
          AllowAbstain: true,
          AllowWriteIn: false,
          MinSelections: 1,
          MaxSelections: 1,
          Options: [{ OptionID: 'yes', Label: 'Yes' }],
        },
      ],
    };

    it('should include all contests when voter class is not filtered', () => {
      const filters = {};
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.Contests).toHaveLength(3);
    });

    it('should exclude contest with non-matching filter', () => {
      const filters = {
        president: 'Director',
        board: 'Member',
        motion: null,
      };
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.Contests).toHaveLength(2);
      expect(filtered.Contests.map(c => c.ContestID)).not.toContain('president');
      expect(filtered.Contests.map(c => c.ContestID)).toContain('board');
      expect(filtered.Contests.map(c => c.ContestID)).toContain('motion');
    });

    it('should preserve election metadata', () => {
      const filters = {};
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.ElectionID).toBe(sampleStyle.ElectionID);
      expect(filtered.ElectionName).toBe(sampleStyle.ElectionName);
      expect(filtered.Hash).toBe(sampleStyle.Hash);
    });

    it('should handle case-insensitive matching', () => {
      const filters = {
        president: 'MEMBER',
        board: 'director',
        motion: null,
      };
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.Contests).toHaveLength(2);
      expect(filtered.Contests.map(c => c.ContestID)).toContain('president');
      expect(filtered.Contests.map(c => c.ContestID)).not.toContain('board');
    });

    it('should handle null voter class with matching null filter', () => {
      const filters = {
        president: null,
        board: 'Member',
        motion: null,
      };
      const filtered = FilterBallotStyleForVoter(sampleStyle, null, filters);
      expect(filtered.Contests).toHaveLength(2);
      expect(filtered.Contests.map(c => c.ContestID)).toContain('president');
      expect(filtered.Contests.map(c => c.ContestID)).not.toContain('board');
    });

    it('should include contests with no filter entry', () => {
      const filters = {
        president: 'Director',
        // board: missing
        // motion: missing
      };
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.Contests).toHaveLength(2);
      expect(filtered.Contests.map(c => c.ContestID)).toContain('board');
      expect(filtered.Contests.map(c => c.ContestID)).toContain('motion');
    });

    it('should return ballot style with filtered contests array', () => {
      const filters = {
        motion: 'Director',
      };
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.Contests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ContestID: 'president' }),
          expect.objectContaining({ ContestID: 'board' }),
        ])
      );
      expect(filtered.Contests).not.toContainEqual(
        expect.objectContaining({ ContestID: 'motion' })
      );
    });

    it('should handle empty ballot', () => {
      const emptyStyle: BallotStyle = {
        ...sampleStyle,
        Contests: [],
      };
      const filtered = FilterBallotStyleForVoter(emptyStyle, 'Member', {});
      expect(filtered.Contests).toHaveLength(0);
    });

    it('should filter out all contests if all have non-matching filters', () => {
      const filters = {
        president: 'Director',
        board: 'Admin',
        motion: 'Officer',
      };
      const filtered = FilterBallotStyleForVoter(sampleStyle, 'Member', filters);
      expect(filtered.Contests).toHaveLength(0);
    });
  });
});
