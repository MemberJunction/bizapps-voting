# Extending Voting

Election types, eligibility sources, sign-in methods and UI parts are plug-ins resolved through MJ's `ClassFactory` by
the class name stored in a metadata row. Tally methods are the exception (below). The engine never names a host app.

## Election type: server driver

Subclass `BaseElectionTypeServerDriver` (`@mj-biz-apps/voting-core-entities-server`), register it under the name in
`ElectionType.ServerDriverClass`, and make sure your package loads with the host. Every hook defaults to allow / no-op.

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    BaseElectionTypeServerDriver, type ElectionChangeContext, type ElectionResultsContext, type CastValidationContext,
} from '@mj-biz-apps/voting-core-entities-server';

@RegisterClass(BaseElectionTypeServerDriver, 'CommitteeMotionDriver')
export class CommitteeMotionDriver extends BaseElectionTypeServerDriver {
    public override async ValidateElectionChange(ctx: ElectionChangeContext): Promise<string | null> {
        return ctx.Action === 'Open' && !ctx.Election.Description ? 'A motion needs its text before opening.' : null; // null = allowed
    }

    public override async OnResultsTallied(ctx: ElectionResultsContext): Promise<void> {
        if (!ctx.PrimaryAnchor) return;                  // { EntityName, RecordID } of the primary ElectionAnchor
        await writeOutcome(ctx.PrimaryAnchor.RecordID, ctx.Results, ctx.Provider, ctx.ContextUser);
    }
}
```

| Hook | When | Returns |
|---|---|---|
| `ValidateElectionChange(ctx)` | Election save; `ctx.Action` is `Create`, `Update`, `Open`, `Close`, `Cancel`, `Tally`, `Certify`; `ctx.oldValues` on update | message or `null` |
| `OnElectionChanged(ctx)` | After an election save (a throw fails the save) | void |
| `ValidateRollChange(ctx)` | Roll `Freeze`, `Amend`, `Challenge` | message or `null` |
| `OnRollFrozen(ctx)` | After the freeze, inside its transaction | void |
| `ValidateBallotStyle(ctx)` | When opening (style built for no voting class) | message or `null` |
| `BuildBallotStyle(ctx)` | Each time a voter's style is built; return the (adjusted) `ctx.Style` | `BallotStyle` |
| `ValidateCast(ctx)` | Before a ballot is recorded; has `Submission`, `VotingClass`, `WeightClass`, never the voter's identity | message or `null` |
| `OnResultsTallied(ctx)` | **Inside** the tally transaction; a throw rolls the tally back | void |
| `OnResultsCertified(ctx)` | **Inside** the certification transaction | void |

Contexts share `ContextUser`, `Provider`, `Election`, `ElectionType`, `Configuration` (merged type defaults and
overrides). `ElectionResultsContext` adds `PrimaryAnchor` and `Results` (`ContestID`, `ContestName`, `Outcome`
`Passed|Failed|Decided|Tied|Void`; a no-quorum contest is reported as `Void`). If the type's `ServerDriverClass` is not
registered, writes to elections of that type are refused with a clear message. The seeded **Standards Ballot** type names
`StandardsBallotServerDriver` (`CoreEntitiesServer`, a worked example of a driver) and `StandardsBallotUIDriver`
(`AngularWidgets`), both shipped and registered. The server driver enforces: `SecrecyMode` Open; every contest a
`StandardsItem` with exactly Approve then Disapprove; a comment on every Disapprove (checked in `ValidateBallotStyle` and
`ValidateCast`); at Open, a Standards Ballot details row with a `DocumentTitle` (not at Create or Update, since the Document
step saves the row after the election); and a recirculation (`RecirculationRound` 1+) following a Certified ballot of the
same type with the same `DocumentTitle`. The UI driver uses the vocabulary Item / Position / Ballot, adds a **Document**
setup step and details form, and, for Open ballots, a **Comments** results view listing comments with their resolutions.

## Election type: UI driver and contributions

`BaseElectionTypeUIDriver` (`@mj-biz-apps/voting-ng-widgets`), registered under `ElectionType.UIDriverClass`, adjusts what
Explorer shows for the type. Each method receives the defaults and returns the final list: `GetAdminTabs`,
`GetSetupSteps`, `GetDetailsForm`, `GetResultsViews`, `GetVocabulary`.

```typescript
@RegisterClass(BaseElectionTypeUIDriver, 'CommitteeMotionUIDriver')
export class CommitteeMotionUIDriver extends BaseElectionTypeUIDriver {
    public override GetVocabulary(ctx: ElectionUIContext, defaults: ElectionVocabulary): ElectionVocabulary {
        return { ...defaults, Election: 'Motion', Voter: 'Member' };
    }
}
```

Other apps **add** parts (they cannot replace built-ins; a clashing key is refused and logged) by registering components
with `RegisterClassEx` and metadata `{ contributionKey, electionTypes: ['code' | '*'], label, icon?, sequence? }`:

| Part | Base class | Gets |
|---|---|---|
| Admin tab | `BaseElectionAdminTab` | `ElectionID`, `ElectionTypeCode`, `ElectionStatus`, `IsAdministrator` |
| Setup wizard step | `BaseElectionSetupStep` | `ElectionID`, `ElectionTypeCode`, `StepNumber`; outputs `Valid`, `Changed` |
| Results view | `BaseElectionResultsView` | `ElectionID`, `ElectionTypeCode`, `ElectionStatus`, `IsAdministrator`, `IsVoter` |

Built-in tabs: Overview, Roll, Credentials, Turnout, Close & Tally, Certification. Built-in wizard steps: Type, Details,
Contests & options, Eligibility, Linked records, Review. **A contributed wizard step can gate progress** (its `Valid`
output blocks Next while `false`) **but cannot add data** to the `Voting.CreateElection` input; the wizard builds that
input from the built-in steps only.

## Tally methods

A counting rule extends `BaseTallyMethodContract` (`@mj-biz-apps/voting-entities`, pure and deterministic, no I/O):

```typescript
export class MyTallyMethod extends BaseTallyMethodContract {
    public readonly Code = 'my-method';                       // matches TallyMethod.Code
    public Tally(input: TallyContestInput): TallyOutcome { /* ... */ }
}
```

`TallyContestInput` carries `Seats`, `OptionIDs` (for Motion/Question/Amendment the first is the affirmative), `Threshold`,
`ThresholdBasis`, `EligibleWeight`, weighted `Ballots` (`Weight`, `Abstain`, `Selections`) and a `TieBreakSeed`; use
`SeededRandom` for ties so the same seed reproduces the result. **There is no runtime registration:** the engine resolves
methods from the fixed `TALLY_METHODS` record in `packages/Entities/src/contracts/tally/registry.ts`, so a new method
means adding it there (a change to this package) and a `TallyMethod` metadata row (`Name`, `Code`, `DriverClass`,
`IsRanked`, `SupportsMultipleSeats`, `Status`). Ranked methods are `irv` and `stv`; add a code to
`RANKED_METHOD_CODES` in `ballot-style-builder.ts` for a new ranked method.

## Eligibility sources

Extend `BaseEligibilitySource` and implement `BuildRollReport(settings, recordDate, ctx)`; it returns
`{ Entries, Unmatched }` where an entry is `{ PersonID, RepresentingOrganizationID, VotingClass, Weight (> 0), SourceKey }`
and unmatched rows are row numbers and reasons, never personal data. `settings` is the source type's `Configuration`
merged with `Election.EligibilitySourceSettings`. Register with `@RegisterClass(BaseEligibilitySource, 'ClassName')` and add
an `EligibilitySourceType` row whose `DriverClass` is that name. Shipped: `entity-query` (`EntityName`, `ExtraFilter`,
`PersonIDField`, `VotingClassField`, `WeightField`, `SourceKeyField`, `RepresentingOrganizationIDField`) and `csv`
(`Rows` or `CsvText` with columns Email, SourceKey, VotingClass, Weight, RepresentingOrganization; people are matched by
email, never created). The base classes are in `@mj-biz-apps/voting-server` under `dist/eligibility` (not re-exported
from the package root).

## Sign-in (credential) methods

Extend `BaseVoterCredentialMethod`: implement `Verify(presentation, distribution, electionID, ctx, method)` returning
`EngineResult<{ EligibleVoterID }>`, and optionally `Issue(target, options, ctx)` (default: skipped). Never log or echo the
presentation; return `InvalidCredential()` for every failure. Register with
`@RegisterClass(BaseVoterCredentialMethod, 'ClassName')` and add a `VoterCredentialMethod` row (`Code`, `DriverClass`,
`IsSecondFactor`, `RequiresIssuance`, `Configuration`). The public edge reads only `Token`, `Assertion`, `SourceKey`, `Pin`
and `SecondFactor` from the request, and refuses the codes `sso` and `mj-session` outright, so a custom method that needs
other inputs needs edge changes. Shipped: `emailed-link`, `host-assertion`, `sso`, `mj-session`, `second-factor`. Base
class in `dist/credentials`.

## Metadata

Seed rows live in `metadata/` (`election-types`, `tally-methods`, `eligibility-source-types`, `voter-credential-methods`,
roles, permissions, scheduled jobs) and are pushed with `mj sync push`; push is upsert-only, so removing a row needs a
migration. An election type's `Configuration` holds defaults (`SecrecyMode`, `AssuranceTier`, `ResultsTiming`,
`ResultsAudience`, `ResultsMinCast`, `AllowRevote`, `AllowedContestKinds`, `AllowedCredentialMethodCodes`,
`DefaultTallyMethodCode`, ...) and `OverridableKeys`, the only keys an individual election may override.

An election's own `Configuration` column is readable by every signed-in member once the roll is frozen (row-level
security hides rows, not columns), so the Elections entity server refuses any key that is not documented
(`ELECTION_CONFIGURATION_KEYS`: `Quorum`, `Reminders`, `Languages`, `IndependentAdministrator`, `RequiredCertifiers` and
the type defaults above), listed in the type's `OverridableKeys`, or declared by the type's server driver
(`BaseElectionTypeServerDriver.ConfigurationKeys`). Declare only public governance parameters there; never credentials,
roll data or private notes.

## Testing and CI

Unit tests are vitest, next to the code (`pnpm test` at the repo root runs them through turbo). The database-backed tier is
described in the README. A CI check keeps host-app names out of the engine, and the element build fails if server-only
modules enter the `<mj-ballot>` bundle.
