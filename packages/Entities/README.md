# @mj-biz-apps/voting-entities

Browser-safe entity and contract package for BizApps Voting.

## Exports

- **Entity classes** `mjBizAppsVoting*Entity` (CodeGen output, `src/generated/entity_subclasses.ts`; never hand-edit).
- **Remote Operation bases**: 29 `Voting<Name>Operation` classes with `Voting<Name>Input` / `Voting<Name>Output` types
  (`src/generated/remote_operations.ts`, generated from `metadata/remote-operations`). The server bodies are in
  `@mj-biz-apps/voting-server`.
- **`ElectionSubtypeResolver` / `ElectionSubtypeDirectory`** and `LoadElectionSubtypeResolver()`: the IS-A resolver for
  elections whose type has an extension entity (Standards Ballot).
- **Contracts**, also importable as `@mj-biz-apps/voting-entities/contracts` (pure TypeScript, no MemberJunction imports; the
  `<mj-ballot>` bundle uses only this):
  - types: `BallotStyle`, `BallotSubmission`, `TallyContestInput`, `TallyOutcome`, `SecrecyMode`, `AssuranceTier`, ...
  - `ValidateSubmission`, `ComputeBallotStyleHash`, `CanonicalJSON`, `Sha256Hex`
  - `CanTransition`, `ALLOWED_TRANSITIONS`, `IsConfigurationLocked`, `IsTerminal`
  - `ResolveElectionConfiguration`, `ValidateResolvedConfiguration`, `VOTING_APP_DEFAULTS`
  - `ResultsVisible`, `PollBookVisible`, `FirstPreferencesOnly`, `WeightClassOf`, `RepresentativeWeights`, `SuppressSmallClasses`
  - `FormatReceiptCode`, `IsReceiptCode`, `NormalizeReceiptCode`
  - `ContestAppliesToVoter`, `FilterBallotStyleForVoter`
  - tally: `BaseTallyMethodContract`, `TALLY_METHODS`, `GetTallyMethod`, `SeededRandom`, and the Plurality, Majority, Approval,
    IRV and STV implementations (`src/contracts/tally`)

The tally registry is a fixed record: adding a counting rule means changing this package.

`@memberjunction/core` and `global` are peer dependencies. See [Operations reference](../../docs/voting/operations.md).
