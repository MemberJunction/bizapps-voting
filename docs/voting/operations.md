# Remote Operations and Actions

Voting exposes **29 Remote Operations**. Typed bases (client-safe) are generated into
`packages/Entities/src/generated/remote_operations.ts`; the bodies are in `packages/Server/src/operations/`, each a thin
wrapper over an engine. Operation keys are `Voting.<Name>`; the classes are `Voting<Name>Operation`.

```typescript
import { VotingCastBallotOperation } from '@mj-biz-apps/voting-entities';
const result = await new VotingCastBallotOperation().Execute(input);   // optionally { provider, user } on the server
```

## Results and errors

`Execute` returns a `RemoteOpResult`: `{ Success, ResultCode?, ErrorMessage?, Output? }`.

- Transport failures: `Success: false` with `ResultCode` `FORBIDDEN` (the operation's `Authorize` said no), `NO_PROVIDER`,
  `EXECUTION_ERROR`, and so on.
- Otherwise `Success: true` and `Output` is the operation's own result, which always has `Success` and `Message?`. A refused
  business rule is `Output.Success === false` with a fixed human-readable `Message`. Engine failure codes
  (`AlreadyVoted`, `InvalidTransition`, `TierNotSupported`, `KeyNotAvailable`, ...) are not returned as fields; unexpected
  exceptions return the generic message "The operation could not be completed." and are logged by error name only.
  Always check both `Success` and `Output.Success`.

## Audiences and scopes

`RequiredScope` is declared per operation: `voting:vote` for the seven voter operations, `voting:admin` for administrator
operations, `voting:trustee` for `SubmitKeyShare`. Then each operation's `Authorize` runs
(`Server/src/shared/authorization.ts`, `voter-identity.ts`):

| Audience | Rule |
|---|---|
| **Voter** (7) | A normal MJ user passes `Authorize`; the roll check happens when the voter is resolved (the user's linked `Person`, by `LinkedUserID` then email, must be an `Eligible` roll entry). A **guest** principal passes only with a ballot-session scope (`VotingBallotSession`, `electionId:eligibleVoterId`) for exactly this election (`GuestMayAccessElection`). `SubmitNomination` receives only a contest id, so it checks the contest's election inside the operation |
| **Administrator** (16) | `VotingAuthorization.IsAdministrator`: role `Voting Administrator`, MJ roles `Developer` / `Integration`, or the system user. `Certify` and `GetTurnout` also allow role `Election Inspector` |
| **Trustee** (1) | Any non-guest principal passes `Authorize`; the engine then requires the acting user's linked `Person` to be the trustee that owns the submitted `ShareIndex` |

## Voter operations

| Operation | Input | Output (besides `Success`, `Message?`) | Notes |
|---|---|---|---|
| `Voting.GetMyBallot` | `ElectionID`, `Language?` | `Style?` (`VotingBallotStyle`: contests, options, `Hash`, `AllowRevote`, ...), `HasVoted?`, `CanRevote?`, `ReceiptCode?` | The style is filtered to the voter's voting class. `ReceiptCode` is returned only for non-Secret elections |
| `Voting.CastBallot` | `ElectionID`, `BallotStyleHash`, `Submission` (`Contests[]`: `ContestID`, `Abstain?`, `Selections[]` of `OptionID`, `Rank?`, `WriteInText?`, `Comments?`), `Language?` | `ReceiptCode?` | Election must be Open and inside its window; hash must match the voter's current style; one ballot per voter unless revotes are allowed (never in Secret) |
| `Voting.GetMyParticipation` | `ElectionID` | `HasVoted?`, `Channel?` (`Online`, `Paper`, `Proxy`, `InPerson`) | Poll-book read only |
| `Voting.VerifyReceipt` | `ElectionID`, `ReceiptCode` | `Found?`, `Counted?` | Reveals nothing about choices. Needs a session (guest scope for the election, or any MJ user) |
| `Voting.SubmitNomination` | `ContestID`, `NomineePersonID`, `Statement?` | `NominationID?` | Only while the election is in `Nominations` status and inside `NominationsOpenAt` / `NominationsCloseAt` |
| `Voting.SubmitProxy` | `ElectionID`, `ProxyPersonID`, `Scope?` (`General` or `Directed`), `Instructions?` | `ProxyDesignationID?` | Requires `Election.ProxyDeadline` set and not passed; one active designation per voter; records the designation only. A proxy's ballot is entered by an administrator with `EnterPaperBallot` |
| `Voting.GetResults` | `ElectionID` | `Visible?`, `Reason?`, `IsFinal?`, `IsRunning?`, `SnapshotAt?`, `BallotCount?`, `Contests?` (per contest: `Outcome`, `VotesCast`, `Abstentions`, `Options[]` of `OptionID`, `Votes`, `Position`, `Outcome`; `Rounds?`, `Notes?`) | Visibility per `ResultsTiming` / `ResultsAudience` (see README). Administrators and inspectors always see final results. A hidden result is `Success: true, Visible: false` with a `Reason` |

## Administrator operations

| Operation | Input | Output | Rules |
|---|---|---|---|
| `Voting.CreateElection` | `ElectionTypeCode`, `Name`, `Description?`, `Anchors?` (`EntityName`, `RecordID`, `Role?`, `IsPrimary?`), `EligibilitySource` (`Code`, `Settings?`), `Contests[]` (`Name`, `Kind`, `Seats?`, `TallyMethodCode`, `Threshold?`, `CustomThreshold?`, `ThresholdBasis?`, `AllowAbstain?`, `AllowWriteIn?`, `Min/MaxSelections?`, `VotingClassFilter?`, `Options?`), `SecrecyMode?`, `AssuranceTier?`, `ResultsTiming?`, `ResultsAudience?`, `RecordDate?`, `OpensAt?`, `ClosesAt?`, `TimeZone?`, `Configuration?` | `ElectionID?` | Creates in `Draft`, in one transaction. Defaults layer: app defaults, then the type's configuration, then `Configuration` (only keys the type lists in `OverridableKeys`). Unknown type, source or tally method is refused |
| `Voting.UpdateElection` | `ElectionID` and any of `Name`, `Description`, `SecrecyMode`, `AssuranceTier`, `ResultsTiming`, `ResultsAudience`, `OpensAt`, `ClosesAt`, `TimeZone`, `Configuration` | `ElectionID?` | The entity server enforces the lock: configuration is locked from `Open` on |
| `Voting.FreezeRoll` | `ElectionID` | `VoterCount?`, `RollHash?` | Builds the roll from the election's eligibility source as of `RecordDate` (set on create; this operation has no date input). Refused if already frozen, if the source yields no voters, or the election is past `Open` |
| `Voting.AmendRoll` | `ElectionID`, `Add?` (`PersonID`, `VotingClass?`, `Weight?`, `SourceKey?`, `RepresentingOrganizationID?`), `Remove?` (`EligibleVoterID`, `Reason`) | `Added?`, `Removed?` | Allowed until Closed. Removal needs a reason; a voter who has voted cannot be removed. Additions after the freeze are flagged `AddedAfterFreeze` |
| `Voting.ChallengeVoter` | `EligibleVoterID`, `Reason`, `Decision?` (`Uphold` or `Reject`) | `Status?` | Without `Decision` the voter becomes `Challenged` and **cannot sign in or vote** until decided; `Uphold` removes them (not if they voted), `Reject` restores `Eligible` |
| `Voting.IssueCredentials` | `ElectionID`, `MethodCode`, `EligibleVoterIDs?`, `BaseUrl?` | `Issued?`, `Skipped?` | Election must be Ready or Open; the method must issue credentials. In practice this sends `emailed-link` emails (`BaseUrl` and an Active distribution are required; voters with no email are skipped). It replaces a voter's earlier unused link |
| `Voting.OpenElection` | `ElectionID` | `Status?` | Draft/Nominations/Ready -> Open (via Ready). Freezes the roll if needed; refuses for no contests, a contest without options, tier B without trustee keys, tier C |
| `Voting.CloseElection` | `ElectionID` | `Status?` | Open -> Closed |
| `Voting.CancelElection` | `ElectionID`, `Reason` | `Status?` | Any non-final state -> Cancelled; reason is audited |
| `Voting.GetTurnout` | `ElectionID` | `Eligible?`, `Voted?`, `TurnoutPercent?`, `QuorumMet?`, `ByChannel?`, `ByMethod?` | Counts `Participation` rows only; never results. Administrator or inspector |
| `Voting.EnterPaperBallot` | `ElectionID`, `ControlNumber`, `Submission`, `Channel` (`Paper`, `Proxy`, `InPerson`) | `ReceiptCode?` | Identifies the voter by a one-time control number, casts through the cast engine with `EnteredByUserID`, then redeems the number. For `Proxy`, `ProxyDesignationID` of an Accepted designation of that voter is required; it is marked Used in the cast transaction. Control numbers come from `Voting.IssueControlNumbers` |
| `Voting.Tally` | `ElectionID`, `TieBreakSeed?` | `Status?`, `Contests?` (outcome, options, rounds, `TieBroken`, `Notes`) | Closed (or Tallied, to re-tally before certification). Tier B needs enough trustee shares submitted to this instance first |
| `Voting.Certify` | `ElectionID`, `Notes?` | `CertificationID?`, `Status?` | Tallied and past `ChallengeWindowEndsAt`; the caller needs a linked `Person`. One call = one signature; `Status` becomes `Certified` after `RequiredCertifiers` (default 1) signatures. Administrator or inspector |
| `Voting.DecideNomination` | `NominationID`, `Decision` (`Approved`/`Rejected`), `Notes?` | `Status?`, `ContestOptionID?` | Before voting opens. Approval creates the contest option (label = the nominee's display name) |
| `Voting.IssueControlNumbers` | `ElectionID`, `EligibleVoterIDs?`, `MethodCode?` | `Issued?` (`EligibleVoterID`, `ControlNumber`), `Skipped?` | Administrator. Election must be Ready or Open. The plain numbers are returned once; only a SHA-256 is stored. Issuing again revokes the voter's earlier unused number |
| `Voting.IssueSecondFactorPins` | `ElectionID`, `EligibleVoterIDs?` | `Issued?` (`EligibleVoterID`, `SourceKey`, `Pin`), `Skipped?` | Administrator. Election must be Ready or Open. The plain PINs are returned once; only a salted scrypt hash is stored. Voters with no roster key are skipped |
| `Voting.OpenNominations` | `ElectionID` | `Status?` | Administrator. Draft to Nominations. Needs an office contest and a nomination window that has not already closed |
| `Voting.CloseNominations` | `ElectionID` | `Status?` | Administrator. Nominations to Ready |
| `Voting.DecideProxy` | `ProxyDesignationID`, `Decision` (`Accepted`/`Rejected`), `Notes?` | `Status?` | Administrator. Pending designations only, and only before the election closes. Notes go to the audit trail. An Accepted designation is consumed (Used) by `EnterPaperBallot` with `Channel: 'Proxy'` and its `ProxyDesignationID` |
| `Voting.ResolveComment` | `BallotCommentID`, `Disposition`, `Response?` | `CommentResolutionID?` | Disposition is one of `Accepted`, `AcceptedInPrinciple`, `Rejected`, `Withdrawn`, `Deferred` |
| `Voting.CreateTrusteeKeys` | `ElectionID`, `TrusteePersonIDs[]`, `Threshold` | `PublicKey?`, `Shares?` (`TrusteePersonID`, `ShareIndex`, `Share`) | Tier B elections in Draft/Ready; 2 or more distinct trustees, threshold 2..n; once only. Shares are returned **once** and never stored |

## Trustee operation

| Operation | Input | Output |
|---|---|---|
| `Voting.SubmitKeyShare` | `ElectionID`, `ShareIndex`, `Share` | `Accepted?`, `SharesReceived?`, `SharesRequired?` |

Accepted only after the election is Closed (or Tallied), for tier B. The share is checked against its stored commitment
and held in the MJAPI process memory (see the runbook). A share that fails its commitment is rejected and audited.

## Actions

`@mj-biz-apps/voting-actions` ships **six** Actions (`metadata/actions/.voting-actions.json`), each executing the matching
Remote Operation as the context user:

| Action | Operation | Parameters |
|---|---|---|
| `MJ_BizApps_Voting: Create Motion Vote` | `Voting.CreateElection` | `Name`, `MotionText`, `EligibilitySourceCode`, `ClosesAt` (required); `AnchorEntityName`, `AnchorRecordID`, `EligibilitySourceSettings`, `Threshold`, `ElectionTypeCode` (optional); output `ElectionID` |
| `... Open Election` | `Voting.OpenElection` | `ElectionID`; output `Status` |
| `... Close Election` | `Voting.CloseElection` | `ElectionID`; output `Status` |
| `... Get Turnout` | `Voting.GetTurnout` | `ElectionID`; outputs `VoterCount`, `TurnoutCount`, `TurnoutPercent`, `QuorumMet`, `TurnoutJSON` |
| `... Get Election Results` | `Voting.GetResults` | `ElectionID`; outputs `ResultsJSON`, `Visible`, `IsFinal`, `Reason` (the viewer is resolved from the calling user) |
| `... Tally Election` | `Voting.Tally` | `ElectionID`, `TieBreakSeed?`; outputs `Status`, `ContestsJSON` |

There is no Action for reminders, certification or credentials; reminders run as a scheduled job.

## Scheduled jobs

`metadata/scheduled-jobs`, implemented in `Server/src/jobs`, run as the system user:

| Job | Schedule | Status | What it does |
|---|---|---|---|
| Election Scheduler | every 5 min | Active | Opens Ready elections whose `OpensAt` is set and has arrived (a Ready election with no `OpensAt` is never auto-opened); closes Open elections whose `ClosesAt` has passed. Idempotent. It never tallies |
| Result Snapshot Publisher | every 5 min | Active | Publishes running-results snapshots for Open Standard-tier elections that show running results, subject to the election's batch policy |
| Reminder Sender | hourly | **Disabled** | Emails non-voters of Open elections when a threshold (days before close, from the election's `Configuration.Reminders.DaysBeforeClose` or the job's `DaysBeforeClose`, shipped as `[7, 3, 1]`) is crossed since the last `RemindersSent` audit event. Needs `VOTING_EMAIL_PROVIDER` + `VOTING_EMAIL_FROM` or `ProviderName` / `From` in the job's Configuration; optional `BallotUrl` |
