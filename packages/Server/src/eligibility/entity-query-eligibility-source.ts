/**
 * EntityQueryEligibilitySource: builds the roll from any MJ entity (membership roster, employee list, owner register...).
 */

import { RegisterClass } from '@memberjunction/global';
import { type VotingContext, RunViewOf } from '../shared/index.js';
import { BaseEligibilitySource } from './base-eligibility-source.js';
import { AsTrimmedString, type JsonObject } from './json-settings.js';
import { type RollBuildReport, type RollEntry, type UnmatchedRow } from './roll-types.js';

/** The typed form of the entity-query settings. */
export interface EntityQuerySettings {
    EntityName: string;
    ExtraFilter: string | null;
    PersonIDField: string;
    VotingClassField: string | null;
    WeightField: string | null;
    SourceKeyField: string | null;
    RepresentingOrganizationIDField: string | null;
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Maps the loose settings JSON to typed settings. Throws a message naming the problem when it cannot be used. */
export function ParseEntityQuerySettings(raw: JsonObject): EntityQuerySettings {
    const entityName = AsTrimmedString(raw.EntityName);
    if (!entityName) throw new Error('Entity Query eligibility settings need an EntityName.');
    const settings: EntityQuerySettings = {
        EntityName: entityName,
        ExtraFilter: AsTrimmedString(raw.ExtraFilter),
        PersonIDField: AsTrimmedString(raw.PersonIDField) ?? 'PersonID',
        VotingClassField: AsTrimmedString(raw.VotingClassField),
        WeightField: AsTrimmedString(raw.WeightField),
        SourceKeyField: AsTrimmedString(raw.SourceKeyField),
        RepresentingOrganizationIDField: AsTrimmedString(raw.RepresentingOrganizationIDField),
    };
    for (const field of FieldsOf(settings)) {
        if (!FIELD_NAME.test(field)) throw new Error(`"${field}" is not a valid field name for Entity Query eligibility settings.`);
    }
    return settings;
}

/** The distinct fields the query must return. */
export function FieldsOf(settings: EntityQuerySettings): string[] {
    const fields = [
        settings.PersonIDField,
        settings.VotingClassField,
        settings.WeightField,
        settings.SourceKeyField,
        settings.RepresentingOrganizationIDField,
    ].filter((f): f is string => !!f);
    return Array.from(new Set(fields));
}

/** `{RecordDate}` in the filter becomes the record date as an ISO string literal, so a filter can ask "as of the record date". */
export function ApplyRecordDate(filter: string | null, recordDate: Date): string | null {
    if (!filter) return null;
    return filter.replace(/\{RecordDate\}/g, `'${recordDate.toISOString()}'`);
}

function textOf(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return AsTrimmedString(typeof value === 'object' ? String(value) : value);
}

/** Maps one source row to a roll entry, or a reason it cannot be used. */
export function MapEntityRow(row: Record<string, unknown>, settings: EntityQuerySettings): { Entry: RollEntry } | { Reason: string } {
    const personID = textOf(row[settings.PersonIDField]);
    if (!personID) return { Reason: `Missing ${settings.PersonIDField}` };
    let weight = 1;
    if (settings.WeightField) {
        const raw = row[settings.WeightField];
        if (raw !== null && raw !== undefined && raw !== '') {
            weight = typeof raw === 'number' ? raw : Number(raw);
        }
    }
    if (!Number.isFinite(weight) || weight <= 0) return { Reason: 'Weight is not greater than zero' };
    return {
        Entry: {
            PersonID: personID,
            RepresentingOrganizationID: settings.RepresentingOrganizationIDField ? textOf(row[settings.RepresentingOrganizationIDField]) : null,
            VotingClass: settings.VotingClassField ? textOf(row[settings.VotingClassField]) : null,
            Weight: weight,
            SourceKey: settings.SourceKeyField ? textOf(row[settings.SourceKeyField]) : null,
        },
    };
}

@RegisterClass(BaseEligibilitySource, 'EntityQueryEligibilitySource')
export class EntityQueryEligibilitySource extends BaseEligibilitySource {
    public async BuildRollReport(settingsJson: JsonObject, recordDate: Date, ctx: VotingContext): Promise<RollBuildReport> {
        const settings = ParseEntityQuerySettings(settingsJson);
        const rv = RunViewOf(ctx);
        const result = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: settings.EntityName,
                ExtraFilter: ApplyRecordDate(settings.ExtraFilter, recordDate) ?? '',
                Fields: FieldsOf(settings),
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!result.Success) throw new Error(`Reading "${settings.EntityName}" for the voter roll failed: ${result.ErrorMessage}`);
        const entries: RollEntry[] = [];
        const unmatched: UnmatchedRow[] = [];
        result.Results.forEach((row, index) => {
            const mapped = MapEntityRow(row, settings);
            if ('Entry' in mapped) entries.push(mapped.Entry);
            else unmatched.push({ Row: index + 1, Reason: mapped.Reason });
        });
        return { Entries: entries, Unmatched: unmatched };
    }
}
