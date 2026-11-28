# BizApps Voting Skill

The **BizApps Voting** Open App (`__mj_BizAppsVoting`) is installed in this MemberJunction environment. It powers secret, verifiable, and standards-compliant elections, board/committee motions, referendums, and polls. Use this skill whenever the user asks about upcoming or active elections and motions, voter turnout and quorum, election results or certification status, open-ballot comments, or administering motion votes.

## 1. Access Control, Ballot Secrecy & RLS

- **Never run raw SQL.** Always read voting records via `RunView` (with the calling user's `ContextUser`) or invoke the typed `MJ_BizApps_Voting: *` actions bound to this skill.
- **Least-privilege role and RLS enforcement is strict:**
  - **Ordinary signed-in users (`UI` role)** only see `Elections`, `Contests`, `Contest Options`, and `Standards Ballot Elections` once the voter roll is frozen (`RollFrozenAt IS NOT NULL`), `Ballot Comments` and `Comment Resolutions` only on `SecrecyMode = 'Open'` frozen elections, and `Election Certifications` / `Election Certifiers` only when `Status = 'Certified'`. They cannot read `Cast Ballots`, `Ballot Selections`, `Ballot Attributions`, `Eligible Voters`, `Participations`, or uncertified `Contest Results`.
  - **Voting Administrator** and **Election Inspector** roles hold read visibility into draft elections, voter rolls, turnout, audit events, and results per their role grants.
  - **Ballot secrecy is inviolable:** Never attempt to correlate a voter (`Eligible Voters` / `Participations`) to a `Cast Ballots` or `Ballot Selections` row on `Secret` or `Confidential` elections.
- **Server-side viewer resolution on results:** `MJ_BizApps_Voting: Get Election Results` resolves the caller's role, eligibility, and participation server-side from `ContextUser` and enforces `ResultsTiming` (`'Live' | 'AfterVoting' | 'AfterClose' | 'AdministratorsOnly'`) and `ResultsAudience` (`'Public' | 'HostMembers' | 'Eligible' | 'Voters' | 'Administrators'`). When `Visible = false`, report the returned `Reason` clearly and do not speculate on tallies.
- **Confirm before state transitions:** Always confirm with the user before calling `Create Motion Vote`, `Open Election`, `Close Election`, or `Tally Election`.

## 2. Core Entities & Lifecycles

### Election Configuration & Contests
- **`MJ_BizApps_Voting: Elections`**: Core election/motion record.
  - `Status`: `'Draft' | 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Tallied' | 'Certified' | 'Cancelled'`.
  - Key fields: `Name`, `Description`, `ElectionType`, `SecrecyMode` (`'Open' | 'Confidential' | 'Secret'`), `AssuranceTier` (`'Standard' | 'HighAssurance' | 'Verifiable'`), `OpensAt`, `ClosesAt`, `NominationsOpenAt`, `NominationsCloseAt`, `RollFrozenAt`, `AllowRevote`, `ResultsTiming`, `ResultsAudience`, `ResultsMinCast`, `PublishPollBook`.
- **`MJ_BizApps_Voting: Contests`**: Individual motions, offices, amendments, questions, or standards items within an election (`ElectionID`, `Name`, `Description`, `Kind`: `'Motion' | 'Office' | 'Amendment' | 'Question' | 'StandardsItem'`, `Seats`, `TallyMethod`, `Threshold`: `'Majority' | 'TwoThirds' | 'ThreeFifths' | 'ThreeQuarters' | 'Unanimous' | 'Custom' | 'None'`, `ThresholdBasis`: `'VotesCast' | 'Eligible'`, `AllowAbstain`, `AllowWriteIn`).
- **`MJ_BizApps_Voting: Contest Options`**: Choices or candidates for a contest (`ContestID`, `Label`, `Description`, `CandidatePersonID`, `Sequence`, `Status`: `'Active' | 'Withdrawn'`).
- **`MJ_BizApps_Voting: Standards Ballot Elections`**: Extension for standards ballots (`DocumentTitle`, `DocumentVersion`, `RecirculationRound`, `PriorElectionID`).
- **`MJ_BizApps_Voting: Election Anchors`**: Polymorphic links tying an election to a committee, board, or parent record (`ElectionID`, `EntityID`, `RecordID`, `Role`, `IsPrimary`).

### Participation, Nominations, Comments & Results
- **`MJ_BizApps_Voting: Eligible Voters`** & **`MJ_BizApps_Voting: Participations`**: Roll entries (`Status`: `'Eligible' | 'Challenged' | 'Removed'`, `VotingClass`, `Weight`) and poll-book records (`Channel`: `'Online' | 'InPerson' | 'Paper' | 'Proxy'`, `CastAt`) — admin/inspector scoped.
- **`MJ_BizApps_Voting: Nominations`** & **`MJ_BizApps_Voting: Proxy Designations`**: Candidate nominations (`Status`: `'Submitted' | 'Accepted' | 'Approved' | 'Rejected' | 'Declined' | 'Withdrawn'`) and proxy assignments (`Scope`: `'General' | 'Directed'`, `Status`: `'Pending' | 'Accepted' | 'Rejected' | 'Revoked' | 'Used'`).
- **`MJ_BizApps_Voting: Ballot Comments`** & **`MJ_BizApps_Voting: Comment Resolutions`**: Editorial/technical/general comments on ballots and their dispositions (`'Accepted' | 'AcceptedInPrinciple' | 'Deferred' | 'Rejected' | 'Withdrawn'`).
- **`MJ_BizApps_Voting: Contest Results`**, **`MJ_BizApps_Voting: Contest Option Results`**, **`MJ_BizApps_Voting: Election Certifications`**, **`MJ_BizApps_Voting: Election Certifiers`**, and **`MJ_BizApps_Voting: Election Audit Events`**: Outcomes (`'Passed' | 'Failed' | 'Decided' | 'Tied' | 'NoQuorum' | 'Void'`), formal certification sign-off (`'Draft' | 'Certified' | 'Revoked'`), and immutable audit trail.

## 3. Typed Action Playbook

1. **Create a motion vote**: Call `MJ_BizApps_Voting: Create Motion Vote` (`Name`, `MotionText`, `EligibilitySourceCode`, `ClosesAt`, optional `Threshold`, `AnchorEntityName` + `AnchorRecordID`, `EligibilitySourceSettings`, `ElectionTypeCode`).
2. **Open or close voting**: Call `MJ_BizApps_Voting: Open Election` (`ElectionID`) or `MJ_BizApps_Voting: Close Election` (`ElectionID`). Requires `Voting Administrator`.
3. **Check turnout and quorum**: Call `MJ_BizApps_Voting: Get Turnout` (`ElectionID`). Returns `VoterCount`, `TurnoutCount`, `TurnoutPercent`, `QuorumMet`, and channel/method breakdown in `TurnoutJSON`. Requires `Voting Administrator` or `Election Inspector`.
4. **Retrieve election results**: Call `MJ_BizApps_Voting: Get Election Results` (`ElectionID`). Returns `Visible`, `IsFinal`, `Reason`, and `ResultsJSON` scoped to the calling user.
5. **Tally a closed election**: Call `MJ_BizApps_Voting: Tally Election` (`ElectionID`, optional `TieBreakSeed`). Requires `Voting Administrator`.

## 4. Common Chief of Staff Workflows

- **"What elections or motions are currently open?"** Query `MJ_BizApps_Voting: Elections` via `RunView` where `Status = 'Open'` ordered by `ClosesAt ASC`. Ordinary members automatically see only frozen-roll elections.
- **"Have we hit quorum on election X?"** Call `MJ_BizApps_Voting: Get Turnout` for `ElectionID`. If the caller lacks Administrator/Inspector permission (`FORBIDDEN`), explain clearly that turnout monitoring is restricted to election administrators and inspectors.
- **"What are the results of election X?"** Call `MJ_BizApps_Voting: Get Election Results`. If `Visible` is `false`, relay `Reason` (e.g., results are withheld until after close or restricted by audience).
- **"Spin up a yes/no board motion vote."** Confirm the motion wording, eligibility source, threshold, and close timestamp with the user, then call `MJ_BizApps_Voting: Create Motion Vote`.
