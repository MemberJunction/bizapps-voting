/**
 * Decision logic for the voting entity server classes (design §5, Invariants).
 *
 * Everything here is pure: it takes plain values and returns a verdict, so each rule is unit tested without a database.
 * The state machine and the lock rule are NOT re-implemented here; they come from the contracts in
 * `@mj-biz-apps/voting-entities` (`CanTransition`, `IsConfigurationLocked`, `ALLOWED_TRANSITIONS`).
 * The one place that touches an entity is the small group of typed field readers at the bottom, which take a `BaseEntity`.
 */

import { type BaseEntity } from '@memberjunction/core';
import {
    IsConfigurationLocked,
    ResolveElectionConfiguration,
    VOTING_APP_DEFAULTS,
    type ElectionStatus,
    type IElectionConfiguration,
    type IElectionTypeConfiguration,
    type ResolvedElectionConfiguration,
} from '@mj-biz-apps/voting-entities';
import { type ElectionChangeAction } from './drivers/base-election-type-server-driver.js';

/** A field and the reason a write to it is refused. */
export interface RuleViolation {
    Field: string;
    Message: string;
}

/** True for the `__mj_` columns MJ maintains itself; no rule judges them. */
export function IsSystemField(name: string): boolean {
    return name.startsWith('__mj_');
}

// === Election ===

/** Fields that may change once an election's configuration is locked (Open and later). */
export function GetAllowedLockedFieldChanges(): Set<string> {
    return new Set(['Status', 'ChallengeWindowEndsAt', 'RollHash', 'RollFrozenAt', 'ElectionPublicKey']);
}

/**
 * The names among `changedFieldNames` that may not change while the election sits in `status`.
 * - Nothing is judged while the configuration is unlocked.
 * - Once locked, only Status, ChallengeWindowEndsAt, RollHash and RollFrozenAt may change; RollHash and RollFrozenAt only
 *   when they were null before (`oldValues`; a field missing from `oldValues` counts as previously null).
 * - ElectionPublicKey may change only before Open, so in any locked status it is a violation.
 */
export function ComputeLockedFieldViolations(status: string, changedFieldNames: string[], oldValues: Record<string, unknown> = {}): string[] {
    if (!IsConfigurationLocked(status as ElectionStatus)) return [];
    const allowed = GetAllowedLockedFieldChanges();
    const violations: string[] = [];
    for (const name of changedFieldNames) {
        if (IsSystemField(name)) continue;
        if (!allowed.has(name) || name === 'ElectionPublicKey') {
            violations.push(name);
        } else if ((name === 'RollHash' || name === 'RollFrozenAt') && oldValues[name] != null) {
            violations.push(name);
        }
    }
    return violations;
}

/**
 * What an election save is, for the type's driver: a create; a change of Status to Open / Closed / Cancelled / Tallied /
 * Certified; anything else an update. A status that did not change (including a re-tally that leaves Tallied as Tallied) is an update.
 */
export function DeriveElectionChangeAction(oldStatus: ElectionStatus | null, newStatus: ElectionStatus, isNew: boolean): ElectionChangeAction {
    if (isNew) return 'Create';
    if (oldStatus === newStatus) return 'Update';
    switch (newStatus) {
        case 'Open':
            return 'Open';
        case 'Closed':
            return 'Close';
        case 'Cancelled':
            return 'Cancel';
        case 'Tallied':
            return 'Tally';
        case 'Certified':
            return 'Certify';
        default:
            return 'Update';
    }
}

/** The election columns SQL reads, which win over the same keys in the configuration JSON. */
export interface ElectionConfigurationColumns {
    SecrecyMode: ResolvedElectionConfiguration['SecrecyMode'];
    AssuranceTier: ResolvedElectionConfiguration['AssuranceTier'];
    ResultsTiming: ResolvedElectionConfiguration['ResultsTiming'];
    ResultsAudience: ResolvedElectionConfiguration['ResultsAudience'];
    ResultsMinCast: number;
    AllowRevote: boolean;
    WeightClassMinSize: number;
}

/**
 * The configuration to validate for an election: app defaults, then the type, then the election's overrides
 * (`ResolveElectionConfiguration`), then the election's own columns, which are what SQL and the engines actually read.
 */
export function BuildConfigurationToValidate(
    typeConfig: IElectionTypeConfiguration | undefined,
    electionConfig: IElectionConfiguration | undefined,
    columns: ElectionConfigurationColumns
): ResolvedElectionConfiguration {
    const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig, electionConfig);
    return { ...resolved, ...columns };
}

/** A configuration column parsed from JSON: the object, or the reason the text is not a JSON object. */
export interface ParsedConfiguration<T> {
    Value: T | undefined;
    Error: string | null;
}

/** Parses a Configuration column. Blank is "none"; text that is not a JSON object is an error (fail closed, never loosen). */
export function ParseConfiguration<T extends object>(raw: string | null | undefined, label: string): ParsedConfiguration<T> {
    if (raw == null || raw.trim() === '') return { Value: undefined, Error: null };
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { Value: undefined, Error: `${label} must be a JSON object.` };
        }
        return { Value: parsed as T, Error: null };
    } catch (e) {
        return { Value: undefined, Error: `${label} is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
}

// === Parents of election children ===

/**
 * The refusal for a write to something that belongs to an election (contests, options, anchors) while the election's
 * configuration is locked; null when the election is not locked. `what` names the thing, `verb` the write.
 */
export function DescribeConfigurationLockRefusal(status: ElectionStatus, what: string, verb: 'create' | 'change' | 'delete'): string | null {
    if (!IsConfigurationLocked(status)) return null;
    return `Cannot ${verb} ${what}: the election is ${status} and its configuration is locked.`;
}

// === Voter roll ===

/**
 * Rules for an EligibleVoter write once the election's roll is frozen (`RollFrozenAt` set):
 * a new row must be flagged AddedAfterFreeze; an existing row may change only Status and StatusReason.
 * Before the freeze nothing is judged here.
 */
export function ComputeVoterRollViolations(rollFrozen: boolean, isNew: boolean, addedAfterFreeze: boolean, dirtyFields: string[]): RuleViolation[] {
    if (!rollFrozen) return [];
    if (isNew) {
        return addedAfterFreeze ? [] : [{ Field: 'AddedAfterFreeze', Message: 'The voter roll is frozen: a voter added now must be marked AddedAfterFreeze.' }];
    }
    const allowed = new Set(['Status', 'StatusReason']);
    return dirtyFields
        .filter((f) => !IsSystemField(f) && !allowed.has(f))
        .map((f) => ({ Field: f, Message: 'The voter roll is frozen: only Status and StatusReason of a voter may change.' }));
}

/** The refusal for deleting a voter from a frozen roll; null before the freeze. */
export function DescribeVoterDeleteRefusal(rollFrozen: boolean): string | null {
    return rollFrozen ? 'The voter roll is frozen: voters cannot be deleted; change their Status instead.' : null;
}

// === Ballot box ===

/**
 * Rules for an update to a saved CastBallot: only Status may change, and only from Counted to Superseded or Spoiled.
 * (The caller separately requires the ballot-box guard.) A save with no dirty fields has no violations.
 */
export function ComputeCastBallotUpdateViolations(dirtyFields: string[], oldStatus: string | null, newStatus: string | null): RuleViolation[] {
    const changed = dirtyFields.filter((f) => !IsSystemField(f));
    const violations: RuleViolation[] = changed
        .filter((f) => f !== 'Status')
        .map((f) => ({ Field: f, Message: 'A cast ballot cannot be modified; only its Status may change.' }));
    if (changed.includes('Status')) {
        const ok = oldStatus === 'Counted' && (newStatus === 'Superseded' || newStatus === 'Spoiled');
        if (!ok) {
            violations.push({ Field: 'Status', Message: `A cast ballot's Status may change only from Counted to Superseded or Spoiled, not from ${oldStatus ?? 'unknown'} to ${newStatus ?? 'unknown'}.` });
        }
    }
    return violations;
}

// === Results ===

/** The refusal for writing a ContestResult or ContestOptionResult: needs the tally guard and a Closed or Tallied election. */
export function DescribeResultWriteRefusal(hasTallyAccess: boolean, electionStatus: ElectionStatus | null): string | null {
    if (!hasTallyAccess) return 'Results may only be written by the tally engine.';
    if (electionStatus !== 'Closed' && electionStatus !== 'Tallied') {
        return `Results may only be written once the election is Closed or Tallied; it is ${electionStatus ?? 'unknown'}.`;
    }
    return null;
}

// === Typed field readers (BaseEntity) ===

/** Names of the fields changed in this save, system columns left out. */
export function GetDirtyFieldNames(entity: BaseEntity): string[] {
    return entity.Fields.filter((f) => f.Dirty && !IsSystemField(f.Name)).map((f) => f.Name);
}

/** What each changed field held before this save, by name. System columns are left out. */
export function GetDirtyOldValues(entity: BaseEntity): Record<string, unknown> {
    const old: Record<string, unknown> = {};
    for (const f of entity.Fields) {
        if (f.Dirty && !IsSystemField(f.Name)) old[f.Name] = f.OldValue;
    }
    return old;
}

/** The value a field held before this save, or null when it has no field of that name or was empty. */
export function GetOldFieldValue(entity: BaseEntity, fieldName: string): unknown {
    return entity.GetFieldByName(fieldName)?.OldValue ?? null;
}

/** The current value of a field, or null when it has no field of that name or is empty. */
export function GetFieldValue(entity: BaseEntity, fieldName: string): unknown {
    return entity.GetFieldByName(fieldName)?.Value ?? null;
}

/** True when the named field has been changed since it was loaded or saved. */
export function IsFieldDirty(entity: BaseEntity, fieldName: string): boolean {
    return entity.GetFieldByName(fieldName)?.Dirty === true;
}

/** A value read through the untyped field API as a string, or null when it is not one. */
export function AsString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}
