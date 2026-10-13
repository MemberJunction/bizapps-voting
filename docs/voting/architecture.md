# BizApps Voting Architecture

How the packages fit together, how the cast and tally work, and the secrecy controls that are actually implemented.
Statements here were checked against the code; file paths are given so you can re-check.

## Packages

| Package | Role | Main exports |
|---|---|---|
| `@mj-biz-apps/voting-entities` (`Entities`) | Browser-safe contracts and generated code | Entity classes `mjBizAppsVoting*Entity`; the 29 `Voting*Operation` bases with `Voting*Input` / `Voting*Output` types (`src/generated/remote_operations.ts`); `ElectionSubtypeResolver`; subpath `./contracts`: `ValidateSubmission`, `ComputeBallotStyleHash`, `CanTransition`, `IsConfigurationLocked`, `ResultsVisible`, `PollBookVisible`, `WeightClassOf`, `SuppressSmallClasses`, `ResolveElectionConfiguration`, `FormatReceiptCode`, `Sha256Hex`, `BaseTallyMethodContract`, `TALLY_METHODS`, `GetTallyMethod`, `SeededRandom` |
| `@mj-biz-apps/voting-engine-base` (`EngineBase`) | Cached lookups | `VotingEngineBase` (a `BaseEngine`, `RegisterForStartup`): `ElectionTypes`, `TallyMethods`, `EligibilitySourceTypes`, `VoterCredentialMethods`, `Get...ByID` / `Get...ByCode`, `GetElectionTypeConfiguration` |
| `@mj-biz-apps/voting-core-entities-server` | Server-only entity classes | Entity server classes (state machine, configuration lock, immutability), `BallotBoxWriteGuard`, `TallyWriteGuard`, `BaseElectionTypeServerDriver`, `ElectionTypeDriverRegistry`, invariant helpers |
| `@mj-biz-apps/voting-server` (`Server`) | Logic and surface | Engines, 29 operations, the `VotingBallotEdge` extension, sign-in method drivers, eligibility sources, three scheduled jobs, crypto, `LoadBizAppsVotingServer()`, `MJ_SERVER_EXTENSIONS`, `RESOLVER_PATHS`. The package root re-exports the engines and `shared/`; the eligibility and credential base classes are in `dist/eligibility` and `dist/credentials` (no `exports` map) |
| `@mj-biz-apps/voting-actions` | Six Actions | Create Motion Vote, Open Election, Close Election, Get Turnout, Get Election Results, Tally Election. Each executes a **Remote Operation** as the context user (`BaseVotingAction.buildOperationOptions`); they do not call engines |
| `@mj-biz-apps/voting-ng-widgets` | L2 UI | `BaseElectionTypeUIDriver`, `ElectionTypeUIDriverRegistry`, `BaseElectionAdminTab`, `BaseElectionSetupStep`, `BaseElectionResultsView`, `assembleElectionContributions`; the `<mj-ballot>` element is a separate bundle (`dist-element/main.js`) |
| `@mj-biz-apps/voting-ng` (`Angular`) | L3 Explorer UI | Five dashboards and generated entity forms; `LoadBizAppsVotingClient()` |

Dependency direction: ng -> ng-widgets -> entities; server -> core-entities-server, engine-base, actions, entities.
The widget bundle imports only `@mj-biz-apps/voting-entities/contracts` and Angular.

## The cast transaction

`CastEngine.Cast` (`Server/src/engines/cast-engine.ts`):

1. Load the election graph; check the election is `Open` and inside `OpensAt` / `ClosesAt`.
2. Load the voter (must be `Eligible` for this election); rebuild that voter's ballot style and require its hash to equal
   the submitted `BallotStyleHash`; run `ValidateSubmission`; run the type driver's `ValidateCast`.
3. Decide first vote, revote or refusal (`AlreadyVoted`). A Secret election never allows a revote.
4. Encrypt the submission (`v1:a:` tier A, `v1:b:` tier B); tier C throws `TierNotSupported`.
5. Inside `BallotBoxWriteGuard.RunWithBallotBoxAccess`, as the **system user**, in one transaction:
   - insert `Participation` (unique on election + voter; a unique violation becomes `AlreadyVoted`), or keep it on a revote;
   - insert `CastBallot` (database-generated random id, ciphertext, receipt code, voting class, weight class, `Counted`);
     on a revote the previous ballot becomes `Superseded`;
   - insert `BallotAttribution` only when `SecrecyMode` is not `Secret`;
   - update `ContestRunningTally` only when `ResultsTiming` is not `AfterClose` **and** the tier is Standard; a running tally
     is a shared counter, so each contest's rows are written under a transaction-scoped exclusive lock (`sp_getapplock` /
     `pg_advisory_xact_lock`, `shared/transaction-lock.ts`) and read fresh (`BypassCache`), else concurrent casts lose
     increments. That lock is the only SQL Voting issues outside entity saves, and it writes nothing;
   - for `Open` elections, write `BallotComment` rows for standards-ballot comments.
6. Return the receipt code. In Secret mode `GetMyParticipation` / `GetMyBallot` cannot return the receipt later
   (no attribution to find it); the voter must keep it.

`VerifyReceipt` answers `{ Found, Counted }` for a receipt in the election and nothing else.

## Tally, results, certification

- `TallyEngine.Tally` needs `Closed`, or `Tallied` for a re-tally (the recount path) until a certifier has signed
  (`TallyRefusal`: `AlreadyCertified`, `CertificationInProgress`, `ElectionCancelled`, `NotClosed`). The write transaction
  takes the election's results lock (`ResultsLockResource`, also taken by every certification signature) and re-checks the
  status and certification there, so two re-tallies or a re-tally racing a signature cannot both write; a re-tally demotes
  the previous final result rows (kept as history, `IsFinal = 0`) and writes exactly one final per contest. Tier B needs the reconstructed
  key in memory (otherwise `KeyNotAvailable`: trustees submit shares, then tally again); tier C needs a registered
  `BaseVerifiableTallyProvider`. Counted ballots are read as the system user, **shuffled with a CSPRNG, then decrypted**.
  Per contest the registered tally method runs with a recorded seed (given, or 32 random hex characters). In one
  transaction under `TallyWriteGuard` it demotes previous finals, writes `BallotSelection` rows (first tally, Standard
  tier only), `ContestResult` + `ContestOptionResult`, moves the election to `Tallied`, and runs the driver's
  `OnResultsTallied`. Key material is wiped afterwards. Quorum (`Configuration.Quorum`) failing yields `NoQuorum`.
- `ResultsEngine.GetResults` applies `ResultsVisible` (see the README). Final results come from `ContestResult` rows;
  running results only from the latest `ResultSnapshot` published by `ResultSnapshotPublisherJob`.
- `CertificationEngine.Certify`: election must be `Tallied` and past `ChallengeWindowEndsAt` (if set). Each call is one
  certifier's signature (the acting user's linked Person). It stores the roll hash, a ballot-set hash (SHA-256 over sorted
  counted `id:styleHash:receipt`) and a results-timing disclosure; when `Configuration.RequiredCertifiers` (default 1)
  signatures exist the election becomes `Certified` and the driver's `OnResultsCertified` runs, in the same transaction.

Election states: Draft -> (Nominations ->) Ready -> Open -> Closed -> Tallied -> Certified; Cancelled from any non-final
state. Configuration is locked from `Open` on. `OpenElection` freezes the roll if needed and passes through `Ready`.

## Engines

All are `BaseSingleton`s in `Server/src/engines`. Operations, Actions-via-operations, the edge and jobs are thin callers.

| Engine | Responsibilities |
|---|---|
| `ElectionAdministrationEngine` | Create (election, anchors, contests, options in one transaction), update, open nominations (Draft to Nominations), close nominations (to Ready), open, close, cancel; audit |
| `BallotStyleBuilder` | Per-voter ballot style (filtered by voting class), driver adjustments, style hash |
| `CastEngine` | The cast transaction, `GetMyParticipation`, `VerifyReceipt` |
| `VoterRollEngine` | Freeze (from the eligibility source, with roll hash), amend (no removing someone who voted), challenge (`Challenged` voters cannot sign in or vote; `Uphold` removes, `Reject` restores), proxy designations (need `ProxyDeadline`; an administrator accepts or rejects a Pending one before close, and `EnterPaperBallot` marks an Accepted one Used in the cast transaction) |
| `CredentialEngine` | Issue emailed links; `VerifyCredential` (distribution Active, method allowed, election Open, optional second factor); `IssueControlNumbers` / `IssueSecondFactorPins` (Ready or Open only; returned once, stored as a SHA-256 digest / salted scrypt hash), `RevokeCredential` |
| `NominationEngine`, `CommentEngine` | Nominations (only while `Nominations`), decisions (approval creates a `ContestOption`); standards-ballot comment dispositions |
| `TallyEngine`, `ResultsEngine`, `CertificationEngine` | As above; `ResultsEngine` also publishes snapshots and computes turnout from `Participation` only |
| `TrusteeEngine` | Tier B key creation and share submission (see the runbook) |
| `ReminderEngine` | Emails eligible voters without a `Participation` while Open; needs a provider and sender |

## Assurance tiers

| Tier | Status |
|---|---|
| A Standard | Implemented. AES-256-GCM, key from `VOTING_SELECTIONS_KEY` |
| B HighAssurance | Implemented. RSA-3072 pair generated in server memory by `CreateTrusteeKeys` (Draft/Ready, 2 or more trustees, threshold 2..n); private key split with Shamir over GF(256), shares returned once, commitments stored (`TrusteeKeyCommitment`), private key discarded. Shares live in process memory during the ceremony. Running results are not possible (`ResultsTiming` must be `AfterClose`) |
| C Verifiable | Not implemented. `OpenElection` refuses (`NotReady`), cast and tally return `TierNotSupported`, unless a `BaseVerifiableTallyProvider` is registered under `ElectionGuard`; none ships |

## Secrecy controls, as implemented

| Control | Where |
|---|---|
| No timestamps on ballot data: `TrackRecordChanges = false` on `CastBallot`, `BallotSelection`, `ContestRunningTally` | `codegen/additional-schema-info.json`; applied when CodeGen *creates* the entity (needs the MJ CodeGen change, see README) |
| Random clustered primary keys (`NEWID()`, `PRIMARY KEY CLUSTERED`) on those three tables, so physical order does not follow cast order | `migrations/V...Voting_Core_Schema.sql` |
| Every non-catalog table is created with `AutoAddPermissions` false and explicit role grants (see [security.md](security.md)); the poll book, audit trail, roll, credentials, proxies, trustees, results and certification also have `AllowDeleteAPI` false | `codegen/additional-schema-info.json`, `metadata/entity-permissions`, `metadata/row-level-security-filters` |
| `AutoAddPermissions`, `AllowDeleteAPI`, `AllowUserSearchAPI`, `AllowAllRowsAPI` false on all four ballot-box entities (also `AuditRecordAccess` / `AuditViewRuns` false on the three timestamp-free ones). `BallotAttribution` keeps change tracking: it only exists for non-Secret elections | `codegen/additional-schema-info.json` |
| Zero permissions except role `Voting Ballot Engine` (read/create/update, never delete), held only by MJ's system user. Voter operations authorize the caller, then run the engines as that principal (`OpenVoterSession`) | `metadata/roles`, `metadata/entity-permissions`, `metadata/user-roles` |
| No delete procedures for the ballot-box entities | Generated SQL (`AllowDeleteAPI: false`) |
| Entity-server write guards: ballot-box creation only inside `BallotBoxWriteGuard`; results only inside `TallyWriteGuard` while the election is `Closed`/`Tallied`; selections and participations immutable | `CoreEntitiesServer/src/entity-servers.ts` |
| `AllowCreateAPI` / `AllowUpdateAPI` **left on**: turning them off makes CodeGen omit `spCreate` / `spUpdate` and generate a `Save()` that always throws, so the cast engine could not write | `codegen/additional-schema-info.json` comments |
| `IncludeInAPI` **left on**: turning it off also removes the base view and procedures, leaving server code unable to use the entity. Permissions (none for any person or API key) close the API instead | same |
| Selections stored as ciphertext | `Server/src/crypto/selection-crypto.ts` |
| No `BallotAttribution` for Secret elections | `CastEngine.NeedsAttribution`; schema check `CK_Election_SecretIsFinal` forbids Secret revotes |
| Running results only at tier A, only from batched snapshots | `CK_Election_RunningResultsTierA`, `ResultsEngine` |
| Errors and logs carry codes, not input | `operation-support.ts` (`FailOperation`), cast and edge code |

Write-ins: a contest spec with `AllowWriteIn` gets an option flagged `IsWriteIn` (label `Write-in`) appended by
`CreateElection` when the spec names none (`EffectiveOptions`); the write-in text is validated and kept on the ballot
selection, and the votes count on that option.

The `PollBookVisible` contract helper encodes "do not show the poll book to an audience that sees running results", but
no operation currently exposes the poll book (turnout is counts only), so it is not enforced anywhere.
The integration tier (`03-unlinkability.test.ts` and others) checks several of these against a real database.

## Type drivers

`BaseElectionTypeServerDriver` hooks (all default to allow / no-op): `ValidateElectionChange`, `OnElectionChanged`,
`ValidateRollChange`, `OnRollFrozen`, `ValidateBallotStyle`, `BuildBallotStyle`, `ValidateCast`, `OnResultsTallied`,
`OnResultsCertified`. `OnRollFrozen`, `OnResultsTallied` and `OnResultsCertified` run inside their engine's transaction.
If an election type names a `ServerDriverClass` that is not registered, writes to elections of that type are refused.

## Database layer

Schema `__mj_BizAppsVoting`, entity prefix `MJ_BizApps_Voting: `. Groups: plug-in tables (`ElectionType`, `TallyMethod`,
`EligibilitySourceType`, `VoterCredentialMethod`); election (`Election`, `ElectionAnchor`, `Contest`, `ContestOption`,
`Nomination`, `NominationEndorsement`); roll and sign-in (`EligibleVoter`, `VoterCredential`, `BallotDistribution`,
`ProxyDesignation`); poll book (`Participation`); ballot box (`CastBallot`, `BallotSelection`, `BallotAttribution`);
results (`ContestRunningTally`, `ResultSnapshot`, `ContestResult`, `ContestOptionResult`, `ElectionCertification`,
`ElectionCertifier`, `ElectionAuditEvent`); tier B (`ElectionTrustee`, `TrusteeKeyCommitment`); standards ballots
(`StandardsBallotElection`, an IS-A child of `Election`, `BallotComment`, `CommentResolution`). Lockout state
(`FailedAttempts`, `LockedUntil`) lives on `VoterCredential`.
