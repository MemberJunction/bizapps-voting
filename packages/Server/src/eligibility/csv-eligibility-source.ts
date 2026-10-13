/**
 * CsvEligibilitySource: builds the roll from CSV with the columns Email, SourceKey, VotingClass, Weight, RepresentingOrganization.
 * Settings carry the rows inline (`Rows`, objects with those keys in any letter case) or as `CsvText`.
 * People are matched by Email against bizapps-common People; unmatched rows are reported, never created.
 * `FileID` (an uploaded file) is not read by this driver: load the file's text into `CsvText` upstream.
 */

import { RegisterClass } from '@memberjunction/global';
import { type VotingContext, SqlLiteral, RunViewOf } from '../shared/index.js';
import { BaseEligibilitySource } from './base-eligibility-source.js';
import { ParseCsvRecords } from './csv-parse.js';
import { AsTrimmedString, type JsonObject } from './json-settings.js';
import { LooksLikeUUID } from './roll-utils.js';
import { type RollBuildReport, type RollEntry, type UnmatchedRow } from './roll-types.js';

const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';
const ORGANIZATIONS_ENTITY = 'MJ_BizApps_Common: Organizations';
const LOOKUP_CHUNK = 100;

/** One CSV row, keys lower-cased. */
export type CsvRow = Record<string, string>;

/** Lower-cases keys and stringifies values of inline rows so they look like parsed CSV. */
export function NormalizeInlineRows(rows: ReadonlyArray<unknown>): CsvRow[] {
    return rows.map((raw) => {
        const out: CsvRow = {};
        if (raw !== null && typeof raw === 'object') {
            for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
                out[key.trim().toLowerCase()] = value === null || value === undefined ? '' : String(value).trim();
            }
        }
        return out;
    });
}

/** The rows a settings object carries: inline `Rows` first, else `CsvText`. Throws when it carries neither. */
export function RowsFromSettings(settings: JsonObject): CsvRow[] {
    if (Array.isArray(settings.Rows) && settings.Rows.length > 0) return NormalizeInlineRows(settings.Rows);
    const text = AsTrimmedString(settings.CsvText);
    if (text) return ParseCsvRecords(text);
    if (AsTrimmedString(settings.FileID)) {
        throw new Error('The CSV eligibility source does not read uploaded files; supply the rows as Rows or CsvText.');
    }
    throw new Error('The CSV eligibility source needs Rows or CsvText.');
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

@RegisterClass(BaseEligibilitySource, 'CsvEligibilitySource')
export class CsvEligibilitySource extends BaseEligibilitySource {
    public async BuildRollReport(settings: JsonObject, _recordDate: Date, ctx: VotingContext): Promise<RollBuildReport> {
        const rows = RowsFromSettings(settings);
        const emails = Array.from(new Set(rows.map((r) => (r.email ?? '').toLowerCase()).filter((e) => e.length > 0)));
        const personByEmail = await this.LookupPeople(emails, ctx);
        const orgNames = Array.from(new Set(rows.map((r) => r.representingorganization ?? '').filter((o) => o && !LooksLikeUUID(o))));
        const orgByName = await this.LookupOrganizations(orgNames, ctx);

        const entries: RollEntry[] = [];
        const unmatched: UnmatchedRow[] = [];
        rows.forEach((row, index) => {
            const rowNumber = index + 1;
            const email = (row.email ?? '').toLowerCase();
            if (!email) {
                unmatched.push({ Row: rowNumber, Reason: 'Missing Email' });
                return;
            }
            const people = personByEmail.get(email);
            if (!people || people.length === 0) {
                unmatched.push({ Row: rowNumber, Reason: 'No person with this email' });
                return;
            }
            if (people.length > 1) {
                unmatched.push({ Row: rowNumber, Reason: 'More than one person has this email' });
                return;
            }
            let weight = 1;
            if (row.weight) {
                weight = Number(row.weight);
                if (!Number.isFinite(weight) || weight <= 0) {
                    unmatched.push({ Row: rowNumber, Reason: 'Weight is not greater than zero' });
                    return;
                }
            }
            let organizationID: string | null = null;
            const org = row.representingorganization ?? '';
            if (org) {
                if (LooksLikeUUID(org)) {
                    organizationID = org;
                } else {
                    const matches = orgByName.get(org.toLowerCase()) ?? [];
                    if (matches.length !== 1) {
                        unmatched.push({ Row: rowNumber, Reason: matches.length === 0 ? 'Unknown organization' : 'More than one organization has this name' });
                        return;
                    }
                    organizationID = matches[0];
                }
            }
            entries.push({
                PersonID: people[0],
                RepresentingOrganizationID: organizationID,
                VotingClass: row.votingclass ? row.votingclass : null,
                Weight: weight,
                SourceKey: row.sourcekey ? row.sourcekey : null,
            });
        });
        return { Entries: entries, Unmatched: unmatched };
    }

    private async LookupPeople(emails: string[], ctx: VotingContext): Promise<Map<string, string[]>> {
        const map = new Map<string, string[]>();
        const rv = RunViewOf(ctx);
        for (const group of chunk(emails, LOOKUP_CHUNK)) {
            const result = await rv.RunView<{ ID: string; Email: string | null }>(
                {
                    EntityName: PEOPLE_ENTITY,
                    ExtraFilter: `LOWER(Email) IN (${group.map(SqlLiteral).join(', ')})`,
                    Fields: ['ID', 'Email'],
                    ResultType: 'simple',
                },
                ctx.ContextUser
            );
            if (!result.Success) throw new Error(`Looking up people for the CSV roll failed: ${result.ErrorMessage}`);
            for (const person of result.Results) {
                const key = (person.Email ?? '').toLowerCase();
                const list = map.get(key) ?? [];
                list.push(person.ID);
                map.set(key, list);
            }
        }
        return map;
    }

    private async LookupOrganizations(names: string[], ctx: VotingContext): Promise<Map<string, string[]>> {
        const map = new Map<string, string[]>();
        const rv = RunViewOf(ctx);
        for (const group of chunk(names, LOOKUP_CHUNK)) {
            const result = await rv.RunView<{ ID: string; Name: string }>(
                {
                    EntityName: ORGANIZATIONS_ENTITY,
                    ExtraFilter: `LOWER(Name) IN (${group.map((n) => SqlLiteral(n.toLowerCase())).join(', ')})`,
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                },
                ctx.ContextUser
            );
            if (!result.Success) throw new Error(`Looking up organizations for the CSV roll failed: ${result.ErrorMessage}`);
            for (const org of result.Results) {
                const key = org.Name.toLowerCase();
                const list = map.get(key) ?? [];
                list.push(org.ID);
                map.set(key, list);
            }
        }
        return map;
    }
}
