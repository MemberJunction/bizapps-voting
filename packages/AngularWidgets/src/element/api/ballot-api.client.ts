/**
 * Tiny fetch-based API client for the ballot widget.
 *
 * The widget calls the voting server through the generic GraphQL ExecuteRemoteOperation
 * mutation, with a bearer token. No MemberJunction core dependencies.
 */

import type { BallotStyle, BallotSubmission } from '@mj-biz-apps/voting-entities/contracts';

export interface SessionInitRequest {
  Slug: string;
  MethodCode: string;
  Credential: string;
}

export interface SessionInitResponse {
  Token: string;
  ExpiresAt: string;
  ElectionID: string;
}

export interface BallotApiClientOptions {
  apiRoot: string;
  graphqlUrl: string;
  token: string;
}

/**
 * Minimal API client for ballot operations. Calls the server's generic
 * ExecuteRemoteOperation mutation with the voting-specific operation keys.
 */
export class BallotApiClient {
  constructor(private options: BallotApiClientOptions) {}

  /**
   * Get the ballot style the voter should see.
   */
  async getMyBallot(electionId: string): Promise<BallotStyle> {
    return this.executeRemoteOperation('Voting.GetMyBallot', { ElectionID: electionId });
  }

  /**
   * Cast the voter's ballot.
   */
  async castBallot(electionId: string, submission: BallotSubmission): Promise<{ ReceiptCode: string }> {
    return this.executeRemoteOperation('Voting.CastBallot', {
      ElectionID: electionId,
      Selections: submission,
    });
  }

  /**
   * Get the results the voter is allowed to see.
   */
  async getResults(electionId: string): Promise<{ ResultsVisible: boolean; Results?: unknown }> {
    return this.executeRemoteOperation('Voting.GetResults', { ElectionID: electionId });
  }

  /**
   * Get the voter's participation record.
   */
  async getMyParticipation(electionId: string): Promise<{ CastAt?: string; Channel?: string }> {
    return this.executeRemoteOperation('Voting.GetMyParticipation', { ElectionID: electionId });
  }

  /**
   * Execute a remote operation via the GraphQL ExecuteRemoteOperation mutation.
   *
   * The mutation signature (from MJ's GraphQLDataProvider):
   * ```graphql
   * mutation ExecuteRemoteOperation($input: ExecuteRemoteOperationInput!) {
   *   ExecuteRemoteOperation(input: $input) {
   *     success
   *     message
   *     data
   *   }
   * }
   * ```
   */
  private async executeRemoteOperation(operationKey: string, parameters: Record<string, unknown>): Promise<any> {
    const query = `
      mutation ExecuteRemoteOperation($input: ExecuteRemoteOperationInput!) {
        ExecuteRemoteOperation(input: $input) {
          success
          message
          data
        }
      }
    `;

    const response = await fetch(this.options.graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.token}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            OperationKey: operationKey,
            Parameters: parameters,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`GraphQL error: ${data.errors[0]?.message ?? 'Unknown error'}`);
    }

    const result = data.data?.ExecuteRemoteOperation;
    if (!result?.success) {
      throw new Error(`Operation failed: ${result?.message ?? 'Unknown error'}`);
    }

    return result.data;
  }
}
