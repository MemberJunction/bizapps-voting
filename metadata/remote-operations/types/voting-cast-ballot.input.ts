/**
 * Input for `Voting.CastBallot`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingOptionSelection {
  OptionID: string;
  Rank?: number;
  WriteInText?: string;
}

export interface VotingSubmittedComment {
  CommentType: 'General' | 'Technical' | 'Editorial';
  DocumentReference?: string;
  Comment: string;
  ProposedChange?: string;
}

export interface VotingContestSubmission {
  ContestID: string;
  Abstain?: boolean;
  Selections: VotingOptionSelection[];
  Comments?: VotingSubmittedComment[];
}

export interface VotingBallotSubmission {
  Contests: VotingContestSubmission[];
}

export interface VotingCastBallotInput {
  /** The election being voted in. */
  ElectionID: string;
  /** The ballot style hash from GetMyBallot; allows detection of style changes between preview and submission. */
  BallotStyleHash: string;
  /** The voter's submission: contests and selections. */
  Submission: VotingBallotSubmission;
}
