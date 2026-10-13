/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { mjBizAppsVotingBallotAttributionEntity, mjBizAppsVotingBallotCommentEntity, mjBizAppsVotingBallotDistributionEntity, mjBizAppsVotingBallotSelectionEntity, mjBizAppsVotingCastBallotEntity, mjBizAppsVotingCommentResolutionEntity, mjBizAppsVotingContestOptionResultEntity, mjBizAppsVotingContestOptionEntity, mjBizAppsVotingContestResultEntity, mjBizAppsVotingContestRunningTallyEntity, mjBizAppsVotingContestEntity, mjBizAppsVotingElectionAnchorEntity, mjBizAppsVotingElectionAuditEventEntity, mjBizAppsVotingElectionCertificationEntity, mjBizAppsVotingElectionCertifierEntity, mjBizAppsVotingElectionTrusteeEntity, mjBizAppsVotingElectionTypeEntity, mjBizAppsVotingElectionEntity, mjBizAppsVotingEligibilitySourceTypeEntity, mjBizAppsVotingEligibleVoterEntity, mjBizAppsVotingNominationEndorsementEntity, mjBizAppsVotingNominationEntity, mjBizAppsVotingParticipationEntity, mjBizAppsVotingProxyDesignationEntity, mjBizAppsVotingResultSnapshotEntity, mjBizAppsVotingStandardsBallotElectionEntity, mjBizAppsVotingTallyMethodEntity, mjBizAppsVotingTrusteeKeyCommitmentEntity, mjBizAppsVotingVoterCredentialMethodEntity, mjBizAppsVotingVoterCredentialEntity } from '@mj-biz-apps/voting-entities';
    

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Ballot Attributions
//****************************************************************************
@ObjectType({ description: "Links a ballot to the poll-book entry that cast it, for Open (roll-call) and Confidential elections only. A Secret election never has rows here; the unlinkability suite asserts it." })
export class mjBizAppsVotingBallotAttribution_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The ballot."}) 
    @MaxLength(36)
    CastBallotID?: string;
        
    @Field({nullable: true, description: "The poll-book entry that cast it. A participation can own several ballots over time when revotes supersede earlier ones."}) 
    @MaxLength(36)
    ParticipationID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Ballot Attributions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingBallotAttributionViewResult {
    @Field(() => [mjBizAppsVotingBallotAttribution_])
    Results: mjBizAppsVotingBallotAttribution_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingBallotAttribution_)
export class mjBizAppsVotingBallotAttributionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingBallotAttributionViewResult)
    async RunmjBizAppsVotingBallotAttributionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotAttributionViewResult)
    async RunmjBizAppsVotingBallotAttributionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotAttributionViewResult)
    async RunmjBizAppsVotingBallotAttributionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Ballot Attributions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingBallotAttribution_, { nullable: true })
    async mjBizAppsVotingBallotAttribution(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingBallotAttribution_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Ballot Attributions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwBallotAttributions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Ballot Attributions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Ballot Attributions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Ballot Comments
//****************************************************************************
@ObjectType({ description: "A comment submitted with a standards-ballot vote (required with every Disapprove). Linked to the voter's Open-mode participation, since standards ballots are roll-call." })
export class mjBizAppsVotingBallotComment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The standards item commented on."}) 
    @MaxLength(36)
    ContestID?: string;
        
    @Field({nullable: true, description: "The voter's poll-book entry (standards ballots are Open mode)."}) 
    @MaxLength(36)
    ParticipationID?: string;
        
    @Field(() => Int, {nullable: true, description: "Order of the voter's comments on the item."}) 
    Sequence?: number;
        
    @Field({nullable: true, description: "General, Technical or Editorial."}) 
    @MaxLength(20)
    CommentType?: string;
        
    @Field({nullable: true, description: "Where in the document the comment applies (clause, section, line)."}) 
    @MaxLength(255)
    DocumentReference?: string;
        
    @Field({nullable: true, description: "The comment."}) 
    Comment?: string;
        
    @Field({nullable: true, description: "The change the commenter proposes."}) 
    ProposedChange?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Contest?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Ballot Comments
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingBallotCommentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    ParticipationID?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    CommentType?: string;

    @Field({ nullable: true })
    DocumentReference: string | null;

    @Field({ nullable: true })
    Comment?: string;

    @Field({ nullable: true })
    ProposedChange: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Ballot Comments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingBallotCommentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    ParticipationID?: string;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    CommentType?: string;

    @Field({ nullable: true })
    DocumentReference?: string | null;

    @Field({ nullable: true })
    Comment?: string;

    @Field({ nullable: true })
    ProposedChange?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Ballot Comments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingBallotCommentViewResult {
    @Field(() => [mjBizAppsVotingBallotComment_])
    Results: mjBizAppsVotingBallotComment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingBallotComment_)
export class mjBizAppsVotingBallotCommentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingBallotCommentViewResult)
    async RunmjBizAppsVotingBallotCommentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotCommentViewResult)
    async RunmjBizAppsVotingBallotCommentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotCommentViewResult)
    async RunmjBizAppsVotingBallotCommentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Ballot Comments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingBallotComment_, { nullable: true })
    async mjBizAppsVotingBallotComment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingBallotComment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Ballot Comments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwBallotComments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Ballot Comments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Ballot Comments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingBallotComment_)
    async CreatemjBizAppsVotingBallotComment(
        @Arg('input', () => CreatemjBizAppsVotingBallotCommentInput) input: CreatemjBizAppsVotingBallotCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Ballot Comments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingBallotComment_)
    async UpdatemjBizAppsVotingBallotComment(
        @Arg('input', () => UpdatemjBizAppsVotingBallotCommentInput) input: UpdatemjBizAppsVotingBallotCommentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Ballot Comments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingBallotComment_)
    async DeletemjBizAppsVotingBallotComment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Ballot Comments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Ballot Distributions
//****************************************************************************
@ObjectType({ description: "One place a ballot is embedded: a slug, the origins allowed to host it, the sign-in methods it offers and, for host assertions, the host's registered public key. Served by the public ballot edge at /vote/:slug." })
export class mjBizAppsVotingBallotDistribution_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election whose ballot this distribution serves."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "Administrator-facing name (for example 'Member portal' or 'Emailed link landing page')."}) 
    @MaxLength(255)
    Name?: string;
        
    @Field({nullable: true, description: "URL slug used by /vote/:slug and the <mj-ballot slug> attribute. Unique across all elections."}) 
    @MaxLength(100)
    Slug?: string;
        
    @Field({nullable: true, description: "Public identifier used as the audience (aud) of host assertions for this distribution."}) 
    @MaxLength(100)
    DistributionKey?: string;
        
    @Field({nullable: true, description: "Draft, Active (serving), Paused (temporarily refusing sessions) or Retired."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true, description: "JSON array of origins allowed to embed the ballot (custom element and iframe frame-ancestors)."}) 
    AllowedOrigins?: string;
        
    @Field({nullable: true, description: "JSON array of VoterCredentialMethod codes this distribution accepts."}) 
    AllowedCredentialMethods?: string;
        
    @Field({nullable: true, description: "PEM public key, registered by an administrator, that host assertions for this distribution must be signed with. Never taken from a request."}) 
    HostPublicKey?: string;
        
    @Field({nullable: true, description: "JSON theme tokens applied to the ballot widget."}) 
    Theme?: string;
        
    @Field({nullable: true, description: "Language the ballot opens in when the voter has not chosen one."}) 
    @MaxLength(20)
    DefaultLanguage?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Ballot Distributions
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingBallotDistributionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Slug?: string;

    @Field({ nullable: true })
    DistributionKey?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    AllowedOrigins: string | null;

    @Field({ nullable: true })
    AllowedCredentialMethods: string | null;

    @Field({ nullable: true })
    HostPublicKey: string | null;

    @Field({ nullable: true })
    Theme: string | null;

    @Field({ nullable: true })
    DefaultLanguage?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Ballot Distributions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingBallotDistributionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Slug?: string;

    @Field({ nullable: true })
    DistributionKey?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    AllowedOrigins?: string | null;

    @Field({ nullable: true })
    AllowedCredentialMethods?: string | null;

    @Field({ nullable: true })
    HostPublicKey?: string | null;

    @Field({ nullable: true })
    Theme?: string | null;

    @Field({ nullable: true })
    DefaultLanguage?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Ballot Distributions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingBallotDistributionViewResult {
    @Field(() => [mjBizAppsVotingBallotDistribution_])
    Results: mjBizAppsVotingBallotDistribution_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingBallotDistribution_)
export class mjBizAppsVotingBallotDistributionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingBallotDistributionViewResult)
    async RunmjBizAppsVotingBallotDistributionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotDistributionViewResult)
    async RunmjBizAppsVotingBallotDistributionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotDistributionViewResult)
    async RunmjBizAppsVotingBallotDistributionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Ballot Distributions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingBallotDistribution_, { nullable: true })
    async mjBizAppsVotingBallotDistribution(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingBallotDistribution_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Ballot Distributions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwBallotDistributions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Ballot Distributions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Ballot Distributions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingBallotDistribution_)
    async CreatemjBizAppsVotingBallotDistribution(
        @Arg('input', () => CreatemjBizAppsVotingBallotDistributionInput) input: CreatemjBizAppsVotingBallotDistributionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Ballot Distributions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingBallotDistribution_)
    async UpdatemjBizAppsVotingBallotDistribution(
        @Arg('input', () => UpdatemjBizAppsVotingBallotDistributionInput) input: UpdatemjBizAppsVotingBallotDistributionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Ballot Distributions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingBallotDistribution_)
    async DeletemjBizAppsVotingBallotDistribution(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Ballot Distributions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Ballot Selections
//****************************************************************************
@ObjectType({ description: "One decrypted selection from a counted ballot, materialized by the tally engine only after close (tier A) or after the trustee ceremony (tier B), in shuffled order, for a reproducible tally and recount export. Never written while voting is open." })
export class mjBizAppsVotingBallotSelection_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The ballot the selection came from."}) 
    @MaxLength(36)
    CastBallotID?: string;
        
    @Field({nullable: true, description: "The contest."}) 
    @MaxLength(36)
    ContestID?: string;
        
    @Field({nullable: true, description: "The option selected (the write-in placeholder option for a write-in). NULL for an abstention."}) 
    @MaxLength(36)
    ContestOptionID?: string;
        
    @Field(() => Int, {nullable: true, description: "For ranked contests: the preference order (1 = first choice)."}) 
    Rank?: number;
        
    @Field({nullable: true, description: "For a write-in: the text written. Field-encrypted at rest."}) 
    WriteInText?: string;
        
    @Field(() => Boolean, {nullable: true, description: "True for an explicit abstention."}) 
    IsAbstain?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Contest?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Ballot Selections
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingBallotSelectionViewResult {
    @Field(() => [mjBizAppsVotingBallotSelection_])
    Results: mjBizAppsVotingBallotSelection_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingBallotSelection_)
export class mjBizAppsVotingBallotSelectionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingBallotSelectionViewResult)
    async RunmjBizAppsVotingBallotSelectionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotSelectionViewResult)
    async RunmjBizAppsVotingBallotSelectionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingBallotSelectionViewResult)
    async RunmjBizAppsVotingBallotSelectionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Ballot Selections';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingBallotSelection_, { nullable: true })
    async mjBizAppsVotingBallotSelection(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingBallotSelection_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Ballot Selections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwBallotSelections')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Ballot Selections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Ballot Selections', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Cast Ballots
//****************************************************************************
@ObjectType({ description: "The ballot box: what was voted, with no reference to the voter. Random (non-sequential) keys, no timestamps, no record-change history, not exposed through the generic API, written by the system user, readable only by the tally engine after close. Selections are field-encrypted at rest (tier A) or encrypted under the election key (tiers B and C)." })
export class mjBizAppsVotingCastBallot_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election. The only reference on a ballot."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "Hash of the ballot style the voter was shown, so the tally can verify every ballot was cast against the published style."}) 
    @MaxLength(128)
    BallotStyleHash?: string;
        
    @Field({nullable: true, description: "Code returned to the voter to confirm the ballot was recorded (tier B: hash of the ciphertext, published after close)."}) 
    @MaxLength(64)
    ReceiptCode?: string;
        
    @Field({nullable: true, description: "The voter's selections as JSON: field-encrypted with MJ Encryption at tier A, ciphertext under the election public key at tiers B and C."}) 
    Selections?: string;
        
    @Field({nullable: true, description: "The voter's voting class, needed to count class-limited contests. Reported only for classes of at least the election's minimum size."}) 
    @MaxLength(100)
    VotingClass?: string;
        
    @Field({nullable: true, description: "The weight class (bucket) the voter's weight falls in; the exact weight is never stored on the ballot."}) 
    @MaxLength(50)
    WeightClass?: string;
        
    @Field({nullable: true, description: "Counted, Superseded (replaced by a revote, Open and Confidential elections only) or Spoiled (voided by an audited decision)."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Cast Ballots
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingCastBallotViewResult {
    @Field(() => [mjBizAppsVotingCastBallot_])
    Results: mjBizAppsVotingCastBallot_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingCastBallot_)
export class mjBizAppsVotingCastBallotResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingCastBallotViewResult)
    async RunmjBizAppsVotingCastBallotViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingCastBallotViewResult)
    async RunmjBizAppsVotingCastBallotViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingCastBallotViewResult)
    async RunmjBizAppsVotingCastBallotDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Cast Ballots';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingCastBallot_, { nullable: true })
    async mjBizAppsVotingCastBallot(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingCastBallot_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Cast Ballots', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwCastBallots')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Cast Ballots', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Cast Ballots', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Comment Resolutions
//****************************************************************************
@ObjectType({ description: "The ballot resolution committee's disposition of a standards-ballot comment, and the commenter's response to it." })
export class mjBizAppsVotingCommentResolution_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The comment resolved."}) 
    @MaxLength(36)
    BallotCommentID?: string;
        
    @Field({nullable: true, description: "Accepted, AcceptedInPrinciple, Rejected, Withdrawn or Deferred."}) 
    @MaxLength(30)
    Disposition?: string;
        
    @Field({nullable: true, description: "The committee's response and the change made, if any."}) 
    Response?: string;
        
    @Field({nullable: true, description: "Who recorded the disposition."}) 
    @MaxLength(36)
    ResolvedByUserID?: string;
        
    @Field({nullable: true, description: "When it was recorded."}) 
    ResolvedAt?: Date;
        
    @Field({nullable: true, description: "Whether the commenter is Satisfied or Unsatisfied with the resolution (drives recirculation)."}) 
    @MaxLength(20)
    CommenterResponse?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ResolvedByUser?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Comment Resolutions
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingCommentResolutionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    BallotCommentID?: string;

    @Field({ nullable: true })
    Disposition?: string;

    @Field({ nullable: true })
    Response: string | null;

    @Field({ nullable: true })
    ResolvedByUserID: string | null;

    @Field({ nullable: true })
    ResolvedAt?: Date;

    @Field({ nullable: true })
    CommenterResponse: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Comment Resolutions
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingCommentResolutionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    BallotCommentID?: string;

    @Field({ nullable: true })
    Disposition?: string;

    @Field({ nullable: true })
    Response?: string | null;

    @Field({ nullable: true })
    ResolvedByUserID?: string | null;

    @Field({ nullable: true })
    ResolvedAt?: Date;

    @Field({ nullable: true })
    CommenterResponse?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Comment Resolutions
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingCommentResolutionViewResult {
    @Field(() => [mjBizAppsVotingCommentResolution_])
    Results: mjBizAppsVotingCommentResolution_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingCommentResolution_)
export class mjBizAppsVotingCommentResolutionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingCommentResolutionViewResult)
    async RunmjBizAppsVotingCommentResolutionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingCommentResolutionViewResult)
    async RunmjBizAppsVotingCommentResolutionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingCommentResolutionViewResult)
    async RunmjBizAppsVotingCommentResolutionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Comment Resolutions';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingCommentResolution_, { nullable: true })
    async mjBizAppsVotingCommentResolution(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingCommentResolution_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Comment Resolutions', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwCommentResolutions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Comment Resolutions', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Comment Resolutions', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingCommentResolution_)
    async CreatemjBizAppsVotingCommentResolution(
        @Arg('input', () => CreatemjBizAppsVotingCommentResolutionInput) input: CreatemjBizAppsVotingCommentResolutionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Comment Resolutions', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingCommentResolution_)
    async UpdatemjBizAppsVotingCommentResolution(
        @Arg('input', () => UpdatemjBizAppsVotingCommentResolutionInput) input: UpdatemjBizAppsVotingCommentResolutionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Comment Resolutions', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingCommentResolution_)
    async DeletemjBizAppsVotingCommentResolution(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Comment Resolutions', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Contest Option Results
//****************************************************************************
@ObjectType({ description: "The result for one option in a contest result: its votes, its position and whether it won." })
export class mjBizAppsVotingContestOptionResult_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The contest result."}) 
    @MaxLength(36)
    ContestResultID?: string;
        
    @Field({nullable: true, description: "The option."}) 
    @MaxLength(36)
    ContestOptionID?: string;
        
    @Field(() => Float, {nullable: true, description: "Weighted votes for the option (final round for ranked methods)."}) 
    Votes?: number;
        
    @Field(() => Int, {nullable: true, description: "Finishing position (1 = most votes or first elected)."}) 
    Position?: number;
        
    @Field({nullable: true, description: "Elected, Defeated, Excluded (eliminated in a ranked count), Tied, or Counted (motion and question options, where the outcome is on the contest)."}) 
    @MaxLength(20)
    Outcome?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contest Option Results
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingContestOptionResultInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContestResultID?: string;

    @Field({ nullable: true })
    ContestOptionID?: string;

    @Field(() => Float, { nullable: true })
    Votes?: number;

    @Field(() => Int, { nullable: true })
    Position: number | null;

    @Field({ nullable: true })
    Outcome?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contest Option Results
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingContestOptionResultInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContestResultID?: string;

    @Field({ nullable: true })
    ContestOptionID?: string;

    @Field(() => Float, { nullable: true })
    Votes?: number;

    @Field(() => Int, { nullable: true })
    Position?: number | null;

    @Field({ nullable: true })
    Outcome?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Contest Option Results
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingContestOptionResultViewResult {
    @Field(() => [mjBizAppsVotingContestOptionResult_])
    Results: mjBizAppsVotingContestOptionResult_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingContestOptionResult_)
export class mjBizAppsVotingContestOptionResultResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingContestOptionResultViewResult)
    async RunmjBizAppsVotingContestOptionResultViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestOptionResultViewResult)
    async RunmjBizAppsVotingContestOptionResultViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestOptionResultViewResult)
    async RunmjBizAppsVotingContestOptionResultDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Contest Option Results';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingContestOptionResult_, { nullable: true })
    async mjBizAppsVotingContestOptionResult(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingContestOptionResult_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Contest Option Results', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwContestOptionResults')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Contest Option Results', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Contest Option Results', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingContestOptionResult_)
    async CreatemjBizAppsVotingContestOptionResult(
        @Arg('input', () => CreatemjBizAppsVotingContestOptionResultInput) input: CreatemjBizAppsVotingContestOptionResultInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Contest Option Results', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingContestOptionResult_)
    async UpdatemjBizAppsVotingContestOptionResult(
        @Arg('input', () => UpdatemjBizAppsVotingContestOptionResultInput) input: UpdatemjBizAppsVotingContestOptionResultInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Contest Option Results', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingContestOptionResult_)
    async DeletemjBizAppsVotingContestOptionResult(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Contest Option Results', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Contest Options
//****************************************************************************
@ObjectType({ description: "A choice in a contest: a candidate, Yes or No on a motion, Approve or Disapprove on a standards item, or a write-in placeholder." })
export class mjBizAppsVotingContestOption_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The contest this option belongs to."}) 
    @MaxLength(36)
    ContestID?: string;
        
    @Field({nullable: true, description: "The option as shown on the ballot (candidate name, Yes, No, Approve)."}) 
    @MaxLength(500)
    Label?: string;
        
    @Field({nullable: true, description: "Short text shown with the option."}) 
    Description?: string;
        
    @Field({nullable: true, description: "The candidate, when the option is a person."}) 
    @MaxLength(36)
    CandidatePersonID?: string;
        
    @Field({nullable: true, description: "The candidate's statement document."}) 
    @MaxLength(36)
    StatementFileID?: string;
        
    @Field({nullable: true, description: "The candidate's photo."}) 
    @MaxLength(36)
    PhotoFileID?: string;
        
    @Field(() => Int, {nullable: true, description: "Position of the option within the contest (rotation, if any, is applied when the ballot style is built)."}) 
    Sequence?: number;
        
    @Field(() => Boolean, {nullable: true, description: "True for the write-in placeholder option; the written text is captured with the selection."}) 
    IsWriteIn?: boolean;
        
    @Field({nullable: true, description: "Active options appear on the ballot; Withdrawn options stay for the record but are not offered."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Contest?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    CandidatePerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    StatementFile?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    PhotoFile?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contest Options
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingContestOptionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    CandidatePersonID: string | null;

    @Field({ nullable: true })
    StatementFileID: string | null;

    @Field({ nullable: true })
    PhotoFileID: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsWriteIn?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contest Options
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingContestOptionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    Label?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    CandidatePersonID?: string | null;

    @Field({ nullable: true })
    StatementFileID?: string | null;

    @Field({ nullable: true })
    PhotoFileID?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => Boolean, { nullable: true })
    IsWriteIn?: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Contest Options
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingContestOptionViewResult {
    @Field(() => [mjBizAppsVotingContestOption_])
    Results: mjBizAppsVotingContestOption_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingContestOption_)
export class mjBizAppsVotingContestOptionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingContestOptionViewResult)
    async RunmjBizAppsVotingContestOptionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestOptionViewResult)
    async RunmjBizAppsVotingContestOptionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestOptionViewResult)
    async RunmjBizAppsVotingContestOptionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Contest Options';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingContestOption_, { nullable: true })
    async mjBizAppsVotingContestOption(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingContestOption_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Contest Options', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwContestOptions')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Contest Options', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Contest Options', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingContestOption_)
    async CreatemjBizAppsVotingContestOption(
        @Arg('input', () => CreatemjBizAppsVotingContestOptionInput) input: CreatemjBizAppsVotingContestOptionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Contest Options', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingContestOption_)
    async UpdatemjBizAppsVotingContestOption(
        @Arg('input', () => UpdatemjBizAppsVotingContestOptionInput) input: UpdatemjBizAppsVotingContestOptionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Contest Options', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingContestOption_)
    async DeletemjBizAppsVotingContestOption(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Contest Options', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Contest Results
//****************************************************************************
@ObjectType({ description: "The outcome of one contest, written only by the tally engine after close: totals, the outcome, the round-by-round record for ranked methods and the tie-break seed, so the count can be reproduced." })
export class mjBizAppsVotingContestResult_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The contest."}) 
    @MaxLength(36)
    ContestID?: string;
        
    @Field({nullable: true, description: "Passed or Failed (motions, questions, amendments), Decided (seats filled), Tied (awaiting an administrator tie-break), NoQuorum or Void."}) 
    @MaxLength(20)
    Outcome?: string;
        
    @Field(() => Int, {nullable: true, description: "Ballots counted in this contest."}) 
    BallotsCounted?: number;
        
    @Field(() => Float, {nullable: true, description: "Weighted abstentions (count toward participation and quorum, never toward the threshold numerator)."}) 
    Abstentions?: number;
        
    @Field(() => Int, {nullable: true, description: "Eligible voters for this contest at the time of the tally (the denominator for an Eligible threshold basis)."}) 
    EligibleCount?: number;
        
    @Field(() => Float, {nullable: true, description: "Weighted votes cast, excluding abstentions."}) 
    VotesCast?: number;
        
    @Field({nullable: true, description: "JSON round-by-round record for ranked methods (IRV/STV transfers and exclusions)."}) 
    Rounds?: string;
        
    @Field({nullable: true, description: "The recorded seed used for a tie broken by lot, so the result can be reproduced."}) 
    @MaxLength(128)
    TieBreakSeed?: string;
        
    @Field({nullable: true, description: "How a tie was broken when decided by an administrator."}) 
    TieBreakNotes?: string;
        
    @Field({nullable: true, description: "When the tally was computed."}) 
    ComputedAt?: Date;
        
    @Field(() => Boolean, {nullable: true, description: "True for the tally of record; earlier recomputations stay for audit with IsFinal false."}) 
    IsFinal?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Contest?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contest Results
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingContestResultInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    Outcome?: string;

    @Field(() => Int, { nullable: true })
    BallotsCounted?: number;

    @Field(() => Float, { nullable: true })
    Abstentions?: number;

    @Field(() => Int, { nullable: true })
    EligibleCount?: number;

    @Field(() => Float, { nullable: true })
    VotesCast?: number;

    @Field({ nullable: true })
    Rounds: string | null;

    @Field({ nullable: true })
    TieBreakSeed: string | null;

    @Field({ nullable: true })
    TieBreakNotes: string | null;

    @Field({ nullable: true })
    ComputedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsFinal?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contest Results
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingContestResultInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    Outcome?: string;

    @Field(() => Int, { nullable: true })
    BallotsCounted?: number;

    @Field(() => Float, { nullable: true })
    Abstentions?: number;

    @Field(() => Int, { nullable: true })
    EligibleCount?: number;

    @Field(() => Float, { nullable: true })
    VotesCast?: number;

    @Field({ nullable: true })
    Rounds?: string | null;

    @Field({ nullable: true })
    TieBreakSeed?: string | null;

    @Field({ nullable: true })
    TieBreakNotes?: string | null;

    @Field({ nullable: true })
    ComputedAt?: Date;

    @Field(() => Boolean, { nullable: true })
    IsFinal?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Contest Results
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingContestResultViewResult {
    @Field(() => [mjBizAppsVotingContestResult_])
    Results: mjBizAppsVotingContestResult_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingContestResult_)
export class mjBizAppsVotingContestResultResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingContestResultViewResult)
    async RunmjBizAppsVotingContestResultViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestResultViewResult)
    async RunmjBizAppsVotingContestResultViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestResultViewResult)
    async RunmjBizAppsVotingContestResultDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Contest Results';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingContestResult_, { nullable: true })
    async mjBizAppsVotingContestResult(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingContestResult_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Contest Results', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwContestResults')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Contest Results', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Contest Results', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingContestResult_)
    async CreatemjBizAppsVotingContestResult(
        @Arg('input', () => CreatemjBizAppsVotingContestResultInput) input: CreatemjBizAppsVotingContestResultInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Contest Results', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingContestResult_)
    async UpdatemjBizAppsVotingContestResult(
        @Arg('input', () => UpdatemjBizAppsVotingContestResultInput) input: UpdatemjBizAppsVotingContestResultInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Contest Results', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingContestResult_)
    async DeletemjBizAppsVotingContestResult(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Contest Results', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Contest Running Tallies
//****************************************************************************
@ObjectType({ description: "Running count per option while voting is open, kept only when the election shows results before close (tier A). Incremented in the cast transaction; first preferences only for ranked contests. Never served directly: results are published through batched snapshots." })
export class mjBizAppsVotingContestRunningTally_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The contest."}) 
    @MaxLength(36)
    ContestID?: string;
        
    @Field({nullable: true, description: "The option counted; NULL is the row counting abstentions."}) 
    @MaxLength(36)
    ContestOptionID?: string;
        
    @Field(() => Float, {nullable: true, description: "Weighted votes so far (first preferences for ranked contests)."}) 
    VoteCount?: number;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Contest?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Contest Running Tallies
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingContestRunningTallyViewResult {
    @Field(() => [mjBizAppsVotingContestRunningTally_])
    Results: mjBizAppsVotingContestRunningTally_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingContestRunningTally_)
export class mjBizAppsVotingContestRunningTallyResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingContestRunningTallyViewResult)
    async RunmjBizAppsVotingContestRunningTallyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestRunningTallyViewResult)
    async RunmjBizAppsVotingContestRunningTallyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestRunningTallyViewResult)
    async RunmjBizAppsVotingContestRunningTallyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Contest Running Tallies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingContestRunningTally_, { nullable: true })
    async mjBizAppsVotingContestRunningTally(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingContestRunningTally_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Contest Running Tallies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwContestRunningTallies')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Contest Running Tallies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Contest Running Tallies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Contests
//****************************************************************************
@ObjectType({ description: "One item on the ballot: a motion, an office, a question, an amendment or a standards item, with the counting rule and selection limits that apply to it." })
export class mjBizAppsVotingContest_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election this contest is on."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "The contest as shown on the ballot (the motion text, the office title or the question)."}) 
    @MaxLength(500)
    Name?: string;
        
    @Field({nullable: true, description: "Supporting text shown with the contest (full motion text, the amendment, the question's explanation)."}) 
    Description?: string;
        
    @Field(() => Int, {nullable: true, description: "Position of the contest on the ballot."}) 
    Sequence?: number;
        
    @Field({nullable: true, description: "Motion, Office, Question, Amendment or StandardsItem."}) 
    @MaxLength(20)
    Kind?: string;
        
    @Field(() => Int, {nullable: true, description: "Number of options that can win (seats to fill). 1 for motions and single-seat offices."}) 
    Seats?: number;
        
    @Field({nullable: true, description: "The counting rule for this contest."}) 
    @MaxLength(36)
    TallyMethodID?: string;
        
    @Field({nullable: true, description: "Share required to pass or win: None (most votes), Majority, ThreeFifths, TwoThirds, ThreeQuarters, Unanimous or Custom."}) 
    @MaxLength(20)
    Threshold?: string;
        
    @Field(() => Float, {nullable: true, description: "The required share as a fraction between 0 and 1 when Threshold is Custom; NULL otherwise."}) 
    CustomThreshold?: number;
        
    @Field({nullable: true, description: "Whether the threshold is measured against votes cast (abstentions excluded) or against all eligible voters."}) 
    @MaxLength(20)
    ThresholdBasis?: string;
        
    @Field(() => Boolean, {nullable: true, description: "True when the ballot offers an explicit abstention. Abstentions count toward participation and quorum, never toward the threshold numerator."}) 
    AllowAbstain?: boolean;
        
    @Field(() => Boolean, {nullable: true, description: "True when voters may write in an option."}) 
    AllowWriteIn?: boolean;
        
    @Field(() => Int, {nullable: true, description: "Fewest options a voter must select (0 allows a blank contest)."}) 
    MinSelections?: number;
        
    @Field(() => Int, {nullable: true, description: "Most options a voter may select or rank. NULL means the number of seats (or every option for approval and ranked methods)."}) 
    MaxSelections?: number;
        
    @Field({nullable: true, description: "When set, only voters in this voting class see and vote in the contest (for example seats elected by one class of member)."}) 
    @MaxLength(100)
    VotingClassFilter?: string;
        
    @Field({nullable: true, description: "Lot (deterministic draw from a recorded seed) or Administrator (decided and recorded by an administrator)."}) 
    @MaxLength(20)
    TieBreakMethod?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    TallyMethod?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contests
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingContestInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Kind?: string;

    @Field(() => Int, { nullable: true })
    Seats?: number;

    @Field({ nullable: true })
    TallyMethodID?: string;

    @Field({ nullable: true })
    Threshold?: string;

    @Field(() => Float, { nullable: true })
    CustomThreshold: number | null;

    @Field({ nullable: true })
    ThresholdBasis?: string;

    @Field(() => Boolean, { nullable: true })
    AllowAbstain?: boolean;

    @Field(() => Boolean, { nullable: true })
    AllowWriteIn?: boolean;

    @Field(() => Int, { nullable: true })
    MinSelections?: number;

    @Field(() => Int, { nullable: true })
    MaxSelections: number | null;

    @Field({ nullable: true })
    VotingClassFilter: string | null;

    @Field({ nullable: true })
    TieBreakMethod?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Contests
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingContestInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field({ nullable: true })
    Kind?: string;

    @Field(() => Int, { nullable: true })
    Seats?: number;

    @Field({ nullable: true })
    TallyMethodID?: string;

    @Field({ nullable: true })
    Threshold?: string;

    @Field(() => Float, { nullable: true })
    CustomThreshold?: number | null;

    @Field({ nullable: true })
    ThresholdBasis?: string;

    @Field(() => Boolean, { nullable: true })
    AllowAbstain?: boolean;

    @Field(() => Boolean, { nullable: true })
    AllowWriteIn?: boolean;

    @Field(() => Int, { nullable: true })
    MinSelections?: number;

    @Field(() => Int, { nullable: true })
    MaxSelections?: number | null;

    @Field({ nullable: true })
    VotingClassFilter?: string | null;

    @Field({ nullable: true })
    TieBreakMethod?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Contests
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingContestViewResult {
    @Field(() => [mjBizAppsVotingContest_])
    Results: mjBizAppsVotingContest_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingContest_)
export class mjBizAppsVotingContestResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingContestViewResult)
    async RunmjBizAppsVotingContestViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestViewResult)
    async RunmjBizAppsVotingContestViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingContestViewResult)
    async RunmjBizAppsVotingContestDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Contests';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingContest_, { nullable: true })
    async mjBizAppsVotingContest(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingContest_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Contests', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwContests')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Contests', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Contests', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingContest_)
    async CreatemjBizAppsVotingContest(
        @Arg('input', () => CreatemjBizAppsVotingContestInput) input: CreatemjBizAppsVotingContestInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Contests', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingContest_)
    async UpdatemjBizAppsVotingContest(
        @Arg('input', () => UpdatemjBizAppsVotingContestInput) input: UpdatemjBizAppsVotingContestInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Contests', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingContest_)
    async DeletemjBizAppsVotingContest(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Contests', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Election Anchors
//****************************************************************************
@ObjectType({ description: "A record an election belongs to: a committee motion and its meeting, a Collaboration space, a standards project. Polymorphic EntityID + RecordID so Voting never foreign-keys a host app." })
export class mjBizAppsVotingElectionAnchor_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "The MJ entity of the anchored record."}) 
    @MaxLength(36)
    EntityID?: string;
        
    @Field({nullable: true, description: "Primary key value of the anchored record (concatenated key format for composite keys)."}) 
    @MaxLength(450)
    RecordID?: string;
        
    @Field({nullable: true, description: "How the record relates to the election (for example Subject, Meeting, Space, Project)."}) 
    @MaxLength(50)
    Role?: string;
        
    @Field(() => Boolean, {nullable: true, description: "True for the one anchor that represents the election's home; at most one per election."}) 
    IsPrimary?: boolean;
        
    @Field(() => Int, {nullable: true, description: "Display order of the anchors."}) 
    Sequence?: number;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Entity?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Anchors
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionAnchorInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    Role?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Anchors
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionAnchorInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    EntityID?: string;

    @Field({ nullable: true })
    RecordID?: string;

    @Field({ nullable: true })
    Role?: string;

    @Field(() => Boolean, { nullable: true })
    IsPrimary?: boolean;

    @Field(() => Int, { nullable: true })
    Sequence?: number;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Election Anchors
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionAnchorViewResult {
    @Field(() => [mjBizAppsVotingElectionAnchor_])
    Results: mjBizAppsVotingElectionAnchor_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElectionAnchor_)
export class mjBizAppsVotingElectionAnchorResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionAnchorViewResult)
    async RunmjBizAppsVotingElectionAnchorViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionAnchorViewResult)
    async RunmjBizAppsVotingElectionAnchorViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionAnchorViewResult)
    async RunmjBizAppsVotingElectionAnchorDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Election Anchors';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElectionAnchor_, { nullable: true })
    async mjBizAppsVotingElectionAnchor(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElectionAnchor_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Election Anchors', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElectionAnchors')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Election Anchors', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Election Anchors', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElectionAnchor_)
    async CreatemjBizAppsVotingElectionAnchor(
        @Arg('input', () => CreatemjBizAppsVotingElectionAnchorInput) input: CreatemjBizAppsVotingElectionAnchorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Election Anchors', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElectionAnchor_)
    async UpdatemjBizAppsVotingElectionAnchor(
        @Arg('input', () => UpdatemjBizAppsVotingElectionAnchorInput) input: UpdatemjBizAppsVotingElectionAnchorInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Election Anchors', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElectionAnchor_)
    async DeletemjBizAppsVotingElectionAnchor(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Election Anchors', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Election Audit Events
//****************************************************************************
@ObjectType({ description: "Append-only audit log of an election: lifecycle changes, roll amendments and challenges, credential issuance, results views by administrators, tally and certification. Never contains ballot content." })
export class mjBizAppsVotingElectionAuditEvent_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "What happened (for example StatusChanged, RollFrozen, RollAmended, VoterChallenged, CredentialsIssued, ResultsViewed, Tallied, Certified)."}) 
    @MaxLength(100)
    EventType?: string;
        
    @Field({nullable: true, description: "The user who acted; NULL for scheduled and system actions."}) 
    @MaxLength(36)
    ActorUserID?: string;
        
    @Field({nullable: true, description: "When it happened."}) 
    OccurredAt?: Date;
        
    @Field({nullable: true, description: "JSON detail of the event. Never ballot content, never a voter's choice."}) 
    Details?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ActorUser?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Audit Events
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionAuditEventInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    EventType?: string;

    @Field({ nullable: true })
    ActorUserID: string | null;

    @Field({ nullable: true })
    OccurredAt?: Date;

    @Field({ nullable: true })
    Details: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Audit Events
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionAuditEventInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    EventType?: string;

    @Field({ nullable: true })
    ActorUserID?: string | null;

    @Field({ nullable: true })
    OccurredAt?: Date;

    @Field({ nullable: true })
    Details?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Election Audit Events
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionAuditEventViewResult {
    @Field(() => [mjBizAppsVotingElectionAuditEvent_])
    Results: mjBizAppsVotingElectionAuditEvent_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElectionAuditEvent_)
export class mjBizAppsVotingElectionAuditEventResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionAuditEventViewResult)
    async RunmjBizAppsVotingElectionAuditEventViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionAuditEventViewResult)
    async RunmjBizAppsVotingElectionAuditEventViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionAuditEventViewResult)
    async RunmjBizAppsVotingElectionAuditEventDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Election Audit Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElectionAuditEvent_, { nullable: true })
    async mjBizAppsVotingElectionAuditEvent(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElectionAuditEvent_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Election Audit Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElectionAuditEvents')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Election Audit Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Election Audit Events', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElectionAuditEvent_)
    async CreatemjBizAppsVotingElectionAuditEvent(
        @Arg('input', () => CreatemjBizAppsVotingElectionAuditEventInput) input: CreatemjBizAppsVotingElectionAuditEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Election Audit Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElectionAuditEvent_)
    async UpdatemjBizAppsVotingElectionAuditEvent(
        @Arg('input', () => UpdatemjBizAppsVotingElectionAuditEventInput) input: UpdatemjBizAppsVotingElectionAuditEventInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Election Audit Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElectionAuditEvent_)
    async DeletemjBizAppsVotingElectionAuditEvent(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Election Audit Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Election Certifications
//****************************************************************************
@ObjectType({ description: "The certified result of record for an election: the report, the hashes of the roll and the ballot set, and the results timing that applied." })
export class mjBizAppsVotingElectionCertification_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election certified."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "Draft (awaiting signatures), Certified or Revoked."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true, description: "When the final required signature was recorded."}) 
    CertifiedAt?: Date;
        
    @Field({nullable: true, description: "The certification report document."}) 
    @MaxLength(36)
    ReportFileID?: string;
        
    @Field({nullable: true, description: "Hash of the frozen roll the election ran against."}) 
    @MaxLength(128)
    RollHash?: string;
        
    @Field({nullable: true, description: "Hash of the counted ballot set, so a recount can prove it used the same ballots."}) 
    @MaxLength(128)
    BallotSetHash?: string;
        
    @Field({nullable: true, description: "Statement of the results timing and audience that applied, required on the certification when results were visible before close."}) 
    ResultsTimingDisclosure?: string;
        
    @Field({nullable: true, description: "Certifier notes."}) 
    Notes?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    ReportFile?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Certifications
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionCertificationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CertifiedAt: Date | null;

    @Field({ nullable: true })
    ReportFileID: string | null;

    @Field({ nullable: true })
    RollHash: string | null;

    @Field({ nullable: true })
    BallotSetHash: string | null;

    @Field({ nullable: true })
    ResultsTimingDisclosure: string | null;

    @Field({ nullable: true })
    Notes: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Certifications
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionCertificationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    CertifiedAt?: Date | null;

    @Field({ nullable: true })
    ReportFileID?: string | null;

    @Field({ nullable: true })
    RollHash?: string | null;

    @Field({ nullable: true })
    BallotSetHash?: string | null;

    @Field({ nullable: true })
    ResultsTimingDisclosure?: string | null;

    @Field({ nullable: true })
    Notes?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Election Certifications
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionCertificationViewResult {
    @Field(() => [mjBizAppsVotingElectionCertification_])
    Results: mjBizAppsVotingElectionCertification_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElectionCertification_)
export class mjBizAppsVotingElectionCertificationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionCertificationViewResult)
    async RunmjBizAppsVotingElectionCertificationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionCertificationViewResult)
    async RunmjBizAppsVotingElectionCertificationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionCertificationViewResult)
    async RunmjBizAppsVotingElectionCertificationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Election Certifications';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElectionCertification_, { nullable: true })
    async mjBizAppsVotingElectionCertification(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElectionCertification_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Election Certifications', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElectionCertifications')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Election Certifications', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Election Certifications', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElectionCertification_)
    async CreatemjBizAppsVotingElectionCertification(
        @Arg('input', () => CreatemjBizAppsVotingElectionCertificationInput) input: CreatemjBizAppsVotingElectionCertificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Election Certifications', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElectionCertification_)
    async UpdatemjBizAppsVotingElectionCertification(
        @Arg('input', () => UpdatemjBizAppsVotingElectionCertificationInput) input: UpdatemjBizAppsVotingElectionCertificationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Election Certifications', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElectionCertification_)
    async DeletemjBizAppsVotingElectionCertification(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Election Certifications', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Election Certifiers
//****************************************************************************
@ObjectType({ description: "A person who signs an election's certification (election administrator, inspector, secretary)." })
export class mjBizAppsVotingElectionCertifier_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The certification."}) 
    @MaxLength(36)
    ElectionCertificationID?: string;
        
    @Field({nullable: true, description: "The certifier."}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field({nullable: true, description: "The capacity in which they sign (for example Inspector of Elections, Corporate Secretary)."}) 
    @MaxLength(100)
    Role?: string;
        
    @Field({nullable: true, description: "When they signed; NULL while pending."}) 
    SignedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    Person?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Certifiers
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionCertifierInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionCertificationID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    Role: string | null;

    @Field({ nullable: true })
    SignedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Certifiers
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionCertifierInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionCertificationID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    Role?: string | null;

    @Field({ nullable: true })
    SignedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Election Certifiers
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionCertifierViewResult {
    @Field(() => [mjBizAppsVotingElectionCertifier_])
    Results: mjBizAppsVotingElectionCertifier_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElectionCertifier_)
export class mjBizAppsVotingElectionCertifierResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionCertifierViewResult)
    async RunmjBizAppsVotingElectionCertifierViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionCertifierViewResult)
    async RunmjBizAppsVotingElectionCertifierViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionCertifierViewResult)
    async RunmjBizAppsVotingElectionCertifierDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Election Certifiers';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElectionCertifier_, { nullable: true })
    async mjBizAppsVotingElectionCertifier(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElectionCertifier_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Election Certifiers', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElectionCertifiers')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Election Certifiers', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Election Certifiers', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElectionCertifier_)
    async CreatemjBizAppsVotingElectionCertifier(
        @Arg('input', () => CreatemjBizAppsVotingElectionCertifierInput) input: CreatemjBizAppsVotingElectionCertifierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Election Certifiers', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElectionCertifier_)
    async UpdatemjBizAppsVotingElectionCertifier(
        @Arg('input', () => UpdatemjBizAppsVotingElectionCertifierInput) input: UpdatemjBizAppsVotingElectionCertifierInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Election Certifiers', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElectionCertifier_)
    async DeletemjBizAppsVotingElectionCertifier(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Election Certifiers', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Election Trustees
//****************************************************************************
@ObjectType({ description: "Tier B: a trustee who holds one share of the election private key and takes part in the tally ceremony. Private shares are never stored." })
export class mjBizAppsVotingElectionTrustee_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "The trustee."}) 
    @MaxLength(36)
    TrusteePersonID?: string;
        
    @Field(() => Int, {nullable: true, description: "The trustee's share number in the k-of-n scheme (1-based)."}) 
    ShareIndex?: number;
        
    @Field({nullable: true, description: "Invited, KeyCommitted (public share and commitment recorded), ShareSubmitted (took part in the tally ceremony) or Removed."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    TrusteePerson?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Trustees
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionTrusteeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    TrusteePersonID?: string;

    @Field(() => Int, { nullable: true })
    ShareIndex?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Trustees
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionTrusteeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    TrusteePersonID?: string;

    @Field(() => Int, { nullable: true })
    ShareIndex?: number;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Election Trustees
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionTrusteeViewResult {
    @Field(() => [mjBizAppsVotingElectionTrustee_])
    Results: mjBizAppsVotingElectionTrustee_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElectionTrustee_)
export class mjBizAppsVotingElectionTrusteeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionTrusteeViewResult)
    async RunmjBizAppsVotingElectionTrusteeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionTrusteeViewResult)
    async RunmjBizAppsVotingElectionTrusteeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionTrusteeViewResult)
    async RunmjBizAppsVotingElectionTrusteeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Election Trustees';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElectionTrustee_, { nullable: true })
    async mjBizAppsVotingElectionTrustee(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElectionTrustee_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Election Trustees', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElectionTrustees')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Election Trustees', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Election Trustees', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElectionTrustee_)
    async CreatemjBizAppsVotingElectionTrustee(
        @Arg('input', () => CreatemjBizAppsVotingElectionTrusteeInput) input: CreatemjBizAppsVotingElectionTrusteeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Election Trustees', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElectionTrustee_)
    async UpdatemjBizAppsVotingElectionTrustee(
        @Arg('input', () => UpdatemjBizAppsVotingElectionTrusteeInput) input: UpdatemjBizAppsVotingElectionTrusteeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Election Trustees', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElectionTrustee_)
    async DeletemjBizAppsVotingElectionTrustee(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Election Trustees', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Election Types
//****************************************************************************
@ObjectType({ description: "A kind of election (Motion, Board Election, Referendum, Poll, Standards Ballot, ...). A plug-in point: the row can name a server driver, a UI driver and an IS-A extension entity that the app shipping the type registers. Seeded as metadata; other apps ship their own types without Voting naming them." })
export class mjBizAppsVotingElectionType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "Display name of the election type."}) 
    @MaxLength(100)
    Name?: string;
        
    @Field({nullable: true, description: "Stable machine code for the type (for example motion, board-election). Callers create elections by this code; it never changes once published."}) 
    @MaxLength(50)
    Code?: string;
        
    @Field({nullable: true, description: "What this type is for and how it behaves."}) 
    Description?: string;
        
    @Field({nullable: true, description: "ClassFactory key of the server driver registered under BaseElectionTypeServerDriver. NULL uses the base driver. A type naming a driver that is not registered refuses writes to its elections."}) 
    @MaxLength(255)
    ServerDriverClass?: string;
        
    @Field({nullable: true, description: "ClassFactory key of the UI driver registered under BaseElectionTypeUIDriver. NULL uses the base driver."}) 
    @MaxLength(255)
    UIDriverClass?: string;
        
    @Field({nullable: true, description: "Optional MJ entity that is a disjoint IS-A child of Election and that every election of this type has, for the type's own typed fields and form (for example Standards Ballot Elections)."}) 
    @MaxLength(36)
    ElectionExtensionEntityID?: string;
        
    @Field({nullable: true, description: "Font Awesome icon class shown for the type in the admin UI."}) 
    @MaxLength(100)
    IconClass?: string;
        
    @Field({nullable: true, description: "JSON (IElectionTypeConfiguration): the type's defaults (secrecy mode, assurance tier, results timing and audience, allowed contest kinds and sign-in methods, governing-document citation, notice period, paper option) and which keys an election may override."}) 
    Configuration?: string;
        
    @Field({nullable: true, description: "Active types can be chosen for new elections; Disabled types keep their existing elections but cannot start new ones."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    ElectionExtensionEntity?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ServerDriverClass: string | null;

    @Field({ nullable: true })
    UIDriverClass: string | null;

    @Field({ nullable: true })
    ElectionExtensionEntityID: string | null;

    @Field({ nullable: true })
    IconClass: string | null;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Election Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ServerDriverClass?: string | null;

    @Field({ nullable: true })
    UIDriverClass?: string | null;

    @Field({ nullable: true })
    ElectionExtensionEntityID?: string | null;

    @Field({ nullable: true })
    IconClass?: string | null;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Election Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionTypeViewResult {
    @Field(() => [mjBizAppsVotingElectionType_])
    Results: mjBizAppsVotingElectionType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElectionType_)
export class mjBizAppsVotingElectionTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionTypeViewResult)
    async RunmjBizAppsVotingElectionTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionTypeViewResult)
    async RunmjBizAppsVotingElectionTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionTypeViewResult)
    async RunmjBizAppsVotingElectionTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Election Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElectionType_, { nullable: true })
    async mjBizAppsVotingElectionType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElectionType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Election Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElectionTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Election Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Election Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElectionType_)
    async CreatemjBizAppsVotingElectionType(
        @Arg('input', () => CreatemjBizAppsVotingElectionTypeInput) input: CreatemjBizAppsVotingElectionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Election Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElectionType_)
    async UpdatemjBizAppsVotingElectionType(
        @Arg('input', () => UpdatemjBizAppsVotingElectionTypeInput) input: UpdatemjBizAppsVotingElectionTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Election Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElectionType_)
    async DeletemjBizAppsVotingElectionType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Election Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Elections
//****************************************************************************
@ObjectType({ description: "The container for a vote: one or more contests, a voter roll, a schedule, and the secrecy, assurance and results-visibility rules that apply. Columns hold what SQL reads; everything else is Configuration (overrides of the election type's defaults)." })
export class mjBizAppsVotingElection_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "Display name of the election (for example '2027 Board of Directors Election' or 'Approve the 2027 budget')."}) 
    @MaxLength(255)
    Name?: string;
        
    @Field({nullable: true, description: "Notice text and background shown to administrators and voters."}) 
    Description?: string;
        
    @Field({nullable: true, description: "The election type, which supplies drivers, the optional extension entity and default configuration."}) 
    @MaxLength(36)
    ElectionTypeID?: string;
        
    @Field({nullable: true, description: "Lifecycle state: Draft -> Nominations -> Ready -> Open -> Closed -> Tallied -> Certified, or Cancelled at any point before certification. Moves only along this state machine; enforced by the entity server class."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true, description: "Open (roll call: each vote linked to the voter and visible per policy), Confidential (linked to the voter but sealed until close) or Secret (poll book and ballot box unlinkable)."}) 
    @MaxLength(20)
    SecrecyMode?: string;
        
    @Field({nullable: true, description: "Standard (tier A: field encryption at rest and access isolation), HighAssurance (tier B: selections encrypted under an election key split among trustees) or Verifiable (tier C: ElectionGuard)."}) 
    @MaxLength(20)
    AssuranceTier?: string;
        
    @Field({nullable: true, description: "Where the voter roll comes from. NULL until the administrator chooses a source."}) 
    @MaxLength(36)
    EligibilitySourceTypeID?: string;
        
    @Field({nullable: true, description: "JSON settings for the eligibility source driver (for example the committee, space or entity query to read)."}) 
    EligibilitySourceSettings?: string;
        
    @Field({nullable: true, description: "The date and time as of which eligibility is determined; the roll is frozen against it."}) 
    RecordDate?: Date;
        
    @Field({nullable: true, description: "IANA time zone used to present the schedule to voters and administrators."}) 
    @MaxLength(64)
    TimeZone?: string;
        
    @Field({nullable: true, description: "When nominations open, if the election takes nominations."}) 
    NominationsOpenAt?: Date;
        
    @Field({nullable: true, description: "When nominations close."}) 
    NominationsCloseAt?: Date;
        
    @Field({nullable: true, description: "When voting opens."}) 
    OpensAt?: Date;
        
    @Field({nullable: true, description: "When voting closes."}) 
    ClosesAt?: Date;
        
    @Field({nullable: true, description: "Latest time a proxy designation is accepted. NULL means proxies are not accepted."}) 
    ProxyDeadline?: Date;
        
    @Field({nullable: true, description: "End of the post-tally challenge window; certification waits for it."}) 
    ChallengeWindowEndsAt?: Date;
        
    @Field(() => Boolean, {nullable: true, description: "When true a voter may replace their ballot until close. Only Open and Confidential elections may allow it; a Secret ballot is final."}) 
    AllowRevote?: boolean;
        
    @Field({nullable: true, description: "When results are visible: AfterClose (default; turnout only while open), AfterVoting (each voter after casting), Live (results audience throughout) or AdministratorsOnly (audited monitoring). Running results are a tier A feature."}) 
    @MaxLength(20)
    ResultsTiming?: string;
        
    @Field({nullable: true, description: "Who may see results: Voters, Eligible, HostMembers, Public or Administrators."}) 
    @MaxLength(20)
    ResultsAudience?: string;
        
    @Field(() => Int, {nullable: true, description: "Minimum number of ballots before any result is shown (k-anonymity threshold for running and small-electorate results)."}) 
    ResultsMinCast?: number;
        
    @Field(() => Int, {nullable: true, description: "Minimum number of voters in a weight class before its tally is reported, so a unique weight cannot re-identify its voter."}) 
    WeightClassMinSize?: number;
        
    @Field(() => Int, {nullable: true, description: "For running results: publish a new snapshot only after this many further ballots."}) 
    LiveRefreshEveryBallots?: number;
        
    @Field(() => Int, {nullable: true, description: "For running results: publish snapshots no more often than every this many minutes."}) 
    LiveRefreshMinMinutes?: number;
        
    @Field(() => Boolean, {nullable: true, description: "When true the poll book (who voted, never how) is visible to voters, as some bylaws require. Default private. Never shown to an audience that also sees running results unless the election is Open."}) 
    PublishPollBook?: boolean;
        
    @Field({nullable: true, description: "When the voter roll was frozen; after this only audited amendments change it."}) 
    RollFrozenAt?: Date;
        
    @Field({nullable: true, description: "Hash of the frozen roll, recorded on the certification."}) 
    @MaxLength(128)
    RollHash?: string;
        
    @Field(() => Int, {nullable: true, description: "Tier B: the number of trustee key shares (k of n) required to decrypt."}) 
    TrusteeThreshold?: number;
        
    @Field({nullable: true, description: "Tier B/C: the election public key ballots are encrypted under. The private key is never stored."}) 
    ElectionPublicKey?: string;
        
    @Field({nullable: true, description: "JSON overrides of the election type's configuration, limited to the keys the type allows (quorum, tie-break policy, reminders, languages, inspectors, independent administrator)."}) 
    Configuration?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    ElectionType?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    EligibilitySourceType?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Elections
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingElectionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ElectionTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SecrecyMode?: string;

    @Field({ nullable: true })
    AssuranceTier?: string;

    @Field({ nullable: true })
    EligibilitySourceTypeID: string | null;

    @Field({ nullable: true })
    EligibilitySourceSettings: string | null;

    @Field({ nullable: true })
    RecordDate: Date | null;

    @Field({ nullable: true })
    TimeZone?: string;

    @Field({ nullable: true })
    NominationsOpenAt: Date | null;

    @Field({ nullable: true })
    NominationsCloseAt: Date | null;

    @Field({ nullable: true })
    OpensAt: Date | null;

    @Field({ nullable: true })
    ClosesAt: Date | null;

    @Field({ nullable: true })
    ProxyDeadline: Date | null;

    @Field({ nullable: true })
    ChallengeWindowEndsAt: Date | null;

    @Field(() => Boolean, { nullable: true })
    AllowRevote?: boolean;

    @Field({ nullable: true })
    ResultsTiming?: string;

    @Field({ nullable: true })
    ResultsAudience?: string;

    @Field(() => Int, { nullable: true })
    ResultsMinCast?: number;

    @Field(() => Int, { nullable: true })
    WeightClassMinSize?: number;

    @Field(() => Int, { nullable: true })
    LiveRefreshEveryBallots: number | null;

    @Field(() => Int, { nullable: true })
    LiveRefreshMinMinutes: number | null;

    @Field(() => Boolean, { nullable: true })
    PublishPollBook?: boolean;

    @Field({ nullable: true })
    RollFrozenAt: Date | null;

    @Field({ nullable: true })
    RollHash: string | null;

    @Field(() => Int, { nullable: true })
    TrusteeThreshold: number | null;

    @Field({ nullable: true })
    ElectionPublicKey: string | null;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Elections
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingElectionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ElectionTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SecrecyMode?: string;

    @Field({ nullable: true })
    AssuranceTier?: string;

    @Field({ nullable: true })
    EligibilitySourceTypeID?: string | null;

    @Field({ nullable: true })
    EligibilitySourceSettings?: string | null;

    @Field({ nullable: true })
    RecordDate?: Date | null;

    @Field({ nullable: true })
    TimeZone?: string;

    @Field({ nullable: true })
    NominationsOpenAt?: Date | null;

    @Field({ nullable: true })
    NominationsCloseAt?: Date | null;

    @Field({ nullable: true })
    OpensAt?: Date | null;

    @Field({ nullable: true })
    ClosesAt?: Date | null;

    @Field({ nullable: true })
    ProxyDeadline?: Date | null;

    @Field({ nullable: true })
    ChallengeWindowEndsAt?: Date | null;

    @Field(() => Boolean, { nullable: true })
    AllowRevote?: boolean;

    @Field({ nullable: true })
    ResultsTiming?: string;

    @Field({ nullable: true })
    ResultsAudience?: string;

    @Field(() => Int, { nullable: true })
    ResultsMinCast?: number;

    @Field(() => Int, { nullable: true })
    WeightClassMinSize?: number;

    @Field(() => Int, { nullable: true })
    LiveRefreshEveryBallots?: number | null;

    @Field(() => Int, { nullable: true })
    LiveRefreshMinMinutes?: number | null;

    @Field(() => Boolean, { nullable: true })
    PublishPollBook?: boolean;

    @Field({ nullable: true })
    RollFrozenAt?: Date | null;

    @Field({ nullable: true })
    RollHash?: string | null;

    @Field(() => Int, { nullable: true })
    TrusteeThreshold?: number | null;

    @Field({ nullable: true })
    ElectionPublicKey?: string | null;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Elections
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingElectionViewResult {
    @Field(() => [mjBizAppsVotingElection_])
    Results: mjBizAppsVotingElection_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingElection_)
export class mjBizAppsVotingElectionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingElectionViewResult)
    async RunmjBizAppsVotingElectionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionViewResult)
    async RunmjBizAppsVotingElectionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingElectionViewResult)
    async RunmjBizAppsVotingElectionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Elections';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingElection_, { nullable: true })
    async mjBizAppsVotingElection(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingElection_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Elections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwElections')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Elections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Elections', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingElection_)
    async CreatemjBizAppsVotingElection(
        @Arg('input', () => CreatemjBizAppsVotingElectionInput) input: CreatemjBizAppsVotingElectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Elections', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingElection_)
    async UpdatemjBizAppsVotingElection(
        @Arg('input', () => UpdatemjBizAppsVotingElectionInput) input: UpdatemjBizAppsVotingElectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Elections', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingElection_)
    async DeletemjBizAppsVotingElection(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Elections', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Eligibility Source Types
//****************************************************************************
@ObjectType({ description: "Where a voter roll comes from. A plug-in point: DriverClass names a BaseEligibilitySource implementation. Voting ships Entity Query and CSV; other apps ship theirs (committee voting members, Collaboration space seats)." })
export class mjBizAppsVotingEligibilitySourceType_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "Display name of the roll source."}) 
    @MaxLength(100)
    Name?: string;
        
    @Field({nullable: true, description: "Stable machine code for the source (for example entity-query, csv)."}) 
    @MaxLength(50)
    Code?: string;
        
    @Field({nullable: true, description: "What the source reads and how it decides voting class and weight."}) 
    Description?: string;
        
    @Field({nullable: true, description: "ClassFactory key of the BaseEligibilitySource implementation."}) 
    @MaxLength(255)
    DriverClass?: string;
        
    @Field({nullable: true, description: "JSON describing the settings an election must supply for this source (the settings themselves live on the election)."}) 
    Configuration?: string;
        
    @Field({nullable: true, description: "Active sources can be chosen for new elections; Disabled sources cannot."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Eligibility Source Types
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingEligibilitySourceTypeInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Eligibility Source Types
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingEligibilitySourceTypeInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Eligibility Source Types
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingEligibilitySourceTypeViewResult {
    @Field(() => [mjBizAppsVotingEligibilitySourceType_])
    Results: mjBizAppsVotingEligibilitySourceType_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingEligibilitySourceType_)
export class mjBizAppsVotingEligibilitySourceTypeResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingEligibilitySourceTypeViewResult)
    async RunmjBizAppsVotingEligibilitySourceTypeViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingEligibilitySourceTypeViewResult)
    async RunmjBizAppsVotingEligibilitySourceTypeViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingEligibilitySourceTypeViewResult)
    async RunmjBizAppsVotingEligibilitySourceTypeDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Eligibility Source Types';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingEligibilitySourceType_, { nullable: true })
    async mjBizAppsVotingEligibilitySourceType(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingEligibilitySourceType_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Eligibility Source Types', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwEligibilitySourceTypes')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Eligibility Source Types', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Eligibility Source Types', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingEligibilitySourceType_)
    async CreatemjBizAppsVotingEligibilitySourceType(
        @Arg('input', () => CreatemjBizAppsVotingEligibilitySourceTypeInput) input: CreatemjBizAppsVotingEligibilitySourceTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Eligibility Source Types', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingEligibilitySourceType_)
    async UpdatemjBizAppsVotingEligibilitySourceType(
        @Arg('input', () => UpdatemjBizAppsVotingEligibilitySourceTypeInput) input: UpdatemjBizAppsVotingEligibilitySourceTypeInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Eligibility Source Types', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingEligibilitySourceType_)
    async DeletemjBizAppsVotingEligibilitySourceType(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Eligibility Source Types', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Eligible Voters
//****************************************************************************
@ObjectType({ description: "One entry on an election's voter roll, frozen at the record date. Changes after the freeze are audited amendments or challenges." })
export class mjBizAppsVotingEligibleVoter_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "The voter. For an organizational voter this is the designated voting representative."}) 
    @MaxLength(36)
    PersonID?: string;
        
    @Field({nullable: true, description: "The organization this entry votes for, when the voter is an organization's representative."}) 
    @MaxLength(36)
    RepresentingOrganizationID?: string;
        
    @Field({nullable: true, description: "The voter's class, for contests limited to one class and for per-class reporting."}) 
    @MaxLength(100)
    VotingClass?: string;
        
    @Field(() => Float, {nullable: true, description: "Vote weight (1 for one-person-one-vote). Never copied onto the ballot; tallies use weight classes."}) 
    Weight?: number;
        
    @Field({nullable: true, description: "The voter's identifier in the source system (member number, employee ID, unit number), used to match host assertions and second factors."}) 
    @MaxLength(255)
    SourceKey?: string;
        
    @Field({nullable: true, description: "Eligible, Challenged (awaiting a decision) or Removed."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true, description: "Why the entry was challenged or removed."}) 
    StatusReason?: string;
        
    @Field(() => Boolean, {nullable: true, description: "True when the entry was added by an audited amendment after the roll was frozen."}) 
    AddedAfterFreeze?: boolean;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    Person?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    RepresentingOrganization?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Eligible Voters
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingEligibleVoterInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    RepresentingOrganizationID: string | null;

    @Field({ nullable: true })
    VotingClass: string | null;

    @Field(() => Float, { nullable: true })
    Weight?: number;

    @Field({ nullable: true })
    SourceKey: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StatusReason: string | null;

    @Field(() => Boolean, { nullable: true })
    AddedAfterFreeze?: boolean;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Eligible Voters
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingEligibleVoterInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    PersonID?: string;

    @Field({ nullable: true })
    RepresentingOrganizationID?: string | null;

    @Field({ nullable: true })
    VotingClass?: string | null;

    @Field(() => Float, { nullable: true })
    Weight?: number;

    @Field({ nullable: true })
    SourceKey?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    StatusReason?: string | null;

    @Field(() => Boolean, { nullable: true })
    AddedAfterFreeze?: boolean;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Eligible Voters
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingEligibleVoterViewResult {
    @Field(() => [mjBizAppsVotingEligibleVoter_])
    Results: mjBizAppsVotingEligibleVoter_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingEligibleVoter_)
export class mjBizAppsVotingEligibleVoterResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingEligibleVoterViewResult)
    async RunmjBizAppsVotingEligibleVoterViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingEligibleVoterViewResult)
    async RunmjBizAppsVotingEligibleVoterViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingEligibleVoterViewResult)
    async RunmjBizAppsVotingEligibleVoterDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Eligible Voters';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingEligibleVoter_, { nullable: true })
    async mjBizAppsVotingEligibleVoter(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingEligibleVoter_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Eligible Voters', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwEligibleVoters')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Eligible Voters', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Eligible Voters', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingEligibleVoter_)
    async CreatemjBizAppsVotingEligibleVoter(
        @Arg('input', () => CreatemjBizAppsVotingEligibleVoterInput) input: CreatemjBizAppsVotingEligibleVoterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Eligible Voters', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingEligibleVoter_)
    async UpdatemjBizAppsVotingEligibleVoter(
        @Arg('input', () => UpdatemjBizAppsVotingEligibleVoterInput) input: UpdatemjBizAppsVotingEligibleVoterInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Eligible Voters', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingEligibleVoter_)
    async DeletemjBizAppsVotingEligibleVoter(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Eligible Voters', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Nomination Endorsements
//****************************************************************************
@ObjectType({ description: "A petition signature or endorsement supporting a nomination." })
export class mjBizAppsVotingNominationEndorsement_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The nomination endorsed."}) 
    @MaxLength(36)
    NominationID?: string;
        
    @Field({nullable: true, description: "The person endorsing (signing the petition)."}) 
    @MaxLength(36)
    EndorserPersonID?: string;
        
    @Field({nullable: true, description: "When the endorsement was given."}) 
    EndorsedAt?: Date;
        
    @Field({nullable: true, description: "Valid, Invalid (failed an eligibility check) or Withdrawn."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    EndorserPerson?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Nomination Endorsements
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingNominationEndorsementInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    NominationID?: string;

    @Field({ nullable: true })
    EndorserPersonID?: string;

    @Field({ nullable: true })
    EndorsedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Nomination Endorsements
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingNominationEndorsementInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    NominationID?: string;

    @Field({ nullable: true })
    EndorserPersonID?: string;

    @Field({ nullable: true })
    EndorsedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Nomination Endorsements
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingNominationEndorsementViewResult {
    @Field(() => [mjBizAppsVotingNominationEndorsement_])
    Results: mjBizAppsVotingNominationEndorsement_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingNominationEndorsement_)
export class mjBizAppsVotingNominationEndorsementResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingNominationEndorsementViewResult)
    async RunmjBizAppsVotingNominationEndorsementViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingNominationEndorsementViewResult)
    async RunmjBizAppsVotingNominationEndorsementViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingNominationEndorsementViewResult)
    async RunmjBizAppsVotingNominationEndorsementDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Nomination Endorsements';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingNominationEndorsement_, { nullable: true })
    async mjBizAppsVotingNominationEndorsement(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingNominationEndorsement_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Nomination Endorsements', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwNominationEndorsements')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Nomination Endorsements', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Nomination Endorsements', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingNominationEndorsement_)
    async CreatemjBizAppsVotingNominationEndorsement(
        @Arg('input', () => CreatemjBizAppsVotingNominationEndorsementInput) input: CreatemjBizAppsVotingNominationEndorsementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Nomination Endorsements', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingNominationEndorsement_)
    async UpdatemjBizAppsVotingNominationEndorsement(
        @Arg('input', () => UpdatemjBizAppsVotingNominationEndorsementInput) input: UpdatemjBizAppsVotingNominationEndorsementInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Nomination Endorsements', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingNominationEndorsement_)
    async DeletemjBizAppsVotingNominationEndorsement(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Nomination Endorsements', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Nominations
//****************************************************************************
@ObjectType({ description: "A nomination of a person for an office contest, through submission, the nominee's acceptance and committee approval. Endorsements carry petition signatures." })
export class mjBizAppsVotingNomination_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The office contest the person is nominated for."}) 
    @MaxLength(36)
    ContestID?: string;
        
    @Field({nullable: true, description: "The person nominated."}) 
    @MaxLength(36)
    NomineePersonID?: string;
        
    @Field({nullable: true, description: "Who made the nomination; NULL for a self-nomination or a committee slate."}) 
    @MaxLength(36)
    NominatedByPersonID?: string;
        
    @Field({nullable: true, description: "Submitted, Accepted (by the nominee), Declined (by the nominee), Approved (onto the ballot), Rejected or Withdrawn."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true, description: "The nominee's statement of candidacy."}) 
    Statement?: string;
        
    @Field({nullable: true, description: "When the nomination was submitted."}) 
    SubmittedAt?: Date;
        
    @Field({nullable: true, description: "When the nomination was approved or rejected."}) 
    DecidedAt?: Date;
        
    @Field({nullable: true, description: "Reason recorded with the approval or rejection."}) 
    DecisionNotes?: string;
        
    @Field({nullable: true, description: "The ballot option created when the nomination was approved."}) 
    @MaxLength(36)
    ContestOptionID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    Contest?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    NomineePerson?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    NominatedByPerson?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Nominations
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingNominationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    NomineePersonID?: string;

    @Field({ nullable: true })
    NominatedByPersonID: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Statement: string | null;

    @Field({ nullable: true })
    SubmittedAt?: Date;

    @Field({ nullable: true })
    DecidedAt: Date | null;

    @Field({ nullable: true })
    DecisionNotes: string | null;

    @Field({ nullable: true })
    ContestOptionID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Nominations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingNominationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ContestID?: string;

    @Field({ nullable: true })
    NomineePersonID?: string;

    @Field({ nullable: true })
    NominatedByPersonID?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    Statement?: string | null;

    @Field({ nullable: true })
    SubmittedAt?: Date;

    @Field({ nullable: true })
    DecidedAt?: Date | null;

    @Field({ nullable: true })
    DecisionNotes?: string | null;

    @Field({ nullable: true })
    ContestOptionID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Nominations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingNominationViewResult {
    @Field(() => [mjBizAppsVotingNomination_])
    Results: mjBizAppsVotingNomination_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingNomination_)
export class mjBizAppsVotingNominationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingNominationViewResult)
    async RunmjBizAppsVotingNominationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingNominationViewResult)
    async RunmjBizAppsVotingNominationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingNominationViewResult)
    async RunmjBizAppsVotingNominationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Nominations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingNomination_, { nullable: true })
    async mjBizAppsVotingNomination(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingNomination_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Nominations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwNominations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Nominations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Nominations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingNomination_)
    async CreatemjBizAppsVotingNomination(
        @Arg('input', () => CreatemjBizAppsVotingNominationInput) input: CreatemjBizAppsVotingNominationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Nominations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingNomination_)
    async UpdatemjBizAppsVotingNomination(
        @Arg('input', () => UpdatemjBizAppsVotingNominationInput) input: UpdatemjBizAppsVotingNominationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Nominations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingNomination_)
    async DeletemjBizAppsVotingNomination(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Nominations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Participations
//****************************************************************************
@ObjectType({ description: "The poll book: who voted in an election, when and through which channel. The only place the voter's identity meets the election. One row per roll entry (unique), written in the same transaction as the ballot, so a voter cannot vote without being marked and cannot be marked without voting." })
export class mjBizAppsVotingParticipation_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "The roll entry that voted."}) 
    @MaxLength(36)
    EligibleVoterID?: string;
        
    @Field({nullable: true, description: "When the ballot was cast (or entered, for paper and proxy ballots)."}) 
    CastAt?: Date;
        
    @Field({nullable: true, description: "Online, Paper, Proxy or InPerson."}) 
    @MaxLength(20)
    Channel?: string;
        
    @Field({nullable: true, description: "For online ballots: the sign-in method used, so the certification can count participation by method."}) 
    @MaxLength(36)
    VoterCredentialMethodID?: string;
        
    @Field({nullable: true, description: "For paper, proxy and in-person ballots: the staff user who entered it."}) 
    @MaxLength(36)
    EnteredByUserID?: string;
        
    @Field({nullable: true, description: "For proxy ballots: the designation the proxy voted under."}) 
    @MaxLength(36)
    ProxyDesignationID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    VoterCredentialMethod?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    EnteredByUser?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Participations
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingParticipationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    EligibleVoterID?: string;

    @Field({ nullable: true })
    CastAt?: Date;

    @Field({ nullable: true })
    Channel?: string;

    @Field({ nullable: true })
    VoterCredentialMethodID: string | null;

    @Field({ nullable: true })
    EnteredByUserID: string | null;

    @Field({ nullable: true })
    ProxyDesignationID: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Participations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingParticipationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    EligibleVoterID?: string;

    @Field({ nullable: true })
    CastAt?: Date;

    @Field({ nullable: true })
    Channel?: string;

    @Field({ nullable: true })
    VoterCredentialMethodID?: string | null;

    @Field({ nullable: true })
    EnteredByUserID?: string | null;

    @Field({ nullable: true })
    ProxyDesignationID?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Participations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingParticipationViewResult {
    @Field(() => [mjBizAppsVotingParticipation_])
    Results: mjBizAppsVotingParticipation_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingParticipation_)
export class mjBizAppsVotingParticipationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingParticipationViewResult)
    async RunmjBizAppsVotingParticipationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingParticipationViewResult)
    async RunmjBizAppsVotingParticipationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingParticipationViewResult)
    async RunmjBizAppsVotingParticipationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Participations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingParticipation_, { nullable: true })
    async mjBizAppsVotingParticipation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingParticipation_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Participations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwParticipations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Participations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Participations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingParticipation_)
    async CreatemjBizAppsVotingParticipation(
        @Arg('input', () => CreatemjBizAppsVotingParticipationInput) input: CreatemjBizAppsVotingParticipationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Participations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingParticipation_)
    async UpdatemjBizAppsVotingParticipation(
        @Arg('input', () => UpdatemjBizAppsVotingParticipationInput) input: UpdatemjBizAppsVotingParticipationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Participations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingParticipation_)
    async DeletemjBizAppsVotingParticipation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Participations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Proxy Designations
//****************************************************************************
@ObjectType({ description: "A voter's designation of a proxy to vote on their behalf, received by the election's proxy deadline." })
export class mjBizAppsVotingProxyDesignation_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "The roll entry granting the proxy."}) 
    @MaxLength(36)
    GrantorEligibleVoterID?: string;
        
    @Field({nullable: true, description: "The person who will vote on the grantor's behalf."}) 
    @MaxLength(36)
    ProxyPersonID?: string;
        
    @Field({nullable: true, description: "General (the proxy decides) or Directed (the grantor's instructions bind the proxy)."}) 
    @MaxLength(20)
    Scope?: string;
        
    @Field({nullable: true, description: "For a directed proxy: the grantor's voting instructions."}) 
    Instructions?: string;
        
    @Field({nullable: true, description: "When the designation was received; must be on or before the election's proxy deadline."}) 
    ReceivedAt?: Date;
        
    @Field({nullable: true, description: "Pending, Accepted, Rejected, Revoked or Used (a ballot was cast under it)."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field({nullable: true}) 
    @MaxLength(201)
    ProxyPerson?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Proxy Designations
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingProxyDesignationInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    GrantorEligibleVoterID?: string;

    @Field({ nullable: true })
    ProxyPersonID?: string;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    Instructions: string | null;

    @Field({ nullable: true })
    ReceivedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Proxy Designations
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingProxyDesignationInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    GrantorEligibleVoterID?: string;

    @Field({ nullable: true })
    ProxyPersonID?: string;

    @Field({ nullable: true })
    Scope?: string;

    @Field({ nullable: true })
    Instructions?: string | null;

    @Field({ nullable: true })
    ReceivedAt?: Date;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Proxy Designations
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingProxyDesignationViewResult {
    @Field(() => [mjBizAppsVotingProxyDesignation_])
    Results: mjBizAppsVotingProxyDesignation_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingProxyDesignation_)
export class mjBizAppsVotingProxyDesignationResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingProxyDesignationViewResult)
    async RunmjBizAppsVotingProxyDesignationViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingProxyDesignationViewResult)
    async RunmjBizAppsVotingProxyDesignationViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingProxyDesignationViewResult)
    async RunmjBizAppsVotingProxyDesignationDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Proxy Designations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingProxyDesignation_, { nullable: true })
    async mjBizAppsVotingProxyDesignation(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingProxyDesignation_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Proxy Designations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwProxyDesignations')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Proxy Designations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Proxy Designations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingProxyDesignation_)
    async CreatemjBizAppsVotingProxyDesignation(
        @Arg('input', () => CreatemjBizAppsVotingProxyDesignationInput) input: CreatemjBizAppsVotingProxyDesignationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Proxy Designations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingProxyDesignation_)
    async UpdatemjBizAppsVotingProxyDesignation(
        @Arg('input', () => UpdatemjBizAppsVotingProxyDesignationInput) input: UpdatemjBizAppsVotingProxyDesignationInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Proxy Designations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingProxyDesignation_)
    async DeletemjBizAppsVotingProxyDesignation(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Proxy Designations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Result Snapshots
//****************************************************************************
@ObjectType({ description: "A batched publication of running results while an election is open, materialized by a scheduled job according to the election's refresh policy and minimum-cast threshold. The only form in which running results are served." })
export class mjBizAppsVotingResultSnapshot_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The election."}) 
    @MaxLength(36)
    ElectionID?: string;
        
    @Field({nullable: true, description: "When the snapshot was taken."}) 
    SnapshotAt?: Date;
        
    @Field(() => Int, {nullable: true, description: "Ballots included in the snapshot."}) 
    BallotCount?: number;
        
    @Field({nullable: true, description: "JSON of per-contest, per-option totals as published (threshold and weight-class suppression already applied)."}) 
    Results?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Election?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Result Snapshots
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingResultSnapshotInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    SnapshotAt?: Date;

    @Field(() => Int, { nullable: true })
    BallotCount?: number;

    @Field({ nullable: true })
    Results?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Result Snapshots
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingResultSnapshotInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionID?: string;

    @Field({ nullable: true })
    SnapshotAt?: Date;

    @Field(() => Int, { nullable: true })
    BallotCount?: number;

    @Field({ nullable: true })
    Results?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Result Snapshots
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingResultSnapshotViewResult {
    @Field(() => [mjBizAppsVotingResultSnapshot_])
    Results: mjBizAppsVotingResultSnapshot_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingResultSnapshot_)
export class mjBizAppsVotingResultSnapshotResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingResultSnapshotViewResult)
    async RunmjBizAppsVotingResultSnapshotViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingResultSnapshotViewResult)
    async RunmjBizAppsVotingResultSnapshotViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingResultSnapshotViewResult)
    async RunmjBizAppsVotingResultSnapshotDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Result Snapshots';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingResultSnapshot_, { nullable: true })
    async mjBizAppsVotingResultSnapshot(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingResultSnapshot_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Result Snapshots', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwResultSnapshots')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Result Snapshots', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Result Snapshots', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingResultSnapshot_)
    async CreatemjBizAppsVotingResultSnapshot(
        @Arg('input', () => CreatemjBizAppsVotingResultSnapshotInput) input: CreatemjBizAppsVotingResultSnapshotInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Result Snapshots', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingResultSnapshot_)
    async UpdatemjBizAppsVotingResultSnapshot(
        @Arg('input', () => UpdatemjBizAppsVotingResultSnapshotInput) input: UpdatemjBizAppsVotingResultSnapshotInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Result Snapshots', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingResultSnapshot_)
    async DeletemjBizAppsVotingResultSnapshot(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Result Snapshots', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Standards Ballot Elections
//****************************************************************************
@ObjectType({ description: "IS-A extension of Election for the Standards Ballot type: the document balloted and its recirculation round." })
export class mjBizAppsVotingStandardsBallotElection_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "Title of the draft standard or document being balloted."}) 
    @MaxLength(500)
    DocumentTitle?: string;
        
    @Field({nullable: true, description: "Version or draft number of the document."}) 
    @MaxLength(50)
    DocumentVersion?: string;
        
    @Field({nullable: true, description: "The document balloted."}) 
    @MaxLength(36)
    DocumentFileID?: string;
        
    @Field(() => Int, {nullable: true, description: "0 for the initial ballot; incremented for each recirculation after comment resolution."}) 
    RecirculationRound?: number;
        
    @Field({nullable: true, description: "For a recirculation: the previous ballot on the same document."}) 
    @MaxLength(36)
    PriorElectionID?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Name?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    ElectionTypeID?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    Status?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    SecrecyMode?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    AssuranceTier?: string;
        
    @Field({nullable: true}) 
    @MaxLength(36)
    EligibilitySourceTypeID?: string;
        
    @Field({nullable: true}) 
    EligibilitySourceSettings?: string;
        
    @Field({nullable: true}) 
    RecordDate?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(64)
    TimeZone?: string;
        
    @Field({nullable: true}) 
    NominationsOpenAt?: Date;
        
    @Field({nullable: true}) 
    NominationsCloseAt?: Date;
        
    @Field({nullable: true}) 
    OpensAt?: Date;
        
    @Field({nullable: true}) 
    ClosesAt?: Date;
        
    @Field({nullable: true}) 
    ProxyDeadline?: Date;
        
    @Field({nullable: true}) 
    ChallengeWindowEndsAt?: Date;
        
    @Field(() => Boolean, {nullable: true}) 
    AllowRevote?: boolean;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    ResultsTiming?: string;
        
    @Field({nullable: true}) 
    @MaxLength(20)
    ResultsAudience?: string;
        
    @Field(() => Int, {nullable: true}) 
    ResultsMinCast?: number;
        
    @Field(() => Int, {nullable: true}) 
    WeightClassMinSize?: number;
        
    @Field(() => Int, {nullable: true}) 
    LiveRefreshEveryBallots?: number;
        
    @Field(() => Int, {nullable: true}) 
    LiveRefreshMinMinutes?: number;
        
    @Field(() => Boolean, {nullable: true}) 
    PublishPollBook?: boolean;
        
    @Field({nullable: true}) 
    RollFrozenAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(128)
    RollHash?: string;
        
    @Field(() => Int, {nullable: true}) 
    TrusteeThreshold?: number;
        
    @Field({nullable: true}) 
    ElectionPublicKey?: string;
        
    @Field({nullable: true}) 
    Configuration?: string;
        
    @Field({nullable: true}) 
    @MaxLength(500)
    DocumentFile?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    PriorElection?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Standards Ballot Elections
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingStandardsBallotElectionInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    DocumentTitle?: string;

    @Field({ nullable: true })
    DocumentVersion: string | null;

    @Field({ nullable: true })
    DocumentFileID: string | null;

    @Field(() => Int, { nullable: true })
    RecirculationRound?: number;

    @Field({ nullable: true })
    PriorElectionID: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    ElectionTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SecrecyMode?: string;

    @Field({ nullable: true })
    AssuranceTier?: string;

    @Field({ nullable: true })
    EligibilitySourceTypeID: string | null;

    @Field({ nullable: true })
    EligibilitySourceSettings: string | null;

    @Field({ nullable: true })
    RecordDate: Date | null;

    @Field({ nullable: true })
    TimeZone?: string;

    @Field({ nullable: true })
    NominationsOpenAt: Date | null;

    @Field({ nullable: true })
    NominationsCloseAt: Date | null;

    @Field({ nullable: true })
    OpensAt: Date | null;

    @Field({ nullable: true })
    ClosesAt: Date | null;

    @Field({ nullable: true })
    ProxyDeadline: Date | null;

    @Field({ nullable: true })
    ChallengeWindowEndsAt: Date | null;

    @Field(() => Boolean, { nullable: true })
    AllowRevote?: boolean;

    @Field({ nullable: true })
    ResultsTiming?: string;

    @Field({ nullable: true })
    ResultsAudience?: string;

    @Field(() => Int, { nullable: true })
    ResultsMinCast?: number;

    @Field(() => Int, { nullable: true })
    WeightClassMinSize?: number;

    @Field(() => Int, { nullable: true })
    LiveRefreshEveryBallots: number | null;

    @Field(() => Int, { nullable: true })
    LiveRefreshMinMinutes: number | null;

    @Field(() => Boolean, { nullable: true })
    PublishPollBook?: boolean;

    @Field({ nullable: true })
    RollFrozenAt: Date | null;

    @Field({ nullable: true })
    RollHash: string | null;

    @Field(() => Int, { nullable: true })
    TrusteeThreshold: number | null;

    @Field({ nullable: true })
    ElectionPublicKey: string | null;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Standards Ballot Elections
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingStandardsBallotElectionInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    DocumentTitle?: string;

    @Field({ nullable: true })
    DocumentVersion?: string | null;

    @Field({ nullable: true })
    DocumentFileID?: string | null;

    @Field(() => Int, { nullable: true })
    RecirculationRound?: number;

    @Field({ nullable: true })
    PriorElectionID?: string | null;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    ElectionTypeID?: string;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    SecrecyMode?: string;

    @Field({ nullable: true })
    AssuranceTier?: string;

    @Field({ nullable: true })
    EligibilitySourceTypeID?: string | null;

    @Field({ nullable: true })
    EligibilitySourceSettings?: string | null;

    @Field({ nullable: true })
    RecordDate?: Date | null;

    @Field({ nullable: true })
    TimeZone?: string;

    @Field({ nullable: true })
    NominationsOpenAt?: Date | null;

    @Field({ nullable: true })
    NominationsCloseAt?: Date | null;

    @Field({ nullable: true })
    OpensAt?: Date | null;

    @Field({ nullable: true })
    ClosesAt?: Date | null;

    @Field({ nullable: true })
    ProxyDeadline?: Date | null;

    @Field({ nullable: true })
    ChallengeWindowEndsAt?: Date | null;

    @Field(() => Boolean, { nullable: true })
    AllowRevote?: boolean;

    @Field({ nullable: true })
    ResultsTiming?: string;

    @Field({ nullable: true })
    ResultsAudience?: string;

    @Field(() => Int, { nullable: true })
    ResultsMinCast?: number;

    @Field(() => Int, { nullable: true })
    WeightClassMinSize?: number;

    @Field(() => Int, { nullable: true })
    LiveRefreshEveryBallots?: number | null;

    @Field(() => Int, { nullable: true })
    LiveRefreshMinMinutes?: number | null;

    @Field(() => Boolean, { nullable: true })
    PublishPollBook?: boolean;

    @Field({ nullable: true })
    RollFrozenAt?: Date | null;

    @Field({ nullable: true })
    RollHash?: string | null;

    @Field(() => Int, { nullable: true })
    TrusteeThreshold?: number | null;

    @Field({ nullable: true })
    ElectionPublicKey?: string | null;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Standards Ballot Elections
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingStandardsBallotElectionViewResult {
    @Field(() => [mjBizAppsVotingStandardsBallotElection_])
    Results: mjBizAppsVotingStandardsBallotElection_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingStandardsBallotElection_)
export class mjBizAppsVotingStandardsBallotElectionResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingStandardsBallotElectionViewResult)
    async RunmjBizAppsVotingStandardsBallotElectionViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingStandardsBallotElectionViewResult)
    async RunmjBizAppsVotingStandardsBallotElectionViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingStandardsBallotElectionViewResult)
    async RunmjBizAppsVotingStandardsBallotElectionDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Standards Ballot Elections';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingStandardsBallotElection_, { nullable: true })
    async mjBizAppsVotingStandardsBallotElection(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingStandardsBallotElection_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Standards Ballot Elections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwStandardsBallotElections')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Standards Ballot Elections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Standards Ballot Elections', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingStandardsBallotElection_)
    async CreatemjBizAppsVotingStandardsBallotElection(
        @Arg('input', () => CreatemjBizAppsVotingStandardsBallotElectionInput) input: CreatemjBizAppsVotingStandardsBallotElectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Standards Ballot Elections', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingStandardsBallotElection_)
    async UpdatemjBizAppsVotingStandardsBallotElection(
        @Arg('input', () => UpdatemjBizAppsVotingStandardsBallotElectionInput) input: UpdatemjBizAppsVotingStandardsBallotElectionInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Standards Ballot Elections', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingStandardsBallotElection_)
    async DeletemjBizAppsVotingStandardsBallotElection(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Standards Ballot Elections', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Tally Methods
//****************************************************************************
@ObjectType({ description: "A counting rule (Plurality, Majority with threshold, Approval, IRV, STV). A plug-in point: DriverClass names a pure, deterministic BaseTallyMethod implementation registered in voting-entities so the server, tests and previews share one implementation." })
export class mjBizAppsVotingTallyMethod_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "Display name of the counting rule."}) 
    @MaxLength(100)
    Name?: string;
        
    @Field({nullable: true, description: "Stable machine code for the method (for example plurality, majority, irv)."}) 
    @MaxLength(50)
    Code?: string;
        
    @Field({nullable: true, description: "How the method counts, including the exact variant (an STV row names its rule, such as Meek or Scottish STV, because variants give different results)."}) 
    Description?: string;
        
    @Field({nullable: true, description: "ClassFactory key of the BaseTallyMethod implementation."}) 
    @MaxLength(255)
    DriverClass?: string;
        
    @Field(() => Boolean, {nullable: true, description: "True when voters rank options (IRV, STV); ranked contests show first preferences only until close."}) 
    IsRanked?: boolean;
        
    @Field(() => Boolean, {nullable: true, description: "True when the method can fill more than one seat in a contest."}) 
    SupportsMultipleSeats?: boolean;
        
    @Field({nullable: true, description: "JSON of method-specific settings passed to the driver."}) 
    Configuration?: string;
        
    @Field({nullable: true, description: "Active methods can be chosen for new contests; Disabled methods cannot."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Tally Methods
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingTallyMethodInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field(() => Boolean, { nullable: true })
    IsRanked?: boolean;

    @Field(() => Boolean, { nullable: true })
    SupportsMultipleSeats?: boolean;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Tally Methods
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingTallyMethodInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field(() => Boolean, { nullable: true })
    IsRanked?: boolean;

    @Field(() => Boolean, { nullable: true })
    SupportsMultipleSeats?: boolean;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Tally Methods
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingTallyMethodViewResult {
    @Field(() => [mjBizAppsVotingTallyMethod_])
    Results: mjBizAppsVotingTallyMethod_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingTallyMethod_)
export class mjBizAppsVotingTallyMethodResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingTallyMethodViewResult)
    async RunmjBizAppsVotingTallyMethodViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingTallyMethodViewResult)
    async RunmjBizAppsVotingTallyMethodViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingTallyMethodViewResult)
    async RunmjBizAppsVotingTallyMethodDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Tally Methods';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingTallyMethod_, { nullable: true })
    async mjBizAppsVotingTallyMethod(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingTallyMethod_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Tally Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwTallyMethods')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Tally Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Tally Methods', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingTallyMethod_)
    async CreatemjBizAppsVotingTallyMethod(
        @Arg('input', () => CreatemjBizAppsVotingTallyMethodInput) input: CreatemjBizAppsVotingTallyMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Tally Methods', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingTallyMethod_)
    async UpdatemjBizAppsVotingTallyMethod(
        @Arg('input', () => UpdatemjBizAppsVotingTallyMethodInput) input: UpdatemjBizAppsVotingTallyMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Tally Methods', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingTallyMethod_)
    async DeletemjBizAppsVotingTallyMethod(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Tally Methods', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Trustee Key Commitments
//****************************************************************************
@ObjectType({ description: "Tier B: the public share and commitment a trustee publishes in the key ceremony, used to verify their decryption share at the tally ceremony." })
export class mjBizAppsVotingTrusteeKeyCommitment_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The trustee."}) 
    @MaxLength(36)
    ElectionTrusteeID?: string;
        
    @Field({nullable: true, description: "The trustee's public key share."}) 
    PublicShare?: string;
        
    @Field({nullable: true, description: "The trustee's commitment (polynomial coefficient commitments) used to verify shares."}) 
    Commitment?: string;
        
    @Field({nullable: true, description: "When the commitment was recorded."}) 
    CommittedAt?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Trustee Key Commitments
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingTrusteeKeyCommitmentInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    ElectionTrusteeID?: string;

    @Field({ nullable: true })
    PublicShare?: string;

    @Field({ nullable: true })
    Commitment?: string;

    @Field({ nullable: true })
    CommittedAt?: Date;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Trustee Key Commitments
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingTrusteeKeyCommitmentInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    ElectionTrusteeID?: string;

    @Field({ nullable: true })
    PublicShare?: string;

    @Field({ nullable: true })
    Commitment?: string;

    @Field({ nullable: true })
    CommittedAt?: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Trustee Key Commitments
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingTrusteeKeyCommitmentViewResult {
    @Field(() => [mjBizAppsVotingTrusteeKeyCommitment_])
    Results: mjBizAppsVotingTrusteeKeyCommitment_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingTrusteeKeyCommitment_)
export class mjBizAppsVotingTrusteeKeyCommitmentResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingTrusteeKeyCommitmentViewResult)
    async RunmjBizAppsVotingTrusteeKeyCommitmentViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingTrusteeKeyCommitmentViewResult)
    async RunmjBizAppsVotingTrusteeKeyCommitmentViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingTrusteeKeyCommitmentViewResult)
    async RunmjBizAppsVotingTrusteeKeyCommitmentDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Trustee Key Commitments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingTrusteeKeyCommitment_, { nullable: true })
    async mjBizAppsVotingTrusteeKeyCommitment(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingTrusteeKeyCommitment_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Trustee Key Commitments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwTrusteeKeyCommitments')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Trustee Key Commitments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Trustee Key Commitments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingTrusteeKeyCommitment_)
    async CreatemjBizAppsVotingTrusteeKeyCommitment(
        @Arg('input', () => CreatemjBizAppsVotingTrusteeKeyCommitmentInput) input: CreatemjBizAppsVotingTrusteeKeyCommitmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Trustee Key Commitments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingTrusteeKeyCommitment_)
    async UpdatemjBizAppsVotingTrusteeKeyCommitment(
        @Arg('input', () => UpdatemjBizAppsVotingTrusteeKeyCommitmentInput) input: UpdatemjBizAppsVotingTrusteeKeyCommitmentInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Trustee Key Commitments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingTrusteeKeyCommitment_)
    async DeletemjBizAppsVotingTrusteeKeyCommitment(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Trustee Key Commitments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Voter Credential Methods
//****************************************************************************
@ObjectType({ description: "How a voter proves who they are (Emailed Link, Host Assertion, SSO, MJ Session, Second Factor). A plug-in point: DriverClass names a BaseVoterCredentialMethod implementation that turns a credential into exactly one roll entry." })
export class mjBizAppsVotingVoterCredentialMethod_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "Display name of the sign-in method."}) 
    @MaxLength(100)
    Name?: string;
        
    @Field({nullable: true, description: "Stable machine code for the method (for example emailed-link, host-assertion, sso, mj-session, second-factor)."}) 
    @MaxLength(50)
    Code?: string;
        
    @Field({nullable: true, description: "How the voter proves identity with this method and how the result is matched to the roll."}) 
    Description?: string;
        
    @Field({nullable: true, description: "ClassFactory key of the BaseVoterCredentialMethod implementation."}) 
    @MaxLength(255)
    DriverClass?: string;
        
    @Field(() => Boolean, {nullable: true, description: "True when the method is layered on top of another method rather than used alone (roster identifier plus PIN)."}) 
    IsSecondFactor?: boolean;
        
    @Field(() => Boolean, {nullable: true, description: "True when credentials must be issued per voter before voting (emailed links, control numbers, PINs); false when the method relies on an existing login or assertion."}) 
    RequiresIssuance?: boolean;
        
    @Field({nullable: true, description: "JSON of method-specific settings passed to the driver (for example lockout thresholds)."}) 
    Configuration?: string;
        
    @Field({nullable: true, description: "Active methods can be offered by ballot distributions; Disabled methods cannot."}) 
    @MaxLength(20)
    Status?: string;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Voter Credential Methods
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingVoterCredentialMethodInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field(() => Boolean, { nullable: true })
    IsSecondFactor?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresIssuance?: boolean;

    @Field({ nullable: true })
    Configuration: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Voter Credential Methods
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingVoterCredentialMethodInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Code?: string;

    @Field({ nullable: true })
    Description?: string | null;

    @Field({ nullable: true })
    DriverClass?: string;

    @Field(() => Boolean, { nullable: true })
    IsSecondFactor?: boolean;

    @Field(() => Boolean, { nullable: true })
    RequiresIssuance?: boolean;

    @Field({ nullable: true })
    Configuration?: string | null;

    @Field({ nullable: true })
    Status?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Voter Credential Methods
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingVoterCredentialMethodViewResult {
    @Field(() => [mjBizAppsVotingVoterCredentialMethod_])
    Results: mjBizAppsVotingVoterCredentialMethod_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingVoterCredentialMethod_)
export class mjBizAppsVotingVoterCredentialMethodResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingVoterCredentialMethodViewResult)
    async RunmjBizAppsVotingVoterCredentialMethodViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingVoterCredentialMethodViewResult)
    async RunmjBizAppsVotingVoterCredentialMethodViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingVoterCredentialMethodViewResult)
    async RunmjBizAppsVotingVoterCredentialMethodDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Voter Credential Methods';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingVoterCredentialMethod_, { nullable: true })
    async mjBizAppsVotingVoterCredentialMethod(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingVoterCredentialMethod_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Voter Credential Methods', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwVoterCredentialMethods')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Voter Credential Methods', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Voter Credential Methods', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingVoterCredentialMethod_)
    async CreatemjBizAppsVotingVoterCredentialMethod(
        @Arg('input', () => CreatemjBizAppsVotingVoterCredentialMethodInput) input: CreatemjBizAppsVotingVoterCredentialMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Voter Credential Methods', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingVoterCredentialMethod_)
    async UpdatemjBizAppsVotingVoterCredentialMethod(
        @Arg('input', () => UpdatemjBizAppsVotingVoterCredentialMethodInput) input: UpdatemjBizAppsVotingVoterCredentialMethodInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Voter Credential Methods', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingVoterCredentialMethod_)
    async DeletemjBizAppsVotingVoterCredentialMethod(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Voter Credential Methods', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for MJ_BizApps_Voting: Voter Credentials
//****************************************************************************
@ObjectType({ description: "A credential issued to a voter for one sign-in method: an emailed link, a paper control number or a second-factor PIN. At most one active (unrevoked) credential per voter and method." })
export class mjBizAppsVotingVoterCredential_ {
    @Field() 
    @MaxLength(36)
    ID: string;
        
    @Field({nullable: true, description: "The roll entry the credential belongs to."}) 
    @MaxLength(36)
    EligibleVoterID?: string;
        
    @Field({nullable: true, description: "The sign-in method the credential is for."}) 
    @MaxLength(36)
    VoterCredentialMethodID?: string;
        
    @Field({nullable: true, description: "For emailed links: the single-use, election-scoped MJ magic link invite."}) 
    @MaxLength(36)
    MagicLinkInviteID?: string;
        
    @Field({nullable: true, description: "For paper and proxy ballots: hash of the control number printed on the ballot. The number itself is never stored."}) 
    @MaxLength(128)
    ControlNumberHash?: string;
        
    @Field({nullable: true, description: "For a second factor: salted hash of the PIN or other secret. The secret itself is never stored."}) 
    @MaxLength(256)
    SecretHash?: string;
        
    @Field({nullable: true, description: "When the credential was issued."}) 
    IssuedAt?: Date;
        
    @Field({nullable: true, description: "When the credential stops working, if earlier than the election close."}) 
    ExpiresAt?: Date;
        
    @Field({nullable: true, description: "When the credential was first used to start a voting session."}) 
    RedeemedAt?: Date;
        
    @Field({nullable: true, description: "When the credential was revoked; a revoked credential never works again."}) 
    RevokedAt?: Date;
        
    @Field(() => Int, {nullable: true, description: "Consecutive failed verification attempts, for durable lockout (held in the database, not process memory)."}) 
    FailedAttempts?: number;
        
    @Field({nullable: true, description: "The credential is refused until this time after too many failed attempts."}) 
    LockedUntil?: Date;
        
    @Field() 
    _mj__CreatedAt: Date;
        
    @Field() 
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    VoterCredentialMethod?: string;
        
    @Field(() => [String], { nullable: true, description: `Field-level security: when non-null, the fields on this entity the calling user may read. Any other field arriving as null was withheld by the server rather than genuinely empty. Null for callers with no field restrictions.` })
    ReadableFields___?: string[];
        
}

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Voter Credentials
//****************************************************************************
@InputType()
export class CreatemjBizAppsVotingVoterCredentialInput {
    @Field({ nullable: true })
    ID?: string;

    @Field({ nullable: true })
    EligibleVoterID?: string;

    @Field({ nullable: true })
    VoterCredentialMethodID?: string;

    @Field({ nullable: true })
    MagicLinkInviteID: string | null;

    @Field({ nullable: true })
    ControlNumberHash: string | null;

    @Field({ nullable: true })
    SecretHash: string | null;

    @Field({ nullable: true })
    IssuedAt?: Date;

    @Field({ nullable: true })
    ExpiresAt: Date | null;

    @Field({ nullable: true })
    RedeemedAt: Date | null;

    @Field({ nullable: true })
    RevokedAt: Date | null;

    @Field(() => Int, { nullable: true })
    FailedAttempts?: number;

    @Field({ nullable: true })
    LockedUntil: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for MJ_BizApps_Voting: Voter Credentials
//****************************************************************************
@InputType()
export class UpdatemjBizAppsVotingVoterCredentialInput {
    @Field()
    ID: string;

    @Field({ nullable: true })
    EligibleVoterID?: string;

    @Field({ nullable: true })
    VoterCredentialMethodID?: string;

    @Field({ nullable: true })
    MagicLinkInviteID?: string | null;

    @Field({ nullable: true })
    ControlNumberHash?: string | null;

    @Field({ nullable: true })
    SecretHash?: string | null;

    @Field({ nullable: true })
    IssuedAt?: Date;

    @Field({ nullable: true })
    ExpiresAt?: Date | null;

    @Field({ nullable: true })
    RedeemedAt?: Date | null;

    @Field({ nullable: true })
    RevokedAt?: Date | null;

    @Field(() => Int, { nullable: true })
    FailedAttempts?: number;

    @Field({ nullable: true })
    LockedUntil?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for MJ_BizApps_Voting: Voter Credentials
//****************************************************************************
@ObjectType()
export class RunmjBizAppsVotingVoterCredentialViewResult {
    @Field(() => [mjBizAppsVotingVoterCredential_])
    Results: mjBizAppsVotingVoterCredential_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(mjBizAppsVotingVoterCredential_)
export class mjBizAppsVotingVoterCredentialResolver extends ResolverBase {
    @Query(() => RunmjBizAppsVotingVoterCredentialViewResult)
    async RunmjBizAppsVotingVoterCredentialViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingVoterCredentialViewResult)
    async RunmjBizAppsVotingVoterCredentialViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunmjBizAppsVotingVoterCredentialViewResult)
    async RunmjBizAppsVotingVoterCredentialDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'MJ_BizApps_Voting: Voter Credentials';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => mjBizAppsVotingVoterCredential_, { nullable: true })
    async mjBizAppsVotingVoterCredential(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<mjBizAppsVotingVoterCredential_ | null> {
        this.CheckUserReadPermissions('MJ_BizApps_Voting: Voter Credentials', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('__mj_BizAppsVoting', 'vwVoterCredentials')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'MJ_BizApps_Voting: Voter Credentials', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('MJ_BizApps_Voting: Voter Credentials', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => mjBizAppsVotingVoterCredential_)
    async CreatemjBizAppsVotingVoterCredential(
        @Arg('input', () => CreatemjBizAppsVotingVoterCredentialInput) input: CreatemjBizAppsVotingVoterCredentialInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('MJ_BizApps_Voting: Voter Credentials', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => mjBizAppsVotingVoterCredential_)
    async UpdatemjBizAppsVotingVoterCredential(
        @Arg('input', () => UpdatemjBizAppsVotingVoterCredentialInput) input: UpdatemjBizAppsVotingVoterCredentialInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('MJ_BizApps_Voting: Voter Credentials', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => mjBizAppsVotingVoterCredential_)
    async DeletemjBizAppsVotingVoterCredential(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('MJ_BizApps_Voting: Voter Credentials', key, options, provider, userPayload, pubSub);
    }
    
}