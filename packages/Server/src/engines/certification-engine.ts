/**
 * CertificationEngine: the sign-off that makes a tallied result the result of record (design section 5, ElectionCertification).
 *
 * Each call to Certify is one certifier's signature (the acting user's Person). The ElectionCertification row is created on
 * the first call (Draft) with the roll hash, the ballot-set hash and the results-timing disclosure; when the number of
 * signed certifiers reaches Configuration.RequiredCertifiers (default 1) the certification becomes Certified, the election
 * becomes Certified and the election-type driver's OnResultsCertified runs, all in one transaction.
 *
 * BallotSetHash = Sha256Hex of the sorted `${CastBallot.ID}:${BallotStyleHash}:${ReceiptCode}` of the counted ballots, so a
 * ballot added, removed or altered after certification changes the hash. It reads identity columns only, never selections.
 */

import { BaseSingleton } from '@memberjunction/global';
import { ElectionTypeDriverRegistry } from '@mj-biz-apps/voting-core-entities-server';
import {
    type mjBizAppsVotingElectionCertificationEntity,
    type mjBizAppsVotingElectionCertifierEntity,
} from '@mj-biz-apps/voting-entities';
import { ElectionAudit } from '../shared/audit.js';
import { LoadElectionGraph } from '../shared/election-graph.js';
import { VotingAuthorization } from '../shared/authorization.js';
import { SystemContext } from '../shared/system-user.js';
import { type EngineResult, type VotingContext, Fail, IsFailure, Ok, PassFailure, RunViewOf } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { BuildResultsContext, ErrorText, FindPersonForUser, LoadFinalContestResults, SaveOrThrow, RunTransactional } from './person-support.js';
import { type BallotIdentity, ComputeBallotSetHash } from './tally-pipeline.js';
import { DescribeResultsTimingDisclosure, RequiredCertifiersOf } from './results-policy.js';

const CERTIFICATIONS_ENTITY = 'MJ_BizApps_Voting: Election Certifications';
const CERTIFIERS_ENTITY = 'MJ_BizApps_Voting: Election Certifiers';
const CAST_BALLOTS_ENTITY = 'MJ_BizApps_Voting: Cast Ballots';
const SNAPSHOTS_ENTITY = 'MJ_BizApps_Voting: Result Snapshots';

export interface CertifyValue {
    CertificationID: string;
    /** The election's status after this call: 'Certified' once enough certifiers have signed, otherwise still 'Tallied'. */
    Status: string;
    SignaturesReceived: number;
    SignaturesRequired: number;
}

export class CertificationEngine extends BaseSingleton<CertificationEngine> {
    protected constructor() {
        super();
    }

    public static get Instance(): CertificationEngine {
        return super.getInstance<CertificationEngine>();
    }

    public async Certify(electionID: string, notes: string | undefined, ctx: VotingContext): Promise<EngineResult<CertifyValue>> {
        const loaded = await LoadElectionGraph(electionID, ctx);
        if (IsFailure(loaded)) return PassFailure(loaded);
        const graph = loaded.Value;
        const election = graph.Election;

        if (election.Status !== 'Tallied') return Fail('NotTallied', `The election is ${election.Status}; only a Tallied election can be certified.`);
        if (election.ChallengeWindowEndsAt && new Date(election.ChallengeWindowEndsAt).getTime() > Date.now()) {
            return Fail('ChallengeWindowOpen', 'The challenge window has not ended yet.');
        }
        if (!election.RollHash) return Fail('NoRollHash', 'The election has no frozen roll hash.');
        const finals = await LoadFinalContestResults(graph.Contests.map((c) => c.ID), ctx);
        if (finals.length < graph.Contests.length) return Fail('ResultsMissing', 'Not every contest has a final result.');

        const person = await FindPersonForUser(ctx);
        if (!person) return Fail('NoCertifierPerson', 'The acting user is not linked to a person record, so cannot sign the certification.');

        const ballotSetHash = await this.computeBallotSetHash(election.ID, ctx);
        if (IsFailure(ballotSetHash)) return PassFailure(ballotSetHash);
        const snapshotCount = await this.countSnapshots(election.ID, ctx);
        const disclosure = DescribeResultsTimingDisclosure({
            Timing: election.ResultsTiming,
            Audience: election.ResultsAudience,
            MinCast: election.ResultsMinCast,
            SecrecyMode: election.SecrecyMode,
            AssuranceTier: election.AssuranceTier,
            SnapshotCount: snapshotCount,
        });
        const required = RequiredCertifiersOf(graph.Configuration);
        const driverLookup = ElectionTypeDriverRegistry.Instance.GetDriver(graph.ElectionType);
        if (!driverLookup.driver) return Fail('DriverUnavailable', driverLookup.error ?? 'The election type driver is not available.');
        const driver = driverLookup.driver;

        const existing = await this.loadCertification(election.ID, ctx);
        if (existing?.Status === 'Certified') return Fail('AlreadyCertified', 'This election is already certified.');
        if (existing?.Status === 'Revoked') return Fail('CertificationRevoked', 'The certification was revoked.');
        if (existing && (existing.BallotSetHash !== ballotSetHash.Value || existing.RollHash !== election.RollHash)) {
            return Fail('HashMismatch', 'The ballot set or roll no longer matches the certification in progress.');
        }
        const signers = existing ? await this.loadCertifiers(existing.ID, ctx) : [];
        if (signers.some((s) => s.PersonID.toLowerCase() === person.ID.toLowerCase())) {
            return Fail('AlreadySigned', 'You have already signed this certification.');
        }

        let value: CertifyValue;
        try {
            value = await RunTransactional(ctx, async () => {
                const certification =
                    existing ?? (await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionCertificationEntity>(CERTIFICATIONS_ENTITY, ctx.ContextUser));
                if (!existing) {
                    certification.NewRecord();
                    certification.ElectionID = election.ID;
                    certification.Status = 'Draft';
                    certification.RollHash = election.RollHash;
                    certification.BallotSetHash = ballotSetHash.Value;
                    certification.ResultsTimingDisclosure = disclosure;
                }
                if (notes && notes.trim() !== '') {
                    certification.Notes = certification.Notes ? `${certification.Notes}\n${notes.trim()}` : notes.trim();
                }
                await SaveOrThrow(certification, 'The certification');

                const certifier = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionCertifierEntity>(CERTIFIERS_ENTITY, ctx.ContextUser);
                certifier.NewRecord();
                certifier.ElectionCertificationID = certification.ID;
                certifier.PersonID = person.ID;
                certifier.Role = VotingAuthorization.IsInspector(ctx.ContextUser) ? 'Election Inspector' : 'Administrator';
                certifier.SignedAt = new Date();
                await SaveOrThrow(certifier, 'The certifier signature');

                const signed = signers.length + 1;
                if (signed >= required) {
                    certification.Status = 'Certified';
                    certification.CertifiedAt = new Date();
                    await SaveOrThrow(certification, 'The certification');
                    election.Status = 'Certified';
                    await SaveOrThrow(election, 'The election status');
                    await driver.OnResultsCertified(await BuildResultsContext(graph, ctx));
                }
                return { CertificationID: certification.ID, Status: election.Status, SignaturesReceived: signed, SignaturesRequired: required };
            });
        } catch (e) {
            return Fail('CertifyFailed', ErrorText(e));
        }

        await ElectionAudit.Record(ctx, election.ID, value.Status === 'Certified' ? 'Certified' : 'CertifierSigned', {
            SignaturesReceived: value.SignaturesReceived,
            SignaturesRequired: value.SignaturesRequired,
            BallotSetHash: ballotSetHash.Value,
            RollHash: election.RollHash,
        });
        return Ok(value);
    }

    /** Hash of the counted ballot set (identity columns only). */
    private async computeBallotSetHash(electionID: string, ctx: VotingContext): Promise<EngineResult<string>> {
        const sys = SystemContext(ctx);
        const res = await RunViewOf(sys).RunView<BallotIdentity>(
            {
                EntityName: CAST_BALLOTS_ENTITY,
                ExtraFilter: `ElectionID = ${SqlLiteral(electionID)} AND Status = 'Counted'`,
                Fields: ['ID', 'BallotStyleHash', 'ReceiptCode'],
                ResultType: 'simple',
            },
            sys.ContextUser
        );
        return res.Success ? Ok(ComputeBallotSetHash(res.Results)) : Fail('LoadFailed', 'The counted ballots could not be listed.');
    }

    private async countSnapshots(electionID: string, ctx: VotingContext): Promise<number> {
        const res = await RunViewOf(ctx).RunView(
            { EntityName: SNAPSHOTS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(electionID)}`, ResultType: 'count_only' },
            ctx.ContextUser
        );
        return res.Success ? res.TotalRowCount : 0;
    }

    private async loadCertification(electionID: string, ctx: VotingContext): Promise<mjBizAppsVotingElectionCertificationEntity | null> {
        const res = await RunViewOf(ctx).RunView<mjBizAppsVotingElectionCertificationEntity>(
            { EntityName: CERTIFICATIONS_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(electionID)}`, MaxRows: 1, ResultType: 'entity_object' },
            ctx.ContextUser
        );
        return res.Success && res.Results[0] ? res.Results[0] : null;
    }

    private async loadCertifiers(certificationID: string, ctx: VotingContext): Promise<Array<{ PersonID: string }>> {
        const res = await RunViewOf(ctx).RunView<{ PersonID: string }>(
            {
                EntityName: CERTIFIERS_ENTITY,
                ExtraFilter: `ElectionCertificationID = ${SqlLiteral(certificationID)} AND SignedAt IS NOT NULL`,
                Fields: ['PersonID'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        return res.Success ? res.Results : [];
    }
}
