/**
 * The ballot widget's server conversation, free of Angular so it can be tested end to end with a mocked `fetch`:
 * /info -> /session -> Voting.GetMyBallot -> Voting.CastBallot -> Voting.GetResults, and Voting.VerifyReceipt.
 */
import type {
  BallotStyle,
  BallotStyleContest,
  BallotSubmission,
  CommentType,
  OptionSelection,
  SubmittedComment,
} from '@mj-biz-apps/voting-entities/contracts';
import {
  BallotApiClient,
  BallotApiError,
  GENERIC_ERROR_MESSAGE,
  createBallotSession,
  fetchDistributionInfo,
} from './ballot-api.client';
import type {
  DistributionInfo,
  SessionCredential,
  VotingGetMyBallotOutput,
  VotingGetResultsOutput,
} from './ballot-api.types';

export interface BallotFlowConfig {
  apiRoot: string;
  /** The `graphql-url` attribute, when set. */
  graphqlUrl?: string;
}

/**
 * Where the operations go, in order: the `graphql-url` attribute, the info endpoint's GraphQLUrl, then `{origin}/` (MJ's default graphqlRootPath is `/`).
 * Never `{apiRoot}/graphql`: the edge root is not MJ's GraphQL endpoint.
 */
export function ResolveGraphqlUrl(attribute: string | undefined, info: DistributionInfo | undefined, origin: string): string {
  return attribute?.trim() || info?.GraphQLUrl?.trim() || `${origin}/`;
}

function currentOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : '';
}

/** What to show after GetMyBallot. */
export type MyBallotView =
  | { Kind: 'vote'; Style: BallotStyle; PreviousReceiptCode?: string }
  | { Kind: 'voted'; ReceiptCode?: string; Style?: BallotStyle };

/**
 * Decide the view from the full GetMyBallot output.
 * - HasVoted and not CanRevote: the "already voted" state, with the receipt when present.
 * - Otherwise a ballot is needed: Style must be present (a revoting voter sees the ballot again).
 */
export function classifyMyBallot(output: VotingGetMyBallotOutput): MyBallotView {
  if (output.HasVoted && !output.CanRevote) {
    return { Kind: 'voted', ReceiptCode: output.ReceiptCode ?? undefined, Style: output.Style };
  }
  if (!output.Style) {
    throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
  }
  return {
    Kind: 'vote',
    Style: output.Style,
    PreviousReceiptCode: output.HasVoted ? (output.ReceiptCode ?? undefined) : undefined,
  };
}

/** Explicit `language` attribute wins, then the distribution's default, then English. */
export function resolveLanguage(attribute: string | undefined, info: DistributionInfo | undefined): string {
  return attribute?.trim() || info?.DefaultLanguage?.trim() || 'en';
}

export interface ResultsView {
  Visible: boolean;
  IsRunning: boolean;
  IsFinal: boolean;
  Reason?: string;
  Output: VotingGetResultsOutput;
}

/** What checking a receipt found. */
export type ReceiptCheck = 'counted' | 'not-counted' | 'not-found';

/**
 * The receipt code as the voter typed or pasted it, ready to send: surrounding space removed, inner spaces dropped,
 * upper case. The server applies its own normalization; this only spares the voter a needless "not found". Empty when
 * nothing usable was typed.
 */
export function NormalizeReceiptInput(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Maps VerifyReceipt's answer to what the voter is told. A receipt that was found but is not counted was replaced by a later ballot. */
export function DescribeReceiptCheck(output: { Found?: boolean; Counted?: boolean }): ReceiptCheck {
  if (!output.Found) return 'not-found';
  return output.Counted ? 'counted' : 'not-counted';
}

export class BallotFlow {
  private client: BallotApiClient | null = null;
  private electionId = '';
  private info: DistributionInfo | undefined;

  constructor(
    private readonly config: BallotFlowConfig,
    private readonly slug: string,
  ) {}

  get ElectionID(): string {
    return this.electionId;
  }

  get Info(): DistributionInfo | undefined {
    return this.info;
  }

  async LoadInfo(): Promise<DistributionInfo> {
    this.info = await fetchDistributionInfo(this.config.apiRoot, this.slug);
    return this.info;
  }

  /** Exchange a credential for a session; afterwards the operations are available. */
  async SignIn(methodCode: string, credential: SessionCredential): Promise<void> {
    const session = await createBallotSession(this.config.apiRoot, {
      Slug: this.slug,
      MethodCode: methodCode,
      Credential: credential,
    });
    this.electionId = session.ElectionID;
    this.client = new BallotApiClient({
      apiRoot: this.config.apiRoot,
      graphqlUrl: ResolveGraphqlUrl(this.config.graphqlUrl, this.info, currentOrigin()),
      token: session.Token,
    });
  }

  async LoadMyBallot(language: string): Promise<MyBallotView> {
    return classifyMyBallot(await this.requireClient().getMyBallot(this.electionId, language));
  }

  /** Casts with the hash of the style the voter was shown, in the language they were shown it in. */
  async Cast(style: BallotStyle, submission: BallotSubmission, language: string): Promise<string | undefined> {
    const output = await this.requireClient().castBallot({
      ElectionID: this.electionId,
      BallotStyleHash: style.Hash,
      Submission: submission,
      Language: language,
    });
    return output.ReceiptCode;
  }

  /** Results the voter may see; a refusal or invisible results yield `Visible: false` rather than an error. */
  async LoadResults(): Promise<ResultsView> {
    const output = await this.requireClient().getResults(this.electionId);
    return {
      Visible: output.Visible === true,
      IsRunning: output.IsRunning === true,
      IsFinal: output.IsFinal === true,
      Reason: output.Reason,
      Output: output,
    };
  }

  /** Whether the session is open (VerifyReceipt, like every voter operation, needs one). */
  get SignedIn(): boolean {
    return this.client !== null;
  }

  /** Checks a receipt code against this election's ballot box: recorded and counted, recorded but replaced, or unknown. */
  async VerifyReceipt(receiptCode: string): Promise<ReceiptCheck> {
    const output = await this.requireClient().verifyReceipt(this.electionId, receiptCode);
    return DescribeReceiptCheck(output);
  }

  private requireClient(): BallotApiClient {
    if (!this.client) throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
    return this.client;
  }
}

/** What the voter has typed for one comment box. */
export interface CommentDraft {
  CommentType: CommentType;
  DocumentReference: string;
  Comment: string;
  ProposedChange: string;
}

/** Draft key for the optional general comment on a StandardsItem contest. */
export const GENERAL_COMMENT_KEY = '';

export function EmptyCommentDraft(): CommentDraft {
  return { CommentType: 'Technical', DocumentReference: '', Comment: '', ProposedChange: '' };
}

export function CommentDraftKey(contestId: string, optionKey: string): string {
  return `${contestId}|${optionKey}`;
}

/** Option IDs whose selection asks for a comment box (only those the voter has actually selected). */
export function RequiredCommentOptionIDs(contest: BallotStyleContest, selections: OptionSelection[]): string[] {
  const selected = new Set(selections.map((s) => s.OptionID));
  return (contest.RequireCommentOnOptionIDs ?? []).filter((id) => selected.has(id));
}

function toSubmittedComment(draft: CommentDraft): SubmittedComment | null {
  const comment = draft.Comment.trim();
  if (!comment) return null;
  const result: SubmittedComment = { CommentType: draft.CommentType, Comment: comment };
  const ref = draft.DocumentReference.trim();
  const change = draft.ProposedChange.trim();
  if (ref) result.DocumentReference = ref;
  if (change) result.ProposedChange = change;
  return result;
}

/**
 * The `Comments` for one contest's submission. A comment is included only when it has text and either its requiring option is
 * currently selected or it is the optional general comment of a StandardsItem contest. Empty boxes are never sent (the
 * contracts validator rejects blank comments). Always returns an array so the validator's CommentRequired check runs.
 */
export function BuildContestComments(
  contest: BallotStyleContest,
  selections: OptionSelection[],
  drafts: ReadonlyMap<string, CommentDraft>,
): SubmittedComment[] {
  const keys = RequiredCommentOptionIDs(contest, selections);
  if (contest.Kind === 'StandardsItem') keys.push(GENERAL_COMMENT_KEY);
  const comments: SubmittedComment[] = [];
  for (const key of keys) {
    const draft = drafts.get(CommentDraftKey(contest.ContestID, key));
    const mapped = draft ? toSubmittedComment(draft) : null;
    if (mapped) comments.push(mapped);
  }
  return comments;
}
