# @mj-biz-apps/voting-core-entities-server

Server-only entity subclasses and driver infrastructure. It must never be imported by client code. A dependency of
`@mj-biz-apps/voting-server`; listed as a `library` in `mj-app.json`.

## Exports

- **Entity server classes** (`@RegisterClass(BaseEntity, ...)`) for Elections, Contests, Contest Options, Election Anchors,
  Eligible Voters, Cast Ballots, Ballot Selections, Contest Running Tallies, Ballot Attributions, Participations, Election
  Audit Events, Contest Results, Contest Option Results and Election Types. They enforce the election state machine, the
  configuration lock from `Open`, immutability (participations, audit events, ballot selections), and the ballot-box and
  result write rules. Async validation cannot be skipped on these classes.
- **`BallotBoxWriteGuard.RunWithBallotBoxAccess(fn)`** and **`TallyWriteGuard.RunWithTallyAccess(fn)`**: `AsyncLocalStorage`
  scopes that the cast and tally engines enter; creating ballot-box rows or writing results outside them is refused.
- **`BaseElectionTypeServerDriver`** (hooks `ValidateElectionChange`, `OnElectionChanged`, `ValidateRollChange`,
  `OnRollFrozen`, `ValidateBallotStyle`, `BuildBallotStyle`, `ValidateCast`, `OnResultsTallied`, `OnResultsCertified`), its
  context types, and **`ElectionTypeDriverRegistry`** (`GetDriver(electionType)` resolves `ServerDriverClass` through the
  `ClassFactory`; an unregistered class returns an error and writes are refused; `Clear()`).
- **`StandardsBallotServerDriver`** (registered as `StandardsBallotServerDriver`): the Standards Ballot election type's rules (Open secrecy, Approve/Disapprove items, comment required on Disapprove, `DocumentTitle` required at Open, recirculation follows a Certified ballot on the same document). Its decision logic is exported as pure functions.
- Invariant helpers (`ComputeLockedFieldViolations`, `DescribeConfigurationLockRefusal`, ...) used by the entity classes.
- `LoadBizAppsVotingEntitiesServer()`: references every class so a bundler cannot drop a registration.

The state machine and lock rule themselves live in `@mj-biz-apps/voting-entities` (`CanTransition`, `IsConfigurationLocked`).

See [Architecture](../../docs/voting/architecture.md) and [Extending](../../docs/voting/extending.md).
