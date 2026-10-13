# @mj-biz-apps/voting-engine-base

`VotingEngineBase`: a `BaseEngine` singleton (`RegisterForStartup`) that caches the four plug-in tables so both server and
client code can look them up without querying.

```typescript
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';

const engine = VotingEngineBase.Instance;
await engine.Config(false, contextUser, provider);
const type = engine.GetElectionTypeByCode('motion');
const config = engine.GetElectionTypeConfiguration(type!.ID);   // parsed type Configuration
```

- Collections: `ElectionTypes`, `TallyMethods`, `EligibilitySourceTypes`, `VoterCredentialMethods`, and `Active...` variants.
- Lookups: `GetElectionTypeByID` / `ByCode`, `GetTallyMethodByID` / `ByCode`, `GetEligibilitySourceTypeByID` / `ByCode`,
  `GetVoterCredentialMethodByID` / `ByCode`.
- `GetElectionTypeConfiguration(typeID)` returns the type's configuration defaults; the full layering with app defaults and
  per-election overrides is `ResolveElectionConfiguration` in `@mj-biz-apps/voting-entities`.

Depends on `@mj-biz-apps/voting-entities`; `@memberjunction/core` and `global` are peers.

See [Architecture](../../docs/voting/architecture.md).
