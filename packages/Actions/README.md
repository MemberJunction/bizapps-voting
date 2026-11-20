# @mj-biz-apps/voting-actions

Six MemberJunction Actions for agents, workflows and low-code. Each one executes the matching **Remote Operation** as the
context user (`BaseVotingAction.buildOperationOptions`); none calls an engine directly. Actions are for metadata-driven
callers; in code, call the operations or engines.

| Action (`MJ_BizApps_Voting: ...`) | Operation | Parameters |
|---|---|---|
| Create Motion Vote | `Voting.CreateElection` | in: `Name`, `MotionText`, `EligibilitySourceCode`, `ClosesAt` (required), `AnchorEntityName`, `AnchorRecordID`, `EligibilitySourceSettings`, `Threshold`, `ElectionTypeCode`; out: `ElectionID` |
| Open Election | `Voting.OpenElection` | in: `ElectionID`; out: `Status` |
| Close Election | `Voting.CloseElection` | in: `ElectionID`; out: `Status` |
| Get Turnout | `Voting.GetTurnout` | in: `ElectionID`; out: `VoterCount`, `TurnoutCount`, `TurnoutPercent`, `QuorumMet`, `TurnoutJSON` |
| Get Election Results | `Voting.GetResults` | in: `ElectionID`; out: `ResultsJSON`, `Visible`, `IsFinal`, `Reason` (the viewer is resolved from the calling user) |
| Tally Election | `Voting.Tally` | in: `ElectionID`, `TieBreakSeed`; out: `Status`, `ContestsJSON` |

There is no Action for updating, cancelling or certifying elections, issuing credentials or sending reminders (reminders are
a scheduled job). Action metadata is in `metadata/actions/.voting-actions.json`; the classes register through
`@RegisterClass(BaseAction, ...)` and `LoadBizAppsVotingActions()` keeps them from being tree-shaken.

A failed operation maps to an Action result with `ResultCode` from the transport (`FORBIDDEN`, `EXECUTION_ERROR`, ...) or
`OPERATION_FAILED` when the operation reports `Success: false`.

See [Operations reference](../../docs/voting/operations.md).
