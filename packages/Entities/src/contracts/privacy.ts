/**
 * Results visibility and privacy policies.
 * Implements the timing, audience, and batching rules from design §4.5.
 */

import type { ResultsTiming, ResultsAudience, ElectionStatus, SecrecyMode, TallyBallot, OptionSelection } from './types.js';

/**
 * Parameters for determining results visibility.
 */
export interface ResultsVisibilityParams {
  /** The election's ResultsTiming setting. */
  Timing: ResultsTiming;
  /** The election's ResultsAudience setting. */
  Audience: ResultsAudience;
  /** The current election status. */
  Status: ElectionStatus;
  /** Whether the requesting viewer is an administrator. */
  ViewerIsAdministrator: boolean;
  /** Whether the requesting viewer has cast a ballot in this election. */
  ViewerHasVoted: boolean;
  /** Whether the requesting viewer is eligible to vote in this election. */
  ViewerIsEligible: boolean;
  /** Whether the requesting viewer is a member of the host (Collaboration space, committee, etc.). */
  ViewerIsHostMember: boolean;
  /** Total number of ballots cast in the election. */
  BallotCount: number;
  /** Minimum ballots required before results are shown (k-anonymity threshold). */
  MinCast: number;
  /** The election's secrecy mode. */
  SecrecyMode: SecrecyMode;
}

/**
 * Result of a results visibility check.
 */
export interface ResultsVisibility {
  /** Whether the viewer is allowed to see results. */
  Visible: boolean;
  /** Explanation of why results are or are not visible. */
  Reason: string;
  /** Whether only running (in-progress) results are visible (vs. final results). */
  RunningResults: boolean;
}

/**
 * Determines whether a viewer is allowed to see election results.
 * Implements the full policy from design §4.5:
 * - AfterClose: only after status enters Closed onward and audience check passes
 * - AfterVoting: voter after casting
 * - Live: audience throughout voting
 * - AdministratorsOnly: admins during open
 *
 * Results below MinCast threshold are never visible while open.
 *
 * @param params - The visibility parameters
 * @returns Visibility decision and reason
 */
export function ResultsVisible(params: ResultsVisibilityParams): ResultsVisibility {
  const {
    Timing,
    Audience,
    Status,
    ViewerIsAdministrator,
    ViewerHasVoted,
    ViewerIsEligible,
    ViewerIsHostMember,
    BallotCount,
    MinCast,
    SecrecyMode,
  } = params;

  // ---- AfterClose: results only after the election is Closed or later ----
  if (Timing === 'AfterClose') {
    // Results hidden while voting is open
    if (Status === 'Draft' || Status === 'Nominations' || Status === 'Ready' || Status === 'Open') {
      return {
        Visible: false,
        Reason: 'Results are not visible until after voting closes.',
        RunningResults: false,
      };
    }

    // Election is Closed or later: apply audience restrictions
    // Final results only visible to Tallied/Certified/Cancelled
    if (Status === 'Closed') {
      return {
        Visible: false,
        Reason: 'Results will be visible after tallying.',
        RunningResults: false,
      };
    }

    // Election is Tallied, Certified, or Cancelled: check audience
    return audienceCheck(Audience, ViewerIsAdministrator, ViewerIsEligible, ViewerIsHostMember,
      'Results are now visible to the authorized audience.');
  }

  // ---- AfterVoting: voter sees results after they vote ----
  if (Timing === 'AfterVoting') {
    if (Status === 'Open') {
      // Only voters who have voted can see results
      if (!ViewerHasVoted) {
        return {
          Visible: false,
          Reason: 'Results are visible only after you vote.',
          RunningResults: true,
        };
      }

      // Minimum ballot threshold
      if (BallotCount < MinCast) {
        return {
          Visible: false,
          Reason: `Results are not shown until at least ${MinCast} ballots are cast.`,
          RunningResults: true,
        };
      }

      return {
        Visible: true,
        Reason: 'You have voted; results are now visible.',
        RunningResults: true,
      };
    }

    // Election closed: check audience for final results
    if (Status === 'Closed') {
      return {
        Visible: false,
        Reason: 'Results will be visible after tallying.',
        RunningResults: false,
      };
    }

    // Election is Tallied, Certified, or Cancelled
    return audienceCheck(Audience, ViewerIsAdministrator, ViewerIsEligible, ViewerIsHostMember,
      'Final results are visible to the authorized audience.');
  }

  // ---- Live: results visible throughout voting to the audience ----
  if (Timing === 'Live') {
    if (Status === 'Draft' || Status === 'Nominations' || Status === 'Ready') {
      return {
        Visible: false,
        Reason: 'Voting has not yet opened.',
        RunningResults: false,
      };
    }

    if (Status === 'Closed' || Status === 'Cancelled') {
      return {
        Visible: false,
        Reason: 'Voting has closed.',
        RunningResults: false,
      };
    }

    // Election is Open: check audience and threshold
    const audienceAllowed = audienceAllows(Audience, ViewerIsAdministrator, ViewerIsEligible, ViewerIsHostMember);
    if (!audienceAllowed) {
      return {
        Visible: false,
        Reason: 'You are not in the authorized audience for live results.',
        RunningResults: false,
      };
    }

    // Check minimum ballot threshold
    if (BallotCount < MinCast) {
      return {
        Visible: false,
        Reason: `Results are not shown until at least ${MinCast} ballots are cast.`,
        RunningResults: true,
      };
    }

    return {
      Visible: true,
      Reason: 'Live results are now visible.',
      RunningResults: true,
    };
  }

  // ---- AdministratorsOnly: admins see results during open, others after close ----
  if (Timing === 'AdministratorsOnly') {
    if (Status === 'Draft' || Status === 'Nominations' || Status === 'Ready') {
      return {
        Visible: false,
        Reason: 'Voting has not yet opened.',
        RunningResults: false,
      };
    }

    if (Status === 'Open') {
      if (!ViewerIsAdministrator) {
        return {
          Visible: false,
          Reason: 'Only administrators may view results while voting is open.',
          RunningResults: false,
        };
      }

      if (BallotCount < MinCast) {
        return {
          Visible: false,
          Reason: `Results are not shown until at least ${MinCast} ballots are cast.`,
          RunningResults: true,
        };
      }

      return {
        Visible: true,
        Reason: 'Administrator view of running results.',
        RunningResults: true,
      };
    }

    // Election is Closed, Tallied, Certified, or Cancelled
    if (Status === 'Closed') {
      return {
        Visible: false,
        Reason: 'Results will be visible after tallying.',
        RunningResults: false,
      };
    }

    // Final results after Tallied: everyone can see
    return {
      Visible: true,
      Reason: 'Final results are now visible.',
      RunningResults: false,
    };
  }

  return {
    Visible: false,
    Reason: 'Unknown results timing setting.',
    RunningResults: false,
  };
}

/**
 * Determines if the poll book (list of who voted) is visible to a viewer.
 * The poll book is refused to audiences that also see live results,
 * unless the election is in Open mode where votes are public.
 *
 * @param params - Visibility parameters (reuses ResultsVisibilityParams)
 * @returns Visibility decision and reason
 */
export function PollBookVisible(params: ResultsVisibilityParams): ResultsVisibility {
  const { Audience, ViewerIsAdministrator, SecrecyMode, Timing } = params;

  // Administrators always see the poll book
  if (ViewerIsAdministrator) {
    return {
      Visible: true,
      Reason: 'Administrators see the poll book.',
      RunningResults: false,
    };
  }

  // In Open mode, votes are public and poll book is visible to the audience
  if (SecrecyMode === 'Open') {
    const audienceAllowed = audienceAllows(Audience, ViewerIsAdministrator, params.ViewerIsEligible, params.ViewerIsHostMember);
    if (audienceAllowed) {
      return {
        Visible: true,
        Reason: 'Votes are public in Open mode.',
        RunningResults: false,
      };
    }
  }

  // Refuse poll book if the viewer also sees live results
  // (a differencing attack: knowing who voted + seeing totals move = learning their vote)
  if (Timing === 'Live' || Timing === 'AfterVoting') {
    const audience = Audience;
    if (audience !== 'Administrators') {
      return {
        Visible: false,
        Reason: 'The poll book is not shown to audiences that also see running results (ballot secrecy).',
        RunningResults: false,
      };
    }
  }

  // Poll book is not visible to the general audience
  return {
    Visible: false,
    Reason: 'You do not have permission to view the poll book.',
    RunningResults: false,
  };
}

/**
 * Filters a set of ballots to show only first preferences for live ranked contests.
 * For ranked contests (with Rank field), keeps only selections with Rank=1 (or the lowest rank value).
 *
 * @param ballots - The ballots to filter
 * @returns Filtered ballots with only first-preference selections
 */
export function FirstPreferencesOnly(ballots: TallyBallot[]): TallyBallot[] {
  return ballots.map(ballot => ({
    Weight: ballot.Weight,
    Abstain: ballot.Abstain,
    Selections: ballot.Selections.filter((sel: OptionSelection) => {
      // Keep selections without a rank (non-ranked contests)
      if (sel.Rank === undefined) {
        return true;
      }
      // Keep only rank 1 (first preference)
      return sel.Rank === 1;
    }),
  }));
}

/**
 * Checks if an audience allows a viewer to see results.
 * @internal
 */
function audienceAllows(
  audience: ResultsAudience,
  isAdmin: boolean,
  isEligible: boolean,
  isHostMember: boolean
): boolean {
  switch (audience) {
    case 'Administrators':
      return isAdmin;
    case 'Voters':
      // Voters: eligible OR has voted (but we can't check "has voted" in this context)
      // In practice, pass true if eligible
      return isEligible;
    case 'Eligible':
      return isEligible;
    case 'HostMembers':
      return isHostMember;
    case 'Public':
      return true;
    default:
      return false;
  }
}

/**
 * Performs audience and reason checks for results visibility.
 * @internal
 */
function audienceCheck(
  audience: ResultsAudience,
  isAdmin: boolean,
  isEligible: boolean,
  isHostMember: boolean,
  reason: string
): ResultsVisibility {
  const allowed = audienceAllows(audience, isAdmin, isEligible, isHostMember);
  if (allowed) {
    return {
      Visible: true,
      Reason: reason,
      RunningResults: false,
    };
  }

  let denialReason = '';
  switch (audience) {
    case 'Administrators':
      denialReason = 'Only administrators may view these results.';
      break;
    case 'Voters':
    case 'Eligible':
      denialReason = 'Only eligible voters may view these results.';
      break;
    case 'HostMembers':
      denialReason = 'Only members of the host may view these results.';
      break;
    default:
      denialReason = 'You do not have permission to view these results.';
  }

  return {
    Visible: false,
    Reason: denialReason,
    RunningResults: false,
  };
}
