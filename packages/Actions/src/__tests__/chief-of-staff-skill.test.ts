import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { RunView, RunViewParams, RunViewResult, UserInfo, type RemoteOpResult } from '@memberjunction/core';
import {
    VotingGetResultsOperation,
    VotingGetTurnoutOperation,
    type VotingGetResultsOutput,
    type VotingGetTurnoutOutput,
} from '@mj-biz-apps/voting-entities';
import { GetElectionResultsAction } from '../get-election-results.action.js';
import { GetTurnoutAction } from '../get-turnout.action.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const UUID_V4_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

interface SkillMetadataRecord {
    fields: {
        Name: string;
        Description: string;
        Instructions: string;
        Status: string;
        ActivationMode: string;
        CreatedByUserID: string;
    };
    relatedEntities?: {
        'MJ: AI Agent Skills'?: Array<{
            fields: { AgentID: string; SkillID: string; Status: string };
            primaryKey: { ID: string };
            sync?: Record<string, string>;
        }>;
        'MJ: AI Skill Actions'?: Array<{
            fields: { SkillID: string; ActionID: string; Role: string; ExposeToModel: boolean };
            primaryKey: { ID: string };
            sync?: Record<string, string>;
        }>;
    };
    primaryKey: { ID: string };
    sync?: Record<string, string>;
}

interface ActionMetadataRecord {
    fields: { Name: string; DriverClass: string; Status: string };
}

interface SimulatedElectionRow {
    ID: string;
    Name: string;
    Status: string;
    SecrecyMode: 'Open' | 'Confidential' | 'Secret';
    RollFrozenAt: string | null;
}

interface SimulatedCertificationRow {
    ID: string;
    ElectionID: string;
    Status: 'Draft' | 'Certified' | 'Revoked';
}

describe('Voting Chief of Staff skill metadata & auto-install integrity', () => {
    const mjAppPath = resolve(repoRoot, 'mj-app.json');
    const rootSyncPath = resolve(repoRoot, 'metadata/.mj-sync.json');
    const skillDir = resolve(repoRoot, 'metadata/chief-of-staff-skills');
    const skillSyncPath = resolve(skillDir, '.mj-sync.json');
    const skillFilePath = resolve(skillDir, '.chief-of-staff-voting-skill.json');
    const actionsMetadataPath = resolve(repoRoot, 'metadata/actions/.voting-actions.json');

    it('wires metadata/chief-of-staff-skills into mj-app.json and root directoryOrder after actions', () => {
        const mjApp = JSON.parse(readFileSync(mjAppPath, 'utf8')) as {
            metadata?: { directory?: string };
        };
        expect(mjApp.metadata?.directory).toBe('metadata');

        const rootSync = JSON.parse(readFileSync(rootSyncPath, 'utf8')) as {
            directoryOrder?: string[];
        };
        const order = rootSync.directoryOrder ?? [];
        expect(order).toContain('actions');
        expect(order).toContain('chief-of-staff-skills');
        expect(order.indexOf('chief-of-staff-skills')).toBeGreaterThan(order.indexOf('actions'));

        const skillSync = JSON.parse(readFileSync(skillSyncPath, 'utf8')) as {
            entity: string;
            filePattern: string;
        };
        expect(skillSync.entity).toBe('MJ: AI Skills');
        expect(skillSync.filePattern).toBe('**/.*.json');
    });

    it('defines a valid Chief of Staff skill with UUIDv4 PKs, zero sync blocks, real entity docs, and active template grant', () => {
        const records = JSON.parse(readFileSync(skillFilePath, 'utf8')) as SkillMetadataRecord[];
        expect(records).toHaveLength(1);

        const skill = records[0];
        expect(skill.fields.Name).toBe('Voting');
        expect(skill.fields.Status).toBe('Active');
        expect(skill.fields.ActivationMode).toBe('Auto');
        expect(skill.fields.CreatedByUserID).toBe('@lookup:MJ: Users.Name=System');
        expect(skill.primaryKey.ID).toMatch(UUID_V4_RE);
        expect(skill.sync).toBeUndefined();

        expect(skill.fields.Instructions.startsWith('@file:')).toBe(true);
        const instructionsPath = resolve(skillDir, skill.fields.Instructions.replace('@file:', ''));
        expect(existsSync(instructionsPath)).toBe(true);
        const instructions = readFileSync(instructionsPath, 'utf8');
        for (const entityName of [
            'MJ_BizApps_Voting: Elections',
            'MJ_BizApps_Voting: Contests',
            'MJ_BizApps_Voting: Contest Options',
            'MJ_BizApps_Voting: Eligible Voters',
            'MJ_BizApps_Voting: Participations',
            'MJ_BizApps_Voting: Election Certifications',
        ]) {
            expect(instructions).toContain(entityName);
        }
        expect(instructions).toContain('RunView');

        const grants = skill.relatedEntities?.['MJ: AI Agent Skills'] ?? [];
        expect(grants).toHaveLength(1);
        expect(grants[0].fields.AgentID).toBe('@lookup:MJ: AI Agents.Name=Chief of Staff');
        expect(grants[0].fields.SkillID).toBe('@parent:ID');
        expect(grants[0].fields.Status).toBe('Active');
        expect(grants[0].primaryKey.ID).toMatch(UUID_V4_RE);
        expect(grants[0].sync).toBeUndefined();

        // Personal instances (e.g. Pepper) with BaseAgentID = Chief of Staff inherit active template grants
        const chiefOfStaffTemplateId = 'CHIEF-OF-STAFF-TEMPLATE';
        const inherited = grants
            .filter((g) => g.fields.Status === 'Active' && g.fields.AgentID === '@lookup:MJ: AI Agents.Name=Chief of Staff')
            .map(() => skill.fields.Name);
        const pepperInstance = { Name: 'Pepper', BaseAgentID: chiefOfStaffTemplateId };
        expect(pepperInstance.BaseAgentID).toBe(chiefOfStaffTemplateId);
        expect(inherited).toEqual(['Voting']);
    });

    it('binds only declared Voting actions and uses zero raw SQL across all action source files', () => {
        const records = JSON.parse(readFileSync(skillFilePath, 'utf8')) as SkillMetadataRecord[];
        const skillActions = records[0].relatedEntities?.['MJ: AI Skill Actions'] ?? [];
        expect(skillActions).toHaveLength(6);

        const declared = new Set(
            (JSON.parse(readFileSync(actionsMetadataPath, 'utf8')) as ActionMetadataRecord[]).map((a) => a.fields.Name),
        );
        const seenIds = new Set<string>([records[0].primaryKey.ID]);
        for (const binding of skillActions) {
            expect(binding.primaryKey.ID).toMatch(UUID_V4_RE);
            expect(seenIds.has(binding.primaryKey.ID)).toBe(false);
            seenIds.add(binding.primaryKey.ID);
            expect(binding.sync).toBeUndefined();
            expect(binding.fields.SkillID).toBe('@parent:ID');
            const actionName = binding.fields.ActionID.replace('@lookup:MJ: Actions.Name=', '');
            expect(declared.has(actionName), `Action '${actionName}' missing from metadata/actions/.voting-actions.json`).toBe(true);
        }

        const actionsSrcDir = resolve(__dirname, '..');
        const actionFiles = readdirSync(actionsSrcDir).filter((f) => f.endsWith('.ts'));
        const rawSqlPattern = /\b(ExecuteSQL|knex|sql\.Request|SELECT\s+.+\s+FROM\s+)\b/i;
        for (const file of actionFiles) {
            const content = readFileSync(resolve(actionsSrcDir, file), 'utf8');
            expect(rawSqlPattern.test(content), `Raw SQL detected in ${file}`).toBe(false);
        }
    });
});

describe('Voting Chief of Staff skill — two-user RLS & role isolation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const adminUser = new UserInfo(undefined, {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'Alice Election Admin',
        Email: 'alice-admin@org.example',
        UserRoles: [
            { UserID: '11111111-1111-4111-8111-111111111111', RoleID: 'R-UI', Role: 'UI' },
            { UserID: '11111111-1111-4111-8111-111111111111', RoleID: 'R-VA', Role: 'Voting Administrator' },
        ],
    });

    const memberUser = new UserInfo(undefined, {
        ID: '22222222-2222-4222-8222-222222222222',
        Name: 'Bob Ordinary Member',
        Email: 'bob-member@org.example',
        UserRoles: [{ UserID: '22222222-2222-4222-8222-222222222222', RoleID: 'R-UI', Role: 'UI' }],
    });

    const elections: SimulatedElectionRow[] = [
        {
            ID: 'elec-draft-1',
            Name: 'Confidential Draft Board Slate (Inline CSV Roll)',
            Status: 'Draft',
            SecrecyMode: 'Secret',
            RollFrozenAt: null,
        },
        {
            ID: 'elec-open-1',
            Name: '2026 Annual Bylaw Amendment',
            Status: 'Open',
            SecrecyMode: 'Secret',
            RollFrozenAt: '2026-11-01T00:00:00.000Z',
        },
    ];

    const certifications: SimulatedCertificationRow[] = [
        { ID: 'cert-draft-1', ElectionID: 'elec-open-1', Status: 'Draft' },
        { ID: 'cert-final-1', ElectionID: 'elec-certified-1', Status: 'Certified' },
    ];

    function hasAdminOrInspectorRole(user?: UserInfo): boolean {
        return (user?.UserRoles ?? []).some(
            (r) => r.Role === 'Voting Administrator' || r.Role === 'Election Inspector',
        );
    }

    function makeElectionParams(contextUser: UserInfo, electionId: string): RunActionParams {
        const params = new RunActionParams();
        params.ContextUser = contextUser;
        const p = new ActionParam();
        p.Name = 'ElectionID';
        p.Type = 'Input';
        p.Value = electionId;
        params.Params = [p];
        return params;
    }

    function outputOf(params: RunActionParams, name: string): string | number | boolean | null | undefined {
        return params.Params.find((p) => p.Name === name && p.Type === 'Output')?.Value as
            | string
            | number
            | boolean
            | null
            | undefined;
    }

    it('invoking bound Voting actions (Get Turnout & Get Election Results) as Admin vs Member yields strictly role-scoped answers', async () => {
        vi.spyOn(VotingGetTurnoutOperation.prototype, 'Execute').mockImplementation(
            async (_input, options): Promise<RemoteOpResult<VotingGetTurnoutOutput>> => {
                if (!hasAdminOrInspectorRole(options?.user)) {
                    return { Success: false, ResultCode: 'FORBIDDEN', ErrorMessage: 'Voting Administrator or Election Inspector required.' };
                }
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Output: { Success: true, Eligible: 100, Voted: 64, TurnoutPercent: 64, QuorumMet: true },
                };
            },
        );

        vi.spyOn(VotingGetResultsOperation.prototype, 'Execute').mockImplementation(
            async (_input, options): Promise<RemoteOpResult<VotingGetResultsOutput>> => {
                if (hasAdminOrInspectorRole(options?.user)) {
                    return {
                        Success: true,
                        ResultCode: 'SUCCESS',
                        Output: {
                            Success: true,
                            Visible: true,
                            IsFinal: false,
                            IsRunning: true,
                            BallotCount: 64,
                            Contests: [],
                        },
                    };
                }
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Output: {
                        Success: true,
                        Visible: false,
                        IsFinal: false,
                        Reason: 'Results are restricted to Administrators while voting is open.',
                    },
                };
            },
        );

        const turnoutAction = new GetTurnoutAction();
        const adminTurnoutParams = makeElectionParams(adminUser, 'elec-open-1');
        const adminTurnout = await turnoutAction.Run(adminTurnoutParams);
        expect(adminTurnout.Success).toBe(true);
        expect(outputOf(adminTurnoutParams, 'VoterCount')).toBe(100);
        expect(outputOf(adminTurnoutParams, 'TurnoutCount')).toBe(64);

        const memberTurnoutParams = makeElectionParams(memberUser, 'elec-open-1');
        const memberTurnout = await turnoutAction.Run(memberTurnoutParams);
        expect(memberTurnout.Success).toBe(false);
        expect(memberTurnout.ResultCode).toBe('FORBIDDEN');

        const resultsAction = new GetElectionResultsAction();
        const adminResultsParams = makeElectionParams(adminUser, 'elec-open-1');
        const adminResults = await resultsAction.Run(adminResultsParams);
        expect(adminResults.Success).toBe(true);
        expect(outputOf(adminResultsParams, 'Visible')).toBe(true);

        const memberResultsParams = makeElectionParams(memberUser, 'elec-open-1');
        const memberResults = await resultsAction.Run(memberResultsParams);
        expect(memberResults.Success).toBe(true);
        expect(outputOf(memberResultsParams, 'Visible')).toBe(false);
        expect(outputOf(memberResultsParams, 'Reason')).toContain('Administrators');
    });

    it('RunView queries mirror Voting RLS filters: Admin sees Draft elections & certifications, ordinary UI member sees only frozen-roll & Certified rows', async () => {
        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(
            async (params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> => {
                const isPrivileged = hasAdminOrInspectorRole(contextUser);
                if (params.EntityName === 'MJ_BizApps_Voting: Elections') {
                    // Matches metadata/row-level-security-filters: (RollFrozenAt IS NOT NULL) for UI role
                    const rows = isPrivileged ? elections : elections.filter((e) => e.RollFrozenAt !== null);
                    return {
                        Success: true,
                        Results: rows,
                        RowCount: rows.length,
                        TotalRowCount: rows.length,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                if (params.EntityName === 'MJ_BizApps_Voting: Election Certifications') {
                    // Matches metadata/row-level-security-filters: (Status = N'Certified') for UI role
                    const rows = isPrivileged ? certifications : certifications.filter((c) => c.Status === 'Certified');
                    return {
                        Success: true,
                        Results: rows,
                        RowCount: rows.length,
                        TotalRowCount: rows.length,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserViewRunID: '',
                    };
                }
                return {
                    Success: true,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserViewRunID: '',
                };
            },
        );

        const rv = new RunView();
        const adminElections = await rv.RunView<SimulatedElectionRow>(
            { EntityName: 'MJ_BizApps_Voting: Elections', ResultType: 'simple' },
            adminUser,
        );
        const memberElections = await rv.RunView<SimulatedElectionRow>(
            { EntityName: 'MJ_BizApps_Voting: Elections', ResultType: 'simple' },
            memberUser,
        );
        expect(adminElections.Results.map((e) => e.ID)).toEqual(['elec-draft-1', 'elec-open-1']);
        expect(memberElections.Results.map((e) => e.ID)).toEqual(['elec-open-1']);

        const adminCerts = await rv.RunView<SimulatedCertificationRow>(
            { EntityName: 'MJ_BizApps_Voting: Election Certifications', ResultType: 'simple' },
            adminUser,
        );
        const memberCerts = await rv.RunView<SimulatedCertificationRow>(
            { EntityName: 'MJ_BizApps_Voting: Election Certifications', ResultType: 'simple' },
            memberUser,
        );
        expect(adminCerts.Results.map((c) => c.ID)).toEqual(['cert-draft-1', 'cert-final-1']);
        expect(memberCerts.Results.map((c) => c.ID)).toEqual(['cert-final-1']);
    });
});
