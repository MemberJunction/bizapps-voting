/**
 * wire-smoke: the foundation checks of the over-the-wire tier. Import from `client-index.ts` only (client-safe).
 *
 *   S1  system key: RunView of a voting entity
 *   S2  admin persona (user API key) calls an admin Remote Operation
 *   S3  outsider persona is refused the same operation, and the REASON is asserted
 *   S4  guest ballot session minted through POST /vote/session can call GetMyBallot (and a bad PIN is refused at the edge)
 *   S5  an inspector persona is admitted to the read-only oversight operation the outsider was refused
 *   S6  an Explorer-style magic-link session (invite -> redeem) for a Voting Administrator can run the admin operation
 */
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import { VotingGetMyBallotOperation, VotingGetTurnoutOperation } from '@mj-biz-apps/voting-entities';
import { CloseWireElection, CreateOpenWireElection, type WireElection } from '../wire/election-world.js';
import { GetGuestSession, RequestGuestSession } from '../wire/guest-session.js';
import { CreateExplorerMagicLink } from '../wire/magic-link-session.js';
import { WireCast } from '../wire/wire-cast.js';
import { WireClient } from '../wire/wire-client.js';

const BUNDLE = 'wire-smoke';
const ELECTION_TYPES = 'MJ_BizApps_Voting: Election Types';

let cast: WireCast | undefined;
let election: WireElection | undefined;

function Cast(): WireCast {
    if (!cast) throw new Error('wire-smoke setup did not run');
    return cast;
}

function Election(): WireElection {
    if (!election) throw new Error('wire-smoke setup did not run');
    return election;
}

const checks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.S1`,
        Name: 'S1 - system key reads a voting entity over GraphQL',
        Fn: async () => {
            const res = await Cast().System.RunView<{ ID: string; Code: string }>({ EntityName: ELECTION_TYPES, Fields: ['ID', 'Code'], ResultType: 'simple' });
            Assert(res.Success, `RunView failed: ${res.ErrorMessage ?? 'unknown'}`);
            Assert(res.Results.length > 0, 'the seeded election types are visible over the wire');
            Assert(res.Results.some((r) => r.Code === 'motion'), 'the "motion" election type exists');
        },
    },
    {
        Id: `${BUNDLE}.S2`,
        Name: 'S2 - admin persona (user API key) runs Voting.GetTurnout',
        Fn: async () => {
            const admin = await Cast().As('admin');
            Assert(admin.User?.Email === Cast().Record('admin').Email, 'the admin provider authenticated as the admin persona, not the system user');
            const result = await admin.Call(new VotingGetTurnoutOperation(), { ElectionID: Election().ElectionID });
            Assert(result.Success, `call failed: ${result.ResultCode}: ${result.ErrorMessage}`);
            AssertEqual(result.ResultCode, 'SUCCESS', 'result code');
            Assert(result.Output?.Success === true, `operation refused: ${result.Output?.Message}`);
            AssertEqual(result.Output?.Eligible, Election().Voters.size, 'every rolled persona counts as eligible');
            AssertEqual(result.Output?.Voted, 0, 'nobody has voted yet');
        },
    },
    {
        Id: `${BUNDLE}.S3`,
        Name: 'S3 - outsider persona is refused Voting.GetTurnout (FORBIDDEN, by the operation authorization)',
        Fn: async () => {
            const outsider = await Cast().As('outsider');
            Assert(outsider.User?.Email === Cast().Record('outsider').Email, 'the outsider provider authenticated as the outsider persona');
            const result = await outsider.Call(new VotingGetTurnoutOperation(), { ElectionID: Election().ElectionID });
            Assert(!result.Success, 'the outsider must not be able to read turnout');
            AssertEqual(result.ResultCode, 'FORBIDDEN', 'refusal code');
            Assert((result.ErrorMessage ?? '').includes("'Voting.GetTurnout'"), `refusal names the operation: ${result.ErrorMessage}`);
            Assert(result.Output === undefined, 'a refused call returns no output');
        },
    },
    {
        Id: `${BUNDLE}.S4`,
        Name: 'S4 - guest session minted through POST /vote/session loads the ballot; a wrong PIN is refused at the edge',
        Fn: async () => {
            const voter = Election().Voters.get('member1');
            Assert(!!voter, 'member1 is on the wire election roll');
            const bad = await RequestGuestSession(Election().Slug, { SourceKey: voter!.SourceKey, Pin: '00000000' });
            Assert(bad.Kind === 'refused', 'a wrong PIN must not yield a session');
            if (bad.Kind === 'refused') {
                AssertEqual(bad.Status, 401, 'edge status for a failed sign-in');
                AssertEqual(bad.Code, 'sign_in_failed', 'edge code for a failed sign-in');
            }

            const session = await GetGuestSession(Election().Slug, { SourceKey: voter!.SourceKey, Pin: voter!.Pin });
            AssertEqual(session.ElectionID.toLowerCase(), Election().ElectionID.toLowerCase(), 'the session is scoped to the election');
            const guest = await WireClient.ConnectGuest('guest-member1', session.Token);
            const ballot = await guest.Call(new VotingGetMyBallotOperation(), { ElectionID: Election().ElectionID });
            Assert(ballot.Success, `GetMyBallot failed: ${ballot.ResultCode}: ${ballot.ErrorMessage}`);
            Assert(ballot.Output?.Success === true, `GetMyBallot refused: ${ballot.Output?.Message}`);
            AssertEqual(ballot.Output?.HasVoted, false, 'the guest has not voted');
            Assert((ballot.Output?.Style?.Contests.length ?? 0) === 1, 'the motion ballot has one contest');
            AssertEqual(ballot.Output?.Style?.Contests[0].Options.length, 2, 'Yes / No');

            // The same guest cannot use an admin operation: its scope is one ballot, not the administration of it.
            const turnout = await guest.Call(new VotingGetTurnoutOperation(), { ElectionID: Election().ElectionID });
            Assert(!turnout.Success, 'a guest ballot session must not run an admin operation');
        },
    },
    {
        Id: `${BUNDLE}.S5`,
        Name: 'S5 - inspector persona IS admitted to Voting.GetTurnout (read-only oversight)',
        Fn: async () => {
            const inspector = await Cast().As('inspector');
            const result = await inspector.Call(new VotingGetTurnoutOperation(), { ElectionID: Election().ElectionID });
            Assert(result.Success && result.Output?.Success === true, `inspector refused: ${result.ResultCode}: ${result.ErrorMessage ?? result.Output?.Message}`);
        },
    },
    {
        Id: `${BUNDLE}.S6`,
        Name: 'S6 - magic-link invite -> redeem yields an Explorer session that runs admin operations',
        Fn: async () => {
            // A fixed external address: the invite flow is idempotent for an account that is already external.
            const link = await CreateExplorerMagicLink(Cast().System, { Email: 'explorer-admin@voting-wire.test', ApplicationName: 'BizApps Voting', RoleName: 'Voting Administrator' });
            Assert(link.Token.split('.').length === 3, 'the redeemed session is a JWT');
            const session = await WireClient.Connect('explorer-admin', { Kind: 'bearer', Token: link.Token });
            Assert(session.User?.Email === 'explorer-admin@voting-wire.test', 'the session authenticates as the invited address');
            Assert((session.User?.UserRoles ?? []).some((r) => r.Role === 'Voting Administrator'), 'the session carries the invited role');
            const result = await session.Call(new VotingGetTurnoutOperation(), { ElectionID: Election().ElectionID });
            Assert(result.Success && result.Output?.Success === true, `admin operation refused for the magic-link admin: ${result.ResultCode}: ${result.ErrorMessage ?? result.Output?.Message}`);
        },
    },
];

for (const check of checks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (_ctx: IntegrationCheckContext) => {
        cast = await WireCast.Create();
        const admin = await cast.As('admin');
        election = await CreateOpenWireElection(cast, admin, { Voters: ['member1', 'member2', 'member3'] });
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        if (cast && election) await CloseWireElection(await cast.As('admin'), election);
        cast = undefined;
        election = undefined;
    },
});
