/**
 * Shared vocabulary of BizApps Voting: the ballot style a voter is shown, what a voter submits,
 * and the inputs and outputs of the tally methods.
 *
 * Everything under `contracts/` is pure TypeScript with no imports outside this folder, so the
 * server, the tests, the admin UI and the MJ-core-free `<mj-ballot>` widget share one
 * implementation (import it from `@mj-biz-apps/voting-entities/contracts`).
 */

export type SecrecyMode = 'Open' | 'Confidential' | 'Secret';
export type AssuranceTier = 'Standard' | 'HighAssurance' | 'Verifiable';
export type ElectionStatus = 'Draft' | 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Tallied' | 'Certified' | 'Cancelled';
export type ResultsTiming = 'AfterClose' | 'AfterVoting' | 'Live' | 'AdministratorsOnly';
export type ResultsAudience = 'Voters' | 'Eligible' | 'HostMembers' | 'Public' | 'Administrators';
export type ContestKind = 'Motion' | 'Office' | 'Question' | 'Amendment' | 'StandardsItem';
export type ThresholdKind = 'None' | 'Majority' | 'ThreeFifths' | 'TwoThirds' | 'ThreeQuarters' | 'Unanimous' | 'Custom';
export type ThresholdBasis = 'VotesCast' | 'Eligible';
export type TieBreakMethod = 'Lot' | 'Administrator';
export type ParticipationChannel = 'Online' | 'Paper' | 'Proxy' | 'InPerson';
export type CommentType = 'General' | 'Technical' | 'Editorial';

// ---------------------------------------------------------------------------------------------
// Ballot style: what the voter is shown. Built on the server, rendered by the widget.
// ---------------------------------------------------------------------------------------------

export interface BallotStyle {
    ElectionID: string;
    ElectionName: string;
    Description?: string;
    /** ISO 8601 close time, for display. */
    ClosesAt?: string;
    SecrecyMode: SecrecyMode;
    AllowRevote: boolean;
    Language: string;
    Contests: BallotStyleContest[];
    /** Hash of everything above (see ComputeBallotStyleHash); stored with every cast ballot. */
    Hash: string;
}

export interface BallotStyleContest {
    ContestID: string;
    Name: string;
    Description?: string;
    Kind: ContestKind;
    Seats: number;
    IsRanked: boolean;
    AllowAbstain: boolean;
    AllowWriteIn: boolean;
    MinSelections: number;
    MaxSelections: number;
    /** Options that require a comment when selected (a standards ballot's Disapprove). */
    RequireCommentOnOptionIDs?: string[];
    Options: BallotStyleOption[];
}

export interface BallotStyleOption {
    OptionID: string;
    Label: string;
    Description?: string;
    PhotoUrl?: string;
    StatementUrl?: string;
    IsWriteIn: boolean;
}

// ---------------------------------------------------------------------------------------------
// Submission: what the voter sends, and what is stored (encrypted) in CastBallot.Selections.
// ---------------------------------------------------------------------------------------------

export interface BallotSubmission {
    Contests: ContestSubmission[];
}

export interface ContestSubmission {
    ContestID: string;
    Abstain?: boolean;
    Selections: OptionSelection[];
    /** Standards ballots only (Open mode). Never stored on the ballot; written as BallotComment rows. */
    Comments?: SubmittedComment[];
}

export interface OptionSelection {
    OptionID: string;
    /** Ranked contests: 1 = first preference. */
    Rank?: number;
    /** Write-ins: the text written against the write-in option. */
    WriteInText?: string;
}

export interface SubmittedComment {
    CommentType: CommentType;
    DocumentReference?: string;
    Comment: string;
    ProposedChange?: string;
}

export interface ValidationIssue {
    ContestID?: string;
    /** Stable machine code, for example 'TooManySelections'. */
    Code: string;
    Message: string;
}

// ---------------------------------------------------------------------------------------------
// Tally
// ---------------------------------------------------------------------------------------------

/** One counted ballot's choices in one contest. */
export interface TallyBallot {
    /** The representative weight of the voter's weight class (1 for one-person-one-vote). */
    Weight: number;
    Abstain: boolean;
    Selections: OptionSelection[];
}

export interface TallyContestInput {
    ContestID: string;
    Seats: number;
    /** Option IDs in ballot order. For Motion/Question/Amendment the FIRST is the affirmative (Yes). */
    OptionIDs: string[];
    Kind: ContestKind;
    Threshold: ThresholdKind;
    /** Fraction in (0, 1] when Threshold is 'Custom'. */
    CustomThreshold?: number;
    ThresholdBasis: ThresholdBasis;
    /** Total weight of voters eligible for this contest (denominator when ThresholdBasis is 'Eligible'). */
    EligibleWeight: number;
    Ballots: TallyBallot[];
    /** Recorded seed for ties broken by lot; same seed, same result. */
    TieBreakSeed: string;
}

export interface TallyRound {
    Round: number;
    /** Weighted votes per option at the start of the round. */
    Tallies: Record<string, number>;
    Elected: string[];
    Excluded: string[];
    /** Votes moved to each option during the round (ranked methods). */
    Transfers?: Record<string, number>;
    /** Votes that could not transfer (no further preference). */
    Exhausted?: number;
    Note?: string;
}

export type TallyOptionOutcome = 'Elected' | 'Defeated' | 'Excluded' | 'Tied' | 'Counted';
export type TallyContestOutcome = 'Passed' | 'Failed' | 'Decided' | 'Tied' | 'Void';

export interface TallyOptionResult {
    OptionID: string;
    /** Weighted votes (final round for ranked methods). */
    Votes: number;
    /** Finishing position, 1-based. */
    Position: number;
    Outcome: TallyOptionOutcome;
}

export interface TallyOutcome {
    Outcome: TallyContestOutcome;
    /** Weighted votes cast, excluding abstentions. */
    VotesCast: number;
    /** Weighted abstentions. */
    Abstentions: number;
    Options: TallyOptionResult[];
    Rounds: TallyRound[];
    /** True when a tie was broken by lot from TieBreakSeed. */
    TieBroken: boolean;
    Notes: string[];
}

/** A counting rule. Implementations are pure and deterministic. */
export abstract class BaseTallyMethodContract {
    /** Matches TallyMethod.Code. */
    public abstract readonly Code: string;
    public abstract Tally(input: TallyContestInput): TallyOutcome;
}
