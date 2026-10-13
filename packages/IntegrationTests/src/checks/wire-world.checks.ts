/**
 * wire-world: the voting WORLD model (see ../world/voting-world.ts) loaded over the wire, then asserted for referential
 * integrity.
 *
 *   WW1  LoadVotingWorld creates the electorate and the election catalog; a second load changes nothing (idempotent)
 *   WW2  the 48 world people exist once each, with their names, and are members of their organization
 *   WW3  the organization tree: one association, four member bodies under it, typed
 *   WW4  the catalog covers every election type, tally method, secrecy mode, assurance tier, results timing, results
 *        audience and both quorum kinds that the application defines
 *   WW5  every catalog election exists with the declared type, secrecy, tier, timing, audience, quorum and status
 *   WW6  every catalog election's contests and options match the catalog exactly (kind, seats, tally method, threshold)
 *   WW7  frozen-roll elections: roll size equals the roll group, hash is a SHA-256, weights/classes/people match the CSV
 *   WW8  unfrozen catalog elections have no roll rows yet (the roll is built at freeze)
 *   WW9  the persona members are on the "personas" rolls and in the Northern Chapter; the known outsider is on no roll
 */
import { Assert, AssertEqual, IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration/registry';
import {
    LoadVotingWorld,
    ReadWorldElections,
    ReadWorldOrganizations,
    ReadWorldPeople,
    WORLD_ELECTION_PREFIX,
    WORLD_EMAIL_DOMAIN,
    WORLD_PERSONA_MEMBERS,
    WORLD_ROOT_ORGANIZATION,
    WorldRoll,
    type WorldElectionDef,
} from '../world/voting-world.js';
import { WireCast } from '../wire/wire-cast.js';
import type { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-world';
const PEOPLE = 'MJ_BizApps_Common: People';
const ORGANIZATIONS = 'MJ_BizApps_Common: Organizations';
const ORGANIZATION_TYPES = 'MJ_BizApps_Common: Organization Types';
const RELATIONSHIPS = 'MJ_BizApps_Common: Relationships';
const RELATIONSHIP_TYPES = 'MJ_BizApps_Common: Relationship Types';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const ELECTION_TYPES = 'MJ_BizApps_Voting: Election Types';
const TALLY_METHODS = 'MJ_BizApps_Voting: Tally Methods';
const CONTESTS = 'MJ_BizApps_Voting: Contests';
const OPTIONS = 'MJ_BizApps_Voting: Contest Options';
const ELIGIBLE_VOTERS = 'MJ_BizApps_Voting: Eligible Voters';

interface ElectionRow {
    ID: string;
    Name: string;
    ElectionTypeID: string;
    Status: string;
    SecrecyMode: string;
    AssuranceTier: string;
    ResultsTiming: string;
    ResultsAudience: string;
    Configuration: string | null;
    RollFrozenAt: string | null;
    RollHash: string | null;
}

let cast: WireCast | undefined;
let system: WireClient | undefined;
let admin: WireClient | undefined;
let firstLoad: Awaited<ReturnType<typeof LoadVotingWorld>> | undefined;
let elections: Map<string, ElectionRow> | undefined;

const C = (): WireCast => {
    if (!cast) throw new Error('wire-world setup did not run');
    return cast;
};
const S = (): WireClient => {
    if (!system) throw new Error('wire-world setup did not run');
    return system;
};
const A = (): WireClient => {
    if (!admin) throw new Error('wire-world setup did not run');
    return admin;
};
const E = (): Map<string, ElectionRow> => {
    if (!elections) throw new Error('wire-world setup did not run');
    return elections;
};

async function Rows<T>(client: WireClient, entity: string, filter: string, fields: string[]): Promise<T[]> {
    const res = await client.RunView<T>({ EntityName: entity, ExtraFilter: filter, Fields: fields, ResultType: 'simple', BypassCache: true });
    if (!res.Success) throw new Error(`${entity} read failed: ${res.ErrorMessage}`);
    return res.Results;
}

function Def(key: string): WorldElectionDef {
    const d = ReadWorldElections().find((e) => e.Key === key);
    if (!d) throw new Error(`no world election "${key}"`);
    return d;
}

function Election(def: WorldElectionDef): ElectionRow {
    const row = E().get(def.Name);
    if (!row) throw new Error(`world election "${def.Name}" is missing`);
    return row;
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.WW1`,
        Name: 'WW1 - the world loads over the wire; a second load is a no-op',
        Fn: async () => {
            const again = await LoadVotingWorld(C());
            AssertEqual(again.People.Total, 48, 'people in the catalog');
            AssertEqual(again.Organizations.Total, 5, 'organizations in the catalog');
            AssertEqual(again.Elections.Total, ReadWorldElections().length, 'elections in the catalog');
            AssertEqual(again.People.Created + again.Organizations.Created + again.Memberships.Created + again.Elections.Created, 0, 'a reload creates nothing (idempotent)');
            // The first load (setup) either created everything or found it: after it, totals are complete.
            Assert(!!firstLoad, 'setup loaded the world');
            AssertEqual(firstLoad?.Memberships.Total, 48 + WORLD_PERSONA_MEMBERS.length, 'memberships declared');
        },
    },
    {
        Id: `${BUNDLE}.WW2`,
        Name: 'WW2 - 48 world people exist exactly once and belong to their organization',
        Fn: async () => {
            const catalog = ReadWorldPeople();
            AssertEqual(catalog.length, 48, 'catalog size');
            AssertEqual(new Set(catalog.map((p) => p.Email)).size, 48, 'catalog emails are unique');
            const rows = await Rows<{ ID: string; FirstName: string; LastName: string; Email: string; Status: string }>(S(), PEOPLE, `Email LIKE '%@${WORLD_EMAIL_DOMAIN}'`, ['ID', 'FirstName', 'LastName', 'Email', 'Status']);
            AssertEqual(rows.length, 48, 'people with the world domain');
            const byEmail = new Map(rows.map((r) => [r.Email.toLowerCase(), r]));
            AssertEqual(byEmail.size, 48, 'no duplicate Person per email');
            for (const p of catalog) {
                const row = byEmail.get(p.Email);
                Assert(!!row, `${p.Email} exists`);
                AssertEqual(row?.FirstName, p.FirstName, `${p.Email} first name`);
                AssertEqual(row?.LastName, p.LastName, `${p.Email} last name`);
                AssertEqual(row?.Status, 'Active', `${p.Email} status`);
            }
            // memberships: each person has a Member relationship to the organization named in the CSV
            const memberType = (await Rows<{ ID: string }>(S(), RELATIONSHIP_TYPES, `Name = 'Member'`, ['ID']))[0];
            const orgs = await Rows<{ ID: string; Name: string }>(S(), ORGANIZATIONS, `Name IN (${ReadWorldOrganizations().map((o) => `'${o.Name}'`).join(',')})`, ['ID', 'Name']);
            const orgByName = new Map(orgs.map((o) => [o.Name, o.ID]));
            const rels = await Rows<{ FromPersonID: string; ToOrganizationID: string }>(S(), RELATIONSHIPS, `RelationshipTypeID = '${memberType.ID}' AND ToOrganizationID IN (${orgs.map((o) => `'${o.ID}'`).join(',')})`, ['FromPersonID', 'ToOrganizationID']);
            for (const p of catalog) {
                const personID = byEmail.get(p.Email)?.ID.toLowerCase();
                const mine = rels.filter((r) => r.FromPersonID.toLowerCase() === personID);
                AssertEqual(mine.length, 1, `${p.Email} has exactly one membership`);
                AssertEqual(mine[0].ToOrganizationID.toLowerCase(), orgByName.get(p.Organization)?.toLowerCase(), `${p.Email} is a member of ${p.Organization}`);
            }
        },
    },
    {
        Id: `${BUNDLE}.WW3`,
        Name: 'WW3 - the organization tree: one association with four member bodies under it',
        Fn: async () => {
            const defs = ReadWorldOrganizations();
            const rows = await Rows<{ ID: string; Name: string; ParentID: string | null; OrganizationTypeID: string | null; Status: string }>(
                S(),
                ORGANIZATIONS,
                `Name IN (${defs.map((o) => `'${o.Name}'`).join(',')})`,
                ['ID', 'Name', 'ParentID', 'OrganizationTypeID', 'Status']
            );
            AssertEqual(rows.length, defs.length, 'organizations exist exactly once each');
            const root = rows.find((r) => r.Name === WORLD_ROOT_ORGANIZATION);
            Assert(!!root && root.ParentID === null, 'the association is a root organization');
            const types = await Rows<{ ID: string; Name: string }>(S(), ORGANIZATION_TYPES, '1=1', ['ID', 'Name']);
            for (const d of defs) {
                const row = rows.find((r) => r.Name === d.Name);
                Assert(!!row, `${d.Name} exists`);
                AssertEqual(row?.Status, 'Active', `${d.Name} status`);
                if (d.Parent) AssertEqual(row?.ParentID?.toLowerCase(), root?.ID.toLowerCase(), `${d.Name} is under the association`);
                AssertEqual(types.find((t) => t.ID.toLowerCase() === row?.OrganizationTypeID?.toLowerCase())?.Name, d.OrganizationType, `${d.Name} organization type`);
            }
            AssertEqual(rows.filter((r) => r.ParentID?.toLowerCase() === root?.ID.toLowerCase()).length, 4, 'four member bodies under the association');
        },
    },
    {
        Id: `${BUNDLE}.WW4`,
        Name: 'WW4 - the catalog covers every election type, tally method, secrecy mode, tier, timing, audience and quorum kind',
        Fn: async () => {
            const defs = ReadWorldElections();
            const types = await Rows<{ Code: string }>(S(), ELECTION_TYPES, '1=1', ['Code']);
            const methods = await Rows<{ Code: string }>(S(), TALLY_METHODS, '1=1', ['Code']);
            const usedTypes = new Set(defs.map((d) => d.Type));
            for (const t of types) Assert(usedTypes.has(t.Code), `an election of type "${t.Code}" is in the catalog`);
            const usedMethods = new Set(defs.flatMap((d) => d.Contests.map((c) => c.TallyMethodCode)));
            for (const m of methods) Assert(usedMethods.has(m.Code), `a contest with tally method "${m.Code}" is in the catalog`);
            const secrecy = new Set(defs.map((d) => d.Secrecy));
            for (const s of ['Open', 'Confidential', 'Secret']) Assert(secrecy.has(s as 'Open'), `secrecy ${s} covered`);
            const tiers = new Set(defs.map((d) => d.Tier));
            for (const t of ['Standard', 'HighAssurance', 'Verifiable']) Assert(tiers.has(t as 'Standard'), `tier ${t} covered`);
            const timings = new Set(defs.map((d) => d.Timing));
            for (const t of ['AfterClose', 'AfterVoting', 'Live', 'AdministratorsOnly']) Assert(timings.has(t as 'Live'), `timing ${t} covered`);
            const audiences = new Set(defs.map((d) => d.Audience));
            for (const a of ['Voters', 'Eligible', 'HostMembers', 'Public', 'Administrators']) Assert(audiences.has(a as 'Public'), `audience ${a} covered`);
            const quorums = new Set(defs.map((d) => (d.Configuration.Quorum as { Kind?: string } | undefined)?.Kind).filter(Boolean));
            Assert(quorums.has('Count') && quorums.has('Percent'), 'both quorum kinds covered');
            const kinds = new Set(defs.flatMap((d) => d.Contests.map((c) => c.Kind)));
            for (const k of ['Motion', 'Office', 'Question', 'Amendment', 'StandardsItem']) Assert(kinds.has(k as 'Motion'), `contest kind ${k} covered`);
            AssertEqual(new Set(defs.map((d) => d.Name)).size, defs.length, 'catalog election names are unique');
            Assert(defs.every((d) => d.Name.startsWith(WORLD_ELECTION_PREFIX)), 'every catalog election carries the world prefix');
        },
    },
    {
        Id: `${BUNDLE}.WW5`,
        Name: 'WW5 - every catalog election exists with the declared type, secrecy, tier, timing, audience, quorum and Draft status',
        Fn: async () => {
            const types = new Map((await Rows<{ ID: string; Code: string }>(S(), ELECTION_TYPES, '1=1', ['ID', 'Code'])).map((t) => [t.ID.toLowerCase(), t.Code]));
            for (const def of ReadWorldElections()) {
                const row = Election(def);
                AssertEqual(types.get(row.ElectionTypeID.toLowerCase()), def.Type, `${def.Key}: election type`);
                AssertEqual(row.SecrecyMode, def.Secrecy, `${def.Key}: secrecy`);
                AssertEqual(row.AssuranceTier, def.Tier, `${def.Key}: tier`);
                AssertEqual(row.ResultsTiming, def.Timing, `${def.Key}: results timing`);
                AssertEqual(row.ResultsAudience, def.Audience, `${def.Key}: results audience`);
                AssertEqual(row.Status, 'Draft', `${def.Key}: status (the world never opens a catalog election)`);
                const stored = row.Configuration ? (JSON.parse(row.Configuration) as { Quorum?: { Kind: string; Value: number } }) : {};
                const wantQuorum = def.Configuration.Quorum as { Kind: string; Value: number } | undefined;
                AssertEqual(JSON.stringify(stored.Quorum ?? null), JSON.stringify(wantQuorum ?? null), `${def.Key}: stored quorum rule`);
            }
        },
    },
    {
        Id: `${BUNDLE}.WW6`,
        Name: 'WW6 - every catalog election has exactly the declared contests and options',
        Fn: async () => {
            const methods = new Map((await Rows<{ ID: string; Code: string }>(S(), TALLY_METHODS, '1=1', ['ID', 'Code'])).map((m) => [m.ID.toLowerCase(), m.Code]));
            for (const def of ReadWorldElections()) {
                const row = Election(def);
                const contests = await Rows<{ ID: string; Name: string; Kind: string; Seats: number; TallyMethodID: string; Threshold: string; ThresholdBasis: string; CustomThreshold: number | null; Sequence: number }>(
                    A(),
                    CONTESTS,
                    `ElectionID = '${row.ID}'`,
                    ['ID', 'Name', 'Kind', 'Seats', 'TallyMethodID', 'Threshold', 'ThresholdBasis', 'CustomThreshold', 'Sequence']
                );
                contests.sort((a, b) => a.Sequence - b.Sequence);
                AssertEqual(contests.length, def.Contests.length, `${def.Key}: contest count`);
                for (let i = 0; i < def.Contests.length; i++) {
                    const want = def.Contests[i];
                    const got = contests[i];
                    AssertEqual(got.Name, want.Name, `${def.Key}: contest ${i + 1} name`);
                    AssertEqual(got.Kind, want.Kind, `${def.Key}/${want.Name}: kind`);
                    AssertEqual(got.Seats, want.Seats ?? 1, `${def.Key}/${want.Name}: seats`);
                    AssertEqual(methods.get(got.TallyMethodID.toLowerCase()), want.TallyMethodCode, `${def.Key}/${want.Name}: tally method`);
                    if (want.Threshold) AssertEqual(got.Threshold, want.Threshold, `${def.Key}/${want.Name}: threshold`);
                    if (want.ThresholdBasis) AssertEqual(got.ThresholdBasis, want.ThresholdBasis, `${def.Key}/${want.Name}: threshold basis`);
                    if (want.CustomThreshold !== undefined) AssertEqual(got.CustomThreshold, want.CustomThreshold, `${def.Key}/${want.Name}: custom threshold`);
                    const options = await Rows<{ Label: string; Sequence: number; ContestID: string }>(A(), OPTIONS, `ContestID = '${got.ID}'`, ['Label', 'Sequence', 'ContestID']);
                    options.sort((a, b) => a.Sequence - b.Sequence);
                    AssertEqual(options.map((o) => o.Label).join('|'), (want.Options ?? []).map((o) => o.Label).join('|'), `${def.Key}/${want.Name}: options in ballot order`);
                    Assert(options.every((o) => o.ContestID.toLowerCase() === got.ID.toLowerCase()), `${def.Key}/${want.Name}: every option belongs to the contest`);
                }
            }
        },
    },
    {
        Id: `${BUNDLE}.WW7`,
        Name: 'WW7 - frozen world rolls: size, SHA-256 hash, people, weights and classes match the roll group',
        Fn: async () => {
            const frozen = ReadWorldElections().filter((d) => d.Freeze);
            Assert(frozen.length >= 2, 'the catalog freezes at least two rolls');
            for (const def of frozen) {
                const row = Election(def);
                Assert(row.RollFrozenAt !== null, `${def.Key}: roll is frozen`);
                Assert(/^[0-9a-f]{64}$/i.test(row.RollHash ?? ''), `${def.Key}: roll hash is a SHA-256 hex digest (got ${row.RollHash})`);
                const expected = WorldRoll(def.Roll, C());
                const roll = await Rows<{ PersonID: string; SourceKey: string; Weight: number; VotingClass: string | null; Status: string }>(A(), ELIGIBLE_VOTERS, `ElectionID = '${row.ID}'`, ['PersonID', 'SourceKey', 'Weight', 'VotingClass', 'Status']);
                AssertEqual(roll.length, expected.length, `${def.Key}: roll size`);
                AssertEqual(new Set(roll.map((r) => r.SourceKey)).size, roll.length, `${def.Key}: source keys are unique`);
                Assert(roll.every((r) => r.Status === 'Eligible'), `${def.Key}: every rolled voter is Eligible`);
                const people = await Rows<{ ID: string; Email: string }>(S(), PEOPLE, `ID IN (${roll.map((r) => `'${r.PersonID}'`).join(',')})`, ['ID', 'Email']);
                const emailByPerson = new Map(people.map((p) => [p.ID.toLowerCase(), p.Email.toLowerCase()]));
                for (const want of expected) {
                    const got = roll.find((r) => r.SourceKey === want.SourceKey);
                    Assert(!!got, `${def.Key}: ${want.SourceKey} is on the roll`);
                    AssertEqual(emailByPerson.get(got!.PersonID.toLowerCase()), want.Email.toLowerCase(), `${def.Key}: ${want.SourceKey} resolves to ${want.Email}`);
                    AssertEqual(got!.Weight, want.Weight ?? 1, `${def.Key}: ${want.SourceKey} weight`);
                    AssertEqual(got!.VotingClass ?? null, want.VotingClass ?? null, `${def.Key}: ${want.SourceKey} voting class`);
                }
            }
            const weighted = ReadWorldElections().find((d) => d.Key === 'motion-weighted');
            const rollRows = await Rows<{ Weight: number; VotingClass: string }>(A(), ELIGIBLE_VOTERS, `ElectionID = '${Election(weighted as WorldElectionDef).ID}'`, ['Weight', 'VotingClass']);
            AssertEqual(rollRows.filter((r) => r.VotingClass === 'Corporate' && r.Weight === 3).length, 8, 'eight corporate voters carry weight 3');
            AssertEqual(rollRows.reduce((sum, r) => sum + r.Weight, 0), 8 * 3 + 40, 'total roll weight (8 x 3 + 40 x 1)');
        },
    },
    {
        Id: `${BUNDLE}.WW8`,
        Name: 'WW8 - elections whose roll is not frozen have no roll rows (the roll is built at freeze)',
        Fn: async () => {
            for (const def of ReadWorldElections().filter((d) => !d.Freeze)) {
                const row = Election(def);
                AssertEqual(row.RollFrozenAt, null, `${def.Key}: roll not frozen`);
                const roll = await Rows<{ ID: string }>(A(), ELIGIBLE_VOTERS, `ElectionID = '${row.ID}'`, ['ID']);
                AssertEqual(roll.length, 0, `${def.Key}: no roll rows before freeze`);
            }
        },
    },
    {
        Id: `${BUNDLE}.WW9`,
        Name: 'WW9 - persona members are in the Northern Chapter and on the personas rolls; the known outsider is on no roll',
        Fn: async () => {
            const org = (await Rows<{ ID: string }>(S(), ORGANIZATIONS, `Name = 'Northern Chapter'`, ['ID']))[0];
            const memberType = (await Rows<{ ID: string }>(S(), RELATIONSHIP_TYPES, `Name = 'Member'`, ['ID']))[0];
            const rels = await Rows<{ FromPersonID: string }>(S(), RELATIONSHIPS, `RelationshipTypeID = '${memberType.ID}' AND ToOrganizationID = '${org.ID}'`, ['FromPersonID']);
            const memberPersonIDs = new Set(rels.map((r) => r.FromPersonID.toLowerCase()));
            for (const key of WORLD_PERSONA_MEMBERS) Assert(memberPersonIDs.has((C().Record(key).PersonID ?? '').toLowerCase()), `${key} is a Northern Chapter member`);
            const knownOutsider = (C().Record('outsider-known').PersonID ?? '').toLowerCase();
            Assert(!memberPersonIDs.has(knownOutsider), 'outsider-known is not a member of the chapter');

            const frozen = Election(Def('frozen-roll'));
            const roll = await Rows<{ PersonID: string }>(A(), ELIGIBLE_VOTERS, `ElectionID = '${frozen.ID}'`, ['PersonID']);
            const rollPersons = new Set(roll.map((r) => r.PersonID.toLowerCase()));
            AssertEqual(roll.length, WORLD_PERSONA_MEMBERS.length, 'personas roll size');
            for (const key of WORLD_PERSONA_MEMBERS) Assert(rollPersons.has((C().Record(key).PersonID ?? '').toLowerCase()), `${key} is on the personas roll`);
            Assert(!rollPersons.has(knownOutsider), 'outsider-known is not on the personas roll');
        },
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async () => {
        cast = await WireCast.Create();
        system = cast.System;
        admin = await cast.As('admin');
        firstLoad = await LoadVotingWorld(cast);
        const rows = await Rows<ElectionRow>(admin, ELECTIONS, `Name LIKE '${WORLD_ELECTION_PREFIX}%'`, [
            'ID',
            'Name',
            'ElectionTypeID',
            'Status',
            'SecrecyMode',
            'AssuranceTier',
            'ResultsTiming',
            'ResultsAudience',
            'Configuration',
            'RollFrozenAt',
            'RollHash',
        ]);
        elections = new Map(rows.map((r) => [r.Name, r]));
    },
    Teardown: async () => {
        // The world is a persistent, shared catalog: it is never deleted.
        cast = undefined;
        system = undefined;
        admin = undefined;
        elections = undefined;
    },
});
