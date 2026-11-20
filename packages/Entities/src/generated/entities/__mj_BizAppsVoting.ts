import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

     
 
/**
 * zod schema definition for the entity MJ_BizApps_Voting: Ballot Attributions
 */
export const mjBizAppsVotingBallotAttributionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    CastBallotID: z.string().describe(`
        * * Field Name: CastBallotID
        * * Display Name: Cast Ballot
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Cast Ballots (vwCastBallots.ID)
        * * Description: The ballot.`),
    ParticipationID: z.string().describe(`
        * * Field Name: ParticipationID
        * * Display Name: Participation
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Participations (vwParticipations.ID)
        * * Description: The poll-book entry that cast it. A participation can own several ballots over time when revotes supersede earlier ones.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsVotingBallotAttributionEntityType = z.infer<typeof mjBizAppsVotingBallotAttributionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Ballot Comments
 */
export const mjBizAppsVotingBallotCommentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContestID: z.string().describe(`
        * * Field Name: ContestID
        * * Display Name: Contest ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
        * * Description: The standards item commented on.`),
    ParticipationID: z.string().describe(`
        * * Field Name: ParticipationID
        * * Display Name: Participation ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Participations (vwParticipations.ID)
        * * Description: The voter's poll-book entry (standards ballots are Open mode).`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Order of the voter's comments on the item.`),
    CommentType: z.union([z.literal('Editorial'), z.literal('General'), z.literal('Technical')]).describe(`
        * * Field Name: CommentType
        * * Display Name: Comment Type
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Technical
    * * Value List Type: List
    * * Possible Values 
    *   * Editorial
    *   * General
    *   * Technical
        * * Description: General, Technical or Editorial.`),
    DocumentReference: z.string().nullable().describe(`
        * * Field Name: DocumentReference
        * * Display Name: Document Reference
        * * SQL Data Type: nvarchar(255)
        * * Description: Where in the document the comment applies (clause, section, line).`),
    Comment: z.string().describe(`
        * * Field Name: Comment
        * * Display Name: Comment
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The comment.`),
    ProposedChange: z.string().nullable().describe(`
        * * Field Name: ProposedChange
        * * Display Name: Proposed Change
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The change the commenter proposes.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Contest: z.string().describe(`
        * * Field Name: Contest
        * * Display Name: Contest
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsVotingBallotCommentEntityType = z.infer<typeof mjBizAppsVotingBallotCommentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Ballot Distributions
 */
export const mjBizAppsVotingBallotDistributionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election whose ballot this distribution serves.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Administrator-facing name (for example 'Member portal' or 'Emailed link landing page').`),
    Slug: z.string().describe(`
        * * Field Name: Slug
        * * Display Name: Slug
        * * SQL Data Type: nvarchar(100)
        * * Description: URL slug used by /vote/:slug and the <mj-ballot slug> attribute. Unique across all elections.`),
    DistributionKey: z.string().describe(`
        * * Field Name: DistributionKey
        * * Display Name: Distribution Key
        * * SQL Data Type: nvarchar(100)
        * * Description: Public identifier used as the audience (aud) of host assertions for this distribution.`),
    Status: z.union([z.literal('Active'), z.literal('Draft'), z.literal('Paused'), z.literal('Retired')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Draft
    *   * Paused
    *   * Retired
        * * Description: Draft, Active (serving), Paused (temporarily refusing sessions) or Retired.`),
    AllowedOrigins: z.string().nullable().describe(`
        * * Field Name: AllowedOrigins
        * * Display Name: Allowed Origins
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of origins allowed to embed the ballot (custom element and iframe frame-ancestors).`),
    AllowedCredentialMethods: z.string().nullable().describe(`
        * * Field Name: AllowedCredentialMethods
        * * Display Name: Allowed Credential Methods
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON array of VoterCredentialMethod codes this distribution accepts.`),
    HostPublicKey: z.string().nullable().describe(`
        * * Field Name: HostPublicKey
        * * Display Name: Host Public Key
        * * SQL Data Type: nvarchar(MAX)
        * * Description: PEM public key, registered by an administrator, that host assertions for this distribution must be signed with. Never taken from a request.`),
    Theme: z.string().nullable().describe(`
        * * Field Name: Theme
        * * Display Name: Theme
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON theme tokens applied to the ballot widget.`),
    DefaultLanguage: z.string().describe(`
        * * Field Name: DefaultLanguage
        * * Display Name: Default Language
        * * SQL Data Type: nvarchar(20)
        * * Default Value: en
        * * Description: Language the ballot opens in when the voter has not chosen one.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingBallotDistributionEntityType = z.infer<typeof mjBizAppsVotingBallotDistributionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Ballot Selections
 */
export const mjBizAppsVotingBallotSelectionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    CastBallotID: z.string().describe(`
        * * Field Name: CastBallotID
        * * Display Name: Cast Ballot
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Cast Ballots (vwCastBallots.ID)
        * * Description: The ballot the selection came from.`),
    ContestID: z.string().describe(`
        * * Field Name: ContestID
        * * Display Name: Contest ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
        * * Description: The contest.`),
    ContestOptionID: z.string().nullable().describe(`
        * * Field Name: ContestOptionID
        * * Display Name: Contest Option
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
        * * Description: The option selected (the write-in placeholder option for a write-in). NULL for an abstention.`),
    Rank: z.number().nullable().describe(`
        * * Field Name: Rank
        * * Display Name: Rank
        * * SQL Data Type: int
        * * Description: For ranked contests: the preference order (1 = first choice).`),
    WriteInText: z.string().nullable().describe(`
        * * Field Name: WriteInText
        * * Display Name: Write-In Text
        * * SQL Data Type: nvarchar(MAX)
        * * Description: For a write-in: the text written. Field-encrypted at rest.`),
    IsAbstain: z.boolean().describe(`
        * * Field Name: IsAbstain
        * * Display Name: Is Abstain
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True for an explicit abstention.`),
    Contest: z.string().describe(`
        * * Field Name: Contest
        * * Display Name: Contest
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsVotingBallotSelectionEntityType = z.infer<typeof mjBizAppsVotingBallotSelectionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Cast Ballots
 */
export const mjBizAppsVotingCastBallotSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election. The only reference on a ballot.`),
    BallotStyleHash: z.string().describe(`
        * * Field Name: BallotStyleHash
        * * Display Name: Ballot Style Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: Hash of the ballot style the voter was shown, so the tally can verify every ballot was cast against the published style.`),
    ReceiptCode: z.string().describe(`
        * * Field Name: ReceiptCode
        * * Display Name: Receipt Code
        * * SQL Data Type: nvarchar(64)
        * * Description: Code returned to the voter to confirm the ballot was recorded (tier B: hash of the ciphertext, published after close).`),
    Selections: z.string().describe(`
        * * Field Name: Selections
        * * Display Name: Selections
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The voter's selections, encrypted: an opaque ciphertext envelope (v1:a:… under the app selections key at tier A, v1:b:… under the election public key at tiers B and C). Never plaintext; only the tally engine decrypts it, after close.`),
    VotingClass: z.string().nullable().describe(`
        * * Field Name: VotingClass
        * * Display Name: Voting Class
        * * SQL Data Type: nvarchar(100)
        * * Description: The voter's voting class, needed to count class-limited contests. Reported only for classes of at least the election's minimum size.`),
    WeightClass: z.string().nullable().describe(`
        * * Field Name: WeightClass
        * * Display Name: Weight Class
        * * SQL Data Type: nvarchar(50)
        * * Description: The weight class (bucket) the voter's weight falls in; the exact weight is never stored on the ballot.`),
    Status: z.union([z.literal('Counted'), z.literal('Spoiled'), z.literal('Superseded')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Counted
    * * Value List Type: List
    * * Possible Values 
    *   * Counted
    *   * Spoiled
    *   * Superseded
        * * Description: Counted, Superseded (replaced by a revote, Open and Confidential elections only) or Spoiled (voided by an audited decision).`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Description
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingCastBallotEntityType = z.infer<typeof mjBizAppsVotingCastBallotSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Comment Resolutions
 */
export const mjBizAppsVotingCommentResolutionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    BallotCommentID: z.string().describe(`
        * * Field Name: BallotCommentID
        * * Display Name: Ballot Comment
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Ballot Comments (vwBallotComments.ID)
        * * Description: The comment resolved.`),
    Disposition: z.union([z.literal('Accepted'), z.literal('AcceptedInPrinciple'), z.literal('Deferred'), z.literal('Rejected'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Disposition
        * * Display Name: Disposition
        * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * AcceptedInPrinciple
    *   * Deferred
    *   * Rejected
    *   * Withdrawn
        * * Description: Accepted, AcceptedInPrinciple, Rejected, Withdrawn or Deferred.`),
    Response: z.string().nullable().describe(`
        * * Field Name: Response
        * * Display Name: Committee Response
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The committee's response and the change made, if any.`),
    ResolvedByUserID: z.string().nullable().describe(`
        * * Field Name: ResolvedByUserID
        * * Display Name: Resolved By User ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: Who recorded the disposition.`),
    ResolvedAt: z.date().describe(`
        * * Field Name: ResolvedAt
        * * Display Name: Resolved At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When it was recorded.`),
    CommenterResponse: z.union([z.literal('Satisfied'), z.literal('Unsatisfied')]).nullable().describe(`
        * * Field Name: CommenterResponse
        * * Display Name: Commenter Response
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Satisfied
    *   * Unsatisfied
        * * Description: Whether the commenter is Satisfied or Unsatisfied with the resolution (drives recirculation).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ResolvedByUser: z.string().nullable().describe(`
        * * Field Name: ResolvedByUser
        * * Display Name: Resolved By User
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsVotingCommentResolutionEntityType = z.infer<typeof mjBizAppsVotingCommentResolutionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Contest Option Results
 */
export const mjBizAppsVotingContestOptionResultSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContestResultID: z.string().describe(`
        * * Field Name: ContestResultID
        * * Display Name: Contest Result
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Results (vwContestResults.ID)
        * * Description: The contest result.`),
    ContestOptionID: z.string().describe(`
        * * Field Name: ContestOptionID
        * * Display Name: Contest Option
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
        * * Description: The option.`),
    Votes: z.number().describe(`
        * * Field Name: Votes
        * * Display Name: Votes
        * * SQL Data Type: decimal(18, 6)
        * * Description: Weighted votes for the option (final round for ranked methods).`),
    Position: z.number().nullable().describe(`
        * * Field Name: Position
        * * Display Name: Position
        * * SQL Data Type: int
        * * Description: Finishing position (1 = most votes or first elected).`),
    Outcome: z.union([z.literal('Counted'), z.literal('Defeated'), z.literal('Elected'), z.literal('Excluded'), z.literal('Tied')]).describe(`
        * * Field Name: Outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Counted
    *   * Defeated
    *   * Elected
    *   * Excluded
    *   * Tied
        * * Description: Elected, Defeated, Excluded (eliminated in a ranked count), Tied, or Counted (motion and question options, where the outcome is on the contest).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsVotingContestOptionResultEntityType = z.infer<typeof mjBizAppsVotingContestOptionResultSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Contest Options
 */
export const mjBizAppsVotingContestOptionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContestID: z.string().describe(`
        * * Field Name: ContestID
        * * Display Name: Contest
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
        * * Description: The contest this option belongs to.`),
    Label: z.string().describe(`
        * * Field Name: Label
        * * Display Name: Label
        * * SQL Data Type: nvarchar(500)
        * * Description: The option as shown on the ballot (candidate name, Yes, No, Approve).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Short text shown with the option.`),
    CandidatePersonID: z.string().nullable().describe(`
        * * Field Name: CandidatePersonID
        * * Display Name: Candidate Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The candidate, when the option is a person.`),
    StatementFileID: z.string().nullable().describe(`
        * * Field Name: StatementFileID
        * * Display Name: Statement File
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
        * * Description: The candidate's statement document.`),
    PhotoFileID: z.string().nullable().describe(`
        * * Field Name: PhotoFileID
        * * Display Name: Photo File
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
        * * Description: The candidate's photo.`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Position of the option within the contest (rotation, if any, is applied when the ballot style is built).`),
    IsWriteIn: z.boolean().describe(`
        * * Field Name: IsWriteIn
        * * Display Name: Is Write-In
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True for the write-in placeholder option; the written text is captured with the selection.`),
    Status: z.union([z.literal('Active'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Withdrawn
        * * Description: Active options appear on the ballot; Withdrawn options stay for the record but are not offered.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Contest: z.string().describe(`
        * * Field Name: Contest
        * * Display Name: Contest
        * * SQL Data Type: nvarchar(500)`),
    CandidatePerson: z.string().nullable().describe(`
        * * Field Name: CandidatePerson
        * * Display Name: Candidate Person
        * * SQL Data Type: nvarchar(201)`),
    StatementFile: z.string().nullable().describe(`
        * * Field Name: StatementFile
        * * Display Name: Statement File
        * * SQL Data Type: nvarchar(500)`),
    PhotoFile: z.string().nullable().describe(`
        * * Field Name: PhotoFile
        * * Display Name: Photo File
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsVotingContestOptionEntityType = z.infer<typeof mjBizAppsVotingContestOptionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Contest Results
 */
export const mjBizAppsVotingContestResultSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContestID: z.string().describe(`
        * * Field Name: ContestID
        * * Display Name: Contest
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
        * * Description: The contest.`),
    Outcome: z.union([z.literal('Decided'), z.literal('Failed'), z.literal('NoQuorum'), z.literal('Passed'), z.literal('Tied'), z.literal('Void')]).describe(`
        * * Field Name: Outcome
        * * Display Name: Outcome
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Decided
    *   * Failed
    *   * NoQuorum
    *   * Passed
    *   * Tied
    *   * Void
        * * Description: Passed or Failed (motions, questions, amendments), Decided (seats filled), Tied (awaiting an administrator tie-break), NoQuorum or Void.`),
    BallotsCounted: z.number().describe(`
        * * Field Name: BallotsCounted
        * * Display Name: Ballots Counted
        * * SQL Data Type: int
        * * Description: Ballots counted in this contest.`),
    Abstentions: z.number().describe(`
        * * Field Name: Abstentions
        * * Display Name: Abstentions
        * * SQL Data Type: decimal(18, 6)
        * * Default Value: 0
        * * Description: Weighted abstentions (count toward participation and quorum, never toward the threshold numerator).`),
    EligibleCount: z.number().describe(`
        * * Field Name: EligibleCount
        * * Display Name: Eligible Count
        * * SQL Data Type: int
        * * Description: Eligible voters for this contest at the time of the tally (the denominator for an Eligible threshold basis).`),
    VotesCast: z.number().describe(`
        * * Field Name: VotesCast
        * * Display Name: Votes Cast
        * * SQL Data Type: decimal(18, 6)
        * * Description: Weighted votes cast, excluding abstentions.`),
    Rounds: z.string().nullable().describe(`
        * * Field Name: Rounds
        * * Display Name: Rounds
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON round-by-round record for ranked methods (IRV/STV transfers and exclusions).`),
    TieBreakSeed: z.string().nullable().describe(`
        * * Field Name: TieBreakSeed
        * * Display Name: Tie-Break Seed
        * * SQL Data Type: nvarchar(128)
        * * Description: The recorded seed used for a tie broken by lot, so the result can be reproduced.`),
    TieBreakNotes: z.string().nullable().describe(`
        * * Field Name: TieBreakNotes
        * * Display Name: Tie-Break Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: How a tie was broken when decided by an administrator.`),
    ComputedAt: z.date().describe(`
        * * Field Name: ComputedAt
        * * Display Name: Computed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the tally was computed.`),
    IsFinal: z.boolean().describe(`
        * * Field Name: IsFinal
        * * Display Name: Is Final
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True for the tally of record; earlier recomputations stay for audit with IsFinal false.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Contest: z.string().describe(`
        * * Field Name: Contest
        * * Display Name: Contest Name
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsVotingContestResultEntityType = z.infer<typeof mjBizAppsVotingContestResultSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Contest Running Tallies
 */
export const mjBizAppsVotingContestRunningTallySchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newid()`),
    ContestID: z.string().describe(`
        * * Field Name: ContestID
        * * Display Name: Contest
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
        * * Description: The contest.`),
    ContestOptionID: z.string().nullable().describe(`
        * * Field Name: ContestOptionID
        * * Display Name: Contest Option
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
        * * Description: The option counted; NULL is the row counting abstentions.`),
    VoteCount: z.number().describe(`
        * * Field Name: VoteCount
        * * Display Name: Vote Count
        * * SQL Data Type: decimal(18, 6)
        * * Default Value: 0
        * * Description: Weighted votes so far (first preferences for ranked contests).`),
    Contest: z.string().describe(`
        * * Field Name: Contest
        * * Display Name: Contest Name
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsVotingContestRunningTallyEntityType = z.infer<typeof mjBizAppsVotingContestRunningTallySchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Contests
 */
export const mjBizAppsVotingContestSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election this contest is on.`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(500)
        * * Description: The contest as shown on the ballot (the motion text, the office title or the question).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Supporting text shown with the contest (full motion text, the amendment, the question's explanation).`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Position of the contest on the ballot.`),
    Kind: z.union([z.literal('Amendment'), z.literal('Motion'), z.literal('Office'), z.literal('Question'), z.literal('StandardsItem')]).describe(`
        * * Field Name: Kind
        * * Display Name: Kind
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Amendment
    *   * Motion
    *   * Office
    *   * Question
    *   * StandardsItem
        * * Description: Motion, Office, Question, Amendment or StandardsItem.`),
    Seats: z.number().describe(`
        * * Field Name: Seats
        * * Display Name: Seats
        * * SQL Data Type: int
        * * Default Value: 1
        * * Description: Number of options that can win (seats to fill). 1 for motions and single-seat offices.`),
    TallyMethodID: z.string().describe(`
        * * Field Name: TallyMethodID
        * * Display Name: Tally Method
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Tally Methods (vwTallyMethods.ID)
        * * Description: The counting rule for this contest.`),
    Threshold: z.union([z.literal('Custom'), z.literal('Majority'), z.literal('None'), z.literal('ThreeFifths'), z.literal('ThreeQuarters'), z.literal('TwoThirds'), z.literal('Unanimous')]).describe(`
        * * Field Name: Threshold
        * * Display Name: Threshold
        * * SQL Data Type: nvarchar(20)
        * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * Custom
    *   * Majority
    *   * None
    *   * ThreeFifths
    *   * ThreeQuarters
    *   * TwoThirds
    *   * Unanimous
        * * Description: Share required to pass or win: None (most votes), Majority, ThreeFifths, TwoThirds, ThreeQuarters, Unanimous or Custom.`),
    CustomThreshold: z.number().nullable().describe(`
        * * Field Name: CustomThreshold
        * * Display Name: Custom Threshold
        * * SQL Data Type: decimal(7, 6)
        * * Description: The required share as a fraction between 0 and 1 when Threshold is Custom; NULL otherwise.`),
    ThresholdBasis: z.union([z.literal('Eligible'), z.literal('VotesCast')]).describe(`
        * * Field Name: ThresholdBasis
        * * Display Name: Threshold Basis
        * * SQL Data Type: nvarchar(20)
        * * Default Value: VotesCast
    * * Value List Type: List
    * * Possible Values 
    *   * Eligible
    *   * VotesCast
        * * Description: Whether the threshold is measured against votes cast (abstentions excluded) or against all eligible voters.`),
    AllowAbstain: z.boolean().describe(`
        * * Field Name: AllowAbstain
        * * Display Name: Allow Abstain
        * * SQL Data Type: bit
        * * Default Value: 1
        * * Description: True when the ballot offers an explicit abstention. Abstentions count toward participation and quorum, never toward the threshold numerator.`),
    AllowWriteIn: z.boolean().describe(`
        * * Field Name: AllowWriteIn
        * * Display Name: Allow Write-In
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True when voters may write in an option.`),
    MinSelections: z.number().describe(`
        * * Field Name: MinSelections
        * * Display Name: Minimum Selections
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Fewest options a voter must select (0 allows a blank contest).`),
    MaxSelections: z.number().nullable().describe(`
        * * Field Name: MaxSelections
        * * Display Name: Maximum Selections
        * * SQL Data Type: int
        * * Description: Most options a voter may select or rank. NULL means the number of seats (or every option for approval and ranked methods).`),
    VotingClassFilter: z.string().nullable().describe(`
        * * Field Name: VotingClassFilter
        * * Display Name: Voting Class Filter
        * * SQL Data Type: nvarchar(100)
        * * Description: When set, only voters in this voting class see and vote in the contest (for example seats elected by one class of member).`),
    TieBreakMethod: z.union([z.literal('Administrator'), z.literal('Lot')]).describe(`
        * * Field Name: TieBreakMethod
        * * Display Name: Tie Break Method
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Lot
    * * Value List Type: List
    * * Possible Values 
    *   * Administrator
    *   * Lot
        * * Description: Lot (deterministic draw from a recorded seed) or Administrator (decided and recorded by an administrator).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    TallyMethod: z.string().describe(`
        * * Field Name: TallyMethod
        * * Display Name: Tally Method Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsVotingContestEntityType = z.infer<typeof mjBizAppsVotingContestSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Election Anchors
 */
export const mjBizAppsVotingElectionAnchorSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    EntityID: z.string().describe(`
        * * Field Name: EntityID
        * * Display Name: Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
        * * Description: The MJ entity of the anchored record.`),
    RecordID: z.string().describe(`
        * * Field Name: RecordID
        * * Display Name: Record ID
        * * SQL Data Type: nvarchar(450)
        * * Description: Primary key value of the anchored record (concatenated key format for composite keys).`),
    Role: z.string().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(50)
        * * Default Value: Subject
        * * Description: How the record relates to the election (for example Subject, Meeting, Space, Project).`),
    IsPrimary: z.boolean().describe(`
        * * Field Name: IsPrimary
        * * Display Name: Is Primary
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True for the one anchor that represents the election's home; at most one per election.`),
    Sequence: z.number().describe(`
        * * Field Name: Sequence
        * * Display Name: Sequence
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Display order of the anchors.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    Entity: z.string().describe(`
        * * Field Name: Entity
        * * Display Name: Entity Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingElectionAnchorEntityType = z.infer<typeof mjBizAppsVotingElectionAnchorSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Election Audit Events
 */
export const mjBizAppsVotingElectionAuditEventSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    EventType: z.string().describe(`
        * * Field Name: EventType
        * * Display Name: Event Type
        * * SQL Data Type: nvarchar(100)
        * * Description: What happened (for example StatusChanged, RollFrozen, RollAmended, VoterChallenged, CredentialsIssued, ResultsViewed, Tallied, Certified).`),
    ActorUserID: z.string().nullable().describe(`
        * * Field Name: ActorUserID
        * * Display Name: Actor User
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: The user who acted; NULL for scheduled and system actions.`),
    OccurredAt: z.date().describe(`
        * * Field Name: OccurredAt
        * * Display Name: Occurred At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When it happened.`),
    Details: z.string().nullable().describe(`
        * * Field Name: Details
        * * Display Name: Event Details
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON detail of the event. Never ballot content, never a voter's choice.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    ActorUser: z.string().nullable().describe(`
        * * Field Name: ActorUser
        * * Display Name: Actor User Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsVotingElectionAuditEventEntityType = z.infer<typeof mjBizAppsVotingElectionAuditEventSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Election Certifications
 */
export const mjBizAppsVotingElectionCertificationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election certified.`),
    Status: z.union([z.literal('Certified'), z.literal('Draft'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Certified
    *   * Draft
    *   * Revoked
        * * Description: Draft (awaiting signatures), Certified or Revoked.`),
    CertifiedAt: z.date().nullable().describe(`
        * * Field Name: CertifiedAt
        * * Display Name: Certified At
        * * SQL Data Type: datetimeoffset
        * * Description: When the final required signature was recorded.`),
    ReportFileID: z.string().nullable().describe(`
        * * Field Name: ReportFileID
        * * Display Name: Report File ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
        * * Description: The certification report document.`),
    RollHash: z.string().nullable().describe(`
        * * Field Name: RollHash
        * * Display Name: Roll Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: Hash of the frozen roll the election ran against.`),
    BallotSetHash: z.string().nullable().describe(`
        * * Field Name: BallotSetHash
        * * Display Name: Ballot Set Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: Hash of the counted ballot set, so a recount can prove it used the same ballots.`),
    ResultsTimingDisclosure: z.string().nullable().describe(`
        * * Field Name: ResultsTimingDisclosure
        * * Display Name: Results Timing Disclosure
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Statement of the results timing and audience that applied, required on the certification when results were visible before close.`),
    Notes: z.string().nullable().describe(`
        * * Field Name: Notes
        * * Display Name: Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Certifier notes.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    ReportFile: z.string().nullable().describe(`
        * * Field Name: ReportFile
        * * Display Name: Report File Name
        * * SQL Data Type: nvarchar(500)`),
});

export type mjBizAppsVotingElectionCertificationEntityType = z.infer<typeof mjBizAppsVotingElectionCertificationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Election Certifiers
 */
export const mjBizAppsVotingElectionCertifierSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionCertificationID: z.string().describe(`
        * * Field Name: ElectionCertificationID
        * * Display Name: Election Certification
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Election Certifications (vwElectionCertifications.ID)
        * * Description: The certification.`),
    PersonID: z.string().describe(`
        * * Field Name: PersonID
        * * Display Name: Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The certifier.`),
    Role: z.string().nullable().describe(`
        * * Field Name: Role
        * * Display Name: Role
        * * SQL Data Type: nvarchar(100)
        * * Description: The capacity in which they sign (for example Inspector of Elections, Corporate Secretary).`),
    SignedAt: z.date().nullable().describe(`
        * * Field Name: SignedAt
        * * Display Name: Signed At
        * * SQL Data Type: datetimeoffset
        * * Description: When they signed; NULL while pending.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Person: z.string().describe(`
        * * Field Name: Person
        * * Display Name: Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsVotingElectionCertifierEntityType = z.infer<typeof mjBizAppsVotingElectionCertifierSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Election Trustees
 */
export const mjBizAppsVotingElectionTrusteeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    TrusteePersonID: z.string().describe(`
        * * Field Name: TrusteePersonID
        * * Display Name: Trustee Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The trustee.`),
    ShareIndex: z.number().describe(`
        * * Field Name: ShareIndex
        * * Display Name: Share Index
        * * SQL Data Type: int
        * * Description: The trustee's share number in the k-of-n scheme (1-based).`),
    Status: z.union([z.literal('Invited'), z.literal('KeyCommitted'), z.literal('Removed'), z.literal('ShareSubmitted')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Invited
    * * Value List Type: List
    * * Possible Values 
    *   * Invited
    *   * KeyCommitted
    *   * Removed
    *   * ShareSubmitted
        * * Description: Invited, KeyCommitted (public share and commitment recorded), ShareSubmitted (took part in the tally ceremony) or Removed.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    TrusteePerson: z.string().describe(`
        * * Field Name: TrusteePerson
        * * Display Name: Trustee Name
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsVotingElectionTrusteeEntityType = z.infer<typeof mjBizAppsVotingElectionTrusteeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Election Types
 */
export const mjBizAppsVotingElectionTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the election type.`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)
        * * Description: Stable machine code for the type (for example motion, board-election). Callers create elections by this code; it never changes once published.`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: What this type is for and how it behaves.`),
    ServerDriverClass: z.string().nullable().describe(`
        * * Field Name: ServerDriverClass
        * * Display Name: Server Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of the server driver registered under BaseElectionTypeServerDriver. NULL uses the base driver. A type naming a driver that is not registered refuses writes to its elections.`),
    UIDriverClass: z.string().nullable().describe(`
        * * Field Name: UIDriverClass
        * * Display Name: UI Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of the UI driver registered under BaseElectionTypeUIDriver. NULL uses the base driver.`),
    ElectionExtensionEntityID: z.string().nullable().describe(`
        * * Field Name: ElectionExtensionEntityID
        * * Display Name: Election Extension Entity ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
        * * Description: Optional MJ entity that is a disjoint IS-A child of Election and that every election of this type has, for the type's own typed fields and form (for example Standards Ballot Elections).`),
    IconClass: z.string().nullable().describe(`
        * * Field Name: IconClass
        * * Display Name: Icon Class
        * * SQL Data Type: nvarchar(100)
        * * Description: Font Awesome icon class shown for the type in the admin UI.`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON (IElectionTypeConfiguration): the type's defaults (secrecy mode, assurance tier, results timing and audience, allowed contest kinds and sign-in methods, governing-document citation, notice period, paper option) and which keys an election may override.`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Active types can be chosen for new elections; Disabled types keep their existing elections but cannot start new ones.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ElectionExtensionEntity: z.string().nullable().describe(`
        * * Field Name: ElectionExtensionEntity
        * * Display Name: Election Extension Entity
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingElectionTypeEntityType = z.infer<typeof mjBizAppsVotingElectionTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Elections
 */
export const mjBizAppsVotingElectionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)
        * * Description: Display name of the election (for example '2027 Board of Directors Election' or 'Approve the 2027 budget').`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Notice text and background shown to administrators and voters.`),
    ElectionTypeID: z.string().describe(`
        * * Field Name: ElectionTypeID
        * * Display Name: Election Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Election Types (vwElectionTypes.ID)
        * * Description: The election type, which supplies drivers, the optional extension entity and default configuration.`),
    Status: z.union([z.literal('Cancelled'), z.literal('Certified'), z.literal('Closed'), z.literal('Draft'), z.literal('Nominations'), z.literal('Open'), z.literal('Ready'), z.literal('Tallied')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Certified
    *   * Closed
    *   * Draft
    *   * Nominations
    *   * Open
    *   * Ready
    *   * Tallied
        * * Description: Lifecycle state: Draft -> Nominations -> Ready -> Open -> Closed -> Tallied -> Certified, or Cancelled at any point before certification. Moves only along this state machine; enforced by the entity server class.`),
    SecrecyMode: z.union([z.literal('Confidential'), z.literal('Open'), z.literal('Secret')]).describe(`
        * * Field Name: SecrecyMode
        * * Display Name: Secrecy Mode
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Secret
    * * Value List Type: List
    * * Possible Values 
    *   * Confidential
    *   * Open
    *   * Secret
        * * Description: Open (roll call: each vote linked to the voter and visible per policy), Confidential (linked to the voter but sealed until close) or Secret (poll book and ballot box unlinkable).`),
    AssuranceTier: z.union([z.literal('HighAssurance'), z.literal('Standard'), z.literal('Verifiable')]).describe(`
        * * Field Name: AssuranceTier
        * * Display Name: Assurance Tier
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Standard
    * * Value List Type: List
    * * Possible Values 
    *   * HighAssurance
    *   * Standard
    *   * Verifiable
        * * Description: Standard (tier A: field encryption at rest and access isolation), HighAssurance (tier B: selections encrypted under an election key split among trustees) or Verifiable (tier C: ElectionGuard).`),
    EligibilitySourceTypeID: z.string().nullable().describe(`
        * * Field Name: EligibilitySourceTypeID
        * * Display Name: Eligibility Source Type
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligibility Source Types (vwEligibilitySourceTypes.ID)
        * * Description: Where the voter roll comes from. NULL until the administrator chooses a source.`),
    EligibilitySourceSettings: z.string().nullable().describe(`
        * * Field Name: EligibilitySourceSettings
        * * Display Name: Eligibility Source Settings
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON settings for the eligibility source driver (for example the committee, space or entity query to read).`),
    RecordDate: z.date().nullable().describe(`
        * * Field Name: RecordDate
        * * Display Name: Record Date
        * * SQL Data Type: datetimeoffset
        * * Description: The date and time as of which eligibility is determined; the roll is frozen against it.`),
    TimeZone: z.string().describe(`
        * * Field Name: TimeZone
        * * Display Name: Time Zone
        * * SQL Data Type: nvarchar(64)
        * * Default Value: UTC
        * * Description: IANA time zone used to present the schedule to voters and administrators.`),
    NominationsOpenAt: z.date().nullable().describe(`
        * * Field Name: NominationsOpenAt
        * * Display Name: Nominations Open At
        * * SQL Data Type: datetimeoffset
        * * Description: When nominations open, if the election takes nominations.`),
    NominationsCloseAt: z.date().nullable().describe(`
        * * Field Name: NominationsCloseAt
        * * Display Name: Nominations Close At
        * * SQL Data Type: datetimeoffset
        * * Description: When nominations close.`),
    OpensAt: z.date().nullable().describe(`
        * * Field Name: OpensAt
        * * Display Name: Opens At
        * * SQL Data Type: datetimeoffset
        * * Description: When voting opens.`),
    ClosesAt: z.date().nullable().describe(`
        * * Field Name: ClosesAt
        * * Display Name: Closes At
        * * SQL Data Type: datetimeoffset
        * * Description: When voting closes.`),
    ProxyDeadline: z.date().nullable().describe(`
        * * Field Name: ProxyDeadline
        * * Display Name: Proxy Deadline
        * * SQL Data Type: datetimeoffset
        * * Description: Latest time a proxy designation is accepted. NULL means proxies are not accepted.`),
    ChallengeWindowEndsAt: z.date().nullable().describe(`
        * * Field Name: ChallengeWindowEndsAt
        * * Display Name: Challenge Window Ends At
        * * SQL Data Type: datetimeoffset
        * * Description: End of the post-tally challenge window; certification waits for it.`),
    AllowRevote: z.boolean().describe(`
        * * Field Name: AllowRevote
        * * Display Name: Allow Revote
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When true a voter may replace their ballot until close. Only Open and Confidential elections may allow it; a Secret ballot is final.`),
    ResultsTiming: z.union([z.literal('AdministratorsOnly'), z.literal('AfterClose'), z.literal('AfterVoting'), z.literal('Live')]).describe(`
        * * Field Name: ResultsTiming
        * * Display Name: Results Timing
        * * SQL Data Type: nvarchar(20)
        * * Default Value: AfterClose
    * * Value List Type: List
    * * Possible Values 
    *   * AdministratorsOnly
    *   * AfterClose
    *   * AfterVoting
    *   * Live
        * * Description: When results are visible: AfterClose (default; turnout only while open), AfterVoting (each voter after casting), Live (results audience throughout) or AdministratorsOnly (audited monitoring). Running results are a tier A feature.`),
    ResultsAudience: z.union([z.literal('Administrators'), z.literal('Eligible'), z.literal('HostMembers'), z.literal('Public'), z.literal('Voters')]).describe(`
        * * Field Name: ResultsAudience
        * * Display Name: Results Audience
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Voters
    * * Value List Type: List
    * * Possible Values 
    *   * Administrators
    *   * Eligible
    *   * HostMembers
    *   * Public
    *   * Voters
        * * Description: Who may see results: Voters, Eligible, HostMembers, Public or Administrators.`),
    ResultsMinCast: z.number().describe(`
        * * Field Name: ResultsMinCast
        * * Display Name: Results Min Cast
        * * SQL Data Type: int
        * * Default Value: 5
        * * Description: Minimum number of ballots cast before running (in-progress) results are shown to non-administrators. Final results, once tallied, are published to their audience regardless.`),
    WeightClassMinSize: z.number().describe(`
        * * Field Name: WeightClassMinSize
        * * Display Name: Weight Class Min Size
        * * SQL Data Type: int
        * * Default Value: 5
        * * Description: Minimum number of voters in a weight class before its tally is reported, so a unique weight cannot re-identify its voter.`),
    LiveRefreshEveryBallots: z.number().nullable().describe(`
        * * Field Name: LiveRefreshEveryBallots
        * * Display Name: Live Refresh Every Ballots
        * * SQL Data Type: int
        * * Description: For running results: publish a new snapshot only after this many further ballots.`),
    LiveRefreshMinMinutes: z.number().nullable().describe(`
        * * Field Name: LiveRefreshMinMinutes
        * * Display Name: Live Refresh Min Minutes
        * * SQL Data Type: int
        * * Description: For running results: publish snapshots no more often than every this many minutes.`),
    PublishPollBook: z.boolean().describe(`
        * * Field Name: PublishPollBook
        * * Display Name: Publish Poll Book
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When true the poll book (who voted, never how) is visible to voters, as some bylaws require. Default private. Never shown to an audience that also sees running results unless the election is Open.`),
    RollFrozenAt: z.date().nullable().describe(`
        * * Field Name: RollFrozenAt
        * * Display Name: Roll Frozen At
        * * SQL Data Type: datetimeoffset
        * * Description: When the voter roll was frozen; after this only audited amendments change it.`),
    RollHash: z.string().nullable().describe(`
        * * Field Name: RollHash
        * * Display Name: Roll Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: Hash of the frozen roll, recorded on the certification.`),
    TrusteeThreshold: z.number().nullable().describe(`
        * * Field Name: TrusteeThreshold
        * * Display Name: Trustee Threshold
        * * SQL Data Type: int
        * * Description: Tier B: the number of trustee key shares (k of n) required to decrypt.`),
    ElectionPublicKey: z.string().nullable().describe(`
        * * Field Name: ElectionPublicKey
        * * Display Name: Election Public Key
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Tier B/C: the election public key ballots are encrypted under. The private key is never stored.`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON overrides of the election type's configuration, limited to the keys the type allows (quorum, tie-break policy, reminders, languages, inspectors, independent administrator).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    ElectionType: z.string().describe(`
        * * Field Name: ElectionType
        * * Display Name: Election Type Name
        * * SQL Data Type: nvarchar(100)`),
    EligibilitySourceType: z.string().nullable().describe(`
        * * Field Name: EligibilitySourceType
        * * Display Name: Eligibility Source Type Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsVotingElectionEntityType = z.infer<typeof mjBizAppsVotingElectionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Eligibility Source Types
 */
export const mjBizAppsVotingEligibilitySourceTypeSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the roll source.`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)
        * * Description: Stable machine code for the source (for example entity-query, csv).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: What the source reads and how it decides voting class and weight.`),
    DriverClass: z.string().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of the BaseEligibilitySource implementation.`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON describing the settings an election must supply for this source (the settings themselves live on the election).`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Active sources can be chosen for new elections; Disabled sources cannot.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsVotingEligibilitySourceTypeEntityType = z.infer<typeof mjBizAppsVotingEligibilitySourceTypeSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Eligible Voters
 */
export const mjBizAppsVotingEligibleVoterSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    PersonID: z.string().describe(`
        * * Field Name: PersonID
        * * Display Name: Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The voter. For an organizational voter this is the designated voting representative.`),
    RepresentingOrganizationID: z.string().nullable().describe(`
        * * Field Name: RepresentingOrganizationID
        * * Display Name: Representing Organization
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
        * * Description: The organization this entry votes for, when the voter is an organization's representative.`),
    VotingClass: z.string().nullable().describe(`
        * * Field Name: VotingClass
        * * Display Name: Voting Class
        * * SQL Data Type: nvarchar(100)
        * * Description: The voter's class, for contests limited to one class and for per-class reporting.`),
    Weight: z.number().describe(`
        * * Field Name: Weight
        * * Display Name: Weight
        * * SQL Data Type: decimal(18, 6)
        * * Default Value: 1
        * * Description: Vote weight (1 for one-person-one-vote). Never copied onto the ballot; tallies use weight classes.`),
    SourceKey: z.string().nullable().describe(`
        * * Field Name: SourceKey
        * * Display Name: Source Key
        * * SQL Data Type: nvarchar(255)
        * * Description: The voter's identifier in the source system (member number, employee ID, unit number), used to match host assertions and second factors.`),
    Status: z.union([z.literal('Challenged'), z.literal('Eligible'), z.literal('Removed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Eligible
    * * Value List Type: List
    * * Possible Values 
    *   * Challenged
    *   * Eligible
    *   * Removed
        * * Description: Eligible, Challenged (awaiting a decision) or Removed.`),
    StatusReason: z.string().nullable().describe(`
        * * Field Name: StatusReason
        * * Display Name: Status Reason
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Why the entry was challenged or removed.`),
    AddedAfterFreeze: z.boolean().describe(`
        * * Field Name: AddedAfterFreeze
        * * Display Name: Added After Freeze
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True when the entry was added by an audited amendment after the roll was frozen.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    Person: z.string().describe(`
        * * Field Name: Person
        * * Display Name: Person Name
        * * SQL Data Type: nvarchar(201)`),
    RepresentingOrganization: z.string().nullable().describe(`
        * * Field Name: RepresentingOrganization
        * * Display Name: Representing Organization Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingEligibleVoterEntityType = z.infer<typeof mjBizAppsVotingEligibleVoterSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Nomination Endorsements
 */
export const mjBizAppsVotingNominationEndorsementSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    NominationID: z.string().describe(`
        * * Field Name: NominationID
        * * Display Name: Nomination
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Nominations (vwNominations.ID)
        * * Description: The nomination endorsed.`),
    EndorserPersonID: z.string().describe(`
        * * Field Name: EndorserPersonID
        * * Display Name: Endorser Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The person endorsing (signing the petition).`),
    EndorsedAt: z.date().describe(`
        * * Field Name: EndorsedAt
        * * Display Name: Endorsed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the endorsement was given.`),
    Status: z.union([z.literal('Invalid'), z.literal('Valid'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Valid
    * * Value List Type: List
    * * Possible Values 
    *   * Invalid
    *   * Valid
    *   * Withdrawn
        * * Description: Valid, Invalid (failed an eligibility check) or Withdrawn.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    EndorserPerson: z.string().describe(`
        * * Field Name: EndorserPerson
        * * Display Name: Endorser Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsVotingNominationEndorsementEntityType = z.infer<typeof mjBizAppsVotingNominationEndorsementSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Nominations
 */
export const mjBizAppsVotingNominationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContestID: z.string().describe(`
        * * Field Name: ContestID
        * * Display Name: Contest
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
        * * Description: The office contest the person is nominated for.`),
    NomineePersonID: z.string().describe(`
        * * Field Name: NomineePersonID
        * * Display Name: Nominee Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The person nominated.`),
    NominatedByPersonID: z.string().nullable().describe(`
        * * Field Name: NominatedByPersonID
        * * Display Name: Nominated By Person
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: Who made the nomination; NULL for a self-nomination or a committee slate.`),
    Status: z.union([z.literal('Accepted'), z.literal('Approved'), z.literal('Declined'), z.literal('Rejected'), z.literal('Submitted'), z.literal('Withdrawn')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Approved
    *   * Declined
    *   * Rejected
    *   * Submitted
    *   * Withdrawn
        * * Description: Submitted, Accepted (by the nominee), Declined (by the nominee), Approved (onto the ballot), Rejected or Withdrawn.`),
    Statement: z.string().nullable().describe(`
        * * Field Name: Statement
        * * Display Name: Statement
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The nominee's statement of candidacy.`),
    SubmittedAt: z.date().describe(`
        * * Field Name: SubmittedAt
        * * Display Name: Submitted At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the nomination was submitted.`),
    DecidedAt: z.date().nullable().describe(`
        * * Field Name: DecidedAt
        * * Display Name: Decided At
        * * SQL Data Type: datetimeoffset
        * * Description: When the nomination was approved or rejected.`),
    DecisionNotes: z.string().nullable().describe(`
        * * Field Name: DecisionNotes
        * * Display Name: Decision Notes
        * * SQL Data Type: nvarchar(MAX)
        * * Description: Reason recorded with the approval or rejection.`),
    ContestOptionID: z.string().nullable().describe(`
        * * Field Name: ContestOptionID
        * * Display Name: Contest Option
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
        * * Description: The ballot option created when the nomination was approved.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Contest: z.string().describe(`
        * * Field Name: Contest
        * * Display Name: Contest
        * * SQL Data Type: nvarchar(500)`),
    NomineePerson: z.string().describe(`
        * * Field Name: NomineePerson
        * * Display Name: Nominee Person
        * * SQL Data Type: nvarchar(201)`),
    NominatedByPerson: z.string().nullable().describe(`
        * * Field Name: NominatedByPerson
        * * Display Name: Nominated By Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsVotingNominationEntityType = z.infer<typeof mjBizAppsVotingNominationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Participations
 */
export const mjBizAppsVotingParticipationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    EligibleVoterID: z.string().describe(`
        * * Field Name: EligibleVoterID
        * * Display Name: Eligible Voter
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligible Voters (vwEligibleVoters.ID)
        * * Description: The roll entry that voted.`),
    CastAt: z.date().describe(`
        * * Field Name: CastAt
        * * Display Name: Cast At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the ballot was cast (or entered, for paper and proxy ballots).`),
    Channel: z.union([z.literal('InPerson'), z.literal('Online'), z.literal('Paper'), z.literal('Proxy')]).describe(`
        * * Field Name: Channel
        * * Display Name: Channel
        * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * InPerson
    *   * Online
    *   * Paper
    *   * Proxy
        * * Description: Online, Paper, Proxy or InPerson.`),
    VoterCredentialMethodID: z.string().nullable().describe(`
        * * Field Name: VoterCredentialMethodID
        * * Display Name: Voter Credential Method
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Voter Credential Methods (vwVoterCredentialMethods.ID)
        * * Description: For online ballots: the sign-in method used, so the certification can count participation by method.`),
    EnteredByUserID: z.string().nullable().describe(`
        * * Field Name: EnteredByUserID
        * * Display Name: Entered By User
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
        * * Description: For paper, proxy and in-person ballots: the staff user who entered it.`),
    ProxyDesignationID: z.string().nullable().describe(`
        * * Field Name: ProxyDesignationID
        * * Display Name: Proxy Designation
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Proxy Designations (vwProxyDesignations.ID)
        * * Description: For proxy ballots: the designation the proxy voted under.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
    VoterCredentialMethod: z.string().nullable().describe(`
        * * Field Name: VoterCredentialMethod
        * * Display Name: Voter Credential Method Name
        * * SQL Data Type: nvarchar(100)`),
    EnteredByUser: z.string().nullable().describe(`
        * * Field Name: EnteredByUser
        * * Display Name: Entered By User Name
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsVotingParticipationEntityType = z.infer<typeof mjBizAppsVotingParticipationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Proxy Designations
 */
export const mjBizAppsVotingProxyDesignationSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    GrantorEligibleVoterID: z.string().describe(`
        * * Field Name: GrantorEligibleVoterID
        * * Display Name: Grantor Eligible Voter ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligible Voters (vwEligibleVoters.ID)
        * * Description: The roll entry granting the proxy.`),
    ProxyPersonID: z.string().describe(`
        * * Field Name: ProxyPersonID
        * * Display Name: Proxy Person ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
        * * Description: The person who will vote on the grantor's behalf.`),
    Scope: z.union([z.literal('Directed'), z.literal('General')]).describe(`
        * * Field Name: Scope
        * * Display Name: Scope
        * * SQL Data Type: nvarchar(20)
        * * Default Value: General
    * * Value List Type: List
    * * Possible Values 
    *   * Directed
    *   * General
        * * Description: General (the proxy decides) or Directed (the grantor's instructions bind the proxy).`),
    Instructions: z.string().nullable().describe(`
        * * Field Name: Instructions
        * * Display Name: Instructions
        * * SQL Data Type: nvarchar(MAX)
        * * Description: For a directed proxy: the grantor's voting instructions.`),
    ReceivedAt: z.date().describe(`
        * * Field Name: ReceivedAt
        * * Display Name: Received At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the designation was received; must be on or before the election's proxy deadline.`),
    Status: z.union([z.literal('Accepted'), z.literal('Pending'), z.literal('Rejected'), z.literal('Revoked'), z.literal('Used')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Pending
    *   * Rejected
    *   * Revoked
    *   * Used
        * * Description: Pending, Accepted, Rejected, Revoked or Used (a ballot was cast under it).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election
        * * SQL Data Type: nvarchar(255)`),
    ProxyPerson: z.string().describe(`
        * * Field Name: ProxyPerson
        * * Display Name: Proxy Person
        * * SQL Data Type: nvarchar(201)`),
});

export type mjBizAppsVotingProxyDesignationEntityType = z.infer<typeof mjBizAppsVotingProxyDesignationSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Result Snapshots
 */
export const mjBizAppsVotingResultSnapshotSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionID: z.string().describe(`
        * * Field Name: ElectionID
        * * Display Name: Election
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: The election.`),
    SnapshotAt: z.date().describe(`
        * * Field Name: SnapshotAt
        * * Display Name: Snapshot At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the snapshot was taken.`),
    BallotCount: z.number().describe(`
        * * Field Name: BallotCount
        * * Display Name: Ballot Count
        * * SQL Data Type: int
        * * Description: Ballots included in the snapshot.`),
    Results: z.string().describe(`
        * * Field Name: Results
        * * Display Name: Results Data
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON of per-contest, per-option totals as published (threshold and weight-class suppression already applied).`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Election: z.string().describe(`
        * * Field Name: Election
        * * Display Name: Election Name
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingResultSnapshotEntityType = z.infer<typeof mjBizAppsVotingResultSnapshotSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Standards Ballot Elections
 */
export const mjBizAppsVotingStandardsBallotElectionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)`),
    DocumentTitle: z.string().describe(`
        * * Field Name: DocumentTitle
        * * Display Name: Document Title
        * * SQL Data Type: nvarchar(500)
        * * Description: Title of the draft standard or document being balloted.`),
    DocumentVersion: z.string().nullable().describe(`
        * * Field Name: DocumentVersion
        * * Display Name: Document Version
        * * SQL Data Type: nvarchar(50)
        * * Description: Version or draft number of the document.`),
    DocumentFileID: z.string().nullable().describe(`
        * * Field Name: DocumentFileID
        * * Display Name: Document File ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
        * * Description: The document balloted.`),
    RecirculationRound: z.number().describe(`
        * * Field Name: RecirculationRound
        * * Display Name: Recirculation Round
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: 0 for the initial ballot; incremented for each recirculation after comment resolution.`),
    PriorElectionID: z.string().nullable().describe(`
        * * Field Name: PriorElectionID
        * * Display Name: Prior Election ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
        * * Description: For a recirculation: the previous ballot on the same document.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(255)`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    ElectionTypeID: z.string().describe(`
        * * Field Name: ElectionTypeID
        * * Display Name: Election Type ID
        * * SQL Data Type: uniqueidentifier`),
    Status: z.string().describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)`),
    SecrecyMode: z.string().describe(`
        * * Field Name: SecrecyMode
        * * Display Name: Secrecy Mode
        * * SQL Data Type: nvarchar(20)`),
    AssuranceTier: z.string().describe(`
        * * Field Name: AssuranceTier
        * * Display Name: Assurance Tier
        * * SQL Data Type: nvarchar(20)`),
    EligibilitySourceTypeID: z.string().nullable().describe(`
        * * Field Name: EligibilitySourceTypeID
        * * Display Name: Eligibility Source Type ID
        * * SQL Data Type: uniqueidentifier`),
    EligibilitySourceSettings: z.string().nullable().describe(`
        * * Field Name: EligibilitySourceSettings
        * * Display Name: Eligibility Source Settings
        * * SQL Data Type: nvarchar(MAX)`),
    RecordDate: z.date().nullable().describe(`
        * * Field Name: RecordDate
        * * Display Name: Record Date
        * * SQL Data Type: datetimeoffset`),
    TimeZone: z.string().describe(`
        * * Field Name: TimeZone
        * * Display Name: Time Zone
        * * SQL Data Type: nvarchar(64)`),
    NominationsOpenAt: z.date().nullable().describe(`
        * * Field Name: NominationsOpenAt
        * * Display Name: Nominations Open At
        * * SQL Data Type: datetimeoffset`),
    NominationsCloseAt: z.date().nullable().describe(`
        * * Field Name: NominationsCloseAt
        * * Display Name: Nominations Close At
        * * SQL Data Type: datetimeoffset`),
    OpensAt: z.date().nullable().describe(`
        * * Field Name: OpensAt
        * * Display Name: Opens At
        * * SQL Data Type: datetimeoffset`),
    ClosesAt: z.date().nullable().describe(`
        * * Field Name: ClosesAt
        * * Display Name: Closes At
        * * SQL Data Type: datetimeoffset`),
    ProxyDeadline: z.date().nullable().describe(`
        * * Field Name: ProxyDeadline
        * * Display Name: Proxy Deadline
        * * SQL Data Type: datetimeoffset`),
    ChallengeWindowEndsAt: z.date().nullable().describe(`
        * * Field Name: ChallengeWindowEndsAt
        * * Display Name: Challenge Window Ends At
        * * SQL Data Type: datetimeoffset`),
    AllowRevote: z.boolean().describe(`
        * * Field Name: AllowRevote
        * * Display Name: Allow Revote
        * * SQL Data Type: bit`),
    ResultsTiming: z.string().describe(`
        * * Field Name: ResultsTiming
        * * Display Name: Results Timing
        * * SQL Data Type: nvarchar(20)`),
    ResultsAudience: z.string().describe(`
        * * Field Name: ResultsAudience
        * * Display Name: Results Audience
        * * SQL Data Type: nvarchar(20)`),
    ResultsMinCast: z.number().describe(`
        * * Field Name: ResultsMinCast
        * * Display Name: Results Min Cast
        * * SQL Data Type: int`),
    WeightClassMinSize: z.number().describe(`
        * * Field Name: WeightClassMinSize
        * * Display Name: Weight Class Min Size
        * * SQL Data Type: int`),
    LiveRefreshEveryBallots: z.number().nullable().describe(`
        * * Field Name: LiveRefreshEveryBallots
        * * Display Name: Live Refresh Every Ballots
        * * SQL Data Type: int`),
    LiveRefreshMinMinutes: z.number().nullable().describe(`
        * * Field Name: LiveRefreshMinMinutes
        * * Display Name: Live Refresh Min Minutes
        * * SQL Data Type: int`),
    PublishPollBook: z.boolean().describe(`
        * * Field Name: PublishPollBook
        * * Display Name: Publish Poll Book
        * * SQL Data Type: bit`),
    RollFrozenAt: z.date().nullable().describe(`
        * * Field Name: RollFrozenAt
        * * Display Name: Roll Frozen At
        * * SQL Data Type: datetimeoffset`),
    RollHash: z.string().nullable().describe(`
        * * Field Name: RollHash
        * * Display Name: Roll Hash
        * * SQL Data Type: nvarchar(128)`),
    TrusteeThreshold: z.number().nullable().describe(`
        * * Field Name: TrusteeThreshold
        * * Display Name: Trustee Threshold
        * * SQL Data Type: int`),
    ElectionPublicKey: z.string().nullable().describe(`
        * * Field Name: ElectionPublicKey
        * * Display Name: Election Public Key
        * * SQL Data Type: nvarchar(MAX)`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)`),
    DocumentFile: z.string().nullable().describe(`
        * * Field Name: DocumentFile
        * * Display Name: Document File
        * * SQL Data Type: nvarchar(500)`),
    PriorElection: z.string().nullable().describe(`
        * * Field Name: PriorElection
        * * Display Name: Prior Election
        * * SQL Data Type: nvarchar(255)`),
});

export type mjBizAppsVotingStandardsBallotElectionEntityType = z.infer<typeof mjBizAppsVotingStandardsBallotElectionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Tally Methods
 */
export const mjBizAppsVotingTallyMethodSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the counting rule.`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)
        * * Description: Stable machine code for the method (for example plurality, majority, irv).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: How the method counts, including the exact variant (an STV row names its rule, such as Meek or Scottish STV, because variants give different results).`),
    DriverClass: z.string().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of the BaseTallyMethod implementation.`),
    IsRanked: z.boolean().describe(`
        * * Field Name: IsRanked
        * * Display Name: Is Ranked
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True when voters rank options (IRV, STV); ranked contests show first preferences only until close.`),
    SupportsMultipleSeats: z.boolean().describe(`
        * * Field Name: SupportsMultipleSeats
        * * Display Name: Supports Multiple Seats
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True when the method can fill more than one seat in a contest.`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON of method-specific settings passed to the driver.`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Active methods can be chosen for new contests; Disabled methods cannot.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsVotingTallyMethodEntityType = z.infer<typeof mjBizAppsVotingTallyMethodSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Trustee Key Commitments
 */
export const mjBizAppsVotingTrusteeKeyCommitmentSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ElectionTrusteeID: z.string().describe(`
        * * Field Name: ElectionTrusteeID
        * * Display Name: Election Trustee
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Election Trustees (vwElectionTrustees.ID)
        * * Description: The trustee.`),
    PublicShare: z.string().describe(`
        * * Field Name: PublicShare
        * * Display Name: Public Share
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The trustee's public key share.`),
    Commitment: z.string().describe(`
        * * Field Name: Commitment
        * * Display Name: Commitment
        * * SQL Data Type: nvarchar(MAX)
        * * Description: The trustee's commitment (polynomial coefficient commitments) used to verify shares.`),
    CommittedAt: z.date().describe(`
        * * Field Name: CommittedAt
        * * Display Name: Committed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the commitment was recorded.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsVotingTrusteeKeyCommitmentEntityType = z.infer<typeof mjBizAppsVotingTrusteeKeyCommitmentSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Voter Credential Methods
 */
export const mjBizAppsVotingVoterCredentialMethodSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    Name: z.string().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: nvarchar(100)
        * * Description: Display name of the sign-in method.`),
    Code: z.string().describe(`
        * * Field Name: Code
        * * Display Name: Code
        * * SQL Data Type: nvarchar(50)
        * * Description: Stable machine code for the method (for example emailed-link, host-assertion, sso, mj-session, second-factor).`),
    Description: z.string().nullable().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)
        * * Description: How the voter proves identity with this method and how the result is matched to the roll.`),
    DriverClass: z.string().describe(`
        * * Field Name: DriverClass
        * * Display Name: Driver Class
        * * SQL Data Type: nvarchar(255)
        * * Description: ClassFactory key of the BaseVoterCredentialMethod implementation.`),
    IsSecondFactor: z.boolean().describe(`
        * * Field Name: IsSecondFactor
        * * Display Name: Is Second Factor
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True when the method is layered on top of another method rather than used alone (roster identifier plus PIN).`),
    RequiresIssuance: z.boolean().describe(`
        * * Field Name: RequiresIssuance
        * * Display Name: Requires Issuance
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: True when credentials must be issued per voter before voting (emailed links, control numbers, PINs); false when the method relies on an existing login or assertion.`),
    Configuration: z.string().nullable().describe(`
        * * Field Name: Configuration
        * * Display Name: Configuration
        * * SQL Data Type: nvarchar(MAX)
        * * Description: JSON of method-specific settings passed to the driver (for example lockout thresholds).`),
    Status: z.union([z.literal('Active'), z.literal('Disabled')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
        * * Description: Active methods can be offered by ballot distributions; Disabled methods cannot.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsVotingVoterCredentialMethodEntityType = z.infer<typeof mjBizAppsVotingVoterCredentialMethodSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_Voting: Voter Credentials
 */
export const mjBizAppsVotingVoterCredentialSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    EligibleVoterID: z.string().describe(`
        * * Field Name: EligibleVoterID
        * * Display Name: Eligible Voter
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligible Voters (vwEligibleVoters.ID)
        * * Description: The roll entry the credential belongs to.`),
    VoterCredentialMethodID: z.string().describe(`
        * * Field Name: VoterCredentialMethodID
        * * Display Name: Voter Credential Method
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_Voting: Voter Credential Methods (vwVoterCredentialMethods.ID)
        * * Description: The sign-in method the credential is for.`),
    MagicLinkInviteID: z.string().nullable().describe(`
        * * Field Name: MagicLinkInviteID
        * * Display Name: Magic Link Invite
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ: Magic Link Invites (vwMagicLinkInvites.ID)
        * * Description: For emailed links: the single-use, election-scoped MJ magic link invite.`),
    ControlNumberHash: z.string().nullable().describe(`
        * * Field Name: ControlNumberHash
        * * Display Name: Control Number Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: For paper and proxy ballots: hash of the control number printed on the ballot. The number itself is never stored.`),
    SecretHash: z.string().nullable().describe(`
        * * Field Name: SecretHash
        * * Display Name: Secret Hash
        * * SQL Data Type: nvarchar(256)
        * * Description: For a second factor: salted hash of the PIN or other secret. The secret itself is never stored.`),
    IssuedAt: z.date().describe(`
        * * Field Name: IssuedAt
        * * Display Name: Issued At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: When the credential was issued.`),
    ExpiresAt: z.date().nullable().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When the credential stops working, if earlier than the election close.`),
    RedeemedAt: z.date().nullable().describe(`
        * * Field Name: RedeemedAt
        * * Display Name: Redeemed At
        * * SQL Data Type: datetimeoffset
        * * Description: When the credential was first used to start a voting session.`),
    RevokedAt: z.date().nullable().describe(`
        * * Field Name: RevokedAt
        * * Display Name: Revoked At
        * * SQL Data Type: datetimeoffset
        * * Description: When the credential was revoked; a revoked credential never works again.`),
    FailedAttempts: z.number().describe(`
        * * Field Name: FailedAttempts
        * * Display Name: Failed Attempts
        * * SQL Data Type: int
        * * Default Value: 0
        * * Description: Consecutive failed verification attempts, for durable lockout (held in the database, not process memory).`),
    LockedUntil: z.date().nullable().describe(`
        * * Field Name: LockedUntil
        * * Display Name: Locked Until
        * * SQL Data Type: datetimeoffset
        * * Description: The credential is refused until this time after too many failed attempts.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    VoterCredentialMethod: z.string().describe(`
        * * Field Name: VoterCredentialMethod
        * * Display Name: Voter Credential Method
        * * SQL Data Type: nvarchar(100)`),
});

export type mjBizAppsVotingVoterCredentialEntityType = z.infer<typeof mjBizAppsVotingVoterCredentialSchema>;
 
 

/**
 * MJ_BizApps_Voting: Ballot Attributions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: BallotAttribution
 * * Base View: vwBallotAttributions
 * * @description Links a ballot to the poll-book entry that cast it, for Open (roll-call) and Confidential elections only. A Secret election never has rows here; the unlinkability suite asserts it.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Attributions')
export class mjBizAppsVotingBallotAttributionEntity extends BaseEntity<mjBizAppsVotingBallotAttributionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Ballot Attributions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Ballot Attributions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingBallotAttributionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Ballot Attributions - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingBallotAttributionEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Ballot Attributions, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Ballot Attributions, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CastBallotID
    * * Display Name: Cast Ballot
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Cast Ballots (vwCastBallots.ID)
    * * Description: The ballot.
    */
    get CastBallotID(): string {
        return this.Get('CastBallotID');
    }
    set CastBallotID(value: string) {
        this.Set('CastBallotID', value);
    }

    /**
    * * Field Name: ParticipationID
    * * Display Name: Participation
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Participations (vwParticipations.ID)
    * * Description: The poll-book entry that cast it. A participation can own several ballots over time when revotes supersede earlier ones.
    */
    get ParticipationID(): string {
        return this.Get('ParticipationID');
    }
    set ParticipationID(value: string) {
        this.Set('ParticipationID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Voting: Ballot Comments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: BallotComment
 * * Base View: vwBallotComments
 * * @description A comment submitted with a standards-ballot vote (required with every Disapprove). Linked to the voter's Open-mode participation, since standards ballots are roll-call.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Comments')
export class mjBizAppsVotingBallotCommentEntity extends BaseEntity<mjBizAppsVotingBallotCommentEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Ballot Comments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Ballot Comments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingBallotCommentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContestID
    * * Display Name: Contest ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
    * * Description: The standards item commented on.
    */
    get ContestID(): string {
        return this.Get('ContestID');
    }
    set ContestID(value: string) {
        this.Set('ContestID', value);
    }

    /**
    * * Field Name: ParticipationID
    * * Display Name: Participation ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Participations (vwParticipations.ID)
    * * Description: The voter's poll-book entry (standards ballots are Open mode).
    */
    get ParticipationID(): string {
        return this.Get('ParticipationID');
    }
    set ParticipationID(value: string) {
        this.Set('ParticipationID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Order of the voter's comments on the item.
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: CommentType
    * * Display Name: Comment Type
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Technical
    * * Value List Type: List
    * * Possible Values 
    *   * Editorial
    *   * General
    *   * Technical
    * * Description: General, Technical or Editorial.
    */
    get CommentType(): 'Editorial' | 'General' | 'Technical' {
        return this.Get('CommentType');
    }
    set CommentType(value: 'Editorial' | 'General' | 'Technical') {
        this.Set('CommentType', value);
    }

    /**
    * * Field Name: DocumentReference
    * * Display Name: Document Reference
    * * SQL Data Type: nvarchar(255)
    * * Description: Where in the document the comment applies (clause, section, line).
    */
    get DocumentReference(): string | null {
        return this.Get('DocumentReference');
    }
    set DocumentReference(value: string | null) {
        this.Set('DocumentReference', value);
    }

    /**
    * * Field Name: Comment
    * * Display Name: Comment
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The comment.
    */
    get Comment(): string {
        return this.Get('Comment');
    }
    set Comment(value: string) {
        this.Set('Comment', value);
    }

    /**
    * * Field Name: ProposedChange
    * * Display Name: Proposed Change
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The change the commenter proposes.
    */
    get ProposedChange(): string | null {
        return this.Get('ProposedChange');
    }
    set ProposedChange(value: string | null) {
        this.Set('ProposedChange', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Contest
    * * Display Name: Contest
    * * SQL Data Type: nvarchar(500)
    */
    get Contest(): string {
        return this.Get('Contest');
    }
}


/**
 * MJ_BizApps_Voting: Ballot Distributions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: BallotDistribution
 * * Base View: vwBallotDistributions
 * * @description One place a ballot is embedded: a slug, the origins allowed to host it, the sign-in methods it offers and, for host assertions, the host's registered public key. Served by the public ballot edge at /vote/:slug.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Distributions')
export class mjBizAppsVotingBallotDistributionEntity extends BaseEntity<mjBizAppsVotingBallotDistributionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Ballot Distributions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Ballot Distributions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingBallotDistributionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election whose ballot this distribution serves.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Administrator-facing name (for example 'Member portal' or 'Emailed link landing page').
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Slug
    * * Display Name: Slug
    * * SQL Data Type: nvarchar(100)
    * * Description: URL slug used by /vote/:slug and the <mj-ballot slug> attribute. Unique across all elections.
    */
    get Slug(): string {
        return this.Get('Slug');
    }
    set Slug(value: string) {
        this.Set('Slug', value);
    }

    /**
    * * Field Name: DistributionKey
    * * Display Name: Distribution Key
    * * SQL Data Type: nvarchar(100)
    * * Description: Public identifier used as the audience (aud) of host assertions for this distribution.
    */
    get DistributionKey(): string {
        return this.Get('DistributionKey');
    }
    set DistributionKey(value: string) {
        this.Set('DistributionKey', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Draft
    *   * Paused
    *   * Retired
    * * Description: Draft, Active (serving), Paused (temporarily refusing sessions) or Retired.
    */
    get Status(): 'Active' | 'Draft' | 'Paused' | 'Retired' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Draft' | 'Paused' | 'Retired') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: AllowedOrigins
    * * Display Name: Allowed Origins
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of origins allowed to embed the ballot (custom element and iframe frame-ancestors).
    */
    get AllowedOrigins(): string | null {
        return this.Get('AllowedOrigins');
    }
    set AllowedOrigins(value: string | null) {
        this.Set('AllowedOrigins', value);
    }

    /**
    * * Field Name: AllowedCredentialMethods
    * * Display Name: Allowed Credential Methods
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON array of VoterCredentialMethod codes this distribution accepts.
    */
    get AllowedCredentialMethods(): string | null {
        return this.Get('AllowedCredentialMethods');
    }
    set AllowedCredentialMethods(value: string | null) {
        this.Set('AllowedCredentialMethods', value);
    }

    /**
    * * Field Name: HostPublicKey
    * * Display Name: Host Public Key
    * * SQL Data Type: nvarchar(MAX)
    * * Description: PEM public key, registered by an administrator, that host assertions for this distribution must be signed with. Never taken from a request.
    */
    get HostPublicKey(): string | null {
        return this.Get('HostPublicKey');
    }
    set HostPublicKey(value: string | null) {
        this.Set('HostPublicKey', value);
    }

    /**
    * * Field Name: Theme
    * * Display Name: Theme
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON theme tokens applied to the ballot widget.
    */
    get Theme(): string | null {
        return this.Get('Theme');
    }
    set Theme(value: string | null) {
        this.Set('Theme', value);
    }

    /**
    * * Field Name: DefaultLanguage
    * * Display Name: Default Language
    * * SQL Data Type: nvarchar(20)
    * * Default Value: en
    * * Description: Language the ballot opens in when the voter has not chosen one.
    */
    get DefaultLanguage(): string {
        return this.Get('DefaultLanguage');
    }
    set DefaultLanguage(value: string) {
        this.Set('DefaultLanguage', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }
}


/**
 * MJ_BizApps_Voting: Ballot Selections - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: BallotSelection
 * * Base View: vwBallotSelections
 * * @description One decrypted selection from a counted ballot, materialized by the tally engine only after close (tier A) or after the trustee ceremony (tier B), in shuffled order, for a reproducible tally and recount export. Never written while voting is open.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Ballot Selections')
export class mjBizAppsVotingBallotSelectionEntity extends BaseEntity<mjBizAppsVotingBallotSelectionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Ballot Selections record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Ballot Selections record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingBallotSelectionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Ballot Selections - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingBallotSelectionEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Ballot Selections, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Ballot Selections, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Ballot Selections entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Rank: Rank must be greater than or equal to 1 when specified.
    * * Table-Level: An abstained vote cannot have a selected contest option or write-in text, while a non-abstained vote must have a selected contest option.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateRankMinimumValue(result);
        this.ValidateIsAbstainWithContestOption(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Rank must be greater than or equal to 1 when specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRankMinimumValue(result: ValidationResult) {
    	if (this.Rank != null && this.Rank < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Rank",
    			"Rank must be greater than or equal to 1.",
    			this.Rank,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * An abstained vote cannot have a selected contest option or write-in text, while a non-abstained vote must have a selected contest option.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateIsAbstainWithContestOption(result: ValidationResult) {
    	if (this.IsAbstain) {
    		if (this.ContestOptionID != null || this.WriteInText != null) {
    			result.Errors.push(new ValidationErrorInfo(
    				"IsAbstain",
    				"Abstaining votes cannot specify a contest option or write-in text.",
    				this.IsAbstain,
    				ValidationErrorType.Failure
    			));
    		}
    	} else if (this.ContestOptionID == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ContestOptionID",
    			"A contest option is required when not abstaining.",
    			this.ContestOptionID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: CastBallotID
    * * Display Name: Cast Ballot
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Cast Ballots (vwCastBallots.ID)
    * * Description: The ballot the selection came from.
    */
    get CastBallotID(): string {
        return this.Get('CastBallotID');
    }
    set CastBallotID(value: string) {
        this.Set('CastBallotID', value);
    }

    /**
    * * Field Name: ContestID
    * * Display Name: Contest ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
    * * Description: The contest.
    */
    get ContestID(): string {
        return this.Get('ContestID');
    }
    set ContestID(value: string) {
        this.Set('ContestID', value);
    }

    /**
    * * Field Name: ContestOptionID
    * * Display Name: Contest Option
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
    * * Description: The option selected (the write-in placeholder option for a write-in). NULL for an abstention.
    */
    get ContestOptionID(): string | null {
        return this.Get('ContestOptionID');
    }
    set ContestOptionID(value: string | null) {
        this.Set('ContestOptionID', value);
    }

    /**
    * * Field Name: Rank
    * * Display Name: Rank
    * * SQL Data Type: int
    * * Description: For ranked contests: the preference order (1 = first choice).
    */
    get Rank(): number | null {
        return this.Get('Rank');
    }
    set Rank(value: number | null) {
        this.Set('Rank', value);
    }

    /**
    * * Field Name: WriteInText
    * * Display Name: Write-In Text
    * * SQL Data Type: nvarchar(MAX)
    * * Description: For a write-in: the text written. Field-encrypted at rest.
    */
    get WriteInText(): string | null {
        return this.Get('WriteInText');
    }
    set WriteInText(value: string | null) {
        this.Set('WriteInText', value);
    }

    /**
    * * Field Name: IsAbstain
    * * Display Name: Is Abstain
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True for an explicit abstention.
    */
    get IsAbstain(): boolean {
        return this.Get('IsAbstain');
    }
    set IsAbstain(value: boolean) {
        this.Set('IsAbstain', value);
    }

    /**
    * * Field Name: Contest
    * * Display Name: Contest
    * * SQL Data Type: nvarchar(500)
    */
    get Contest(): string {
        return this.Get('Contest');
    }
}


/**
 * MJ_BizApps_Voting: Cast Ballots - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: CastBallot
 * * Base View: vwCastBallots
 * * @description The ballot box: what was voted, with no reference to the voter. Random (non-sequential) keys, no timestamps, no record-change history, not exposed through the generic API, written by the system user, readable only by the tally engine after close. Selections are field-encrypted at rest (tier A) or encrypted under the election key (tiers B and C).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Cast Ballots')
export class mjBizAppsVotingCastBallotEntity extends BaseEntity<mjBizAppsVotingCastBallotEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Cast Ballots record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Cast Ballots record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingCastBallotEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Cast Ballots - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingCastBallotEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Cast Ballots, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Cast Ballots, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election. The only reference on a ballot.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: BallotStyleHash
    * * Display Name: Ballot Style Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: Hash of the ballot style the voter was shown, so the tally can verify every ballot was cast against the published style.
    */
    get BallotStyleHash(): string {
        return this.Get('BallotStyleHash');
    }
    set BallotStyleHash(value: string) {
        this.Set('BallotStyleHash', value);
    }

    /**
    * * Field Name: ReceiptCode
    * * Display Name: Receipt Code
    * * SQL Data Type: nvarchar(64)
    * * Description: Code returned to the voter to confirm the ballot was recorded (tier B: hash of the ciphertext, published after close).
    */
    get ReceiptCode(): string {
        return this.Get('ReceiptCode');
    }
    set ReceiptCode(value: string) {
        this.Set('ReceiptCode', value);
    }

    /**
    * * Field Name: Selections
    * * Display Name: Selections
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The voter's selections, encrypted: an opaque ciphertext envelope (v1:a:… under the app selections key at tier A, v1:b:… under the election public key at tiers B and C). Never plaintext; only the tally engine decrypts it, after close.
    */
    get Selections(): string {
        return this.Get('Selections');
    }
    set Selections(value: string) {
        this.Set('Selections', value);
    }

    /**
    * * Field Name: VotingClass
    * * Display Name: Voting Class
    * * SQL Data Type: nvarchar(100)
    * * Description: The voter's voting class, needed to count class-limited contests. Reported only for classes of at least the election's minimum size.
    */
    get VotingClass(): string | null {
        return this.Get('VotingClass');
    }
    set VotingClass(value: string | null) {
        this.Set('VotingClass', value);
    }

    /**
    * * Field Name: WeightClass
    * * Display Name: Weight Class
    * * SQL Data Type: nvarchar(50)
    * * Description: The weight class (bucket) the voter's weight falls in; the exact weight is never stored on the ballot.
    */
    get WeightClass(): string | null {
        return this.Get('WeightClass');
    }
    set WeightClass(value: string | null) {
        this.Set('WeightClass', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Counted
    * * Value List Type: List
    * * Possible Values 
    *   * Counted
    *   * Spoiled
    *   * Superseded
    * * Description: Counted, Superseded (replaced by a revote, Open and Confidential elections only) or Spoiled (voided by an audited decision).
    */
    get Status(): 'Counted' | 'Spoiled' | 'Superseded' {
        return this.Get('Status');
    }
    set Status(value: 'Counted' | 'Spoiled' | 'Superseded') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Description
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }
}


/**
 * MJ_BizApps_Voting: Comment Resolutions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: CommentResolution
 * * Base View: vwCommentResolutions
 * * @description The ballot resolution committee's disposition of a standards-ballot comment, and the commenter's response to it.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Comment Resolutions')
export class mjBizAppsVotingCommentResolutionEntity extends BaseEntity<mjBizAppsVotingCommentResolutionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Comment Resolutions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Comment Resolutions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingCommentResolutionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: BallotCommentID
    * * Display Name: Ballot Comment
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Ballot Comments (vwBallotComments.ID)
    * * Description: The comment resolved.
    */
    get BallotCommentID(): string {
        return this.Get('BallotCommentID');
    }
    set BallotCommentID(value: string) {
        this.Set('BallotCommentID', value);
    }

    /**
    * * Field Name: Disposition
    * * Display Name: Disposition
    * * SQL Data Type: nvarchar(30)
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * AcceptedInPrinciple
    *   * Deferred
    *   * Rejected
    *   * Withdrawn
    * * Description: Accepted, AcceptedInPrinciple, Rejected, Withdrawn or Deferred.
    */
    get Disposition(): 'Accepted' | 'AcceptedInPrinciple' | 'Deferred' | 'Rejected' | 'Withdrawn' {
        return this.Get('Disposition');
    }
    set Disposition(value: 'Accepted' | 'AcceptedInPrinciple' | 'Deferred' | 'Rejected' | 'Withdrawn') {
        this.Set('Disposition', value);
    }

    /**
    * * Field Name: Response
    * * Display Name: Committee Response
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The committee's response and the change made, if any.
    */
    get Response(): string | null {
        return this.Get('Response');
    }
    set Response(value: string | null) {
        this.Set('Response', value);
    }

    /**
    * * Field Name: ResolvedByUserID
    * * Display Name: Resolved By User ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: Who recorded the disposition.
    */
    get ResolvedByUserID(): string | null {
        return this.Get('ResolvedByUserID');
    }
    set ResolvedByUserID(value: string | null) {
        this.Set('ResolvedByUserID', value);
    }

    /**
    * * Field Name: ResolvedAt
    * * Display Name: Resolved At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When it was recorded.
    */
    get ResolvedAt(): Date {
        return this.Get('ResolvedAt');
    }
    set ResolvedAt(value: Date) {
        this.Set('ResolvedAt', value);
    }

    /**
    * * Field Name: CommenterResponse
    * * Display Name: Commenter Response
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Satisfied
    *   * Unsatisfied
    * * Description: Whether the commenter is Satisfied or Unsatisfied with the resolution (drives recirculation).
    */
    get CommenterResponse(): 'Satisfied' | 'Unsatisfied' | null {
        return this.Get('CommenterResponse');
    }
    set CommenterResponse(value: 'Satisfied' | 'Unsatisfied' | null) {
        this.Set('CommenterResponse', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ResolvedByUser
    * * Display Name: Resolved By User
    * * SQL Data Type: nvarchar(100)
    */
    get ResolvedByUser(): string | null {
        return this.Get('ResolvedByUser');
    }
}


/**
 * MJ_BizApps_Voting: Contest Option Results - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ContestOptionResult
 * * Base View: vwContestOptionResults
 * * @description The result for one option in a contest result: its votes, its position and whether it won.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Option Results')
export class mjBizAppsVotingContestOptionResultEntity extends BaseEntity<mjBizAppsVotingContestOptionResultEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Contest Option Results record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Contest Option Results record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingContestOptionResultEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Contest Option Results - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingContestOptionResultEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Contest Option Results, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Contest Option Results, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContestResultID
    * * Display Name: Contest Result
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Results (vwContestResults.ID)
    * * Description: The contest result.
    */
    get ContestResultID(): string {
        return this.Get('ContestResultID');
    }
    set ContestResultID(value: string) {
        this.Set('ContestResultID', value);
    }

    /**
    * * Field Name: ContestOptionID
    * * Display Name: Contest Option
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
    * * Description: The option.
    */
    get ContestOptionID(): string {
        return this.Get('ContestOptionID');
    }
    set ContestOptionID(value: string) {
        this.Set('ContestOptionID', value);
    }

    /**
    * * Field Name: Votes
    * * Display Name: Votes
    * * SQL Data Type: decimal(18, 6)
    * * Description: Weighted votes for the option (final round for ranked methods).
    */
    get Votes(): number {
        return this.Get('Votes');
    }
    set Votes(value: number) {
        this.Set('Votes', value);
    }

    /**
    * * Field Name: Position
    * * Display Name: Position
    * * SQL Data Type: int
    * * Description: Finishing position (1 = most votes or first elected).
    */
    get Position(): number | null {
        return this.Get('Position');
    }
    set Position(value: number | null) {
        this.Set('Position', value);
    }

    /**
    * * Field Name: Outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Counted
    *   * Defeated
    *   * Elected
    *   * Excluded
    *   * Tied
    * * Description: Elected, Defeated, Excluded (eliminated in a ranked count), Tied, or Counted (motion and question options, where the outcome is on the contest).
    */
    get Outcome(): 'Counted' | 'Defeated' | 'Elected' | 'Excluded' | 'Tied' {
        return this.Get('Outcome');
    }
    set Outcome(value: 'Counted' | 'Defeated' | 'Elected' | 'Excluded' | 'Tied') {
        this.Set('Outcome', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Voting: Contest Options - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ContestOption
 * * Base View: vwContestOptions
 * * @description A choice in a contest: a candidate, Yes or No on a motion, Approve or Disapprove on a standards item, or a write-in placeholder.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Options')
export class mjBizAppsVotingContestOptionEntity extends BaseEntity<mjBizAppsVotingContestOptionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Contest Options record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Contest Options record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingContestOptionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContestID
    * * Display Name: Contest
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
    * * Description: The contest this option belongs to.
    */
    get ContestID(): string {
        return this.Get('ContestID');
    }
    set ContestID(value: string) {
        this.Set('ContestID', value);
    }

    /**
    * * Field Name: Label
    * * Display Name: Label
    * * SQL Data Type: nvarchar(500)
    * * Description: The option as shown on the ballot (candidate name, Yes, No, Approve).
    */
    get Label(): string {
        return this.Get('Label');
    }
    set Label(value: string) {
        this.Set('Label', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Short text shown with the option.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: CandidatePersonID
    * * Display Name: Candidate Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The candidate, when the option is a person.
    */
    get CandidatePersonID(): string | null {
        return this.Get('CandidatePersonID');
    }
    set CandidatePersonID(value: string | null) {
        this.Set('CandidatePersonID', value);
    }

    /**
    * * Field Name: StatementFileID
    * * Display Name: Statement File
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
    * * Description: The candidate's statement document.
    */
    get StatementFileID(): string | null {
        return this.Get('StatementFileID');
    }
    set StatementFileID(value: string | null) {
        this.Set('StatementFileID', value);
    }

    /**
    * * Field Name: PhotoFileID
    * * Display Name: Photo File
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
    * * Description: The candidate's photo.
    */
    get PhotoFileID(): string | null {
        return this.Get('PhotoFileID');
    }
    set PhotoFileID(value: string | null) {
        this.Set('PhotoFileID', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Position of the option within the contest (rotation, if any, is applied when the ballot style is built).
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: IsWriteIn
    * * Display Name: Is Write-In
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True for the write-in placeholder option; the written text is captured with the selection.
    */
    get IsWriteIn(): boolean {
        return this.Get('IsWriteIn');
    }
    set IsWriteIn(value: boolean) {
        this.Set('IsWriteIn', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Withdrawn
    * * Description: Active options appear on the ballot; Withdrawn options stay for the record but are not offered.
    */
    get Status(): 'Active' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Contest
    * * Display Name: Contest
    * * SQL Data Type: nvarchar(500)
    */
    get Contest(): string {
        return this.Get('Contest');
    }

    /**
    * * Field Name: CandidatePerson
    * * Display Name: Candidate Person
    * * SQL Data Type: nvarchar(201)
    */
    get CandidatePerson(): string | null {
        return this.Get('CandidatePerson');
    }

    /**
    * * Field Name: StatementFile
    * * Display Name: Statement File
    * * SQL Data Type: nvarchar(500)
    */
    get StatementFile(): string | null {
        return this.Get('StatementFile');
    }

    /**
    * * Field Name: PhotoFile
    * * Display Name: Photo File
    * * SQL Data Type: nvarchar(500)
    */
    get PhotoFile(): string | null {
        return this.Get('PhotoFile');
    }
}


/**
 * MJ_BizApps_Voting: Contest Results - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ContestResult
 * * Base View: vwContestResults
 * * @description The outcome of one contest, written only by the tally engine after close: totals, the outcome, the round-by-round record for ranked methods and the tie-break seed, so the count can be reproduced.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Results')
export class mjBizAppsVotingContestResultEntity extends BaseEntity<mjBizAppsVotingContestResultEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Contest Results record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Contest Results record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingContestResultEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Contest Results - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingContestResultEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Contest Results, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Contest Results, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContestID
    * * Display Name: Contest
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
    * * Description: The contest.
    */
    get ContestID(): string {
        return this.Get('ContestID');
    }
    set ContestID(value: string) {
        this.Set('ContestID', value);
    }

    /**
    * * Field Name: Outcome
    * * Display Name: Outcome
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Decided
    *   * Failed
    *   * NoQuorum
    *   * Passed
    *   * Tied
    *   * Void
    * * Description: Passed or Failed (motions, questions, amendments), Decided (seats filled), Tied (awaiting an administrator tie-break), NoQuorum or Void.
    */
    get Outcome(): 'Decided' | 'Failed' | 'NoQuorum' | 'Passed' | 'Tied' | 'Void' {
        return this.Get('Outcome');
    }
    set Outcome(value: 'Decided' | 'Failed' | 'NoQuorum' | 'Passed' | 'Tied' | 'Void') {
        this.Set('Outcome', value);
    }

    /**
    * * Field Name: BallotsCounted
    * * Display Name: Ballots Counted
    * * SQL Data Type: int
    * * Description: Ballots counted in this contest.
    */
    get BallotsCounted(): number {
        return this.Get('BallotsCounted');
    }
    set BallotsCounted(value: number) {
        this.Set('BallotsCounted', value);
    }

    /**
    * * Field Name: Abstentions
    * * Display Name: Abstentions
    * * SQL Data Type: decimal(18, 6)
    * * Default Value: 0
    * * Description: Weighted abstentions (count toward participation and quorum, never toward the threshold numerator).
    */
    get Abstentions(): number {
        return this.Get('Abstentions');
    }
    set Abstentions(value: number) {
        this.Set('Abstentions', value);
    }

    /**
    * * Field Name: EligibleCount
    * * Display Name: Eligible Count
    * * SQL Data Type: int
    * * Description: Eligible voters for this contest at the time of the tally (the denominator for an Eligible threshold basis).
    */
    get EligibleCount(): number {
        return this.Get('EligibleCount');
    }
    set EligibleCount(value: number) {
        this.Set('EligibleCount', value);
    }

    /**
    * * Field Name: VotesCast
    * * Display Name: Votes Cast
    * * SQL Data Type: decimal(18, 6)
    * * Description: Weighted votes cast, excluding abstentions.
    */
    get VotesCast(): number {
        return this.Get('VotesCast');
    }
    set VotesCast(value: number) {
        this.Set('VotesCast', value);
    }

    /**
    * * Field Name: Rounds
    * * Display Name: Rounds
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON round-by-round record for ranked methods (IRV/STV transfers and exclusions).
    */
    get Rounds(): string | null {
        return this.Get('Rounds');
    }
    set Rounds(value: string | null) {
        this.Set('Rounds', value);
    }

    /**
    * * Field Name: TieBreakSeed
    * * Display Name: Tie-Break Seed
    * * SQL Data Type: nvarchar(128)
    * * Description: The recorded seed used for a tie broken by lot, so the result can be reproduced.
    */
    get TieBreakSeed(): string | null {
        return this.Get('TieBreakSeed');
    }
    set TieBreakSeed(value: string | null) {
        this.Set('TieBreakSeed', value);
    }

    /**
    * * Field Name: TieBreakNotes
    * * Display Name: Tie-Break Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: How a tie was broken when decided by an administrator.
    */
    get TieBreakNotes(): string | null {
        return this.Get('TieBreakNotes');
    }
    set TieBreakNotes(value: string | null) {
        this.Set('TieBreakNotes', value);
    }

    /**
    * * Field Name: ComputedAt
    * * Display Name: Computed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the tally was computed.
    */
    get ComputedAt(): Date {
        return this.Get('ComputedAt');
    }
    set ComputedAt(value: Date) {
        this.Set('ComputedAt', value);
    }

    /**
    * * Field Name: IsFinal
    * * Display Name: Is Final
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True for the tally of record; earlier recomputations stay for audit with IsFinal false.
    */
    get IsFinal(): boolean {
        return this.Get('IsFinal');
    }
    set IsFinal(value: boolean) {
        this.Set('IsFinal', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Contest
    * * Display Name: Contest Name
    * * SQL Data Type: nvarchar(500)
    */
    get Contest(): string {
        return this.Get('Contest');
    }
}


/**
 * MJ_BizApps_Voting: Contest Running Tallies - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ContestRunningTally
 * * Base View: vwContestRunningTallies
 * * @description Running count per option while voting is open, kept only when the election shows results before close (tier A). Incremented in the cast transaction; first preferences only for ranked contests. Never served directly: results are published through batched snapshots.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contest Running Tallies')
export class mjBizAppsVotingContestRunningTallyEntity extends BaseEntity<mjBizAppsVotingContestRunningTallyEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Contest Running Tallies record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Contest Running Tallies record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingContestRunningTallyEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Contest Running Tallies - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingContestRunningTallyEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Contest Running Tallies, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Contest Running Tallies, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContestID
    * * Display Name: Contest
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
    * * Description: The contest.
    */
    get ContestID(): string {
        return this.Get('ContestID');
    }
    set ContestID(value: string) {
        this.Set('ContestID', value);
    }

    /**
    * * Field Name: ContestOptionID
    * * Display Name: Contest Option
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
    * * Description: The option counted; NULL is the row counting abstentions.
    */
    get ContestOptionID(): string | null {
        return this.Get('ContestOptionID');
    }
    set ContestOptionID(value: string | null) {
        this.Set('ContestOptionID', value);
    }

    /**
    * * Field Name: VoteCount
    * * Display Name: Vote Count
    * * SQL Data Type: decimal(18, 6)
    * * Default Value: 0
    * * Description: Weighted votes so far (first preferences for ranked contests).
    */
    get VoteCount(): number {
        return this.Get('VoteCount');
    }
    set VoteCount(value: number) {
        this.Set('VoteCount', value);
    }

    /**
    * * Field Name: Contest
    * * Display Name: Contest Name
    * * SQL Data Type: nvarchar(500)
    */
    get Contest(): string {
        return this.Get('Contest');
    }
}


/**
 * MJ_BizApps_Voting: Contests - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: Contest
 * * Base View: vwContests
 * * @description One item on the ballot: a motion, an office, a question, an amendment or a standards item, with the counting rule and selection limits that apply to it.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Contests')
export class mjBizAppsVotingContestEntity extends BaseEntity<mjBizAppsVotingContestEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Contests record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Contests record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingContestEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Contests entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Seats: The number of seats must be at least 1
    * * Table-Level: When threshold is set to Custom, a custom threshold value between 0 (exclusive) and 1 (inclusive) must be provided. For any other threshold type, the custom threshold must be empty.
    * * Table-Level: Minimum selections must be zero or greater, and if maximum selections is specified, it must be greater than or equal to minimum selections.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateSeatsAtLeastOne(result);
        this.ValidateCustomThresholdByThreshold(result);
        this.ValidateMinAndMaxSelections(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The number of seats must be at least 1
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateSeatsAtLeastOne(result: ValidationResult) {
    	if (this.Seats != null && this.Seats < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Seats",
    			"The number of seats must be at least 1.",
    			this.Seats,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * When threshold is set to Custom, a custom threshold value between 0 (exclusive) and 1 (inclusive) must be provided. For any other threshold type, the custom threshold must be empty.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateCustomThresholdByThreshold(result: ValidationResult) {
    	if (this.Threshold === "Custom") {
    		if (this.CustomThreshold == null || this.CustomThreshold <= 0 || this.CustomThreshold > 1) {
    			result.Errors.push(new ValidationErrorInfo(
    				"CustomThreshold",
    				"Custom threshold must be greater than 0 and less than or equal to 1 when threshold is set to Custom.",
    				this.CustomThreshold,
    				ValidationErrorType.Failure
    			));
    		}
    	} else {
    		if (this.CustomThreshold != null) {
    			result.Errors.push(new ValidationErrorInfo(
    				"CustomThreshold",
    				"Custom threshold must be empty when threshold is not set to Custom.",
    				this.CustomThreshold,
    				ValidationErrorType.Failure
    			));
    		}
    	}
    }

    /**
    * Minimum selections must be zero or greater, and if maximum selections is specified, it must be greater than or equal to minimum selections.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateMinAndMaxSelections(result: ValidationResult) {
    	if (this.MinSelections < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MinSelections",
    			"Minimum selections must be greater than or equal to 0.",
    			this.MinSelections,
    			ValidationErrorType.Failure
    		));
    	}
    
    	if (this.MaxSelections != null && this.MaxSelections < this.MinSelections) {
    		result.Errors.push(new ValidationErrorInfo(
    			"MaxSelections",
    			"Maximum selections must be greater than or equal to minimum selections.",
    			this.MaxSelections,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election this contest is on.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(500)
    * * Description: The contest as shown on the ballot (the motion text, the office title or the question).
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Supporting text shown with the contest (full motion text, the amendment, the question's explanation).
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Position of the contest on the ballot.
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: Kind
    * * Display Name: Kind
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * Amendment
    *   * Motion
    *   * Office
    *   * Question
    *   * StandardsItem
    * * Description: Motion, Office, Question, Amendment or StandardsItem.
    */
    get Kind(): 'Amendment' | 'Motion' | 'Office' | 'Question' | 'StandardsItem' {
        return this.Get('Kind');
    }
    set Kind(value: 'Amendment' | 'Motion' | 'Office' | 'Question' | 'StandardsItem') {
        this.Set('Kind', value);
    }

    /**
    * * Field Name: Seats
    * * Display Name: Seats
    * * SQL Data Type: int
    * * Default Value: 1
    * * Description: Number of options that can win (seats to fill). 1 for motions and single-seat offices.
    */
    get Seats(): number {
        return this.Get('Seats');
    }
    set Seats(value: number) {
        this.Set('Seats', value);
    }

    /**
    * * Field Name: TallyMethodID
    * * Display Name: Tally Method
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Tally Methods (vwTallyMethods.ID)
    * * Description: The counting rule for this contest.
    */
    get TallyMethodID(): string {
        return this.Get('TallyMethodID');
    }
    set TallyMethodID(value: string) {
        this.Set('TallyMethodID', value);
    }

    /**
    * * Field Name: Threshold
    * * Display Name: Threshold
    * * SQL Data Type: nvarchar(20)
    * * Default Value: None
    * * Value List Type: List
    * * Possible Values 
    *   * Custom
    *   * Majority
    *   * None
    *   * ThreeFifths
    *   * ThreeQuarters
    *   * TwoThirds
    *   * Unanimous
    * * Description: Share required to pass or win: None (most votes), Majority, ThreeFifths, TwoThirds, ThreeQuarters, Unanimous or Custom.
    */
    get Threshold(): 'Custom' | 'Majority' | 'None' | 'ThreeFifths' | 'ThreeQuarters' | 'TwoThirds' | 'Unanimous' {
        return this.Get('Threshold');
    }
    set Threshold(value: 'Custom' | 'Majority' | 'None' | 'ThreeFifths' | 'ThreeQuarters' | 'TwoThirds' | 'Unanimous') {
        this.Set('Threshold', value);
    }

    /**
    * * Field Name: CustomThreshold
    * * Display Name: Custom Threshold
    * * SQL Data Type: decimal(7, 6)
    * * Description: The required share as a fraction between 0 and 1 when Threshold is Custom; NULL otherwise.
    */
    get CustomThreshold(): number | null {
        return this.Get('CustomThreshold');
    }
    set CustomThreshold(value: number | null) {
        this.Set('CustomThreshold', value);
    }

    /**
    * * Field Name: ThresholdBasis
    * * Display Name: Threshold Basis
    * * SQL Data Type: nvarchar(20)
    * * Default Value: VotesCast
    * * Value List Type: List
    * * Possible Values 
    *   * Eligible
    *   * VotesCast
    * * Description: Whether the threshold is measured against votes cast (abstentions excluded) or against all eligible voters.
    */
    get ThresholdBasis(): 'Eligible' | 'VotesCast' {
        return this.Get('ThresholdBasis');
    }
    set ThresholdBasis(value: 'Eligible' | 'VotesCast') {
        this.Set('ThresholdBasis', value);
    }

    /**
    * * Field Name: AllowAbstain
    * * Display Name: Allow Abstain
    * * SQL Data Type: bit
    * * Default Value: 1
    * * Description: True when the ballot offers an explicit abstention. Abstentions count toward participation and quorum, never toward the threshold numerator.
    */
    get AllowAbstain(): boolean {
        return this.Get('AllowAbstain');
    }
    set AllowAbstain(value: boolean) {
        this.Set('AllowAbstain', value);
    }

    /**
    * * Field Name: AllowWriteIn
    * * Display Name: Allow Write-In
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True when voters may write in an option.
    */
    get AllowWriteIn(): boolean {
        return this.Get('AllowWriteIn');
    }
    set AllowWriteIn(value: boolean) {
        this.Set('AllowWriteIn', value);
    }

    /**
    * * Field Name: MinSelections
    * * Display Name: Minimum Selections
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Fewest options a voter must select (0 allows a blank contest).
    */
    get MinSelections(): number {
        return this.Get('MinSelections');
    }
    set MinSelections(value: number) {
        this.Set('MinSelections', value);
    }

    /**
    * * Field Name: MaxSelections
    * * Display Name: Maximum Selections
    * * SQL Data Type: int
    * * Description: Most options a voter may select or rank. NULL means the number of seats (or every option for approval and ranked methods).
    */
    get MaxSelections(): number | null {
        return this.Get('MaxSelections');
    }
    set MaxSelections(value: number | null) {
        this.Set('MaxSelections', value);
    }

    /**
    * * Field Name: VotingClassFilter
    * * Display Name: Voting Class Filter
    * * SQL Data Type: nvarchar(100)
    * * Description: When set, only voters in this voting class see and vote in the contest (for example seats elected by one class of member).
    */
    get VotingClassFilter(): string | null {
        return this.Get('VotingClassFilter');
    }
    set VotingClassFilter(value: string | null) {
        this.Set('VotingClassFilter', value);
    }

    /**
    * * Field Name: TieBreakMethod
    * * Display Name: Tie Break Method
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Lot
    * * Value List Type: List
    * * Possible Values 
    *   * Administrator
    *   * Lot
    * * Description: Lot (deterministic draw from a recorded seed) or Administrator (decided and recorded by an administrator).
    */
    get TieBreakMethod(): 'Administrator' | 'Lot' {
        return this.Get('TieBreakMethod');
    }
    set TieBreakMethod(value: 'Administrator' | 'Lot') {
        this.Set('TieBreakMethod', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: TallyMethod
    * * Display Name: Tally Method Name
    * * SQL Data Type: nvarchar(100)
    */
    get TallyMethod(): string {
        return this.Get('TallyMethod');
    }
}


/**
 * MJ_BizApps_Voting: Election Anchors - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ElectionAnchor
 * * Base View: vwElectionAnchors
 * * @description A record an election belongs to: a committee motion and its meeting, a Collaboration space, a standards project. Polymorphic EntityID + RecordID so Voting never foreign-keys a host app.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Anchors')
export class mjBizAppsVotingElectionAnchorEntity extends BaseEntity<mjBizAppsVotingElectionAnchorEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Election Anchors record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Election Anchors record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionAnchorEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: EntityID
    * * Display Name: Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    * * Description: The MJ entity of the anchored record.
    */
    get EntityID(): string {
        return this.Get('EntityID');
    }
    set EntityID(value: string) {
        this.Set('EntityID', value);
    }

    /**
    * * Field Name: RecordID
    * * Display Name: Record ID
    * * SQL Data Type: nvarchar(450)
    * * Description: Primary key value of the anchored record (concatenated key format for composite keys).
    */
    get RecordID(): string {
        return this.Get('RecordID');
    }
    set RecordID(value: string) {
        this.Set('RecordID', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(50)
    * * Default Value: Subject
    * * Description: How the record relates to the election (for example Subject, Meeting, Space, Project).
    */
    get Role(): string {
        return this.Get('Role');
    }
    set Role(value: string) {
        this.Set('Role', value);
    }

    /**
    * * Field Name: IsPrimary
    * * Display Name: Is Primary
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True for the one anchor that represents the election's home; at most one per election.
    */
    get IsPrimary(): boolean {
        return this.Get('IsPrimary');
    }
    set IsPrimary(value: boolean) {
        this.Set('IsPrimary', value);
    }

    /**
    * * Field Name: Sequence
    * * Display Name: Sequence
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Display order of the anchors.
    */
    get Sequence(): number {
        return this.Get('Sequence');
    }
    set Sequence(value: number) {
        this.Set('Sequence', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: Entity
    * * Display Name: Entity Name
    * * SQL Data Type: nvarchar(255)
    */
    get Entity(): string {
        return this.Get('Entity');
    }
}


/**
 * MJ_BizApps_Voting: Election Audit Events - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ElectionAuditEvent
 * * Base View: vwElectionAuditEvents
 * * @description Append-only audit log of an election: lifecycle changes, roll amendments and challenges, credential issuance, results views by administrators, tally and certification. Never contains ballot content.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Audit Events')
export class mjBizAppsVotingElectionAuditEventEntity extends BaseEntity<mjBizAppsVotingElectionAuditEventEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Election Audit Events record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Election Audit Events record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionAuditEventEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Election Audit Events - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingElectionAuditEventEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Election Audit Events, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Election Audit Events, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: EventType
    * * Display Name: Event Type
    * * SQL Data Type: nvarchar(100)
    * * Description: What happened (for example StatusChanged, RollFrozen, RollAmended, VoterChallenged, CredentialsIssued, ResultsViewed, Tallied, Certified).
    */
    get EventType(): string {
        return this.Get('EventType');
    }
    set EventType(value: string) {
        this.Set('EventType', value);
    }

    /**
    * * Field Name: ActorUserID
    * * Display Name: Actor User
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: The user who acted; NULL for scheduled and system actions.
    */
    get ActorUserID(): string | null {
        return this.Get('ActorUserID');
    }
    set ActorUserID(value: string | null) {
        this.Set('ActorUserID', value);
    }

    /**
    * * Field Name: OccurredAt
    * * Display Name: Occurred At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When it happened.
    */
    get OccurredAt(): Date {
        return this.Get('OccurredAt');
    }
    set OccurredAt(value: Date) {
        this.Set('OccurredAt', value);
    }

    /**
    * * Field Name: Details
    * * Display Name: Event Details
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON detail of the event. Never ballot content, never a voter's choice.
    */
    get Details(): string | null {
        return this.Get('Details');
    }
    set Details(value: string | null) {
        this.Set('Details', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: ActorUser
    * * Display Name: Actor User Name
    * * SQL Data Type: nvarchar(100)
    */
    get ActorUser(): string | null {
        return this.Get('ActorUser');
    }
}


/**
 * MJ_BizApps_Voting: Election Certifications - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ElectionCertification
 * * Base View: vwElectionCertifications
 * * @description The certified result of record for an election: the report, the hashes of the roll and the ballot set, and the results timing that applied.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Certifications')
export class mjBizAppsVotingElectionCertificationEntity extends BaseEntity<mjBizAppsVotingElectionCertificationEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Election Certifications record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Election Certifications record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionCertificationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Election Certifications - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingElectionCertificationEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Election Certifications, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Election Certifications, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election certified.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Certified
    *   * Draft
    *   * Revoked
    * * Description: Draft (awaiting signatures), Certified or Revoked.
    */
    get Status(): 'Certified' | 'Draft' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Certified' | 'Draft' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: CertifiedAt
    * * Display Name: Certified At
    * * SQL Data Type: datetimeoffset
    * * Description: When the final required signature was recorded.
    */
    get CertifiedAt(): Date | null {
        return this.Get('CertifiedAt');
    }
    set CertifiedAt(value: Date | null) {
        this.Set('CertifiedAt', value);
    }

    /**
    * * Field Name: ReportFileID
    * * Display Name: Report File ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
    * * Description: The certification report document.
    */
    get ReportFileID(): string | null {
        return this.Get('ReportFileID');
    }
    set ReportFileID(value: string | null) {
        this.Set('ReportFileID', value);
    }

    /**
    * * Field Name: RollHash
    * * Display Name: Roll Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: Hash of the frozen roll the election ran against.
    */
    get RollHash(): string | null {
        return this.Get('RollHash');
    }
    set RollHash(value: string | null) {
        this.Set('RollHash', value);
    }

    /**
    * * Field Name: BallotSetHash
    * * Display Name: Ballot Set Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: Hash of the counted ballot set, so a recount can prove it used the same ballots.
    */
    get BallotSetHash(): string | null {
        return this.Get('BallotSetHash');
    }
    set BallotSetHash(value: string | null) {
        this.Set('BallotSetHash', value);
    }

    /**
    * * Field Name: ResultsTimingDisclosure
    * * Display Name: Results Timing Disclosure
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Statement of the results timing and audience that applied, required on the certification when results were visible before close.
    */
    get ResultsTimingDisclosure(): string | null {
        return this.Get('ResultsTimingDisclosure');
    }
    set ResultsTimingDisclosure(value: string | null) {
        this.Set('ResultsTimingDisclosure', value);
    }

    /**
    * * Field Name: Notes
    * * Display Name: Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Certifier notes.
    */
    get Notes(): string | null {
        return this.Get('Notes');
    }
    set Notes(value: string | null) {
        this.Set('Notes', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: ReportFile
    * * Display Name: Report File Name
    * * SQL Data Type: nvarchar(500)
    */
    get ReportFile(): string | null {
        return this.Get('ReportFile');
    }
}


/**
 * MJ_BizApps_Voting: Election Certifiers - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ElectionCertifier
 * * Base View: vwElectionCertifiers
 * * @description A person who signs an election's certification (election administrator, inspector, secretary).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Certifiers')
export class mjBizAppsVotingElectionCertifierEntity extends BaseEntity<mjBizAppsVotingElectionCertifierEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Election Certifiers record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Election Certifiers record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionCertifierEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Election Certifiers - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingElectionCertifierEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Election Certifiers, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Election Certifiers, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionCertificationID
    * * Display Name: Election Certification
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Election Certifications (vwElectionCertifications.ID)
    * * Description: The certification.
    */
    get ElectionCertificationID(): string {
        return this.Get('ElectionCertificationID');
    }
    set ElectionCertificationID(value: string) {
        this.Set('ElectionCertificationID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The certifier.
    */
    get PersonID(): string {
        return this.Get('PersonID');
    }
    set PersonID(value: string) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: Role
    * * Display Name: Role
    * * SQL Data Type: nvarchar(100)
    * * Description: The capacity in which they sign (for example Inspector of Elections, Corporate Secretary).
    */
    get Role(): string | null {
        return this.Get('Role');
    }
    set Role(value: string | null) {
        this.Set('Role', value);
    }

    /**
    * * Field Name: SignedAt
    * * Display Name: Signed At
    * * SQL Data Type: datetimeoffset
    * * Description: When they signed; NULL while pending.
    */
    get SignedAt(): Date | null {
        return this.Get('SignedAt');
    }
    set SignedAt(value: Date | null) {
        this.Set('SignedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Person
    * * Display Name: Person
    * * SQL Data Type: nvarchar(201)
    */
    get Person(): string {
        return this.Get('Person');
    }
}


/**
 * MJ_BizApps_Voting: Election Trustees - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ElectionTrustee
 * * Base View: vwElectionTrustees
 * * @description Tier B: a trustee who holds one share of the election private key and takes part in the tally ceremony. Private shares are never stored.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Trustees')
export class mjBizAppsVotingElectionTrusteeEntity extends BaseEntity<mjBizAppsVotingElectionTrusteeEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Election Trustees record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Election Trustees record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionTrusteeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Election Trustees - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingElectionTrusteeEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Election Trustees, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Election Trustees, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Election Trustees entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * ShareIndex: Share index must be at least 1.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateShareIndexMinimum(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Share index must be at least 1.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateShareIndexMinimum(result: ValidationResult) {
    	if (this.ShareIndex != null && this.ShareIndex < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ShareIndex",
    			"Share index must be 1 or greater.",
    			this.ShareIndex,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: TrusteePersonID
    * * Display Name: Trustee Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The trustee.
    */
    get TrusteePersonID(): string {
        return this.Get('TrusteePersonID');
    }
    set TrusteePersonID(value: string) {
        this.Set('TrusteePersonID', value);
    }

    /**
    * * Field Name: ShareIndex
    * * Display Name: Share Index
    * * SQL Data Type: int
    * * Description: The trustee's share number in the k-of-n scheme (1-based).
    */
    get ShareIndex(): number {
        return this.Get('ShareIndex');
    }
    set ShareIndex(value: number) {
        this.Set('ShareIndex', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Invited
    * * Value List Type: List
    * * Possible Values 
    *   * Invited
    *   * KeyCommitted
    *   * Removed
    *   * ShareSubmitted
    * * Description: Invited, KeyCommitted (public share and commitment recorded), ShareSubmitted (took part in the tally ceremony) or Removed.
    */
    get Status(): 'Invited' | 'KeyCommitted' | 'Removed' | 'ShareSubmitted' {
        return this.Get('Status');
    }
    set Status(value: 'Invited' | 'KeyCommitted' | 'Removed' | 'ShareSubmitted') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: TrusteePerson
    * * Display Name: Trustee Name
    * * SQL Data Type: nvarchar(201)
    */
    get TrusteePerson(): string {
        return this.Get('TrusteePerson');
    }
}


/**
 * MJ_BizApps_Voting: Election Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ElectionType
 * * Base View: vwElectionTypes
 * * @description A kind of election (Motion, Board Election, Referendum, Poll, Standards Ballot, ...). A plug-in point: the row can name a server driver, a UI driver and an IS-A extension entity that the app shipping the type registers. Seeded as metadata; other apps ship their own types without Voting naming them.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Election Types')
export class mjBizAppsVotingElectionTypeEntity extends BaseEntity<mjBizAppsVotingElectionTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Election Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Election Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the election type.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    * * Description: Stable machine code for the type (for example motion, board-election). Callers create elections by this code; it never changes once published.
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: What this type is for and how it behaves.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ServerDriverClass
    * * Display Name: Server Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of the server driver registered under BaseElectionTypeServerDriver. NULL uses the base driver. A type naming a driver that is not registered refuses writes to its elections.
    */
    get ServerDriverClass(): string | null {
        return this.Get('ServerDriverClass');
    }
    set ServerDriverClass(value: string | null) {
        this.Set('ServerDriverClass', value);
    }

    /**
    * * Field Name: UIDriverClass
    * * Display Name: UI Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of the UI driver registered under BaseElectionTypeUIDriver. NULL uses the base driver.
    */
    get UIDriverClass(): string | null {
        return this.Get('UIDriverClass');
    }
    set UIDriverClass(value: string | null) {
        this.Set('UIDriverClass', value);
    }

    /**
    * * Field Name: ElectionExtensionEntityID
    * * Display Name: Election Extension Entity ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Entities (vwEntities.ID)
    * * Description: Optional MJ entity that is a disjoint IS-A child of Election and that every election of this type has, for the type's own typed fields and form (for example Standards Ballot Elections).
    */
    get ElectionExtensionEntityID(): string | null {
        return this.Get('ElectionExtensionEntityID');
    }
    set ElectionExtensionEntityID(value: string | null) {
        this.Set('ElectionExtensionEntityID', value);
    }

    /**
    * * Field Name: IconClass
    * * Display Name: Icon Class
    * * SQL Data Type: nvarchar(100)
    * * Description: Font Awesome icon class shown for the type in the admin UI.
    */
    get IconClass(): string | null {
        return this.Get('IconClass');
    }
    set IconClass(value: string | null) {
        this.Set('IconClass', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON (IElectionTypeConfiguration): the type's defaults (secrecy mode, assurance tier, results timing and audience, allowed contest kinds and sign-in methods, governing-document citation, notice period, paper option) and which keys an election may override.
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Active types can be chosen for new elections; Disabled types keep their existing elections but cannot start new ones.
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ElectionExtensionEntity
    * * Display Name: Election Extension Entity
    * * SQL Data Type: nvarchar(255)
    */
    get ElectionExtensionEntity(): string | null {
        return this.Get('ElectionExtensionEntity');
    }
}


/**
 * MJ_BizApps_Voting: Elections - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: Election
 * * Base View: vwElections
 * * @description The container for a vote: one or more contests, a voter roll, a schedule, and the secrecy, assurance and results-visibility rules that apply. Columns hold what SQL reads; everything else is Configuration (overrides of the election type's defaults).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Elections')
export class mjBizAppsVotingElectionEntity extends BaseEntity<mjBizAppsVotingElectionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Elections record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Elections record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingElectionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Elections entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * ResultsMinCast: The minimum number of cast ballots required to view or publish results must be zero or greater.
    * * TrusteeThreshold: Trustee threshold must be at least 1 when specified.
    * * WeightClassMinSize: Weight class minimum size must be at least 1 to ensure each class contains at least one voter or ballot.
    * * Table-Level: Elections with a Secret secrecy mode cannot allow revoting to preserve ballot secrecy and integrity.
    * * Table-Level: Elections using an assurance tier other than Standard must release results only after the election has closed.
    * * Table-Level: If both election opening and closing times are specified, the closing time must be later than the opening time.
    * * Table-Level: If specified, the live refresh ballot interval and minimum refresh minutes must each be at least 1.
    * * Table-Level: Nominations close date and time must be after the nominations open date and time when both dates are provided.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateResultsMinCastGreaterThanOrEqualToZero(result);
        this.ValidateTrusteeThresholdMinimum(result);
        this.ValidateWeightClassMinSizeMinimum(result);
        this.ValidateAllowRevoteForSecretMode(result);
        this.ValidateAssuranceTierResultsTiming(result);
        this.ValidateClosesAtAfterOpensAt(result);
        this.ValidateLiveRefreshThresholds(result);
        this.ValidateNominationsCloseAtAfterNominationsOpenAt(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The minimum number of cast ballots required to view or publish results must be zero or greater.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateResultsMinCastGreaterThanOrEqualToZero(result: ValidationResult) {
    	if (this.ResultsMinCast != null && this.ResultsMinCast < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ResultsMinCast",
    			"Results minimum cast must be greater than or equal to 0.",
    			this.ResultsMinCast,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Trustee threshold must be at least 1 when specified.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateTrusteeThresholdMinimum(result: ValidationResult) {
    	if (this.TrusteeThreshold != null && this.TrusteeThreshold < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"TrusteeThreshold",
    			"Trustee threshold must be at least 1.",
    			this.TrusteeThreshold,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Weight class minimum size must be at least 1 to ensure each class contains at least one voter or ballot.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateWeightClassMinSizeMinimum(result: ValidationResult) {
    	if (this.WeightClassMinSize != null && this.WeightClassMinSize < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"WeightClassMinSize",
    			"Weight class minimum size must be at least 1.",
    			this.WeightClassMinSize,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Elections with a Secret secrecy mode cannot allow revoting to preserve ballot secrecy and integrity.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAllowRevoteForSecretMode(result: ValidationResult) {
    	if (this.SecrecyMode === "Secret" && this.AllowRevote) {
    		result.Errors.push(new ValidationErrorInfo(
    			"AllowRevote",
    			"Revoting cannot be enabled when secrecy mode is set to Secret.",
    			this.AllowRevote,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Elections using an assurance tier other than Standard must release results only after the election has closed.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateAssuranceTierResultsTiming(result: ValidationResult): void {
    	if (this.AssuranceTier !== "Standard" && this.ResultsTiming !== "AfterClose") {
    		result.Errors.push(new ValidationErrorInfo(
    			"ResultsTiming",
    			"Elections with an assurance tier other than Standard must have results timing set to AfterClose.",
    			this.ResultsTiming,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * If both election opening and closing times are specified, the closing time must be later than the opening time.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateClosesAtAfterOpensAt(result: ValidationResult) {
    	if (this.OpensAt != null && this.ClosesAt != null && this.ClosesAt <= this.OpensAt) {
    		result.Errors.push(new ValidationErrorInfo(
    			"ClosesAt",
    			"Election closing time must be after the opening time.",
    			this.ClosesAt,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * If specified, the live refresh ballot interval and minimum refresh minutes must each be at least 1.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateLiveRefreshThresholds(result: ValidationResult) {
    	if (this.LiveRefreshEveryBallots != null && this.LiveRefreshEveryBallots < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"LiveRefreshEveryBallots",
    			"Live refresh ballot interval must be at least 1.",
    			this.LiveRefreshEveryBallots,
    			ValidationErrorType.Failure
    		));
    	}
    	if (this.LiveRefreshMinMinutes != null && this.LiveRefreshMinMinutes < 1) {
    		result.Errors.push(new ValidationErrorInfo(
    			"LiveRefreshMinMinutes",
    			"Live refresh minimum minutes must be at least 1.",
    			this.LiveRefreshMinMinutes,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * Nominations close date and time must be after the nominations open date and time when both dates are provided.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateNominationsCloseAtAfterNominationsOpenAt(result: ValidationResult) {
    	if (this.NominationsOpenAt != null && this.NominationsCloseAt != null && this.NominationsCloseAt <= this.NominationsOpenAt) {
    		result.Errors.push(new ValidationErrorInfo(
    			"NominationsCloseAt",
    			"Nominations close date and time must be after the nominations open date and time.",
    			this.NominationsCloseAt,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * Description: Display name of the election (for example '2027 Board of Directors Election' or 'Approve the 2027 budget').
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Notice text and background shown to administrators and voters.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ElectionTypeID
    * * Display Name: Election Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Election Types (vwElectionTypes.ID)
    * * Description: The election type, which supplies drivers, the optional extension entity and default configuration.
    */
    get ElectionTypeID(): string {
        return this.Get('ElectionTypeID');
    }
    set ElectionTypeID(value: string) {
        this.Set('ElectionTypeID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Draft
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Certified
    *   * Closed
    *   * Draft
    *   * Nominations
    *   * Open
    *   * Ready
    *   * Tallied
    * * Description: Lifecycle state: Draft -> Nominations -> Ready -> Open -> Closed -> Tallied -> Certified, or Cancelled at any point before certification. Moves only along this state machine; enforced by the entity server class.
    */
    get Status(): 'Cancelled' | 'Certified' | 'Closed' | 'Draft' | 'Nominations' | 'Open' | 'Ready' | 'Tallied' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Certified' | 'Closed' | 'Draft' | 'Nominations' | 'Open' | 'Ready' | 'Tallied') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SecrecyMode
    * * Display Name: Secrecy Mode
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Secret
    * * Value List Type: List
    * * Possible Values 
    *   * Confidential
    *   * Open
    *   * Secret
    * * Description: Open (roll call: each vote linked to the voter and visible per policy), Confidential (linked to the voter but sealed until close) or Secret (poll book and ballot box unlinkable).
    */
    get SecrecyMode(): 'Confidential' | 'Open' | 'Secret' {
        return this.Get('SecrecyMode');
    }
    set SecrecyMode(value: 'Confidential' | 'Open' | 'Secret') {
        this.Set('SecrecyMode', value);
    }

    /**
    * * Field Name: AssuranceTier
    * * Display Name: Assurance Tier
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Standard
    * * Value List Type: List
    * * Possible Values 
    *   * HighAssurance
    *   * Standard
    *   * Verifiable
    * * Description: Standard (tier A: field encryption at rest and access isolation), HighAssurance (tier B: selections encrypted under an election key split among trustees) or Verifiable (tier C: ElectionGuard).
    */
    get AssuranceTier(): 'HighAssurance' | 'Standard' | 'Verifiable' {
        return this.Get('AssuranceTier');
    }
    set AssuranceTier(value: 'HighAssurance' | 'Standard' | 'Verifiable') {
        this.Set('AssuranceTier', value);
    }

    /**
    * * Field Name: EligibilitySourceTypeID
    * * Display Name: Eligibility Source Type
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligibility Source Types (vwEligibilitySourceTypes.ID)
    * * Description: Where the voter roll comes from. NULL until the administrator chooses a source.
    */
    get EligibilitySourceTypeID(): string | null {
        return this.Get('EligibilitySourceTypeID');
    }
    set EligibilitySourceTypeID(value: string | null) {
        this.Set('EligibilitySourceTypeID', value);
    }

    /**
    * * Field Name: EligibilitySourceSettings
    * * Display Name: Eligibility Source Settings
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON settings for the eligibility source driver (for example the committee, space or entity query to read).
    */
    get EligibilitySourceSettings(): string | null {
        return this.Get('EligibilitySourceSettings');
    }
    set EligibilitySourceSettings(value: string | null) {
        this.Set('EligibilitySourceSettings', value);
    }

    /**
    * * Field Name: RecordDate
    * * Display Name: Record Date
    * * SQL Data Type: datetimeoffset
    * * Description: The date and time as of which eligibility is determined; the roll is frozen against it.
    */
    get RecordDate(): Date | null {
        return this.Get('RecordDate');
    }
    set RecordDate(value: Date | null) {
        this.Set('RecordDate', value);
    }

    /**
    * * Field Name: TimeZone
    * * Display Name: Time Zone
    * * SQL Data Type: nvarchar(64)
    * * Default Value: UTC
    * * Description: IANA time zone used to present the schedule to voters and administrators.
    */
    get TimeZone(): string {
        return this.Get('TimeZone');
    }
    set TimeZone(value: string) {
        this.Set('TimeZone', value);
    }

    /**
    * * Field Name: NominationsOpenAt
    * * Display Name: Nominations Open At
    * * SQL Data Type: datetimeoffset
    * * Description: When nominations open, if the election takes nominations.
    */
    get NominationsOpenAt(): Date | null {
        return this.Get('NominationsOpenAt');
    }
    set NominationsOpenAt(value: Date | null) {
        this.Set('NominationsOpenAt', value);
    }

    /**
    * * Field Name: NominationsCloseAt
    * * Display Name: Nominations Close At
    * * SQL Data Type: datetimeoffset
    * * Description: When nominations close.
    */
    get NominationsCloseAt(): Date | null {
        return this.Get('NominationsCloseAt');
    }
    set NominationsCloseAt(value: Date | null) {
        this.Set('NominationsCloseAt', value);
    }

    /**
    * * Field Name: OpensAt
    * * Display Name: Opens At
    * * SQL Data Type: datetimeoffset
    * * Description: When voting opens.
    */
    get OpensAt(): Date | null {
        return this.Get('OpensAt');
    }
    set OpensAt(value: Date | null) {
        this.Set('OpensAt', value);
    }

    /**
    * * Field Name: ClosesAt
    * * Display Name: Closes At
    * * SQL Data Type: datetimeoffset
    * * Description: When voting closes.
    */
    get ClosesAt(): Date | null {
        return this.Get('ClosesAt');
    }
    set ClosesAt(value: Date | null) {
        this.Set('ClosesAt', value);
    }

    /**
    * * Field Name: ProxyDeadline
    * * Display Name: Proxy Deadline
    * * SQL Data Type: datetimeoffset
    * * Description: Latest time a proxy designation is accepted. NULL means proxies are not accepted.
    */
    get ProxyDeadline(): Date | null {
        return this.Get('ProxyDeadline');
    }
    set ProxyDeadline(value: Date | null) {
        this.Set('ProxyDeadline', value);
    }

    /**
    * * Field Name: ChallengeWindowEndsAt
    * * Display Name: Challenge Window Ends At
    * * SQL Data Type: datetimeoffset
    * * Description: End of the post-tally challenge window; certification waits for it.
    */
    get ChallengeWindowEndsAt(): Date | null {
        return this.Get('ChallengeWindowEndsAt');
    }
    set ChallengeWindowEndsAt(value: Date | null) {
        this.Set('ChallengeWindowEndsAt', value);
    }

    /**
    * * Field Name: AllowRevote
    * * Display Name: Allow Revote
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When true a voter may replace their ballot until close. Only Open and Confidential elections may allow it; a Secret ballot is final.
    */
    get AllowRevote(): boolean {
        return this.Get('AllowRevote');
    }
    set AllowRevote(value: boolean) {
        this.Set('AllowRevote', value);
    }

    /**
    * * Field Name: ResultsTiming
    * * Display Name: Results Timing
    * * SQL Data Type: nvarchar(20)
    * * Default Value: AfterClose
    * * Value List Type: List
    * * Possible Values 
    *   * AdministratorsOnly
    *   * AfterClose
    *   * AfterVoting
    *   * Live
    * * Description: When results are visible: AfterClose (default; turnout only while open), AfterVoting (each voter after casting), Live (results audience throughout) or AdministratorsOnly (audited monitoring). Running results are a tier A feature.
    */
    get ResultsTiming(): 'AdministratorsOnly' | 'AfterClose' | 'AfterVoting' | 'Live' {
        return this.Get('ResultsTiming');
    }
    set ResultsTiming(value: 'AdministratorsOnly' | 'AfterClose' | 'AfterVoting' | 'Live') {
        this.Set('ResultsTiming', value);
    }

    /**
    * * Field Name: ResultsAudience
    * * Display Name: Results Audience
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Voters
    * * Value List Type: List
    * * Possible Values 
    *   * Administrators
    *   * Eligible
    *   * HostMembers
    *   * Public
    *   * Voters
    * * Description: Who may see results: Voters, Eligible, HostMembers, Public or Administrators.
    */
    get ResultsAudience(): 'Administrators' | 'Eligible' | 'HostMembers' | 'Public' | 'Voters' {
        return this.Get('ResultsAudience');
    }
    set ResultsAudience(value: 'Administrators' | 'Eligible' | 'HostMembers' | 'Public' | 'Voters') {
        this.Set('ResultsAudience', value);
    }

    /**
    * * Field Name: ResultsMinCast
    * * Display Name: Results Min Cast
    * * SQL Data Type: int
    * * Default Value: 5
    * * Description: Minimum number of ballots cast before running (in-progress) results are shown to non-administrators. Final results, once tallied, are published to their audience regardless.
    */
    get ResultsMinCast(): number {
        return this.Get('ResultsMinCast');
    }
    set ResultsMinCast(value: number) {
        this.Set('ResultsMinCast', value);
    }

    /**
    * * Field Name: WeightClassMinSize
    * * Display Name: Weight Class Min Size
    * * SQL Data Type: int
    * * Default Value: 5
    * * Description: Minimum number of voters in a weight class before its tally is reported, so a unique weight cannot re-identify its voter.
    */
    get WeightClassMinSize(): number {
        return this.Get('WeightClassMinSize');
    }
    set WeightClassMinSize(value: number) {
        this.Set('WeightClassMinSize', value);
    }

    /**
    * * Field Name: LiveRefreshEveryBallots
    * * Display Name: Live Refresh Every Ballots
    * * SQL Data Type: int
    * * Description: For running results: publish a new snapshot only after this many further ballots.
    */
    get LiveRefreshEveryBallots(): number | null {
        return this.Get('LiveRefreshEveryBallots');
    }
    set LiveRefreshEveryBallots(value: number | null) {
        this.Set('LiveRefreshEveryBallots', value);
    }

    /**
    * * Field Name: LiveRefreshMinMinutes
    * * Display Name: Live Refresh Min Minutes
    * * SQL Data Type: int
    * * Description: For running results: publish snapshots no more often than every this many minutes.
    */
    get LiveRefreshMinMinutes(): number | null {
        return this.Get('LiveRefreshMinMinutes');
    }
    set LiveRefreshMinMinutes(value: number | null) {
        this.Set('LiveRefreshMinMinutes', value);
    }

    /**
    * * Field Name: PublishPollBook
    * * Display Name: Publish Poll Book
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When true the poll book (who voted, never how) is visible to voters, as some bylaws require. Default private. Never shown to an audience that also sees running results unless the election is Open.
    */
    get PublishPollBook(): boolean {
        return this.Get('PublishPollBook');
    }
    set PublishPollBook(value: boolean) {
        this.Set('PublishPollBook', value);
    }

    /**
    * * Field Name: RollFrozenAt
    * * Display Name: Roll Frozen At
    * * SQL Data Type: datetimeoffset
    * * Description: When the voter roll was frozen; after this only audited amendments change it.
    */
    get RollFrozenAt(): Date | null {
        return this.Get('RollFrozenAt');
    }
    set RollFrozenAt(value: Date | null) {
        this.Set('RollFrozenAt', value);
    }

    /**
    * * Field Name: RollHash
    * * Display Name: Roll Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: Hash of the frozen roll, recorded on the certification.
    */
    get RollHash(): string | null {
        return this.Get('RollHash');
    }
    set RollHash(value: string | null) {
        this.Set('RollHash', value);
    }

    /**
    * * Field Name: TrusteeThreshold
    * * Display Name: Trustee Threshold
    * * SQL Data Type: int
    * * Description: Tier B: the number of trustee key shares (k of n) required to decrypt.
    */
    get TrusteeThreshold(): number | null {
        return this.Get('TrusteeThreshold');
    }
    set TrusteeThreshold(value: number | null) {
        this.Set('TrusteeThreshold', value);
    }

    /**
    * * Field Name: ElectionPublicKey
    * * Display Name: Election Public Key
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Tier B/C: the election public key ballots are encrypted under. The private key is never stored.
    */
    get ElectionPublicKey(): string | null {
        return this.Get('ElectionPublicKey');
    }
    set ElectionPublicKey(value: string | null) {
        this.Set('ElectionPublicKey', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON overrides of the election type's configuration, limited to the keys the type allows (quorum, tie-break policy, reminders, languages, inspectors, independent administrator).
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: ElectionType
    * * Display Name: Election Type Name
    * * SQL Data Type: nvarchar(100)
    */
    get ElectionType(): string {
        return this.Get('ElectionType');
    }

    /**
    * * Field Name: EligibilitySourceType
    * * Display Name: Eligibility Source Type Name
    * * SQL Data Type: nvarchar(100)
    */
    get EligibilitySourceType(): string | null {
        return this.Get('EligibilitySourceType');
    }
}


/**
 * MJ_BizApps_Voting: Eligibility Source Types - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: EligibilitySourceType
 * * Base View: vwEligibilitySourceTypes
 * * @description Where a voter roll comes from. A plug-in point: DriverClass names a BaseEligibilitySource implementation. Voting ships Entity Query and CSV; other apps ship theirs (committee voting members, Collaboration space seats).
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Eligibility Source Types')
export class mjBizAppsVotingEligibilitySourceTypeEntity extends BaseEntity<mjBizAppsVotingEligibilitySourceTypeEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Eligibility Source Types record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Eligibility Source Types record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingEligibilitySourceTypeEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the roll source.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    * * Description: Stable machine code for the source (for example entity-query, csv).
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: What the source reads and how it decides voting class and weight.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of the BaseEligibilitySource implementation.
    */
    get DriverClass(): string {
        return this.Get('DriverClass');
    }
    set DriverClass(value: string) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON describing the settings an election must supply for this source (the settings themselves live on the election).
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Active sources can be chosen for new elections; Disabled sources cannot.
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Voting: Eligible Voters - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: EligibleVoter
 * * Base View: vwEligibleVoters
 * * @description One entry on an election's voter roll, frozen at the record date. Changes after the freeze are audited amendments or challenges.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Eligible Voters')
export class mjBizAppsVotingEligibleVoterEntity extends BaseEntity<mjBizAppsVotingEligibleVoterEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Eligible Voters record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Eligible Voters record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingEligibleVoterEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Eligible Voters - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingEligibleVoterEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Eligible Voters, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Eligible Voters, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Eligible Voters entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Weight: Weight must be greater than zero to ensure that voter or representation allocations have a positive voting value.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateWeightGreaterThanZero(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Weight must be greater than zero to ensure that voter or representation allocations have a positive voting value.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateWeightGreaterThanZero(result: ValidationResult) {
    	if (this.Weight != null && this.Weight <= 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"Weight",
    			"Weight must be greater than zero.",
    			this.Weight,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The voter. For an organizational voter this is the designated voting representative.
    */
    get PersonID(): string {
        return this.Get('PersonID');
    }
    set PersonID(value: string) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: RepresentingOrganizationID
    * * Display Name: Representing Organization
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: Organizations (vwOrganizations.ID)
    * * Description: The organization this entry votes for, when the voter is an organization's representative.
    */
    get RepresentingOrganizationID(): string | null {
        return this.Get('RepresentingOrganizationID');
    }
    set RepresentingOrganizationID(value: string | null) {
        this.Set('RepresentingOrganizationID', value);
    }

    /**
    * * Field Name: VotingClass
    * * Display Name: Voting Class
    * * SQL Data Type: nvarchar(100)
    * * Description: The voter's class, for contests limited to one class and for per-class reporting.
    */
    get VotingClass(): string | null {
        return this.Get('VotingClass');
    }
    set VotingClass(value: string | null) {
        this.Set('VotingClass', value);
    }

    /**
    * * Field Name: Weight
    * * Display Name: Weight
    * * SQL Data Type: decimal(18, 6)
    * * Default Value: 1
    * * Description: Vote weight (1 for one-person-one-vote). Never copied onto the ballot; tallies use weight classes.
    */
    get Weight(): number {
        return this.Get('Weight');
    }
    set Weight(value: number) {
        this.Set('Weight', value);
    }

    /**
    * * Field Name: SourceKey
    * * Display Name: Source Key
    * * SQL Data Type: nvarchar(255)
    * * Description: The voter's identifier in the source system (member number, employee ID, unit number), used to match host assertions and second factors.
    */
    get SourceKey(): string | null {
        return this.Get('SourceKey');
    }
    set SourceKey(value: string | null) {
        this.Set('SourceKey', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Eligible
    * * Value List Type: List
    * * Possible Values 
    *   * Challenged
    *   * Eligible
    *   * Removed
    * * Description: Eligible, Challenged (awaiting a decision) or Removed.
    */
    get Status(): 'Challenged' | 'Eligible' | 'Removed' {
        return this.Get('Status');
    }
    set Status(value: 'Challenged' | 'Eligible' | 'Removed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: StatusReason
    * * Display Name: Status Reason
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Why the entry was challenged or removed.
    */
    get StatusReason(): string | null {
        return this.Get('StatusReason');
    }
    set StatusReason(value: string | null) {
        this.Set('StatusReason', value);
    }

    /**
    * * Field Name: AddedAfterFreeze
    * * Display Name: Added After Freeze
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True when the entry was added by an audited amendment after the roll was frozen.
    */
    get AddedAfterFreeze(): boolean {
        return this.Get('AddedAfterFreeze');
    }
    set AddedAfterFreeze(value: boolean) {
        this.Set('AddedAfterFreeze', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: Person
    * * Display Name: Person Name
    * * SQL Data Type: nvarchar(201)
    */
    get Person(): string {
        return this.Get('Person');
    }

    /**
    * * Field Name: RepresentingOrganization
    * * Display Name: Representing Organization Name
    * * SQL Data Type: nvarchar(255)
    */
    get RepresentingOrganization(): string | null {
        return this.Get('RepresentingOrganization');
    }
}


/**
 * MJ_BizApps_Voting: Nomination Endorsements - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: NominationEndorsement
 * * Base View: vwNominationEndorsements
 * * @description A petition signature or endorsement supporting a nomination.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Nomination Endorsements')
export class mjBizAppsVotingNominationEndorsementEntity extends BaseEntity<mjBizAppsVotingNominationEndorsementEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Nomination Endorsements record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Nomination Endorsements record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingNominationEndorsementEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: NominationID
    * * Display Name: Nomination
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Nominations (vwNominations.ID)
    * * Description: The nomination endorsed.
    */
    get NominationID(): string {
        return this.Get('NominationID');
    }
    set NominationID(value: string) {
        this.Set('NominationID', value);
    }

    /**
    * * Field Name: EndorserPersonID
    * * Display Name: Endorser Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The person endorsing (signing the petition).
    */
    get EndorserPersonID(): string {
        return this.Get('EndorserPersonID');
    }
    set EndorserPersonID(value: string) {
        this.Set('EndorserPersonID', value);
    }

    /**
    * * Field Name: EndorsedAt
    * * Display Name: Endorsed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the endorsement was given.
    */
    get EndorsedAt(): Date {
        return this.Get('EndorsedAt');
    }
    set EndorsedAt(value: Date) {
        this.Set('EndorsedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Valid
    * * Value List Type: List
    * * Possible Values 
    *   * Invalid
    *   * Valid
    *   * Withdrawn
    * * Description: Valid, Invalid (failed an eligibility check) or Withdrawn.
    */
    get Status(): 'Invalid' | 'Valid' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Invalid' | 'Valid' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: EndorserPerson
    * * Display Name: Endorser Person
    * * SQL Data Type: nvarchar(201)
    */
    get EndorserPerson(): string {
        return this.Get('EndorserPerson');
    }
}


/**
 * MJ_BizApps_Voting: Nominations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: Nomination
 * * Base View: vwNominations
 * * @description A nomination of a person for an office contest, through submission, the nominee's acceptance and committee approval. Endorsements carry petition signatures.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Nominations')
export class mjBizAppsVotingNominationEntity extends BaseEntity<mjBizAppsVotingNominationEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Nominations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Nominations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingNominationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContestID
    * * Display Name: Contest
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contests (vwContests.ID)
    * * Description: The office contest the person is nominated for.
    */
    get ContestID(): string {
        return this.Get('ContestID');
    }
    set ContestID(value: string) {
        this.Set('ContestID', value);
    }

    /**
    * * Field Name: NomineePersonID
    * * Display Name: Nominee Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The person nominated.
    */
    get NomineePersonID(): string {
        return this.Get('NomineePersonID');
    }
    set NomineePersonID(value: string) {
        this.Set('NomineePersonID', value);
    }

    /**
    * * Field Name: NominatedByPersonID
    * * Display Name: Nominated By Person
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: Who made the nomination; NULL for a self-nomination or a committee slate.
    */
    get NominatedByPersonID(): string | null {
        return this.Get('NominatedByPersonID');
    }
    set NominatedByPersonID(value: string | null) {
        this.Set('NominatedByPersonID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Submitted
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Approved
    *   * Declined
    *   * Rejected
    *   * Submitted
    *   * Withdrawn
    * * Description: Submitted, Accepted (by the nominee), Declined (by the nominee), Approved (onto the ballot), Rejected or Withdrawn.
    */
    get Status(): 'Accepted' | 'Approved' | 'Declined' | 'Rejected' | 'Submitted' | 'Withdrawn' {
        return this.Get('Status');
    }
    set Status(value: 'Accepted' | 'Approved' | 'Declined' | 'Rejected' | 'Submitted' | 'Withdrawn') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: Statement
    * * Display Name: Statement
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The nominee's statement of candidacy.
    */
    get Statement(): string | null {
        return this.Get('Statement');
    }
    set Statement(value: string | null) {
        this.Set('Statement', value);
    }

    /**
    * * Field Name: SubmittedAt
    * * Display Name: Submitted At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the nomination was submitted.
    */
    get SubmittedAt(): Date {
        return this.Get('SubmittedAt');
    }
    set SubmittedAt(value: Date) {
        this.Set('SubmittedAt', value);
    }

    /**
    * * Field Name: DecidedAt
    * * Display Name: Decided At
    * * SQL Data Type: datetimeoffset
    * * Description: When the nomination was approved or rejected.
    */
    get DecidedAt(): Date | null {
        return this.Get('DecidedAt');
    }
    set DecidedAt(value: Date | null) {
        this.Set('DecidedAt', value);
    }

    /**
    * * Field Name: DecisionNotes
    * * Display Name: Decision Notes
    * * SQL Data Type: nvarchar(MAX)
    * * Description: Reason recorded with the approval or rejection.
    */
    get DecisionNotes(): string | null {
        return this.Get('DecisionNotes');
    }
    set DecisionNotes(value: string | null) {
        this.Set('DecisionNotes', value);
    }

    /**
    * * Field Name: ContestOptionID
    * * Display Name: Contest Option
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Contest Options (vwContestOptions.ID)
    * * Description: The ballot option created when the nomination was approved.
    */
    get ContestOptionID(): string | null {
        return this.Get('ContestOptionID');
    }
    set ContestOptionID(value: string | null) {
        this.Set('ContestOptionID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Contest
    * * Display Name: Contest
    * * SQL Data Type: nvarchar(500)
    */
    get Contest(): string {
        return this.Get('Contest');
    }

    /**
    * * Field Name: NomineePerson
    * * Display Name: Nominee Person
    * * SQL Data Type: nvarchar(201)
    */
    get NomineePerson(): string {
        return this.Get('NomineePerson');
    }

    /**
    * * Field Name: NominatedByPerson
    * * Display Name: Nominated By Person
    * * SQL Data Type: nvarchar(201)
    */
    get NominatedByPerson(): string | null {
        return this.Get('NominatedByPerson');
    }
}


/**
 * MJ_BizApps_Voting: Participations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: Participation
 * * Base View: vwParticipations
 * * @description The poll book: who voted in an election, when and through which channel. The only place the voter's identity meets the election. One row per roll entry (unique), written in the same transaction as the ballot, so a voter cannot vote without being marked and cannot be marked without voting.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Participations')
export class mjBizAppsVotingParticipationEntity extends BaseEntity<mjBizAppsVotingParticipationEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Participations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Participations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingParticipationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Participations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingParticipationEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Participations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Participations, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Participations entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * Table-Level: Votes submitted through channels other than 'Online' must record the user who entered the vote.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateEnteredByUserWhenChannelNotOnline(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Votes submitted through channels other than 'Online' must record the user who entered the vote.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateEnteredByUserWhenChannelNotOnline(result: ValidationResult) {
    	if (this.Channel !== "Online" && this.EnteredByUserID == null) {
    		result.Errors.push(new ValidationErrorInfo(
    			"EnteredByUserID",
    			"Entered by user must be specified when the submission channel is not Online.",
    			this.EnteredByUserID,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: EligibleVoterID
    * * Display Name: Eligible Voter
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligible Voters (vwEligibleVoters.ID)
    * * Description: The roll entry that voted.
    */
    get EligibleVoterID(): string {
        return this.Get('EligibleVoterID');
    }
    set EligibleVoterID(value: string) {
        this.Set('EligibleVoterID', value);
    }

    /**
    * * Field Name: CastAt
    * * Display Name: Cast At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the ballot was cast (or entered, for paper and proxy ballots).
    */
    get CastAt(): Date {
        return this.Get('CastAt');
    }
    set CastAt(value: Date) {
        this.Set('CastAt', value);
    }

    /**
    * * Field Name: Channel
    * * Display Name: Channel
    * * SQL Data Type: nvarchar(20)
    * * Value List Type: List
    * * Possible Values 
    *   * InPerson
    *   * Online
    *   * Paper
    *   * Proxy
    * * Description: Online, Paper, Proxy or InPerson.
    */
    get Channel(): 'InPerson' | 'Online' | 'Paper' | 'Proxy' {
        return this.Get('Channel');
    }
    set Channel(value: 'InPerson' | 'Online' | 'Paper' | 'Proxy') {
        this.Set('Channel', value);
    }

    /**
    * * Field Name: VoterCredentialMethodID
    * * Display Name: Voter Credential Method
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Voter Credential Methods (vwVoterCredentialMethods.ID)
    * * Description: For online ballots: the sign-in method used, so the certification can count participation by method.
    */
    get VoterCredentialMethodID(): string | null {
        return this.Get('VoterCredentialMethodID');
    }
    set VoterCredentialMethodID(value: string | null) {
        this.Set('VoterCredentialMethodID', value);
    }

    /**
    * * Field Name: EnteredByUserID
    * * Display Name: Entered By User
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Users (vwUsers.ID)
    * * Description: For paper, proxy and in-person ballots: the staff user who entered it.
    */
    get EnteredByUserID(): string | null {
        return this.Get('EnteredByUserID');
    }
    set EnteredByUserID(value: string | null) {
        this.Set('EnteredByUserID', value);
    }

    /**
    * * Field Name: ProxyDesignationID
    * * Display Name: Proxy Designation
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Proxy Designations (vwProxyDesignations.ID)
    * * Description: For proxy ballots: the designation the proxy voted under.
    */
    get ProxyDesignationID(): string | null {
        return this.Get('ProxyDesignationID');
    }
    set ProxyDesignationID(value: string | null) {
        this.Set('ProxyDesignationID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: VoterCredentialMethod
    * * Display Name: Voter Credential Method Name
    * * SQL Data Type: nvarchar(100)
    */
    get VoterCredentialMethod(): string | null {
        return this.Get('VoterCredentialMethod');
    }

    /**
    * * Field Name: EnteredByUser
    * * Display Name: Entered By User Name
    * * SQL Data Type: nvarchar(100)
    */
    get EnteredByUser(): string | null {
        return this.Get('EnteredByUser');
    }
}


/**
 * MJ_BizApps_Voting: Proxy Designations - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ProxyDesignation
 * * Base View: vwProxyDesignations
 * * @description A voter's designation of a proxy to vote on their behalf, received by the election's proxy deadline.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Proxy Designations')
export class mjBizAppsVotingProxyDesignationEntity extends BaseEntity<mjBizAppsVotingProxyDesignationEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Proxy Designations record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Proxy Designations record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingProxyDesignationEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Proxy Designations - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingProxyDesignationEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Proxy Designations, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Proxy Designations, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: GrantorEligibleVoterID
    * * Display Name: Grantor Eligible Voter ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligible Voters (vwEligibleVoters.ID)
    * * Description: The roll entry granting the proxy.
    */
    get GrantorEligibleVoterID(): string {
        return this.Get('GrantorEligibleVoterID');
    }
    set GrantorEligibleVoterID(value: string) {
        this.Set('GrantorEligibleVoterID', value);
    }

    /**
    * * Field Name: ProxyPersonID
    * * Display Name: Proxy Person ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Common: People (vwPeople.ID)
    * * Description: The person who will vote on the grantor's behalf.
    */
    get ProxyPersonID(): string {
        return this.Get('ProxyPersonID');
    }
    set ProxyPersonID(value: string) {
        this.Set('ProxyPersonID', value);
    }

    /**
    * * Field Name: Scope
    * * Display Name: Scope
    * * SQL Data Type: nvarchar(20)
    * * Default Value: General
    * * Value List Type: List
    * * Possible Values 
    *   * Directed
    *   * General
    * * Description: General (the proxy decides) or Directed (the grantor's instructions bind the proxy).
    */
    get Scope(): 'Directed' | 'General' {
        return this.Get('Scope');
    }
    set Scope(value: 'Directed' | 'General') {
        this.Set('Scope', value);
    }

    /**
    * * Field Name: Instructions
    * * Display Name: Instructions
    * * SQL Data Type: nvarchar(MAX)
    * * Description: For a directed proxy: the grantor's voting instructions.
    */
    get Instructions(): string | null {
        return this.Get('Instructions');
    }
    set Instructions(value: string | null) {
        this.Set('Instructions', value);
    }

    /**
    * * Field Name: ReceivedAt
    * * Display Name: Received At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the designation was received; must be on or before the election's proxy deadline.
    */
    get ReceivedAt(): Date {
        return this.Get('ReceivedAt');
    }
    set ReceivedAt(value: Date) {
        this.Set('ReceivedAt', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Accepted
    *   * Pending
    *   * Rejected
    *   * Revoked
    *   * Used
    * * Description: Pending, Accepted, Rejected, Revoked or Used (a ballot was cast under it).
    */
    get Status(): 'Accepted' | 'Pending' | 'Rejected' | 'Revoked' | 'Used' {
        return this.Get('Status');
    }
    set Status(value: 'Accepted' | 'Pending' | 'Rejected' | 'Revoked' | 'Used') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }

    /**
    * * Field Name: ProxyPerson
    * * Display Name: Proxy Person
    * * SQL Data Type: nvarchar(201)
    */
    get ProxyPerson(): string {
        return this.Get('ProxyPerson');
    }
}


/**
 * MJ_BizApps_Voting: Result Snapshots - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: ResultSnapshot
 * * Base View: vwResultSnapshots
 * * @description A batched publication of running results while an election is open, materialized by a scheduled job according to the election's refresh policy and minimum-cast threshold. The only form in which running results are served.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Result Snapshots')
export class mjBizAppsVotingResultSnapshotEntity extends BaseEntity<mjBizAppsVotingResultSnapshotEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Result Snapshots record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Result Snapshots record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingResultSnapshotEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Result Snapshots - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingResultSnapshotEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Result Snapshots, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Result Snapshots, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Result Snapshots entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * BallotCount: Ballot count cannot be negative to ensure accurate election snapshot records.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateBallotCountNonNegative(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Ballot count cannot be negative to ensure accurate election snapshot records.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateBallotCountNonNegative(result: ValidationResult) {
    	if (this.BallotCount != null && this.BallotCount < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"BallotCount",
    			"Ballot count must be greater than or equal to 0.",
    			this.BallotCount,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionID
    * * Display Name: Election
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: The election.
    */
    get ElectionID(): string {
        return this.Get('ElectionID');
    }
    set ElectionID(value: string) {
        this.Set('ElectionID', value);
    }

    /**
    * * Field Name: SnapshotAt
    * * Display Name: Snapshot At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the snapshot was taken.
    */
    get SnapshotAt(): Date {
        return this.Get('SnapshotAt');
    }
    set SnapshotAt(value: Date) {
        this.Set('SnapshotAt', value);
    }

    /**
    * * Field Name: BallotCount
    * * Display Name: Ballot Count
    * * SQL Data Type: int
    * * Description: Ballots included in the snapshot.
    */
    get BallotCount(): number {
        return this.Get('BallotCount');
    }
    set BallotCount(value: number) {
        this.Set('BallotCount', value);
    }

    /**
    * * Field Name: Results
    * * Display Name: Results Data
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON of per-contest, per-option totals as published (threshold and weight-class suppression already applied).
    */
    get Results(): string {
        return this.Get('Results');
    }
    set Results(value: string) {
        this.Set('Results', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Election
    * * Display Name: Election Name
    * * SQL Data Type: nvarchar(255)
    */
    get Election(): string {
        return this.Get('Election');
    }
}


/**
 * MJ_BizApps_Voting: Standards Ballot Elections - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: StandardsBallotElection
 * * Base View: vwStandardsBallotElections
 * * @description IS-A extension of Election for the Standards Ballot type: the document balloted and its recirculation round.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Standards Ballot Elections')
export class mjBizAppsVotingStandardsBallotElectionEntity extends BaseEntity<mjBizAppsVotingStandardsBallotElectionEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Standards Ballot Elections record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Standards Ballot Elections record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingStandardsBallotElectionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Standards Ballot Elections entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * RecirculationRound: Recirculation round must be zero or a positive number.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateRecirculationRoundNonNegative(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * Recirculation round must be zero or a positive number.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateRecirculationRoundNonNegative(result: ValidationResult): void {
    	if (this.RecirculationRound != null && this.RecirculationRound < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"RecirculationRound",
    			"Recirculation round must be greater than or equal to 0.",
    			this.RecirculationRound,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: DocumentTitle
    * * Display Name: Document Title
    * * SQL Data Type: nvarchar(500)
    * * Description: Title of the draft standard or document being balloted.
    */
    get DocumentTitle(): string {
        return this.Get('DocumentTitle');
    }
    set DocumentTitle(value: string) {
        this.Set('DocumentTitle', value);
    }

    /**
    * * Field Name: DocumentVersion
    * * Display Name: Document Version
    * * SQL Data Type: nvarchar(50)
    * * Description: Version or draft number of the document.
    */
    get DocumentVersion(): string | null {
        return this.Get('DocumentVersion');
    }
    set DocumentVersion(value: string | null) {
        this.Set('DocumentVersion', value);
    }

    /**
    * * Field Name: DocumentFileID
    * * Display Name: Document File ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Files (vwFiles.ID)
    * * Description: The document balloted.
    */
    get DocumentFileID(): string | null {
        return this.Get('DocumentFileID');
    }
    set DocumentFileID(value: string | null) {
        this.Set('DocumentFileID', value);
    }

    /**
    * * Field Name: RecirculationRound
    * * Display Name: Recirculation Round
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: 0 for the initial ballot; incremented for each recirculation after comment resolution.
    */
    get RecirculationRound(): number {
        return this.Get('RecirculationRound');
    }
    set RecirculationRound(value: number) {
        this.Set('RecirculationRound', value);
    }

    /**
    * * Field Name: PriorElectionID
    * * Display Name: Prior Election ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Elections (vwElections.ID)
    * * Description: For a recirculation: the previous ballot on the same document.
    */
    get PriorElectionID(): string | null {
        return this.Get('PriorElectionID');
    }
    set PriorElectionID(value: string | null) {
        this.Set('PriorElectionID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(255)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: ElectionTypeID
    * * Display Name: Election Type ID
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ElectionTypeID(): string {
        return this.Get('ElectionTypeID');
    }
    set ElectionTypeID(value: string) {
        this.Set('ElectionTypeID', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get Status(): string {
        return this.Get('Status');
    }
    set Status(value: string) {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SecrecyMode
    * * Display Name: Secrecy Mode
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get SecrecyMode(): string {
        return this.Get('SecrecyMode');
    }
    set SecrecyMode(value: string) {
        this.Set('SecrecyMode', value);
    }

    /**
    * * Field Name: AssuranceTier
    * * Display Name: Assurance Tier
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get AssuranceTier(): string {
        return this.Get('AssuranceTier');
    }
    set AssuranceTier(value: string) {
        this.Set('AssuranceTier', value);
    }

    /**
    * * Field Name: EligibilitySourceTypeID
    * * Display Name: Eligibility Source Type ID
    * * SQL Data Type: uniqueidentifier
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get EligibilitySourceTypeID(): string | null {
        return this.Get('EligibilitySourceTypeID');
    }
    set EligibilitySourceTypeID(value: string | null) {
        this.Set('EligibilitySourceTypeID', value);
    }

    /**
    * * Field Name: EligibilitySourceSettings
    * * Display Name: Eligibility Source Settings
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get EligibilitySourceSettings(): string | null {
        return this.Get('EligibilitySourceSettings');
    }
    set EligibilitySourceSettings(value: string | null) {
        this.Set('EligibilitySourceSettings', value);
    }

    /**
    * * Field Name: RecordDate
    * * Display Name: Record Date
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get RecordDate(): Date | null {
        return this.Get('RecordDate');
    }
    set RecordDate(value: Date | null) {
        this.Set('RecordDate', value);
    }

    /**
    * * Field Name: TimeZone
    * * Display Name: Time Zone
    * * SQL Data Type: nvarchar(64)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get TimeZone(): string {
        return this.Get('TimeZone');
    }
    set TimeZone(value: string) {
        this.Set('TimeZone', value);
    }

    /**
    * * Field Name: NominationsOpenAt
    * * Display Name: Nominations Open At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get NominationsOpenAt(): Date | null {
        return this.Get('NominationsOpenAt');
    }
    set NominationsOpenAt(value: Date | null) {
        this.Set('NominationsOpenAt', value);
    }

    /**
    * * Field Name: NominationsCloseAt
    * * Display Name: Nominations Close At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get NominationsCloseAt(): Date | null {
        return this.Get('NominationsCloseAt');
    }
    set NominationsCloseAt(value: Date | null) {
        this.Set('NominationsCloseAt', value);
    }

    /**
    * * Field Name: OpensAt
    * * Display Name: Opens At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get OpensAt(): Date | null {
        return this.Get('OpensAt');
    }
    set OpensAt(value: Date | null) {
        this.Set('OpensAt', value);
    }

    /**
    * * Field Name: ClosesAt
    * * Display Name: Closes At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ClosesAt(): Date | null {
        return this.Get('ClosesAt');
    }
    set ClosesAt(value: Date | null) {
        this.Set('ClosesAt', value);
    }

    /**
    * * Field Name: ProxyDeadline
    * * Display Name: Proxy Deadline
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ProxyDeadline(): Date | null {
        return this.Get('ProxyDeadline');
    }
    set ProxyDeadline(value: Date | null) {
        this.Set('ProxyDeadline', value);
    }

    /**
    * * Field Name: ChallengeWindowEndsAt
    * * Display Name: Challenge Window Ends At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ChallengeWindowEndsAt(): Date | null {
        return this.Get('ChallengeWindowEndsAt');
    }
    set ChallengeWindowEndsAt(value: Date | null) {
        this.Set('ChallengeWindowEndsAt', value);
    }

    /**
    * * Field Name: AllowRevote
    * * Display Name: Allow Revote
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get AllowRevote(): boolean {
        return this.Get('AllowRevote');
    }
    set AllowRevote(value: boolean) {
        this.Set('AllowRevote', value);
    }

    /**
    * * Field Name: ResultsTiming
    * * Display Name: Results Timing
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ResultsTiming(): string {
        return this.Get('ResultsTiming');
    }
    set ResultsTiming(value: string) {
        this.Set('ResultsTiming', value);
    }

    /**
    * * Field Name: ResultsAudience
    * * Display Name: Results Audience
    * * SQL Data Type: nvarchar(20)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ResultsAudience(): string {
        return this.Get('ResultsAudience');
    }
    set ResultsAudience(value: string) {
        this.Set('ResultsAudience', value);
    }

    /**
    * * Field Name: ResultsMinCast
    * * Display Name: Results Min Cast
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ResultsMinCast(): number {
        return this.Get('ResultsMinCast');
    }
    set ResultsMinCast(value: number) {
        this.Set('ResultsMinCast', value);
    }

    /**
    * * Field Name: WeightClassMinSize
    * * Display Name: Weight Class Min Size
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get WeightClassMinSize(): number {
        return this.Get('WeightClassMinSize');
    }
    set WeightClassMinSize(value: number) {
        this.Set('WeightClassMinSize', value);
    }

    /**
    * * Field Name: LiveRefreshEveryBallots
    * * Display Name: Live Refresh Every Ballots
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get LiveRefreshEveryBallots(): number | null {
        return this.Get('LiveRefreshEveryBallots');
    }
    set LiveRefreshEveryBallots(value: number | null) {
        this.Set('LiveRefreshEveryBallots', value);
    }

    /**
    * * Field Name: LiveRefreshMinMinutes
    * * Display Name: Live Refresh Min Minutes
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get LiveRefreshMinMinutes(): number | null {
        return this.Get('LiveRefreshMinMinutes');
    }
    set LiveRefreshMinMinutes(value: number | null) {
        this.Set('LiveRefreshMinMinutes', value);
    }

    /**
    * * Field Name: PublishPollBook
    * * Display Name: Publish Poll Book
    * * SQL Data Type: bit
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get PublishPollBook(): boolean {
        return this.Get('PublishPollBook');
    }
    set PublishPollBook(value: boolean) {
        this.Set('PublishPollBook', value);
    }

    /**
    * * Field Name: RollFrozenAt
    * * Display Name: Roll Frozen At
    * * SQL Data Type: datetimeoffset
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get RollFrozenAt(): Date | null {
        return this.Get('RollFrozenAt');
    }
    set RollFrozenAt(value: Date | null) {
        this.Set('RollFrozenAt', value);
    }

    /**
    * * Field Name: RollHash
    * * Display Name: Roll Hash
    * * SQL Data Type: nvarchar(128)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get RollHash(): string | null {
        return this.Get('RollHash');
    }
    set RollHash(value: string | null) {
        this.Set('RollHash', value);
    }

    /**
    * * Field Name: TrusteeThreshold
    * * Display Name: Trustee Threshold
    * * SQL Data Type: int
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get TrusteeThreshold(): number | null {
        return this.Get('TrusteeThreshold');
    }
    set TrusteeThreshold(value: number | null) {
        this.Set('TrusteeThreshold', value);
    }

    /**
    * * Field Name: ElectionPublicKey
    * * Display Name: Election Public Key
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get ElectionPublicKey(): string | null {
        return this.Get('ElectionPublicKey');
    }
    set ElectionPublicKey(value: string | null) {
        this.Set('ElectionPublicKey', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * IS-A Source: Inherited from MJ_BizApps_Voting: Elections
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: DocumentFile
    * * Display Name: Document File
    * * SQL Data Type: nvarchar(500)
    */
    get DocumentFile(): string | null {
        return this.Get('DocumentFile');
    }

    /**
    * * Field Name: PriorElection
    * * Display Name: Prior Election
    * * SQL Data Type: nvarchar(255)
    */
    get PriorElection(): string | null {
        return this.Get('PriorElection');
    }
}


/**
 * MJ_BizApps_Voting: Tally Methods - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: TallyMethod
 * * Base View: vwTallyMethods
 * * @description A counting rule (Plurality, Majority with threshold, Approval, IRV, STV). A plug-in point: DriverClass names a pure, deterministic BaseTallyMethod implementation registered in voting-entities so the server, tests and previews share one implementation.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Tally Methods')
export class mjBizAppsVotingTallyMethodEntity extends BaseEntity<mjBizAppsVotingTallyMethodEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Tally Methods record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Tally Methods record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingTallyMethodEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the counting rule.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    * * Description: Stable machine code for the method (for example plurality, majority, irv).
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: How the method counts, including the exact variant (an STV row names its rule, such as Meek or Scottish STV, because variants give different results).
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of the BaseTallyMethod implementation.
    */
    get DriverClass(): string {
        return this.Get('DriverClass');
    }
    set DriverClass(value: string) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: IsRanked
    * * Display Name: Is Ranked
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True when voters rank options (IRV, STV); ranked contests show first preferences only until close.
    */
    get IsRanked(): boolean {
        return this.Get('IsRanked');
    }
    set IsRanked(value: boolean) {
        this.Set('IsRanked', value);
    }

    /**
    * * Field Name: SupportsMultipleSeats
    * * Display Name: Supports Multiple Seats
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True when the method can fill more than one seat in a contest.
    */
    get SupportsMultipleSeats(): boolean {
        return this.Get('SupportsMultipleSeats');
    }
    set SupportsMultipleSeats(value: boolean) {
        this.Set('SupportsMultipleSeats', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON of method-specific settings passed to the driver.
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Active methods can be chosen for new contests; Disabled methods cannot.
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Voting: Trustee Key Commitments - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: TrusteeKeyCommitment
 * * Base View: vwTrusteeKeyCommitments
 * * @description Tier B: the public share and commitment a trustee publishes in the key ceremony, used to verify their decryption share at the tally ceremony.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Trustee Key Commitments')
export class mjBizAppsVotingTrusteeKeyCommitmentEntity extends BaseEntity<mjBizAppsVotingTrusteeKeyCommitmentEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Trustee Key Commitments record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Trustee Key Commitments record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingTrusteeKeyCommitmentEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Trustee Key Commitments - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingTrusteeKeyCommitmentEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Trustee Key Commitments, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Trustee Key Commitments, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ElectionTrusteeID
    * * Display Name: Election Trustee
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Election Trustees (vwElectionTrustees.ID)
    * * Description: The trustee.
    */
    get ElectionTrusteeID(): string {
        return this.Get('ElectionTrusteeID');
    }
    set ElectionTrusteeID(value: string) {
        this.Set('ElectionTrusteeID', value);
    }

    /**
    * * Field Name: PublicShare
    * * Display Name: Public Share
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The trustee's public key share.
    */
    get PublicShare(): string {
        return this.Get('PublicShare');
    }
    set PublicShare(value: string) {
        this.Set('PublicShare', value);
    }

    /**
    * * Field Name: Commitment
    * * Display Name: Commitment
    * * SQL Data Type: nvarchar(MAX)
    * * Description: The trustee's commitment (polynomial coefficient commitments) used to verify shares.
    */
    get Commitment(): string {
        return this.Get('Commitment');
    }
    set Commitment(value: string) {
        this.Set('Commitment', value);
    }

    /**
    * * Field Name: CommittedAt
    * * Display Name: Committed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the commitment was recorded.
    */
    get CommittedAt(): Date {
        return this.Get('CommittedAt');
    }
    set CommittedAt(value: Date) {
        this.Set('CommittedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Voting: Voter Credential Methods - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: VoterCredentialMethod
 * * Base View: vwVoterCredentialMethods
 * * @description How a voter proves who they are (Emailed Link, Host Assertion, SSO, MJ Session, Second Factor). A plug-in point: DriverClass names a BaseVoterCredentialMethod implementation that turns a credential into exactly one roll entry.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Voter Credential Methods')
export class mjBizAppsVotingVoterCredentialMethodEntity extends BaseEntity<mjBizAppsVotingVoterCredentialMethodEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Voter Credential Methods record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Voter Credential Methods record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingVoterCredentialMethodEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: nvarchar(100)
    * * Description: Display name of the sign-in method.
    */
    get Name(): string {
        return this.Get('Name');
    }
    set Name(value: string) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Code
    * * Display Name: Code
    * * SQL Data Type: nvarchar(50)
    * * Description: Stable machine code for the method (for example emailed-link, host-assertion, sso, mj-session, second-factor).
    */
    get Code(): string {
        return this.Get('Code');
    }
    set Code(value: string) {
        this.Set('Code', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    * * Description: How the voter proves identity with this method and how the result is matched to the roll.
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: DriverClass
    * * Display Name: Driver Class
    * * SQL Data Type: nvarchar(255)
    * * Description: ClassFactory key of the BaseVoterCredentialMethod implementation.
    */
    get DriverClass(): string {
        return this.Get('DriverClass');
    }
    set DriverClass(value: string) {
        this.Set('DriverClass', value);
    }

    /**
    * * Field Name: IsSecondFactor
    * * Display Name: Is Second Factor
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True when the method is layered on top of another method rather than used alone (roster identifier plus PIN).
    */
    get IsSecondFactor(): boolean {
        return this.Get('IsSecondFactor');
    }
    set IsSecondFactor(value: boolean) {
        this.Set('IsSecondFactor', value);
    }

    /**
    * * Field Name: RequiresIssuance
    * * Display Name: Requires Issuance
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: True when credentials must be issued per voter before voting (emailed links, control numbers, PINs); false when the method relies on an existing login or assertion.
    */
    get RequiresIssuance(): boolean {
        return this.Get('RequiresIssuance');
    }
    set RequiresIssuance(value: boolean) {
        this.Set('RequiresIssuance', value);
    }

    /**
    * * Field Name: Configuration
    * * Display Name: Configuration
    * * SQL Data Type: nvarchar(MAX)
    * * Description: JSON of method-specific settings passed to the driver (for example lockout thresholds).
    */
    get Configuration(): string | null {
        return this.Get('Configuration');
    }
    set Configuration(value: string | null) {
        this.Set('Configuration', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Disabled
    * * Description: Active methods can be offered by ballot distributions; Disabled methods cannot.
    */
    get Status(): 'Active' | 'Disabled' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Disabled') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_Voting: Voter Credentials - strongly typed entity sub-class
 * * Schema: __mj_BizAppsVoting
 * * Base Table: VoterCredential
 * * Base View: vwVoterCredentials
 * * @description A credential issued to a voter for one sign-in method: an emailed link, a paper control number or a second-factor PIN. At most one active (unrevoked) credential per voter and method.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_Voting: Voter Credentials')
export class mjBizAppsVotingVoterCredentialEntity extends BaseEntity<mjBizAppsVotingVoterCredentialEntityType> {
    /**
    * Loads the MJ_BizApps_Voting: Voter Credentials record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_Voting: Voter Credentials record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsVotingVoterCredentialEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * MJ_BizApps_Voting: Voter Credentials - AllowDeleteAPI is set to 0 in the database.  Delete is not allowed, so this method is generated to override the base class method and throw an error. To enable delete for this entity, set AllowDeleteAPI to 1 in the database.
    * @public
    * @method
    * @override
    * @memberof mjBizAppsVotingVoterCredentialEntity
    * @throws {Error} - Delete is not allowed for MJ_BizApps_Voting: Voter Credentials, to enable it set AllowDeleteAPI to 1 in the database.
    */
    public override async Delete(): Promise<boolean> {
        throw new Error('Delete is not allowed for MJ_BizApps_Voting: Voter Credentials, to enable it set AllowDeleteAPI to 1 in the database.');
    }

    /**
    * Validate() method override for MJ_BizApps_Voting: Voter Credentials entity. This is an auto-generated method that invokes the generated validators for this entity for the following fields:
    * * FailedAttempts: The number of failed attempts cannot be negative.
    * @public
    * @method
    * @override
    */
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateFailedAttemptsNonNegative(result);
        result.Success = result.Success && (result.Errors.length === 0);

        return result;
    }

    /**
    * The number of failed attempts cannot be negative.
    * @param result - the ValidationResult object to add any errors or warnings to
    * @public
    * @method
    */
    public ValidateFailedAttemptsNonNegative(result: ValidationResult) {
    	if (this.FailedAttempts != null && this.FailedAttempts < 0) {
    		result.Errors.push(new ValidationErrorInfo(
    			"FailedAttempts",
    			"Failed attempts cannot be negative.",
    			this.FailedAttempts,
    			ValidationErrorType.Failure
    		));
    	}
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: EligibleVoterID
    * * Display Name: Eligible Voter
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Eligible Voters (vwEligibleVoters.ID)
    * * Description: The roll entry the credential belongs to.
    */
    get EligibleVoterID(): string {
        return this.Get('EligibleVoterID');
    }
    set EligibleVoterID(value: string) {
        this.Set('EligibleVoterID', value);
    }

    /**
    * * Field Name: VoterCredentialMethodID
    * * Display Name: Voter Credential Method
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_Voting: Voter Credential Methods (vwVoterCredentialMethods.ID)
    * * Description: The sign-in method the credential is for.
    */
    get VoterCredentialMethodID(): string {
        return this.Get('VoterCredentialMethodID');
    }
    set VoterCredentialMethodID(value: string) {
        this.Set('VoterCredentialMethodID', value);
    }

    /**
    * * Field Name: MagicLinkInviteID
    * * Display Name: Magic Link Invite
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ: Magic Link Invites (vwMagicLinkInvites.ID)
    * * Description: For emailed links: the single-use, election-scoped MJ magic link invite.
    */
    get MagicLinkInviteID(): string | null {
        return this.Get('MagicLinkInviteID');
    }
    set MagicLinkInviteID(value: string | null) {
        this.Set('MagicLinkInviteID', value);
    }

    /**
    * * Field Name: ControlNumberHash
    * * Display Name: Control Number Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: For paper and proxy ballots: hash of the control number printed on the ballot. The number itself is never stored.
    */
    get ControlNumberHash(): string | null {
        return this.Get('ControlNumberHash');
    }
    set ControlNumberHash(value: string | null) {
        this.Set('ControlNumberHash', value);
    }

    /**
    * * Field Name: SecretHash
    * * Display Name: Secret Hash
    * * SQL Data Type: nvarchar(256)
    * * Description: For a second factor: salted hash of the PIN or other secret. The secret itself is never stored.
    */
    get SecretHash(): string | null {
        return this.Get('SecretHash');
    }
    set SecretHash(value: string | null) {
        this.Set('SecretHash', value);
    }

    /**
    * * Field Name: IssuedAt
    * * Display Name: Issued At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: When the credential was issued.
    */
    get IssuedAt(): Date {
        return this.Get('IssuedAt');
    }
    set IssuedAt(value: Date) {
        this.Set('IssuedAt', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When the credential stops working, if earlier than the election close.
    */
    get ExpiresAt(): Date | null {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date | null) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: RedeemedAt
    * * Display Name: Redeemed At
    * * SQL Data Type: datetimeoffset
    * * Description: When the credential was first used to start a voting session.
    */
    get RedeemedAt(): Date | null {
        return this.Get('RedeemedAt');
    }
    set RedeemedAt(value: Date | null) {
        this.Set('RedeemedAt', value);
    }

    /**
    * * Field Name: RevokedAt
    * * Display Name: Revoked At
    * * SQL Data Type: datetimeoffset
    * * Description: When the credential was revoked; a revoked credential never works again.
    */
    get RevokedAt(): Date | null {
        return this.Get('RevokedAt');
    }
    set RevokedAt(value: Date | null) {
        this.Set('RevokedAt', value);
    }

    /**
    * * Field Name: FailedAttempts
    * * Display Name: Failed Attempts
    * * SQL Data Type: int
    * * Default Value: 0
    * * Description: Consecutive failed verification attempts, for durable lockout (held in the database, not process memory).
    */
    get FailedAttempts(): number {
        return this.Get('FailedAttempts');
    }
    set FailedAttempts(value: number) {
        this.Set('FailedAttempts', value);
    }

    /**
    * * Field Name: LockedUntil
    * * Display Name: Locked Until
    * * SQL Data Type: datetimeoffset
    * * Description: The credential is refused until this time after too many failed attempts.
    */
    get LockedUntil(): Date | null {
        return this.Get('LockedUntil');
    }
    set LockedUntil(value: Date | null) {
        this.Set('LockedUntil', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: VoterCredentialMethod
    * * Display Name: Voter Credential Method
    * * SQL Data Type: nvarchar(100)
    */
    get VoterCredentialMethod(): string {
        return this.Get('VoterCredentialMethod');
    }
}
