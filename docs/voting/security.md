# Security and permissions

Who can read or write what, and why. The rule behind it: **a table that identifies a voter, holds a credential, records who
voted, audits the election, or holds results that are not yet published is closed to ordinary users.** Members reach their
own data only through Remote Operations, which authorize the caller first and then act as the system principal.

## Principals and roles

| Principal | What it is |
|---|---|
| Guest ballot session | A scope-limited magic-link principal minted by the public edge, bound to exactly `electionId:eligibleVoterId`. Holds no entity grants at all |
| Member (`UI` role) | Every signed-in Explorer user. Read-only access to election *configuration* (below) and the catalogs |
| `Voting Administrator` | Runs elections. Administrative operations run as this user, so the role holds what those engines touch |
| `Election Inspector` | Observes (roll, poll book, audit, results) and co-signs the certification |
| `Voting Ballot Engine` | Held only by the MJ system user. The engines act as the system principal for voter operations, the public edge, scheduled jobs and the ballot box |
| `Developer`, `Integration` | Hold **nothing** on the voting tables except the four catalogs. Administering elections is a `Voting Administrator` grant, not a platform perk (`VotingAuthorization.IsAdministrator` is that role or the system user) |

## How the tables are protected

`codegen/additional-schema-info.json` creates every table except the four catalogs (Election Types, Tally Methods,
Eligibility Source Types, Voter Credential Methods) with **no role permissions** (`AutoAddPermissions: false`; CodeGen's
defaults would give every UI user read and Developer/Integration full CRUD). The grants are explicit metadata:
`metadata/entity-permissions/.entity-permissions.json` (ballot box) and `.voting-permissions.json` (everything else).
The poll book, audit trail, roll, credentials, proxies, trustees, key commitments, result rows and certification also have
`AllowDeleteAPI: false`: no delete procedure and no GraphQL delete. A row leaves those tables by a status change
(`Removed`, `Revoked`, `Superseded`), never by DELETE. The entity-server classes in `CoreEntitiesServer` (write guards,
immutability, lifecycle locks) stay in force underneath the grants.

### Grant matrix (C create, R read, U update, D delete)

| Table | UI | Voting Administrator | Election Inspector | Voting Ballot Engine |
|---|---|---|---|---|
| Elections, Contests, Contest Options, Standards Ballot Elections | R, rows with a frozen roll only | CRU | R | CRU |
| Election Types, Tally Methods, Eligibility Source Types, Voter Credential Methods | R (default) | via UI | via UI | R (also Developer/Integration CRUD: seeded metadata) |
| Election Anchors | - | CRU | R | CRU |
| Nominations | - | RU | R | CRU |
| Nomination Endorsements | - | R | R | CRU |
| Eligible Voters (the roll) | - | CRU | R | CRU |
| Voter Credentials | - | CRU | - | CRU |
| Ballot Distributions | - | CRU | R | CRU |
| Proxy Designations | - | RU | R | CRU |
| Participations (poll book: who voted) | - | R | R | CR |
| Election Audit Events | - | CR | CR | CR |
| Result Snapshots | - | R | R | CRU |
| Contest Results, Contest Option Results | - | CRU | R | CRU |
| Election Certifications, Election Certifiers | R, certified elections only | CRU | CRU | CRU |
| Election Trustees | - | CRU | - | CRU |
| Trustee Key Commitments | - | CR (the key ceremony writes each once; never rewritten) | - | CR (no role may rewrite a commitment: every submitted share is checked against it) |
| Ballot Comments | R, Open ballots only | R | R | CRUD (a revote replaces its comments) |
| Comment Resolutions | R, Open ballots only | CRU | R | CRU |
| Cast Ballots, Ballot Selections, Contest Running Tallies, Ballot Attributions | - | - | - | CRU |

No role holds DELETE anywhere except the engine on Ballot Comments (and Developer/Integration on the four catalogs).
Ballot Distributions are also guarded by their entity server class: a distribution cannot be created for (or moved to) a
Closed, Tallied, Certified or Cancelled election, whoever holds the grant.
The engine role is a superset of what a Voting Administrator holds because administrative operations run as the system
user in tests, jobs and API-key flows.

### Row-level security for members (`metadata/row-level-security-filters`)

UI read on the configuration tables is filtered, and a user who also holds an unfiltered grant (administrators, inspectors,
the system user) is exempt:

- **Elections, Contests, Contest Options, Standards Ballot Elections**: visible once `RollFrozenAt IS NOT NULL`.

### What a member can read of an election row

Row-level security hides rows, not columns, and MJ has no field-level read permission, so every column of a frozen election
is readable by members. The two free-form JSON columns are made safe on the write side:

- **`EligibilitySourceSettings`** says how to find the roll: an inline CSV of voters' emails, an entity name and filter that
  reveal how voters were selected, or a third-party source's keys. Nothing reads it after the freeze (the roll then lives in
  Eligible Voters, and a roll is frozen once), so the freeze replaces it with `{ SettingsRedactedAtFreeze, SettingsSha256 }`
  (`RedactSourceSettingsAtFreeze`); the same digest is recorded in the `RollFrozen` audit event, so an administrator holding
  the original settings can match them. Draft elections, which still carry the settings, are hidden from members.
- **`Configuration`** is needed at run time (quorum, reminders, required certifiers), so it cannot be redacted. It is limited
  instead: the Elections entity server refuses any key that is not documented (`ELECTION_CONFIGURATION_KEYS`: `Quorum`,
  `Reminders`, `Languages`, `IndependentAdministrator`, `RequiredCertifiers` and the overridable type defaults such as
  `ResultsMinCast` or `AllowRevote`), listed in the type's `OverridableKeys`, or declared by the type's server driver
  (`ConfigurationKeys`). Each of those is a public governance parameter that members are entitled to know (how many votes
  make a quorum, how many certifiers sign). Free text, notes, credentials or roll data have no key to go in.
- The remaining columns are the election's public definition (name, dates, modes, `RollHash`, `ElectionPublicKey`, which is
  a public key) and hold nothing secret.

`wire-secrecy.X13` reads frozen election rows as a member and asserts both; `12-permission-model` checks the stored
values and the refusal.
- **Ballot Comments, Comment Resolutions**: only for Open-secrecy elections with a frozen roll.
- **Election Certifications, Certifiers**: only once `Status = 'Certified'`.

## Voter operations: authorize first, then act as the system principal

A guest or an ordinary member has no grant on the roll, poll book, credentials, trustee tables or results, so a voter
operation cannot read them with the caller's permissions. Every voter operation therefore follows one pattern, in
`operations/operation-support.ts`:

1. `OpenVoterSession(electionId, caller)` authorizes the caller from claims the platform already verified. A guest's signed
   scope must name exactly this election and a voter who is still `Eligible` on its roll. A member is matched through the
   Person linked to their MJ user (`LinkedUserID`, then email) to an `Eligible` roll entry. No match returns `null` and the
   operation answers `You are not on the roll for this election.`
2. The roll and Person lookups for that match run as the system principal (`VoterIdentityResolver`); only the matched
   `EligibleVoterID` leaves.
3. The session's `Engine` context (same provider, system user) is handed to the engines, keyed by the session's own
   `EligibleVoterID` and `ElectionID`, never by a caller-supplied id. The response carries only that caller's data.

Operations that authorize without a roll entry use `EngineContextAfterAuthorization(caller)`, after their own check:
`GetResults` (the results engine applies the election's audience and timing rule to the caller; a non-voter is simply
"not eligible"), `VerifyReceipt` (the receipt code is the bearer secret; the answer is found/counted only) and
`SubmitKeyShare` (the engine matches the caller's Person to the trustee that owns the share).

Certification follows the same idea for its one cross-grant write: `Voting.Certify` authorizes an administrator or an
Election Inspector, the signer writes the certification and certifier rows as themselves (inspectors hold CRU there), and
the last required signature's move of the election to `Certified` (plus the type driver's `OnResultsCertified`) runs as the
system principal, since inspectors hold only R on Elections (`CertificationEngine.markElectionCertified`).

Audit attribution: the system context a voter operation runs under keeps the authorized caller as its `Actor`
(`SystemContext`, `VotingContext.Actor`), and `ElectionAudit.Record` names that caller: `ActorUserID` is the member's MJ user,
and a guest ballot session (whose principal is not a stored user) is recorded in the event's details as
`ActorEligibleVoterID`. Only events that already existed get an actor; the cast writes no audit event, and no event carries
ballot content (`wire-secrecy.X06`), so naming the actor reveals nothing the poll book does not already hold. The plain
system user (scheduled jobs, the public edge before sign-in) is still recorded as no actor. Administrative operations run as
the administrator, who is named as before; the certification's status move, made as the system principal, names the
signer.

## API scopes

Operations declare `voting:vote` (voter), `voting:admin` (administration, inspection) or `voting:trustee`.
`metadata/api-scopes` ships the parent `voting` scope with those three children, and `metadata/api-application-scopes`
allows them on the `MJAPI` application, so API keys can be issued for them. A scope only lets a key reach an operation:
the operation still authorizes the caller (roll entry or session binding for voter operations; the role for the others).

## Verification

`packages/IntegrationTests/src/__tests__/12-permission-model.test.ts` asserts the matrix against the database (no
sensitive grant to UI/Developer/Integration, no DELETE outside the allowed few, UI read only with a filter), the role
behaviour of in-memory principals, the draft/frozen visibility and redaction, and the scopes.
`04-access.test.ts` covers the ballot box. Unit tests: `voter-session.test.ts`, `redact-source-settings.test.ts`,
`audit-actor.test.ts`, `operations.auth.test.ts`; the wire tier asserts the matrix cell by cell (`wire-access`), including
that not even the system user may update a trustee key commitment.
