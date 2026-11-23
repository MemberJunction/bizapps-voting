/**
 * Eligibility filtering and contest applicability checks.
 * Determines which contests apply to a voter and how the ballot style is filtered.
 */

import type { BallotStyle } from './types.js';

/**
 * Determines if a contest applies to a voter based on voting class filters.
 * A null or empty filter applies to all voters.
 * A non-empty filter uses case-insensitive string equality.
 *
 * @param contestVotingClassFilter - The contest's voting class filter (from Contest.VotingClassFilter)
 * @param voterClass - The voter's class (from EligibleVoter.VotingClass)
 * @returns true if the contest applies to this voter, false otherwise
 */
export function ContestAppliesToVoter(
  contestVotingClassFilter: string | null | undefined,
  voterClass: string | null | undefined
): boolean {
  // No filter means the contest applies to everyone
  if (!contestVotingClassFilter) {
    return true;
  }

  // Both must be non-empty for a match check
  if (!voterClass) {
    return false;
  }

  // Case-insensitive equality
  return contestVotingClassFilter.toLowerCase() === voterClass.toLowerCase();
}

/**
 * Filters a ballot style to show only contests that apply to a voter.
 * Removes contests with voting class filters that don't match the voter's class.
 *
 * @param style - The full ballot style
 * @param voterClass - The voter's voting class
 * @param contestClassFilters - Map of contestID to voting class filter (from Contest.VotingClassFilter)
 * @returns Filtered ballot style with only applicable contests
 */
export function FilterBallotStyleForVoter(
  style: BallotStyle,
  voterClass: string | null | undefined,
  contestClassFilters: Record<string, string | null | undefined>
): BallotStyle {
  const filteredContests = style.Contests.filter(contest => {
    const filter = contestClassFilters[contest.ContestID];
    return ContestAppliesToVoter(filter, voterClass);
  });

  return {
    ...style,
    Contests: filteredContests,
  };
}
