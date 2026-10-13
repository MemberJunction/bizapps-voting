/**
 * @mj-biz-apps/voting-server — Remote Operations barrel
 *
 * All 24 Remote Operations: 7 voter (guest-scoped), 16 administrator, 1 trustee.
 */

// Voter operations (AllowScopedPrincipal: true)
export { GetMyBallotOperation } from './GetMyBallotOperation.js';
export { CastBallotOperation } from './CastBallotOperation.js';
export { GetMyParticipationOperation } from './GetMyParticipationOperation.js';
export { SubmitProxyOperation } from './SubmitProxyOperation.js';
export { SubmitNominationOperation } from './SubmitNominationOperation.js';
export { GetResultsOperation } from './GetResultsOperation.js';
export { VerifyReceiptOperation } from './VerifyReceiptOperation.js';

// Administrator operations
export { CreateElectionOperation } from './CreateElectionOperation.js';
export { UpdateElectionOperation } from './UpdateElectionOperation.js';
export { FreezeRollOperation } from './FreezeRollOperation.js';
export { AmendRollOperation } from './AmendRollOperation.js';
export { ChallengeVoterOperation } from './ChallengeVoterOperation.js';
export { IssueCredentialsOperation } from './IssueCredentialsOperation.js';
export { OpenElectionOperation } from './OpenElectionOperation.js';
export { CloseElectionOperation } from './CloseElectionOperation.js';
export { CancelElectionOperation } from './CancelElectionOperation.js';
export { GetTurnoutOperation } from './GetTurnoutOperation.js';
export { EnterPaperBallotOperation } from './EnterPaperBallotOperation.js';
export { TallyOperation } from './TallyOperation.js';
export { CertifyOperation } from './CertifyOperation.js';
export { DecideNominationOperation } from './DecideNominationOperation.js';
export { ResolveCommentOperation } from './ResolveCommentOperation.js';
export { CreateTrusteeKeysOperation } from './CreateTrusteeKeysOperation.js';

// Trustee operation
export { SubmitKeyShareOperation } from './SubmitKeyShareOperation.js';

// Import Load functions for use in LoadVotingOperations
import { LoadGetMyBallotOperation } from './GetMyBallotOperation.js';
import { LoadCastBallotOperation } from './CastBallotOperation.js';
import { LoadGetMyParticipationOperation } from './GetMyParticipationOperation.js';
import { LoadSubmitProxyOperation } from './SubmitProxyOperation.js';
import { LoadSubmitNominationOperation } from './SubmitNominationOperation.js';
import { LoadGetResultsOperation } from './GetResultsOperation.js';
import { LoadVerifyReceiptOperation } from './VerifyReceiptOperation.js';
import { LoadCreateElectionOperation } from './CreateElectionOperation.js';
import { LoadUpdateElectionOperation } from './UpdateElectionOperation.js';
import { LoadFreezeRollOperation } from './FreezeRollOperation.js';
import { LoadAmendRollOperation } from './AmendRollOperation.js';
import { LoadChallengeVoterOperation } from './ChallengeVoterOperation.js';
import { LoadIssueCredentialsOperation } from './IssueCredentialsOperation.js';
import { LoadOpenElectionOperation } from './OpenElectionOperation.js';
import { LoadCloseElectionOperation } from './CloseElectionOperation.js';
import { LoadCancelElectionOperation } from './CancelElectionOperation.js';
import { LoadGetTurnoutOperation } from './GetTurnoutOperation.js';
import { LoadEnterPaperBallotOperation } from './EnterPaperBallotOperation.js';
import { LoadTallyOperation } from './TallyOperation.js';
import { LoadCertifyOperation } from './CertifyOperation.js';
import { LoadDecideNominationOperation } from './DecideNominationOperation.js';
import { LoadResolveCommentOperation } from './ResolveCommentOperation.js';
import { LoadCreateTrusteeKeysOperation } from './CreateTrusteeKeysOperation.js';
import { LoadSubmitKeyShareOperation } from './SubmitKeyShareOperation.js';

/** Tree-shaking anchor: call from server bootstrap to retain all @RegisterClass decorators. */
export function LoadVotingOperations(): void {
    // Voter operations
    LoadGetMyBallotOperation();
    LoadCastBallotOperation();
    LoadGetMyParticipationOperation();
    LoadSubmitProxyOperation();
    LoadSubmitNominationOperation();
    LoadGetResultsOperation();
    LoadVerifyReceiptOperation();

    // Administrator operations
    LoadCreateElectionOperation();
    LoadUpdateElectionOperation();
    LoadFreezeRollOperation();
    LoadAmendRollOperation();
    LoadChallengeVoterOperation();
    LoadIssueCredentialsOperation();
    LoadOpenElectionOperation();
    LoadCloseElectionOperation();
    LoadCancelElectionOperation();
    LoadGetTurnoutOperation();
    LoadEnterPaperBallotOperation();
    LoadTallyOperation();
    LoadCertifyOperation();
    LoadDecideNominationOperation();
    LoadResolveCommentOperation();
    LoadCreateTrusteeKeysOperation();

    // Trustee operation
    LoadSubmitKeyShareOperation();
}
