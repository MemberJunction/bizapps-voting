# @mj-biz-apps/voting-server

The server bootstrap package. MJAPI's dynamic package loader calls `LoadBizAppsVotingServer()` (the `startupExport` in
`mj-app.json`); importing the package registers everything below. It also exports `MJ_SERVER_EXTENSIONS` and declares
`memberjunction.serverExtensions` so the public ballot edge mounts with no host configuration.

## Layout (`src/`)

| Folder | Contents |
|---|---|
| `engines/` | `ElectionAdministrationEngine`, `BallotStyleBuilder`, `CastEngine`, `VoterRollEngine`, `CredentialEngine`, `NominationEngine`, `CommentEngine`, `TallyEngine`, `ResultsEngine`, `CertificationEngine`, `TrusteeEngine`, `ReminderEngine` (`BaseSingleton`s; all the logic) |
| `operations/` | The 24 Remote Operations (`@RegisterClass(BaseRemotableOperation, 'Voting.<Name>')`): 7 voter (guest-scoped via `GuestMayAccessElection`), 16 administrator, 1 trustee. Thin wrappers over engines |
| `edge/` | `VotingBallotEdge` server extension: `GET /vote/:slug`, `GET /vote/:slug/info`, `POST /vote/session`, `GET /vote/element/main.js`; pure policy, rate limiter, request validation, session claims |
| `credentials/` | `BaseVoterCredentialMethod` and the drivers: emailed link, host assertion, SSO, MJ session, second factor |
| `eligibility/` | `BaseEligibilitySource` and the drivers: Entity Query, CSV |
| `crypto/` | `selection-crypto` (AES-256-GCM `v1:a:`, hybrid RSA-OAEP `v1:b:`), `shamir` (GF(256)), trustee commitments, `BaseVerifiableTallyProvider` seam (tier C) |
| `jobs/` | Scheduled jobs: `ElectionSchedulerJob`, `ResultSnapshotPublisherJob`, `ReminderSenderJob` |
| `shared/` | `VotingContext`, `EngineResult`/`Ok`/`Fail`, `ElectionGraph`, `VotingAuthorization`, `VoterIdentityResolver`, `ElectionAudit`, system-user helpers |
| `generated/` | CodeGen GraphQL resolvers (`RESOLVER_PATHS`) |

The package root exports `LoadBizAppsVotingServer`, `MJ_SERVER_EXTENSIONS`, `RESOLVER_PATHS`, the engines and `shared/`.
`BaseEligibilitySource` and `BaseVoterCredentialMethod` are not re-exported from the root; import them from
`@mj-biz-apps/voting-server/dist/eligibility/...` and `.../dist/credentials/...` (the package has no `exports` map).

## Configuration

- `VOTING_SELECTIONS_KEY`: base64, 32 bytes. Production fails closed without it; elsewhere a derived dev key is used with a
  warning.
- `VOTING_EMAIL_PROVIDER`, `VOTING_EMAIL_FROM`: reminders only (job Configuration `ProviderName` / `From` override them).
- Ballot emails use the `emailed-link` method's `Configuration` (`FromAddress`, optional `ProviderName`, `FromName`, `Subject`).
- Edge extension `Settings`: `SessionTtlMinutes`, `RateLimitWindowMs`, `RateLimitMax`, `RateLimitMaxGlobal`,
  `TrustedProxyHops`, `ApplicationName`, `GuestRoleName`. MJ `magicLink.enabled` must be `true`.
- Data access goes through the host's MJ provider; there is no separate connection.

## Dependencies

Hard: `voting-entities`, `voting-engine-base`, `voting-core-entities-server`, `voting-actions`. Peers: `@memberjunction/core`,
`global`, `server` (needs the not-yet-released exports listed in the root README), `server-extensions-core`,
`communication-engine`, `scheduling-engine`, and others in `package.json`.

See [Architecture](../../docs/voting/architecture.md), [Operations](../../docs/voting/operations.md),
[Embedding](../../docs/voting/embedding.md), [Runbook](../../docs/voting/operations-runbook.md).
