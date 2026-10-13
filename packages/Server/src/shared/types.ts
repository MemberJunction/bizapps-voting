/**
 * Shared engine vocabulary: the per-call context and the result envelope every engine returns.
 */

import { type EntityTransactionScope, type IMetadataProvider, type IRunViewProvider, RunView, type UserInfo } from '@memberjunction/core';

/**
 * The caller an action is attributed to when it runs as the system principal on that caller's behalf (a voter operation
 * authorizes the caller, then acts as the system user). Audit attribution only: it never reaches an entity save except the
 * audit row, and never a ballot-box row.
 */
export interface VotingActor {
    /** The MJ user who called. Absent for a guest ballot session, whose principal is not a stored user. */
    UserID?: string;
    /** For a guest ballot session: the roll entry its signed scope is bound to. */
    GuestEligibleVoterID?: string;
}

/** Who is acting and through which provider. Engines never reach for a global provider. */
export interface VotingContext {
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    /** Set only on a system-principal context opened for an authorized caller (`SystemContext`). */
    Actor?: VotingActor;
}

/** A success value, or a stable machine-readable code plus a human message. Messages never carry ballot content. */
export type EngineResult<T> = { Success: true; Value: T } | { Success: false; Code: string; ErrorMessage: string };

export function Ok<T>(value: T): EngineResult<T> {
    return { Success: true, Value: value };
}

export function Fail<T>(code: string, message: string): EngineResult<T> {
    return { Success: false, Code: code, ErrorMessage: message };
}

function isRunViewProvider(p: IMetadataProvider): p is IMetadataProvider & IRunViewProvider {
    return typeof (p as Partial<IRunViewProvider>).RunView === 'function';
}

/** A RunView bound to the context's provider (server providers implement both faces). */
export function RunViewOf(ctx: VotingContext): RunView {
    return isRunViewProvider(ctx.Provider) ? new RunView(ctx.Provider) : new RunView();
}

/** The failure arm of an EngineResult. */
export type EngineFailure = { Success: false; Code: string; ErrorMessage: string };

/** Narrowing guard. (`!result.Success` does not narrow under this repo's non-strict tsconfig; use this.) */
export function IsFailure<T>(result: EngineResult<T>): result is EngineFailure {
    return result.Success === false;
}

/** Re-wraps a failure for another result type. */
export function PassFailure<T>(failure: EngineFailure): EngineResult<T> {
    return Fail<T>(failure.Code, failure.ErrorMessage);
}

interface TransactionalProvider {
    BeginEntityTransaction(): Promise<EntityTransactionScope>;
}

function isTransactional(p: IMetadataProvider): p is IMetadataProvider & TransactionalProvider {
    return typeof (p as Partial<TransactionalProvider>).BeginEntityTransaction === 'function';
}

/**
 * Opens (or joins) an entity transaction on the context's provider. Returns null when the provider cannot
 * (a client-tier provider); callers then refuse the operation rather than write non-atomically.
 */
export async function BeginTransaction(ctx: VotingContext): Promise<EntityTransactionScope | null> {
    return isTransactional(ctx.Provider) ? ctx.Provider.BeginEntityTransaction() : null;
}
