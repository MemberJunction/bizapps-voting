/**
 * Pure roll helpers: normalization, de-duplication and the deterministic roll hash.
 * No MJ imports beyond the contracts, so they are unit-testable without a database.
 */

import { CanonicalJSON, Sha256Hex } from '@mj-biz-apps/voting-entities';
import { type RollEntry } from './roll-types.js';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the text looks like a UUID. */
export function LooksLikeUUID(text: string): boolean {
    return UUID_SHAPE.test(text.trim());
}

/** Weights are stored as DECIMAL(18,6); rounding here keeps the hash identical to what the table holds. */
export function NormalizeWeight(weight: number): number {
    return Math.round(weight * 1e6) / 1e6;
}

/** The identity of a roll entry: one person per represented organization. */
export function RollEntryKey(entry: Pick<RollEntry, 'PersonID' | 'RepresentingOrganizationID'>): string {
    return `${entry.PersonID.trim().toLowerCase()}|${(entry.RepresentingOrganizationID ?? '').trim().toLowerCase()}`;
}

/** Lower-cases IDs, trims text, rounds the weight and nulls empty optionals. */
export function NormalizeRollEntry(entry: RollEntry): RollEntry {
    return {
        PersonID: entry.PersonID.trim().toLowerCase(),
        RepresentingOrganizationID: entry.RepresentingOrganizationID?.trim() ? entry.RepresentingOrganizationID.trim().toLowerCase() : null,
        VotingClass: entry.VotingClass?.trim() ? entry.VotingClass.trim() : null,
        Weight: NormalizeWeight(entry.Weight),
        SourceKey: entry.SourceKey?.trim() ? entry.SourceKey.trim() : null,
    };
}

/**
 * Collapses duplicates (same Person and RepresentingOrganization) and drops entries whose weight is not above zero.
 * The first occurrence wins, so a source controls precedence by ordering its rows.
 */
export function DedupeRoll(entries: ReadonlyArray<RollEntry>): { Entries: RollEntry[]; Duplicates: number; Dropped: number } {
    const seen = new Set<string>();
    const kept: RollEntry[] = [];
    let duplicates = 0;
    let dropped = 0;
    for (const raw of entries) {
        const entry = NormalizeRollEntry(raw);
        if (!(entry.Weight > 0) || !entry.PersonID) {
            dropped++;
            continue;
        }
        const key = RollEntryKey(entry);
        if (seen.has(key)) {
            duplicates++;
            continue;
        }
        seen.add(key);
        kept.push(entry);
    }
    return { Entries: kept, Duplicates: duplicates, Dropped: dropped };
}

/** Total order used for the hash: person, then organization. */
export function CompareRollEntries(a: RollEntry, b: RollEntry): number {
    const ka = RollEntryKey(a);
    const kb = RollEntryKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * The roll hash: SHA-256 over the canonical JSON of the sorted [{PersonID, RepresentingOrganizationID, VotingClass, Weight}].
 * SourceKey is deliberately not part of it (it is a lookup aid, not part of who may vote and how much).
 * The same set of voters always hashes the same, whatever order the source returned them in.
 */
export function ComputeRollHash(entries: ReadonlyArray<RollEntry>): string {
    const rows = entries
        .map(NormalizeRollEntry)
        .sort(CompareRollEntries)
        .map((e) => ({
            PersonID: e.PersonID,
            RepresentingOrganizationID: e.RepresentingOrganizationID,
            VotingClass: e.VotingClass,
            Weight: e.Weight,
        }));
    return Sha256Hex(CanonicalJSON(rows));
}
