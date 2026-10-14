/**
 * Tiny fetch-based API client for the ballot widget. No MemberJunction core dependencies.
 *
 * Two surfaces:
 * - the public edge (`GET {apiRoot}/{slug}/info`, `POST {apiRoot}/session`), unauthenticated;
 * - the voting operations, through MJ's generic `ExecuteRemoteOperation` GraphQL mutation with `Authorization: Bearer`.
 *
 * Errors: handled refusals (`Success: false` with a `Message`) surface as `BallotApiError` kind 'operation' (message safe
 * to show). Edge refusals carry the edge's fixed public text (kind 'edge'). Everything else (HTTP, GraphQL, framework
 * failures, malformed bodies) is kind 'transport' with a generic message; server detail is never shown.
 */

import type {
  DistributionInfo,
  OperationOutputBase,
  SessionInitRequest,
  SessionInitResponse,
  VotingCastBallotInput,
  VotingCastBallotOutput,
  VotingGetMyBallotInput,
  VotingGetMyBallotOutput,
  VotingGetMyParticipationInput,
  VotingGetMyParticipationOutput,
  VotingGetResultsInput,
  VotingGetResultsOutput,
  VotingVerifyReceiptInput,
  VotingVerifyReceiptOutput,
} from './ballot-api.types';

export * from './ballot-api.types';

/** Shown for every failure that is not a handled refusal. */
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const MAX_SAFE_MESSAGE = 300;

export type BallotApiErrorKind = 'operation' | 'edge' | 'transport';

export class BallotApiError extends Error {
  constructor(
    public readonly Kind: BallotApiErrorKind,
    message: string,
    public readonly Code?: string,
  ) {
    super(message);
    this.name = 'BallotApiError';
  }
}

/** Bounded, control-character-free text for display. */
function safeMessage(text: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_SAFE_MESSAGE);
  return cleaned || GENERIC_ERROR_MESSAGE;
}

export interface BallotApiClientOptions {
  apiRoot: string;
  graphqlUrl: string;
  token: string;
}

/** The mutation text MJ's GraphQLDataProvider.InternalRouteOperation sends. */
export const EXECUTE_REMOTE_OPERATION_MUTATION = `mutation ExecuteRemoteOperation($operationKey: String!, $inputJSON: String!, $invokeMode: String!, $progressChannelId: String) {
            ExecuteRemoteOperation(input: { operationKey: $operationKey, inputJSON: $inputJSON, invokeMode: $invokeMode, progressChannelId: $progressChannelId }) {
                success
                resultCode
                outputJSON
                handle
                errorMessage
            }
        }`;

interface ExecuteRemoteOperationResponse {
  data?: {
    ExecuteRemoteOperation?: {
      success: boolean;
      resultCode?: string | null;
      outputJSON?: string | null;
      handle?: string | null;
      errorMessage?: string | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }>;
}

interface EdgeErrorBody {
  Success?: boolean;
  Code?: string;
  ErrorMessage?: string;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
  }
}

async function edgeFetch<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
  }
  if (!response.ok) {
    // The edge's error bodies have fixed public text and never echo input, so the message is safe to show.
    let body: EdgeErrorBody | undefined;
    try {
      body = (await response.json()) as EdgeErrorBody;
    } catch {
      body = undefined;
    }
    if (body && body.Success === false && typeof body.ErrorMessage === 'string') {
      throw new BallotApiError('edge', safeMessage(body.ErrorMessage), body.Code);
    }
    throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
  }
  return readJson<T>(response);
}

/** GET {apiRoot}/{slug}/info */
export function fetchDistributionInfo(apiRoot: string, slug: string): Promise<DistributionInfo> {
  return edgeFetch<DistributionInfo>(`${trimTrailingSlash(apiRoot)}/${encodeURIComponent(slug)}/info`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

/** POST {apiRoot}/session — exchanges a voter credential for a short-lived ballot token. */
export function createBallotSession(apiRoot: string, request: SessionInitRequest): Promise<SessionInitResponse> {
  return edgeFetch<SessionInitResponse>(`${trimTrailingSlash(apiRoot)}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ Slug: request.Slug, MethodCode: request.MethodCode, Credential: request.Credential }),
  });
}

/** Authenticated client for the voter-facing operations. */
export class BallotApiClient {
  constructor(private options: BallotApiClientOptions) {}

  /** The voter's ballot style plus whether they have already voted. Returns the full output; callers read `Style`, `HasVoted`, `CanRevote`, `ReceiptCode`. */
  getMyBallot(electionId: string, language?: string): Promise<VotingGetMyBallotOutput> {
    return this.execute<VotingGetMyBallotInput, VotingGetMyBallotOutput>('Voting.GetMyBallot', {
      ElectionID: electionId,
      ...(language ? { Language: language } : {}),
    });
  }

  castBallot(input: VotingCastBallotInput): Promise<VotingCastBallotOutput> {
    return this.execute<VotingCastBallotInput, VotingCastBallotOutput>('Voting.CastBallot', input);
  }

  getResults(electionId: string): Promise<VotingGetResultsOutput> {
    return this.execute<VotingGetResultsInput, VotingGetResultsOutput>('Voting.GetResults', { ElectionID: electionId });
  }

  getMyParticipation(electionId: string): Promise<VotingGetMyParticipationOutput> {
    return this.execute<VotingGetMyParticipationInput, VotingGetMyParticipationOutput>('Voting.GetMyParticipation', {
      ElectionID: electionId,
    });
  }

  /** Whether a receipt code belongs to a ballot recorded (Found) and counted (Counted) in the election. Nothing else. */
  verifyReceipt(electionId: string, receiptCode: string): Promise<VotingVerifyReceiptOutput> {
    return this.execute<VotingVerifyReceiptInput, VotingVerifyReceiptOutput>('Voting.VerifyReceipt', {
      ElectionID: electionId,
      ReceiptCode: receiptCode,
    });
  }

  /**
   * Execute a remote operation exactly as MJ's GraphQLDataProvider does: variables `operationKey`, `inputJSON`
   * (JSON string), `invokeMode: 'attached'`, `progressChannelId: null`; the result's `outputJSON` is a JSON string.
   * Throws BallotApiError for transport failures and for operation-level `Success: false`.
   */
  private async execute<TIn, TOut extends OperationOutputBase>(operationKey: string, input: TIn): Promise<TOut> {
    let response: Response;
    try {
      response = await fetch(this.options.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.token}`,
        },
        body: JSON.stringify({
          query: EXECUTE_REMOTE_OPERATION_MUTATION,
          variables: {
            operationKey,
            inputJSON: JSON.stringify(input ?? null),
            invokeMode: 'attached',
            progressChannelId: null,
          },
        }),
      });
    } catch {
      throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
    }
    if (!response.ok) {
      throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE, String(response.status));
    }

    const body = await readJson<ExecuteRemoteOperationResponse>(response);
    const result = body.data?.ExecuteRemoteOperation;
    if (body.errors?.length || !result || !result.success || typeof result.outputJSON !== 'string') {
      // Framework-level failure (auth, unknown operation, GraphQL error): detail is for operators, not voters.
      throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE, result?.resultCode ?? undefined);
    }

    let output: TOut;
    try {
      output = JSON.parse(result.outputJSON) as TOut;
    } catch {
      throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
    }
    if (!output.Success) {
      throw new BallotApiError('operation', safeMessage(output.Message));
    }
    return output;
  }
}
