/**
 * Small lookups shared by the WP5c engines: the bizapps-common Person behind an MJ user, a Person's display name, and the
 * context handed to election-type drivers when results are tallied or certified.
 */

import { type BaseEntity } from '@memberjunction/core';
import {
    type mjBizAppsVotingElectionAnchorEntity,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingElectionTypeEntity,
} from '@mj-biz-apps/voting-entities';
import { type ContestResultSummary, type ElectionResultsContext } from '@mj-biz-apps/voting-core-entities-server';
import { type ElectionGraph } from '../shared/election-graph.js';
import { type VotingContext, BeginTransaction, RunViewOf } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';

const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
const ANCHORS_ENTITY = 'MJ_BizApps_Voting: Election Anchors';
const CONTEST_RESULTS_ENTITY = 'MJ_BizApps_Voting: Contest Results';
const ELECTIONS_ENTITY = 'MJ_BizApps_Voting: Elections';

/** Saves an entity or throws with the entity's own reason (so a surrounding transaction rolls back). Messages carry no ballot content. */
export async function SaveOrThrow(entity: BaseEntity, what: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`${what} could not be saved: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** An election entity object, or null when it does not exist. */
export async function LoadElectionEntity(electionID: string, ctx: VotingContext): Promise<mjBizAppsVotingElectionEntity | null> {
    const election = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionEntity>(ELECTIONS_ENTITY, ctx.ContextUser);
    return (await election.Load(electionID)) ? election : null;
}

/** Message of a caught value. */
export function ErrorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export interface PersonRef {
    ID: string;
    DisplayName: string;
}

/**
 * The Person linked to the acting user (LinkedUserID first, then email). Null when none.
 * `caller` supplies the claims (user id, email); `reader` runs the lookups (defaults to the caller itself). Voter-facing
 * operations pass the system context as `reader`: a member holds no permission on the roll or trustee tables.
 */
export async function FindPersonForUser(caller: VotingContext, reader: VotingContext = caller): Promise<PersonRef | null> {
    const user = caller.ContextUser;
    const rv = RunViewOf(reader);
    if (user.ID) {
        const linked = await rv.RunView<PersonRef>(
            { EntityName: PEOPLE_ENTITY, ExtraFilter: `LinkedUserID = ${SqlLiteral(user.ID)}`, Fields: ['ID', 'DisplayName'], MaxRows: 1, ResultType: 'simple' },
            reader.ContextUser
        );
        if (linked.Success && linked.Results[0]) return linked.Results[0];
    }
    const email = user.Email?.trim();
    if (!email) return null;
    const byEmail = await rv.RunView<PersonRef>(
        { EntityName: PEOPLE_ENTITY, ExtraFilter: `LOWER(Email) = ${SqlLiteral(email.toLowerCase())}`, Fields: ['ID', 'DisplayName'], MaxRows: 1, ResultType: 'simple' },
        reader.ContextUser
    );
    return byEmail.Success && byEmail.Results[0] ? byEmail.Results[0] : null;
}

/** A Person by ID. Null when not found. */
export async function GetPerson(personID: string, ctx: VotingContext): Promise<PersonRef | null> {
    const res = await RunViewOf(ctx).RunView<PersonRef>(
        { EntityName: PEOPLE_ENTITY, ExtraFilter: `ID = ${SqlLiteral(personID)}`, Fields: ['ID', 'DisplayName'], MaxRows: 1, ResultType: 'simple' },
        ctx.ContextUser
    );
    return res.Success && res.Results[0] ? res.Results[0] : null;
}

/** The final ContestResult rows of an election's contests. */
export interface FinalContestResultRow {
    ID: string;
    ContestID: string;
    Outcome: ContestResultSummary['Outcome'] | 'NoQuorum';
}

export async function LoadFinalContestResults(contestIDs: readonly string[], ctx: VotingContext): Promise<FinalContestResultRow[]> {
    if (contestIDs.length === 0) return [];
    const res = await RunViewOf(ctx).RunView<FinalContestResultRow>(
        {
            EntityName: CONTEST_RESULTS_ENTITY,
            ExtraFilter: `IsFinal = 1 AND ContestID IN (${contestIDs.map(SqlLiteral).join(',')})`,
            Fields: ['ID', 'ContestID', 'Outcome'],
            ResultType: 'simple',
        },
        ctx.ContextUser
    );
    return res.Success ? res.Results : [];
}

/**
 * The context a driver's OnResultsTallied / OnResultsCertified hook receives. A NoQuorum contest is summarized as 'Void'
 * (the driver contract has no NoQuorum value; the stored result keeps the real outcome).
 *
 * @param finals The final results when the caller already holds them. The tally passes the rows it has just written, inside
 *   its own transaction: re-reading Contest Results there scans rows another election's concurrent tally has inserted
 *   but not committed, while that tally does the same to ours, and SQL Server picks one as a deadlock victim.
 */
export async function BuildResultsContext(
    graph: ElectionGraph,
    ctx: VotingContext,
    finals?: ReadonlyArray<Pick<FinalContestResultRow, 'ContestID' | 'Outcome'>>
): Promise<ElectionResultsContext> {
    const anchors = await RunViewOf(ctx).RunView<mjBizAppsVotingElectionAnchorEntity>(
        {
            EntityName: ANCHORS_ENTITY,
            ExtraFilter: `ElectionID = ${SqlLiteral(graph.Election.ID)} AND IsPrimary = 1`,
            MaxRows: 1,
            ResultType: 'entity_object',
        },
        ctx.ContextUser
    );
    const anchor = anchors.Success ? anchors.Results[0] : undefined;
    const entityName = anchor ? ctx.Provider.EntityByID(anchor.EntityID)?.Name : undefined;
    const known = finals ?? (await LoadFinalContestResults(graph.Contests.map((c) => c.ID), ctx));
    const results: ContestResultSummary[] = [];
    for (const contest of graph.Contests) {
        const final = known.find((f) => f.ContestID.toLowerCase() === contest.ID.toLowerCase());
        if (!final) continue;
        results.push({ ContestID: contest.ID, ContestName: contest.Name, Outcome: final.Outcome === 'NoQuorum' ? 'Void' : final.Outcome });
    }
    const type: mjBizAppsVotingElectionTypeEntity = graph.ElectionType;
    return {
        ContextUser: ctx.ContextUser,
        Provider: ctx.Provider,
        Election: graph.Election,
        ElectionType: type,
        Configuration: graph.Configuration,
        PrimaryAnchor: anchor && entityName ? { EntityName: entityName, RecordID: anchor.RecordID } : null,
        Results: results,
    };
}

/**
 * Runs `work` in one entity transaction on the context's provider: commit on success, roll back and rethrow on error.
 * Throws when the provider cannot transact (the operation is refused rather than written non-atomically).
 */
export async function RunTransactional<T>(ctx: VotingContext, work: () => Promise<T>): Promise<T> {
    const scope = await BeginTransaction(ctx);
    if (!scope) throw new Error('This provider does not support transactions.');
    try {
        const result = await work();
        await scope.Commit();
        return result;
    } catch (e) {
        await scope.Rollback();
        throw e;
    }
}
