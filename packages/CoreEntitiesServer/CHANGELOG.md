# @mj-biz-apps/voting-core-entities-server

## 1.0.0

### Major Changes

- 115ef82: Adopt OpenApp LTS release lines and cut the 6.2 release line (`lts/6.2`, MJ 6.2.1), moving bizapps-voting out of `0.x` to `1.0.0`.

### Minor Changes

- 463cba3: First schema drop for BizApps Voting: elections, contests and options, nominations, the voter
  roll and credentials, ballot distributions, proxies, the poll book (Participation) and the
  ballot box (CastBallot, BallotSelection) kept unlinkable, results, certification, the tier-B
  trustee tables and standards-ballot comments, with their CodeGen-generated entities, views,
  procedures and forms.
- 8b354e1: Write-ins, re-tally as the recount path, decisive-only STV tie flags, member-readable election columns, the acting
  user on audit events, refusal of late ballot distributions, receipt verification in `<mj-ballot>`, and a voting
  entity-permission metadata change. Moves to MemberJunction `6.2.0-edge.5`: the ballot edge declares `OwnsCORS` instead of
  reordering the host's Express router, and the test harnesses drop their stopgaps for MJ's global-provider IS-A lookup and
  the 5-second client RunView replay.

### Patch Changes

- Updated dependencies [115ef82]
- Updated dependencies [72f6621]
- Updated dependencies [463cba3]
- Updated dependencies [8b354e1]
  - @mj-biz-apps/voting-entities@1.0.0
