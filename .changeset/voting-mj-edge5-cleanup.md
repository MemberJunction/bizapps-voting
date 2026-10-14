---
"@mj-biz-apps/voting-entities": minor
"@mj-biz-apps/voting-engine-base": minor
"@mj-biz-apps/voting-core-entities-server": minor
"@mj-biz-apps/voting-server": minor
"@mj-biz-apps/voting-actions": minor
"@mj-biz-apps/voting-ng-widgets": minor
"@mj-biz-apps/voting-ng": minor
---

Write-ins, re-tally as the recount path, decisive-only STV tie flags, member-readable election columns, the acting
user on audit events, refusal of late ballot distributions, receipt verification in `<mj-ballot>`, and a voting
entity-permission metadata change. Moves to MemberJunction `6.2.0-edge.5`: the ballot edge declares `OwnsCORS` instead of
reordering the host's Express router, and the test harnesses drop their stopgaps for MJ's global-provider IS-A lookup and
the 5-second client RunView replay.
