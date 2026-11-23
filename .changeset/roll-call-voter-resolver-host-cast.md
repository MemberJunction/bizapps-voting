---
"@mj-biz-apps/voting-entities": minor
"@mj-biz-apps/voting-server": minor
---

Add `Voting.GetRollCall` / `ResultsEngine.GetRollCall` for named roll-call reads on `Open`-secrecy Standard-tier elections (refused unconditionally for `Confidential` and `Secret`), adopt Common's `ResolvePersonIDForUser` (raising the `mj-bizapps-common` floor to `>=5.59.0`), and add `CastEngine.CastForVoter` for single-call host ballot entry with `Participations.EnteredByUserID` and `BallotEntered` audit attribution.
