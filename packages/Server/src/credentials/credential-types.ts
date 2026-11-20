/**
 * Credential vocabulary shared by the engine and the method drivers.
 */

import {
    type mjBizAppsVotingBallotDistributionEntity,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingEligibleVoterEntity,
    type mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';

/** What a voter (or the edge on the voter's behalf) presents. Only the fields the chosen method reads are used. */
export interface VoterCredentialPresentation {
    /** Emailed link: the raw token from the URL fragment. */
    Token?: string;
    /** Host assertion: the host-signed RS256 JWT. */
    Assertion?: string;
    /** Roster/source key (second factor, when given at the top level). */
    SourceKey?: string;
    /** PIN (second factor, when given at the top level). */
    Pin?: string;
    /** SSO: the email the identity provider vouched for. The edge has already validated the IdP token. */
    Email?: string;
    /** SSO: the identity provider's stable user id. */
    ExternalID?: string;
    /** Second factor, layered on another method or used alone. */
    SecondFactor?: { SourceKey: string; Pin: string };
}

/** A verified roll entry. */
export interface VerifiedVoter {
    EligibleVoterID: string;
}

/** Who a credential is being issued to. */
export interface CredentialIssueTarget {
    Voter: mjBizAppsVotingEligibleVoterEntity;
    /** The voter's email from the Person record, if any. */
    Email: string | null;
}

/** What a driver needs to issue one credential. */
export interface CredentialIssueOptions {
    Election: mjBizAppsVotingElectionEntity;
    Method: mjBizAppsVotingVoterCredentialMethodEntity;
    /** The distribution whose slug the link points at. */
    Distribution: mjBizAppsVotingBallotDistributionEntity | null;
    BaseUrl: string | null;
}

export type CredentialIssueResult = { Status: 'Issued' } | { Status: 'Skipped'; Reason: string };
