/**
 * The unlinkability suite (design section 4.2 and 14): after N casts in a Secret election, nothing in the database joins a
 * Participation row to a CastBallot row.
 *
 * The ordering checks are statistical: with N = 20 ballots the chance that a random permutation looks like the cast order
 * is 1 / 20! (about 4e-19), so a failure means the ballot set follows the cast order, not bad luck.
 */

import { describe, expect, it } from 'vitest';
import { GetHarness } from '../support/harness.js';
import { CastVote, CreateOpenElection, CreatePeople, LoadRoll, Rows, Scalar, VotingSchema } from '../support/world.js';

const h = await GetHarness();
const CAST_COUNT = 20;
const BALLOT_BOX_TABLES = ['CastBallot', 'BallotSelection', 'ContestRunningTally'];
const BALLOT_BOX_ENTITIES = [
    'MJ_BizApps_Voting: Cast Ballots',
    'MJ_BizApps_Voting: Ballot Selections',
    'MJ_BizApps_Voting: Ballot Attributions',
    'MJ_BizApps_Voting: Contest Running Tallies',
];

interface Run {
    ElectionID: string;
    /** Receipts in the order the casts happened. */
    Receipts: string[];
    OptionIDs: string[];
}

let runPromise: Promise<Run> | null = null;

/** One Secret election with CAST_COUNT sequential casts, shared by the assertions below. */
function secretRun(): Promise<Run> {
    runPromise ??= (async () => {
        const voters = await CreatePeople(h!, CAST_COUNT, 'unl');
        const electionID = await CreateOpenElection(h!, { Voters: voters, Overrides: { SecrecyMode: 'Secret' } });
        const roll = await LoadRoll(h!, electionID);
        const receipts: string[] = [];
        for (let i = 0; i < roll.length; i++) {
            const out = await CastVote(h!, electionID, roll[i].EligibleVoterID, i % 2);
            if (!out.Success) throw new Error(`cast ${i} failed: ${out.Code}`);
            receipts.push(out.ReceiptCode!);
        }
        const schema = await VotingSchema(h!);
        const options = await Rows<{ ID: string }>(
            h!,
            `SELECT o.ID FROM [${schema}].[ContestOption] o JOIN [${schema}].[Contest] c ON c.ID = o.ContestID WHERE c.ElectionID = @e`,
            { e: electionID }
        );
        return { ElectionID: electionID, Receipts: receipts, OptionIDs: options.map((o) => o.ID) };
    })();
    return runPromise;
}

describe.skipIf(!h)('3. Unlinkability (Secret election)', () => {
    it('ballot-box tables carry no __mj_ timestamp columns, and CastBallot has no voter-shaped column', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        for (const table of BALLOT_BOX_TABLES) {
            const columns = await Rows<{ COLUMN_NAME: string }>(
                h,
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @s AND TABLE_NAME = @t`,
                { s: schema, t: table }
            );
            expect(columns.length, `${table} exists`).toBeGreaterThan(0);
            const stamped = columns.map((c) => c.COLUMN_NAME).filter((n) => n.toLowerCase().startsWith('__mj'));
            expect(stamped, `${table} timestamp columns`).toEqual([]);
        }
        const castColumns = (
            await Rows<{ COLUMN_NAME: string }>(h, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @s AND TABLE_NAME = 'CastBallot'`, { s: schema })
        )
            .map((c) => c.COLUMN_NAME)
            .sort();
        expect(castColumns).toEqual(['BallotStyleHash', 'ElectionID', 'ID', 'ReceiptCode', 'Selections', 'Status', 'VotingClass', 'WeightClass']);
    });

    it('no BallotAttribution rows exist for the election, and the poll book and ballot box have the same count', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const run = await secretRun();
        const attributions = await Scalar<number>(
            h,
            `SELECT COUNT(*) FROM [${schema}].[BallotAttribution] ba JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID WHERE cb.ElectionID = @e`,
            { e: run.ElectionID }
        );
        expect(attributions).toBe(0);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[Participation] WHERE ElectionID = @e`, { e: run.ElectionID })).toBe(CAST_COUNT);
        expect(await Scalar<number>(h, `SELECT COUNT(*) FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: run.ElectionID })).toBe(CAST_COUNT);
    });

    it('Cast Ballots, Ballot Selections and Contest Running Tallies never have Record Changes rows; the Secret election has none for any ballot-box entity', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const run = await secretRun();
        const never = BALLOT_BOX_ENTITIES.filter((n) => !n.endsWith('Ballot Attributions'));
        const names = never.map((_, i) => `@n${i}`).join(',');
        const params = Object.fromEntries(never.map((n, i) => [`n${i}`, n]));
        const count = await Scalar<number>(
            h,
            `SELECT COUNT(*) FROM [${h.CoreSchema}].[RecordChange] rc JOIN [${h.CoreSchema}].[Entity] e ON e.ID = rc.EntityID WHERE e.Name IN (${names})`,
            params
        );
        expect(count).toBe(0);

        // Ballot Attributions deliberately keep change tracking (they exist only in Open/Confidential elections). A Secret
        // election must have no attribution rows, hence no change records for them either.
        const attributionChanges = await Scalar<number>(
            h,
            `SELECT COUNT(*) FROM [${h.CoreSchema}].[RecordChange] rc
               JOIN [${h.CoreSchema}].[Entity] e ON e.ID = rc.EntityID AND e.Name = 'MJ_BizApps_Voting: Ballot Attributions'
               JOIN [${schema}].[BallotAttribution] ba ON rc.RecordID = 'ID|' + CONVERT(varchar(36), ba.ID)
               JOIN [${schema}].[CastBallot] cb ON cb.ID = ba.CastBallotID
              WHERE cb.ElectionID = @e`,
            { e: run.ElectionID }
        );
        expect(attributionChanges).toBe(0);
    });

    it('the ballot set cannot be aligned with the cast order by ID order', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const run = await secretRun();
        // ORDER BY ID is what an adversary with read access would do (SQL Server's uniqueidentifier ordering).
        const byId = await Rows<{ ReceiptCode: string }>(h, `SELECT ReceiptCode FROM [${schema}].[CastBallot] WHERE ElectionID = @e ORDER BY ID`, { e: run.ElectionID });
        const castIndex = byId.map((r) => run.Receipts.indexOf(r.ReceiptCode));
        expect(castIndex.every((i) => i >= 0), 'every ballot is one of this run\'s casts').toBe(true);
        const ascendingSteps = castIndex.slice(1).filter((v, i) => v > castIndex[i]).length;
        // Sequential IDs (NEWSEQUENTIALID) would give CAST_COUNT-1 ascending steps; a mirror image would give 0.
        expect(ascendingSteps, `ID-ordered cast indexes: ${castIndex.join(',')}`).toBeLessThan(CAST_COUNT - 1);
        expect(ascendingSteps).toBeGreaterThan(0);

        // Plain string ordering of the GUID text, the other obvious thing to try.
        const asText = Rows<{ ReceiptCode: string }>(h, `SELECT ReceiptCode FROM [${schema}].[CastBallot] WHERE ElectionID = @e ORDER BY CONVERT(varchar(36), ID)`, { e: run.ElectionID });
        const textIndex = (await asText).map((r) => run.Receipts.indexOf(r.ReceiptCode));
        const textAscending = textIndex.slice(1).filter((v, i) => v > textIndex[i]).length;
        expect(textAscending, `text-ordered cast indexes: ${textIndex.join(',')}`).toBeLessThan(CAST_COUNT - 1);
        expect(textAscending).toBeGreaterThan(0);
    });

    it('the clustered index on each ballot-box table is the primary key on its random ID', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        for (const table of BALLOT_BOX_TABLES) {
            const clustered = await Rows<{ IsPrimaryKey: boolean; KeyColumns: string }>(
                h,
                `SELECT i.is_primary_key AS IsPrimaryKey,
                        STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS KeyColumns
                   FROM sys.indexes i
                   JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                   JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                  WHERE i.object_id = OBJECT_ID(@t) AND i.type = 1
                  GROUP BY i.index_id, i.is_primary_key`,
                { t: `[${schema}].[${table}]` }
            );
            expect(clustered, `${table} has exactly one clustered index`).toHaveLength(1);
            expect(clustered[0].IsPrimaryKey, `${table} clustered index is the primary key`).toBe(true);
            expect(clustered[0].KeyColumns, `${table} clustered key`).toBe('ID');
            const defaultText = await Scalar<string>(
                h,
                `SELECT dc.definition FROM sys.default_constraints dc JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                  WHERE dc.parent_object_id = OBJECT_ID(@t) AND c.name = 'ID'`,
                { t: `[${schema}].[${table}]` }
            );
            expect(defaultText.toLowerCase(), `${table} ID default`).toContain('newid()');
            expect(defaultText.toLowerCase()).not.toContain('sequential');
        }
    });

    it('physical row order does not follow the cast order', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const run = await secretRun();
        // Rows come back in clustered-key (random GUID) order, so physical order must not echo insert order.
        // With N = 20 ballots there are 19 adjacent steps; failing needs ascents/steps >= 0.8, i.e. at least 16 ascents,
        // i.e. at most 3 descents. For a uniformly random permutation the Eulerian numbers give
        //   P = (A(20,0) + A(20,1) + A(20,2) + A(20,3)) / 20!  ~  4.2e-7
        // so a false failure is negligible. Insert-ordered storage scores 19 of 19, so this fails reliably when ordering leaks.
        const physical = await Rows<{ ReceiptCode: string }>(h, `SELECT ReceiptCode FROM [${schema}].[CastBallot] WHERE ElectionID = @e ORDER BY %%physloc%%`, { e: run.ElectionID });
        const castIndex = physical.map((r) => run.Receipts.indexOf(r.ReceiptCode));
        expect(castIndex.every((i) => i >= 0)).toBe(true);
        expect(castIndex.length).toBeGreaterThanOrEqual(11);
        const steps = castIndex.length - 1;
        const ascending = castIndex.slice(1).filter((v, i) => v > castIndex[i]).length;
        expect(ascending / steps, `physical-order cast indexes: ${castIndex.join(',')}`).toBeLessThan(0.8);
    });

    it('audit events carry no selections, option ids or receipt codes', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const run = await secretRun();
        const events = await Rows<{ EventType: string; Details: string | null }>(h, `SELECT EventType, Details FROM [${schema}].[ElectionAuditEvent] WHERE ElectionID = @e`, { e: run.ElectionID });
        expect(events.length).toBeGreaterThan(0);
        const text = events.map((e) => `${e.EventType} ${e.Details ?? ''}`).join('\n').toLowerCase();
        for (const receipt of run.Receipts) expect(text).not.toContain(receipt.toLowerCase());
        for (const optionID of run.OptionIDs) expect(text).not.toContain(optionID.toLowerCase());
        expect(text).not.toContain('selections');
    });

    it('selections are encrypted at rest (v1:a: ciphertext, no option ids in the clear)', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const run = await secretRun();
        const ballots = await Rows<{ Selections: string }>(h, `SELECT Selections FROM [${schema}].[CastBallot] WHERE ElectionID = @e`, { e: run.ElectionID });
        expect(ballots).toHaveLength(CAST_COUNT);
        for (const b of ballots) {
            expect(b.Selections.startsWith('v1:a:')).toBe(true);
            for (const optionID of run.OptionIDs) expect(b.Selections.toLowerCase()).not.toContain(optionID.toLowerCase());
        }
        // Equal choices must not produce equal ciphertext (fresh IV per ballot).
        expect(new Set(ballots.map((b) => b.Selections)).size).toBe(CAST_COUNT);
    });

    it('a Secret election keeps no per-voter linkage in the poll book either (Participation has no ballot reference)', async () => {
        if (!h) return;
        const schema = await VotingSchema(h);
        const columns = (
            await Rows<{ COLUMN_NAME: string }>(h, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @s AND TABLE_NAME = 'Participation'`, { s: schema })
        ).map((c) => c.COLUMN_NAME.toLowerCase());
        expect(columns.some((c) => c.includes('ballot') || c.includes('receipt') || c.includes('selection'))).toBe(false);
    });
});
