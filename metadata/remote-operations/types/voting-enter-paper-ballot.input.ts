/**
 * Input for `Voting.EnterPaperBallot`.
 *
 * NO import statements — definitions are emitted verbatim.
 */

export interface VotingOptionSelection {
  OptionID: string;
  Rank?: number;
  WriteInText?: string;
}

export interface VotingContestSubmission {
  ContestID: string;
  Abstain?: boolean;
  Selections: VotingOptionSelection[];
}

export interface VotingBallotSubmission {
  Contests: VotingContestSubmission[];
}

export interface VotingEnterPaperBallotInput {
  /** The election. */
  ElectionID: string;
  /** Control number or ballot identifier for paper ballots. */
  ControlNumber: string;
  /** The ballot submission. */
  Submission: VotingBallotSubmission;
  /** The channel: 'Paper', 'Proxy', or 'InPerson'. */
  Channel: 'Paper' | 'Proxy' | 'InPerson';
  /** Required when Channel is 'Proxy': the Accepted proxy designation of the voter the control number belongs to. It is marked Used. */
  ProxyDesignationID?: string;
}
