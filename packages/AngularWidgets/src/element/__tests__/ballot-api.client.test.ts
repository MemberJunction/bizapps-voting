import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BallotApiClient,
  BallotApiError,
  EXECUTE_REMOTE_OPERATION_MUTATION,
  GENERIC_ERROR_MESSAGE,
  createBallotSession,
  fetchDistributionInfo,
} from '../api/ballot-api.client';
import type { VotingCastBallotOutput, VotingGetMyBallotOutput, VotingGetResultsOutput } from '../api/ballot-api.types';

const fetchMock = vi.fn<typeof fetch>();

/** A fetch Response carrying a JSON body. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The GraphQL envelope for a successful transport carrying `output` as outputJSON. */
function opResponse(output: unknown): Response {
  return jsonResponse({
    data: { ExecuteRemoteOperation: { success: true, resultCode: 'SUCCESS', outputJSON: JSON.stringify(output), handle: null, errorMessage: null } },
  });
}

interface SentRequest {
  url: string;
  init: RequestInit;
  body: { query: string; variables: { operationKey: string; inputJSON: string; invokeMode: string; progressChannelId: string | null } };
}

function sent(call = 0): SentRequest {
  const [url, init] = fetchMock.mock.calls[call];
  return { url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) };
}

const STYLE = {
  ElectionID: 'e1',
  ElectionName: 'Board',
  SecrecyMode: 'Secret' as const,
  AllowRevote: false,
  Language: 'en',
  Contests: [],
  Hash: 'h1',
};

describe('BallotApiClient', () => {
  let client: BallotApiClient;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    client = new BallotApiClient({ apiRoot: 'https://api.example.com/vote', graphqlUrl: 'https://api.example.com/graphql', token: 'tok-123' });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('wire format (matches MJ GraphQLDataProvider.InternalRouteOperation)', () => {
    it('posts the exact mutation text, variables and bearer header for GetMyBallot with a language', async () => {
      fetchMock.mockResolvedValueOnce(opResponse({ Success: true, Style: STYLE, HasVoted: false, CanRevote: false }));
      await client.getMyBallot('e1', 'fr');

      const req = sent();
      expect(req.url).toBe('https://api.example.com/graphql');
      expect(req.init.method).toBe('POST');
      expect(req.init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok-123' });
      expect(req.body.query).toBe(EXECUTE_REMOTE_OPERATION_MUTATION);
      expect(req.body.query).toContain(
        'mutation ExecuteRemoteOperation($operationKey: String!, $inputJSON: String!, $invokeMode: String!, $progressChannelId: String)',
      );
      expect(req.body.query).toContain(
        'ExecuteRemoteOperation(input: { operationKey: $operationKey, inputJSON: $inputJSON, invokeMode: $invokeMode, progressChannelId: $progressChannelId })',
      );
      expect(req.body.variables).toEqual({
        operationKey: 'Voting.GetMyBallot',
        inputJSON: JSON.stringify({ ElectionID: 'e1', Language: 'fr' }),
        invokeMode: 'attached',
        progressChannelId: null,
      });
      // inputJSON is a STRING, not an object
      expect(typeof req.body.variables.inputJSON).toBe('string');
    });

    it('omits Language from GetMyBallot when none is given', async () => {
      fetchMock.mockResolvedValueOnce(opResponse({ Success: true, Style: STYLE }));
      await client.getMyBallot('e1');
      expect(sent().body.variables.inputJSON).toBe('{"ElectionID":"e1"}');
    });

    it('CastBallot sends ElectionID, BallotStyleHash, Submission and Language', async () => {
      fetchMock.mockResolvedValueOnce(opResponse({ Success: true, ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' }));
      const submission = { Contests: [{ ContestID: 'c1', Selections: [{ OptionID: 'o1' }] }] };
      const out: VotingCastBallotOutput = await client.castBallot({ ElectionID: 'e1', BallotStyleHash: 'h1', Submission: submission, Language: 'es' });

      expect(out.ReceiptCode).toBe('AAAA-BBBB-CCCC-DDDD-EEEE');
      const v = sent().body.variables;
      expect(v.operationKey).toBe('Voting.CastBallot');
      expect(JSON.parse(v.inputJSON)).toEqual({ ElectionID: 'e1', BallotStyleHash: 'h1', Submission: submission, Language: 'es' });
    });

    it('GetResults and GetMyParticipation send only ElectionID', async () => {
      fetchMock.mockResolvedValueOnce(opResponse({ Success: true, Visible: false, Reason: 'Not yet' }));
      fetchMock.mockResolvedValueOnce(opResponse({ Success: true, HasVoted: true, Channel: 'Online' }));
      const results: VotingGetResultsOutput = await client.getResults('e1');
      const participation = await client.getMyParticipation('e1');

      expect(results.Visible).toBe(false);
      expect(participation.Channel).toBe('Online');
      expect(sent(0).body.variables.operationKey).toBe('Voting.GetResults');
      expect(sent(0).body.variables.inputJSON).toBe('{"ElectionID":"e1"}');
      expect(sent(1).body.variables.operationKey).toBe('Voting.GetMyParticipation');
      expect(sent(1).body.variables.inputJSON).toBe('{"ElectionID":"e1"}');
    });
  });

  describe('response mapping', () => {
    it('returns the full GetMyBallot output (Style, HasVoted, CanRevote, ReceiptCode)', async () => {
      const output: VotingGetMyBallotOutput = { Success: true, Style: STYLE, HasVoted: true, CanRevote: true, ReceiptCode: 'R-1' };
      fetchMock.mockResolvedValueOnce(opResponse(output));
      expect(await client.getMyBallot('e1')).toEqual(output);
    });

    it('surfaces an operation-level Success:false Message as an operation error', async () => {
      fetchMock.mockResolvedValueOnce(opResponse({ Success: false, Message: 'Voting is closed.' }));
      const err = await client.getMyBallot('e1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BallotApiError);
      expect((err as BallotApiError).Kind).toBe('operation');
      expect((err as BallotApiError).message).toBe('Voting is closed.');
    });

    it('falls back to the generic message when an operation refusal has no Message, and strips control characters', async () => {
      fetchMock.mockResolvedValueOnce(opResponse({ Success: false }));
      await expect(client.getResults('e1')).rejects.toThrow(GENERIC_ERROR_MESSAGE);
      fetchMock.mockResolvedValueOnce(opResponse({ Success: false, Message: 'Line1\nLine2\u0000' }));
      await expect(client.getResults('e1')).rejects.toThrow('Line1 Line2');
    });
  });

  describe('transport failures map to a generic message (no server detail)', () => {
    it('HTTP error', async () => {
      fetchMock.mockResolvedValueOnce(new Response('secret stack trace', { status: 500 }));
      const err = await client.getMyBallot('e1').catch((e: unknown) => e as BallotApiError);
      expect((err as BallotApiError).Kind).toBe('transport');
      expect((err as BallotApiError).message).toBe(GENERIC_ERROR_MESSAGE);
    });

    it('GraphQL errors array', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'Cannot read property of voter jane@example.com' }] }));
      await expect(client.getMyBallot('e1')).rejects.toThrow(GENERIC_ERROR_MESSAGE);
    });

    it('framework failure (success:false at the transport level) hides errorMessage', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: { ExecuteRemoteOperation: { success: false, resultCode: 'FORBIDDEN', outputJSON: null, errorMessage: 'user 42 lacks role' } } }),
      );
      const err = await client.getMyBallot('e1').catch((e: unknown) => e as BallotApiError);
      expect((err as BallotApiError).message).toBe(GENERIC_ERROR_MESSAGE);
      expect((err as BallotApiError).Code).toBe('FORBIDDEN');
    });

    it('network failure and malformed JSON', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(client.getMyBallot('e1')).rejects.toThrow(GENERIC_ERROR_MESSAGE);
      fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
      await expect(client.getMyBallot('e1')).rejects.toThrow(GENERIC_ERROR_MESSAGE);
    });
  });
});

describe('public edge client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('GET {apiRoot}/{slug}/info', async () => {
    const info = { ElectionName: 'Board', AllowedMethods: ['emailed-link'], Theme: null, DefaultLanguage: 'fr' };
    fetchMock.mockResolvedValueOnce(jsonResponse(info));
    expect(await fetchDistributionInfo('https://api.example.com/vote/', 'my slug')).toEqual(info);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.example.com/vote/my%20slug/info');
    expect(init?.method).toBe('GET');
  });

  it('POST {apiRoot}/session sends exactly {Slug, MethodCode, Credential} with no Authorization header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Token: 't', ExpiresAt: '2030-01-01T00:00:00Z', ElectionID: 'e1' }));
    const out = await createBallotSession('https://api.example.com/vote', {
      Slug: 'board-2030',
      MethodCode: 'second-factor',
      Credential: { SecondFactor: { SourceKey: 'M-100', Pin: '1234' } },
    });
    expect(out).toEqual({ Token: 't', ExpiresAt: '2030-01-01T00:00:00Z', ElectionID: 'e1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.example.com/vote/session');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      Slug: 'board-2030',
      MethodCode: 'second-factor',
      Credential: { SecondFactor: { SourceKey: 'M-100', Pin: '1234' } },
    });
    expect(JSON.stringify(init?.headers)).not.toContain('Authorization');
  });

  it('edge error bodies surface their fixed public text; unknown bodies are generic', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ Success: false, Code: 'sign_in_failed', ErrorMessage: 'Sign-in failed' }, 401));
    const err = await createBallotSession('/vote', { Slug: 's', MethodCode: 'emailed-link', Credential: { Token: 'x' } }).catch((e: unknown) => e as BallotApiError);
    expect((err as BallotApiError).Kind).toBe('edge');
    expect((err as BallotApiError).Code).toBe('sign_in_failed');
    expect((err as BallotApiError).message).toBe('Sign-in failed');

    fetchMock.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }));
    await expect(fetchDistributionInfo('/vote', 's')).rejects.toThrow(GENERIC_ERROR_MESSAGE);
  });
});
