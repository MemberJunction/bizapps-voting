import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BallotApiClient } from '../api/ballot-api.client';

// Mock fetch globally
global.fetch = vi.fn();

describe('BallotApiClient', () => {
  let client: BallotApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BallotApiClient({
      apiRoot: 'https://api.example.com/vote',
      graphqlUrl: 'https://api.example.com/graphql',
      token: 'test-token-123',
    });
  });

  describe('getMyBallot', () => {
    it('should execute Voting.GetMyBallot operation', async () => {
      const mockBallotStyle = {
        ElectionID: 'election-1',
        ElectionName: 'Board Election 2024',
        Contests: [],
        Hash: 'abc123',
        SecrecyMode: 'Secret' as const,
        AllowRevote: false,
        Language: 'en',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            ExecuteRemoteOperation: {
              success: true,
              data: mockBallotStyle,
            },
          },
        }),
      });

      const result = await client.getMyBallot('election-1');

      expect(result).toEqual(mockBallotStyle);
      expect(global.fetch).toHaveBeenCalledOnce();
      expect((global.fetch as any).mock.calls[0][1]).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      });
    });

    it('should throw on GraphQL error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Election not found' }],
        }),
      });

      await expect(client.getMyBallot('election-1')).rejects.toThrow('GraphQL error');
    });

    it('should throw on HTTP error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.getMyBallot('election-1')).rejects.toThrow('API request failed');
    });
  });

  describe('castBallot', () => {
    it('should execute Voting.CastBallot operation', async () => {
      const submission = {
        Contests: [
          {
            ContestID: 'contest-1',
            Selections: [{ OptionID: 'option-1' }],
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            ExecuteRemoteOperation: {
              success: true,
              data: { ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' },
            },
          },
        }),
      });

      const result = await client.castBallot('election-1', submission);

      expect(result.ReceiptCode).toBe('AAAA-BBBB-CCCC-DDDD-EEEE');
    });
  });

  describe('getResults', () => {
    it('should execute Voting.GetResults operation', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            ExecuteRemoteOperation: {
              success: true,
              data: { ResultsVisible: true, Results: {} },
            },
          },
        }),
      });

      const result = await client.getResults('election-1');

      expect(result.ResultsVisible).toBe(true);
    });
  });
});
