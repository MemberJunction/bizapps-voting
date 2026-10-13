/**
 * Plumbing shared by the entity server classes: reading a parent row with the saving entity's own provider and context user,
 * resolving an election's type and driver, and refusing a write the way MJ expects (`Save()` / `Delete()` return false with
 * the reason on the result history).
 */

import {
    BaseEntity,
    BaseEntityResult,
    type EntitySaveOptions,
    LogError,
    Metadata,
    ValidationErrorInfo,
    ValidationErrorType,
    type IMetadataProvider,
    type UserInfo,
    type ValidationResult,
} from '@memberjunction/core';
import {
    type IElectionTypeConfiguration,
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingContestResultEntity,
    type mjBizAppsVotingElectionEntity,
    type mjBizAppsVotingElectionTypeEntity,
} from '@mj-biz-apps/voting-entities';
import { type BaseElectionTypeServerDriver } from './drivers/base-election-type-server-driver.js';
import { ElectionTypeDriverRegistry } from './drivers/election-type-driver-registry.js';
import { ParseConfiguration } from './entity-invariants.js';

export const ELECTIONS = 'MJ_BizApps_Voting: Elections';
export const ELECTION_TYPES = 'MJ_BizApps_Voting: Election Types';
export const CONTESTS = 'MJ_BizApps_Voting: Contests';
export const CONTEST_RESULTS = 'MJ_BizApps_Voting: Contest Results';

/** A provider's metadata face: the entity's own provider when it has one (it owns the open transaction), else the global one. */
export function MetadataProviderOf(entity: BaseEntity): IMetadataProvider {
    const candidate: Partial<IMetadataProvider> = entity.ProviderToUse;
    if (candidate && typeof candidate.GetEntityObject === 'function' && typeof candidate.EntityByName === 'function') {
        return candidate as IMetadataProvider;
    }
    return Metadata.Provider as IMetadataProvider;
}

/** A generated entity: a BaseEntity with its by-ID `Load`. */
export type LoadableEntity = BaseEntity & { Load(ID: string): Promise<boolean> };

/** Loads one row of another entity through the saving entity's provider and context user; null when it can't be read. */
export async function LoadRelated<T extends LoadableEntity>(entity: BaseEntity, entityName: string, id: string | null): Promise<T | null> {
    if (!id) return null;
    try {
        const row = await MetadataProviderOf(entity).GetEntityObject<T>(entityName, entity.ContextCurrentUser);
        return (await row.Load(id)) ? row : null;
    } catch (e) {
        LogError(`Voting: could not read ${entityName} ${id}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}

export function LoadElection(entity: BaseEntity, electionId: string | null): Promise<mjBizAppsVotingElectionEntity | null> {
    return LoadRelated<mjBizAppsVotingElectionEntity>(entity, ELECTIONS, electionId);
}

/** The election a contest belongs to. */
export async function LoadElectionOfContest(entity: BaseEntity, contestId: string | null): Promise<mjBizAppsVotingElectionEntity | null> {
    const contest = await LoadRelated<mjBizAppsVotingContestEntity>(entity, CONTESTS, contestId);
    return contest ? LoadElection(entity, contest.ElectionID) : null;
}

/** The election a contest result belongs to. */
export async function LoadElectionOfContestResult(entity: BaseEntity, contestResultId: string | null): Promise<mjBizAppsVotingElectionEntity | null> {
    const result = await LoadRelated<mjBizAppsVotingContestResultEntity>(entity, CONTEST_RESULTS, contestResultId);
    return result ? LoadElectionOfContest(entity, result.ContestID) : null;
}

/** An election's type, its parsed configuration and its driver; or the reason none of that can be had (the write is then refused). */
export type ElectionTypeResolution =
    | { kind: 'resolved'; type: mjBizAppsVotingElectionTypeEntity; typeConfig: IElectionTypeConfiguration | undefined; driver: BaseElectionTypeServerDriver }
    | { kind: 'refused'; message: string };

/**
 * Loads the election's type with the saving entity's provider and context user, parses its configuration, and resolves its
 * server driver. A type naming a driver class that isn't registered fails closed, with a message naming the class.
 */
export async function ResolveElectionType(entity: BaseEntity, electionTypeId: string): Promise<ElectionTypeResolution> {
    const type = await LoadRelated<mjBizAppsVotingElectionTypeEntity>(entity, ELECTION_TYPES, electionTypeId);
    if (!type) return { kind: 'refused', message: 'The election type could not be read.' };
    const parsed = ParseConfiguration<IElectionTypeConfiguration>(type.Configuration, `The configuration of election type "${type.Name}"`);
    if (parsed.Error) return { kind: 'refused', message: parsed.Error };
    const { driver, error } = ElectionTypeDriverRegistry.Instance.GetDriver(type);
    if (!driver) return { kind: 'refused', message: error ?? 'The election type\'s driver could not be resolved.' };
    return { kind: 'resolved', type, typeConfig: parsed.Value, driver };
}

/** The user a write acts as, or null when the entity has none. */
export function ActingUser(entity: BaseEntity): UserInfo | null {
    return entity.ContextCurrentUser ?? null;
}

/** Marks a validation result failed and adds the reason. Returns the result so a rule can `return refuse(...)`. */
export function Refuse(result: ValidationResult, field: string, message: string): ValidationResult {
    result.Success = false;
    result.Errors.push(new ValidationErrorInfo(field, message, null, ValidationErrorType.Failure));
    return result;
}

/** Records a refused delete on the entity's result history and returns false, as a delete that fails must. */
export function FailDelete(entity: BaseEntity, message: string): false {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = 'delete';
    result.Message = message;
    entity.RegisterResultHistoryEntry(result);
    return false;
}

/** Records a refused save on the entity's result history and returns false, as a save that fails must. */
export function FailSave(entity: BaseEntity, message: string): false {
    const result = new BaseEntityResult();
    result.Success = false;
    result.Type = entity.IsSaved ? 'update' : 'create';
    result.Message = message;
    entity.RegisterResultHistoryEntry(result);
    return false;
}

/** Save options with async validation forced on, so no caller can skip an invariant by passing `SkipAsyncValidation: true`. */
export function WithValidation(options: EntitySaveOptions | undefined): EntitySaveOptions {
    return { ...options, SkipAsyncValidation: false };
}

/**
 * The ids a write to a child row must be judged against in its parent column: the current value, and, when a saved row is
 * being moved to another parent, the value it held before, since leaving a locked parent is a change to it too.
 */
export function ParentIdsOf(entity: BaseEntity, fieldName: string): string[] {
    const field = entity.GetFieldByName(fieldName);
    if (!field) return [];
    const ids: string[] = [];
    if (typeof field.Value === 'string' && field.Value) ids.push(field.Value);
    if (entity.IsSaved && field.Dirty && typeof field.OldValue === 'string' && field.OldValue) ids.push(field.OldValue);
    return ids;
}
