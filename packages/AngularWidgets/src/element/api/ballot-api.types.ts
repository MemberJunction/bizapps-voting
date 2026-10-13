/**
 * Wire types for the `<mj-ballot>` element: the Voting remote-operation inputs/outputs and the public edge bodies.
 *
 * The element is MJ-core-free, so it cannot import the generated `remote_operations.ts`. These are structural copies of the
 * generated interfaces; `__tests__/ballot-api.types.test.ts` type-checks them against the generated ones in both directions,
 * so a drift fails `pnpm test`. The ballot style and submission come from the pure contracts subpath.
 */
import type { BallotStyle, BallotSubmission } from '@mj-biz-apps/voting-entities/contracts';

/** Every operation output carries these. `Success: false` means a handled refusal; `Message` is safe to show the voter. */
export interface OperationOutputBase {
  Success: boolean;
  Message?: string;
}

// ---- Voting.GetMyBallot ----
export interface VotingGetMyBallotInput {
  ElectionID: string;
  Language?: string;
}

export interface VotingGetMyBallotOutput extends OperationOutputBase {
  Style?: BallotStyle;
  HasVoted?: boolean;
  CanRevote?: boolean;
  ReceiptCode?: string | null;
}

// ---- Voting.CastBallot ----
export interface VotingCastBallotInput {
  ElectionID: string;
  Language?: string;
  BallotStyleHash: string;
  Submission: BallotSubmission;
}

export interface VotingCastBallotOutput extends OperationOutputBase {
  ReceiptCode?: string;
}

// ---- Voting.GetResults ----
export interface VotingGetResultsInput {
  ElectionID: string;
}

export type VotingTallyContestOutcome = 'Passed' | 'Failed' | 'Decided' | 'Tied' | 'Void' | 'NoQuorum' | 'Running';
export type VotingTallyOptionOutcome = 'Elected' | 'Defeated' | 'Excluded' | 'Tied' | 'Counted';

export interface VotingTallyRound {
  Round: number;
  Tallies: Record<string, number>;
  Elected: string[];
  Excluded: string[];
  Transfers?: Record<string, number>;
  Exhausted?: number;
  Note?: string;
}

export interface VotingTallyOptionResult {
  OptionID: string;
  Votes: number;
  Position: number;
  Outcome: VotingTallyOptionOutcome;
}

export interface VotingContestOutcome {
  ContestID: string;
  Outcome: VotingTallyContestOutcome;
  VotesCast: number;
  Abstentions: number;
  Options: VotingTallyOptionResult[];
  Rounds?: VotingTallyRound[];
  TieBroken?: boolean;
  Notes?: string[];
}

export interface VotingGetResultsOutput extends OperationOutputBase {
  Visible?: boolean;
  Reason?: string;
  IsFinal?: boolean;
  IsRunning?: boolean;
  SnapshotAt?: string;
  BallotCount?: number;
  Contests?: VotingContestOutcome[];
}

// ---- Voting.GetMyParticipation ----
export interface VotingGetMyParticipationInput {
  ElectionID: string;
}

export type VotingParticipationChannel = 'Online' | 'Paper' | 'Proxy' | 'InPerson';

export interface VotingGetMyParticipationOutput extends OperationOutputBase {
  HasVoted?: boolean;
  Channel?: VotingParticipationChannel;
}

// ---- Public edge ----
/** GET {apiRoot}/{slug}/info */
export interface DistributionInfo {
  ElectionName: string;
  AllowedMethods: string[];
  Theme: Record<string, unknown> | null;
  DefaultLanguage: string;
}

/** The credential bodies the edge accepts (only these fields are read; anything else is ignored server-side). */
export interface SessionCredential {
  Token?: string;
  Assertion?: string;
  SecondFactor?: { SourceKey: string; Pin: string };
}

/** POST {apiRoot}/session */
export interface SessionInitRequest {
  Slug: string;
  MethodCode: string;
  Credential: SessionCredential;
}

export interface SessionInitResponse {
  Token: string;
  ExpiresAt: string;
  ElectionID: string;
}
