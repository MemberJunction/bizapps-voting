import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RunActionParams, ActionParam } from '@memberjunction/actions-base';
import type { RemoteOpResult, UserInfo } from '@memberjunction/core';
import {
    VotingCloseElectionOperation,
    VotingCreateElectionOperation,
    VotingGetResultsOperation,
    VotingGetTurnoutOperation,
    VotingOpenElectionOperation,
    VotingTallyOperation,
    type VotingCreateElectionInput
} from '@mj-biz-apps/voting-entities';
import { CreateMotionVoteAction, BuildMotionElectionInput } from '../create-motion-vote.action.js';
import { OpenElectionAction } from '../open-election.action.js';
import { CloseElectionAction } from '../close-election.action.js';
import { GetTurnoutAction } from '../get-turnout.action.js';
import { GetElectionResultsAction } from '../get-election-results.action.js';
import { TallyElectionAction } from '../tally-election.action.js';

const USER = { ID: 'u-1', Name: 'Tester' } as unknown as UserInfo;
const PROVIDER = { Name: 'fake-provider' } as unknown as NonNullable<RunActionParams['Provider']>;

function makeParams(values: Record<string, unknown>): RunActionParams {
    const params = new RunActionParams();
    params.Params = Object.entries(values).map(([Name, Value]) => {
        const p = new ActionParam();
        p.Name = Name;
        p.Type = 'Input';
        p.Value = Value;
        return p;
    });
    params.ContextUser = USER;
    params.Provider = PROVIDER;
    return params;
}

function outputOf(params: RunActionParams, name: string): unknown {
    return params.Params.find((p) => p.Name === name && p.Type === 'Output')?.Value;
}

function ok<T>(Output: T): RemoteOpResult<T> {
    return { Success: true, ResultCode: 'SUCCESS', Output };
}

describe('Voting actions execute the Remote Operations', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('Open Election passes input + provider/user and maps status', async () => {
        const spy = vi.spyOn(VotingOpenElectionOperation.prototype, 'Execute').mockResolvedValue(ok({ Success: true, Status: 'Open' }));
        const params = makeParams({ ElectionID: 'e1' });
        const result = await new OpenElectionAction().Run(params);
        expect(result.Success).toBe(true);
        expect(spy).toHaveBeenCalledWith({ ElectionID: 'e1' }, { provider: PROVIDER, user: USER });
        expect(outputOf(params, 'Status')).toBe('Open');
    });

    it('requires ElectionID without calling the operation', async () => {
        const spy = vi.spyOn(VotingCloseElectionOperation.prototype, 'Execute');
        const result = await new CloseElectionAction().Run(makeParams({}));
        expect(result.ResultCode).toBe('MISSING_PARAMETER');
        expect(spy).not.toHaveBeenCalled();
    });

    it('surfaces a logical operation failure', async () => {
        vi.spyOn(VotingCloseElectionOperation.prototype, 'Execute').mockResolvedValue(ok({ Success: false, Message: 'Not open' }));
        const result = await new CloseElectionAction().Run(makeParams({ ElectionID: 'e1' }));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('OPERATION_FAILED');
        expect(result.Message).toBe('Not open');
    });

    it('surfaces a transport failure code (FORBIDDEN)', async () => {
        vi.spyOn(VotingOpenElectionOperation.prototype, 'Execute').mockResolvedValue({ Success: false, ResultCode: 'FORBIDDEN', ErrorMessage: 'nope' });
        const result = await new OpenElectionAction().Run(makeParams({ ElectionID: 'e1' }));
        expect(result.ResultCode).toBe('FORBIDDEN');
    });

    it('Get Turnout maps scalars and JSON', async () => {
        vi.spyOn(VotingGetTurnoutOperation.prototype, 'Execute').mockResolvedValue(ok({ Success: true, Eligible: 10, Voted: 4, TurnoutPercent: 40, QuorumMet: false }));
        const params = makeParams({ ElectionID: 'e1' });
        const result = await new GetTurnoutAction().Run(params);
        expect(result.Success).toBe(true);
        expect(outputOf(params, 'VoterCount')).toBe(10);
        expect(outputOf(params, 'TurnoutCount')).toBe(4);
        expect(outputOf(params, 'TurnoutPercent')).toBe(40);
    });

    it('Get Results sends ONLY ElectionID, ignoring caller-claimed viewer flags', async () => {
        const spy = vi.spyOn(VotingGetResultsOperation.prototype, 'Execute').mockResolvedValue(ok({ Success: true, Visible: true, IsFinal: true }));
        const params = makeParams({ ElectionID: 'e1', IsAdministrator: true, IsEligible: true, HasVoted: true, IsHostMember: true });
        const result = await new GetElectionResultsAction().Run(params);
        expect(result.Success).toBe(true);
        expect(spy.mock.calls[0][0]).toEqual({ ElectionID: 'e1' });
        expect(JSON.parse(outputOf(params, 'ResultsJSON') as string).Visible).toBe(true);
    });

    it('Tally passes the seed and maps contests', async () => {
        const spy = vi.spyOn(VotingTallyOperation.prototype, 'Execute').mockResolvedValue(ok({ Success: true, Status: 'Tallied', Contests: [] }));
        const params = makeParams({ ElectionID: 'e1', TieBreakSeed: 'abc' });
        const result = await new TallyElectionAction().Run(params);
        expect(result.Success).toBe(true);
        expect(spy.mock.calls[0][0]).toEqual({ ElectionID: 'e1', TieBreakSeed: 'abc' });
        expect(outputOf(params, 'Status')).toBe('Tallied');
        expect(outputOf(params, 'ContestsJSON')).toBe('[]');
    });
});

describe('Create Motion Vote', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('builds a one-contest Motion election with anchors and threshold', () => {
        const input = BuildMotionElectionInput({
            Name: 'Bylaw', MotionText: 'Adopt', AnchorEntityName: 'Committees', AnchorRecordID: 'c1',
            EligibilitySourceCode: 'entity-query', ClosesAt: '2027-01-01T00:00:00.000Z', Threshold: 'TwoThirds', ElectionTypeCode: 'motion'
        });
        expect(input.Contests).toHaveLength(1);
        expect(input.Contests[0]).toMatchObject({ Kind: 'Motion', Threshold: 'TwoThirds', Description: 'Adopt' });
        expect(input.Anchors).toEqual([{ EntityName: 'Committees', RecordID: 'c1', IsPrimary: true }]);
    });

    it('executes CreateElection and returns ElectionID', async () => {
        const spy = vi.spyOn(VotingCreateElectionOperation.prototype, 'Execute').mockResolvedValue(ok({ Success: true, ElectionID: 'new-1' }));
        const params = makeParams({
            Name: 'Motion', MotionText: 'Do it', EligibilitySourceCode: 'csv',
            EligibilitySourceSettings: '{"Rows":[]}', ClosesAt: '2027-01-01T00:00:00Z'
        });
        const result = await new CreateMotionVoteAction().Run(params);
        expect(result.Success).toBe(true);
        const sent = spy.mock.calls[0][0] as VotingCreateElectionInput;
        expect(sent.ElectionTypeCode).toBe('motion');
        expect(sent.Contests[0].Threshold).toBe('Majority');
        expect(sent.EligibilitySource).toEqual({ Code: 'csv', Settings: { Rows: [] } });
        expect(outputOf(params, 'ElectionID')).toBe('new-1');
    });

    it('rejects bad threshold, bad JSON, partial anchor', async () => {
        const base = { Name: 'M', MotionText: 'T', EligibilitySourceCode: 'csv', ClosesAt: '2027-01-01T00:00:00Z' };
        expect((await new CreateMotionVoteAction().Run(makeParams({ ...base, Threshold: 'Half' }))).ResultCode).toBe('INVALID_PARAMETER');
        expect((await new CreateMotionVoteAction().Run(makeParams({ ...base, EligibilitySourceSettings: '{bad' }))).ResultCode).toBe('INVALID_SETTINGS_JSON');
        expect((await new CreateMotionVoteAction().Run(makeParams({ ...base, AnchorEntityName: 'X' }))).ResultCode).toBe('INVALID_PARAMETER');
        expect((await new CreateMotionVoteAction().Run(makeParams({ ...base, ClosesAt: 'nope' }))).ResultCode).toBe('INVALID_DATE');
    });
});
