/**
 * The voting WORLD: a deterministic, committed catalog of the electorate and the elections the wire tier runs against.
 *
 *   data/organizations.csv   an association with four member bodies (parent/child organizations)
 *   data/people.csv          48 people, voting classes and weights, `wNN@voting-world.test`
 *   data/elections.json      one Draft election per (type x tally method x secrecy x tier x timing x audience x quorum) combination
 *
 * Loading goes through entity Saves and Remote Operations over the wire (no SQL), keyed by natural keys (Organization
 * Name, Person Email, Relationship triple, Election Name), so a rerun changes nothing.
 *
 * CLIENT-SAFE (node:fs only). The CSV reader has no quoted-comma support: these files are authored, not exported.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VotingContestSpec } from '@mj-biz-apps/voting-entities';
import { VotingCreateElectionOperation, VotingFreezeRollOperation } from '@mj-biz-apps/voting-entities';
import type {
    mjBizAppsCommonOrganizationEntity,
    mjBizAppsCommonPersonEntity,
    mjBizAppsCommonRelationshipEntity,
} from '@mj-biz-apps/common-entities';
import { Ok } from '../wire/wire-kit.js';
import type { WireVoterSpec } from '../wire/wire-kit.js';
import type { PersonaKey } from '../wire/persona-model.js';
import type { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const PEOPLE = 'MJ_BizApps_Common: People';
const ORGANIZATIONS = 'MJ_BizApps_Common: Organizations';
const ORGANIZATION_TYPES = 'MJ_BizApps_Common: Organization Types';
const RELATIONSHIPS = 'MJ_BizApps_Common: Relationships';
const RELATIONSHIP_TYPES = 'MJ_BizApps_Common: Relationship Types';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';

export const WORLD_EMAIL_DOMAIN = 'voting-world.test';
export const WORLD_ELECTION_PREFIX = 'World: ';
export const WORLD_ROOT_ORGANIZATION = 'Voting World Association';

export interface WorldPerson {
    Key: string;
    FirstName: string;
    LastName: string;
    Email: string;
    Organization: string;
    VotingClass: string;
    Weight: number;
}

export interface WorldOrganization {
    Name: string;
    Parent: string;
    OrganizationType: string;
}

export type WorldRollGroup = 'all' | 'individual' | 'corporate' | 'students' | 'personas';

export interface WorldElectionDef {
    Key: string;
    Name: string;
    Type: string;
    Secrecy: 'Open' | 'Confidential' | 'Secret';
    Tier: 'Standard' | 'HighAssurance' | 'Verifiable';
    Timing: 'AfterClose' | 'AfterVoting' | 'Live' | 'AdministratorsOnly';
    Audience: 'Voters' | 'Eligible' | 'HostMembers' | 'Public' | 'Administrators';
    Roll: WorldRollGroup;
    Freeze: boolean;
    Configuration: Record<string, unknown>;
    Purpose: string;
    Contests: VotingContestSpec[];
}

/** The personas that are members of the association (they vote in the "personas" roll group). */
export const WORLD_PERSONA_MEMBERS: readonly PersonaKey[] = ['member1', 'member2', 'member3', 'member4', 'trustee1', 'trustee2', 'trustee3'];

// ---- data files -----------------------------------------------------------------------------------------------

function DataDir(): string {
    const here = dirname(fileURLToPath(import.meta.url)); // src/world or dist/world
    const beside = join(here, 'data');
    return existsSync(beside) ? beside : resolve(here, '../../src/world/data');
}

function ReadCsv(file: string): Array<Record<string, string>> {
    const text = readFileSync(join(DataDir(), file), 'utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim());
        return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    });
}

export function ReadWorldPeople(): WorldPerson[] {
    return ReadCsv('people.csv').map((r) => ({
        Key: r.Key,
        FirstName: r.FirstName,
        LastName: r.LastName,
        Email: r.Email.toLowerCase(),
        Organization: r.Organization,
        VotingClass: r.VotingClass,
        Weight: Number(r.Weight),
    }));
}

export function ReadWorldOrganizations(): WorldOrganization[] {
    return ReadCsv('organizations.csv').map((r) => ({ Name: r.Name, Parent: r.Parent, OrganizationType: r.OrganizationType }));
}

export function ReadWorldElections(): WorldElectionDef[] {
    return JSON.parse(readFileSync(join(DataDir(), 'elections.json'), 'utf8')) as WorldElectionDef[];
}

/** The roll of a world election as CSV voter specs (persona members vote with their API keys). */
export function WorldRoll(group: WorldRollGroup, cast: WireCast): WireVoterSpec[] {
    if (group === 'personas') return WORLD_PERSONA_MEMBERS.map((key) => ({ Email: cast.Record(key).Email, SourceKey: `world-${key}`, Persona: key, Weight: 1 }));
    const people = ReadWorldPeople().filter((p) => {
        if (group === 'individual') return p.VotingClass === 'Individual';
        if (group === 'corporate') return p.VotingClass === 'Corporate';
        if (group === 'students') return p.VotingClass === 'Student';
        return true;
    });
    return people.map((p) => ({ Email: p.Email, SourceKey: `world-${p.Key}`, Weight: p.Weight, VotingClass: p.VotingClass }));
}

// ---- loading ----------------------------------------------------------------------------------------------------

export interface WorldReport {
    People: { Total: number; Created: number };
    Organizations: { Total: number; Created: number };
    Memberships: { Total: number; Created: number };
    Elections: { Total: number; Created: number; Frozen: number };
}

function lit(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

async function IdByName(client: WireClient, entity: string, name: string): Promise<string> {
    const res = await client.RunView<{ ID: string }>({ EntityName: entity, ExtraFilter: `Name = ${lit(name)}`, Fields: ['ID'], ResultType: 'simple' });
    if (!res.Success || res.Results.length === 0) throw new Error(`${entity} "${name}" is not in the database (it is looked up, never created by the world)`);
    return res.Results[0].ID;
}

async function SaveOrThrow(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, what: string): Promise<void> {
    if (!(await entity.Save())) throw new Error(`world: saving ${what} failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
}

/** Organizations, people and memberships through entity saves as the system identity; elections through the admin persona. */
export async function LoadVotingWorld(cast: WireCast): Promise<WorldReport> {
    const system = cast.System;
    const report: WorldReport = {
        People: { Total: 0, Created: 0 },
        Organizations: { Total: 0, Created: 0 },
        Memberships: { Total: 0, Created: 0 },
        Elections: { Total: 0, Created: 0, Frozen: 0 },
    };

    // organizations (parents before children: the CSV is authored in that order)
    const orgIDs = new Map<string, string>();
    for (const o of ReadWorldOrganizations()) {
        report.Organizations.Total++;
        const existing = await system.RunView<{ ID: string }>({ EntityName: ORGANIZATIONS, ExtraFilter: `Name = ${lit(o.Name)}`, Fields: ['ID'], ResultType: 'simple' });
        if (existing.Success && existing.Results.length > 0) {
            orgIDs.set(o.Name, existing.Results[0].ID);
            continue;
        }
        const org = await system.NewEntity<mjBizAppsCommonOrganizationEntity>(ORGANIZATIONS);
        org.NewRecord();
        org.Name = o.Name;
        org.OrganizationTypeID = await IdByName(system, ORGANIZATION_TYPES, o.OrganizationType);
        org.ParentID = o.Parent ? (orgIDs.get(o.Parent) ?? null) : null;
        org.Status = 'Active';
        await SaveOrThrow(org, `organization ${o.Name}`);
        orgIDs.set(o.Name, org.ID);
        report.Organizations.Created++;
    }

    // people
    const people = ReadWorldPeople();
    const existingPeople = await system.RunView<{ ID: string; Email: string }>({
        EntityName: PEOPLE,
        ExtraFilter: `Email LIKE '%@${WORLD_EMAIL_DOMAIN}'`,
        Fields: ['ID', 'Email'],
        ResultType: 'simple',
            BypassCache: true,
    });
    if (!existingPeople.Success) throw new Error(`world: reading people failed: ${existingPeople.ErrorMessage}`);
    const personIDs = new Map(existingPeople.Results.map((p) => [p.Email.toLowerCase(), p.ID]));
    for (const p of people) {
        report.People.Total++;
        if (personIDs.has(p.Email)) continue;
        const person = await system.NewEntity<mjBizAppsCommonPersonEntity>(PEOPLE);
        person.NewRecord();
        person.FirstName = p.FirstName;
        person.LastName = p.LastName;
        person.Email = p.Email;
        person.Status = 'Active';
        await SaveOrThrow(person, `person ${p.Email}`);
        personIDs.set(p.Email, person.ID);
        report.People.Created++;
    }

    // memberships: Person --Member--> Organization (the world people and the persona members)
    const memberTypeID = await IdByName(system, RELATIONSHIP_TYPES, 'Member');
    const memberships: Array<{ PersonID: string; OrganizationID: string }> = [
        ...people.map((p) => ({ PersonID: personIDs.get(p.Email) as string, OrganizationID: orgIDs.get(p.Organization) as string })),
        ...WORLD_PERSONA_MEMBERS.map((key) => ({ PersonID: cast.Record(key).PersonID as string, OrganizationID: orgIDs.get('Northern Chapter') as string })),
    ];
    const known = await system.RunView<{ FromPersonID: string; ToOrganizationID: string }>({
        EntityName: RELATIONSHIPS,
        ExtraFilter: `RelationshipTypeID = '${memberTypeID}' AND ToOrganizationID IN (${[...orgIDs.values()].map(lit).join(',')})`,
        Fields: ['FromPersonID', 'ToOrganizationID'],
        ResultType: 'simple',
            BypassCache: true,
    });
    if (!known.Success) throw new Error(`world: reading memberships failed: ${known.ErrorMessage}`);
    const knownKeys = new Set(known.Results.map((r) => `${r.FromPersonID.toLowerCase()}|${r.ToOrganizationID.toLowerCase()}`));
    for (const m of memberships) {
        report.Memberships.Total++;
        if (knownKeys.has(`${m.PersonID.toLowerCase()}|${m.OrganizationID.toLowerCase()}`)) continue;
        const rel = await system.NewEntity<mjBizAppsCommonRelationshipEntity>(RELATIONSHIPS);
        rel.NewRecord();
        rel.RelationshipTypeID = memberTypeID;
        rel.FromPersonID = m.PersonID;
        rel.ToOrganizationID = m.OrganizationID;
        rel.Status = 'Active';
        await SaveOrThrow(rel, `membership ${m.PersonID}`);
        report.Memberships.Created++;
    }

    // elections, created by the admin persona the way the wizard would
    const admin = await cast.As('admin');
    const have = await admin.RunView<{ ID: string; Name: string; RollFrozenAt: string | null }>({
        EntityName: ELECTIONS,
        ExtraFilter: `Name LIKE '${WORLD_ELECTION_PREFIX}%'`,
        Fields: ['ID', 'Name', 'RollFrozenAt'],
        ResultType: 'simple',
            BypassCache: true,
    });
    if (!have.Success) throw new Error(`world: reading elections failed: ${have.ErrorMessage}`);
    const byName = new Map(have.Results.map((e) => [e.Name, e]));
    for (const def of ReadWorldElections()) {
        report.Elections.Total++;
        let row = byName.get(def.Name);
        if (!row) {
            const created = Ok(
                `create ${def.Name}`,
                await admin.Call(new VotingCreateElectionOperation(), {
                    ElectionTypeCode: def.Type,
                    Name: def.Name,
                    Description: def.Purpose,
                    EligibilitySource: { Code: 'csv', Settings: { Rows: WorldRoll(def.Roll, cast).map((v) => ({ Email: v.Email, SourceKey: v.SourceKey, Weight: v.Weight ?? 1, ...(v.VotingClass ? { VotingClass: v.VotingClass } : {}) })) } },
                    Contests: def.Contests,
                    SecrecyMode: def.Secrecy,
                    AssuranceTier: def.Tier,
                    ResultsTiming: def.Timing,
                    ResultsAudience: def.Audience,
                    Configuration: Object.keys(def.Configuration).length > 0 ? def.Configuration : undefined,
                })
            );
            row = { ID: created.ElectionID as string, Name: def.Name, RollFrozenAt: null };
            report.Elections.Created++;
        }
        if (def.Freeze && !row.RollFrozenAt) {
            Ok(`freeze ${def.Name}`, await admin.Call(new VotingFreezeRollOperation(), { ElectionID: row.ID }));
        }
        if (def.Freeze) report.Elections.Frozen++;
    }
    return report;
}
