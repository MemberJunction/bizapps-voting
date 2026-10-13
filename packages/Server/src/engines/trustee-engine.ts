/**
 * TrusteeEngine: the tier B (High assurance) key ceremony (design section 4.4).
 *
 * CreateTrusteeKeys: an RSA-3072 key pair is generated in memory. The PRIVATE key PEM bytes are split with Shamir k-of-n over
 * GF(256) (crypto/shamir.ts) and returned ONCE to the caller (one share per trustee); the private key is then discarded and
 * never stored. The public key, the threshold, the trustee rows and a commitment per share are stored.
 *
 * SubmitKeyShare: during the tally ceremony each trustee submits their share. The caller must BE that trustee (the Person
 * linked to the acting user); the share is checked against its stored commitment and then held in process memory only.
 * When k verified shares are present the private key is reconstructed and checked against Election.ElectionPublicKey.
 *
 * MULTI-INSTANCE LIMITATION: shares and the reconstructed key live in this MJAPI process (see TrusteeKeyVault). Every
 * trustee must reach the same instance, and a restart loses them (trustees resubmit). Nothing is written to the database
 * or a log. TallyEngine calls ClearKeyMaterial as soon as the tally commits.
 */

import { generateKeyPair } from 'node:crypto';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import {
    type VotingCreateTrusteeKeysInput,
    type VotingSubmitKeyShareInput,
    type VotingTrusteeKeyShare,
    type mjBizAppsVotingElectionTrusteeEntity,
    type mjBizAppsVotingTrusteeKeyCommitmentEntity,
} from '@mj-biz-apps/voting-entities';
import { SplitSecret } from '../crypto/shamir.js';
import { ComputeShareCommitment, TrusteeKeyVault, VerifyShareAgainstCommitment } from '../crypto/trustee-commitments.js';
import { ElectionAudit } from '../shared/audit.js';
import { SystemContext } from '../shared/system-user.js';
import { type EngineResult, type VotingContext, Fail, IsFailure, Ok, PassFailure, RunViewOf } from '../shared/types.js';
import { SqlLiteral } from '../shared/voter-identity.js';
import { ErrorText, FindPersonForUser, GetPerson, LoadElectionEntity, SaveOrThrow, RunTransactional } from './person-support.js';

const TRUSTEES_ENTITY = 'MJ_BizApps_Voting: Election Trustees';
const COMMITMENTS_ENTITY = 'MJ_BizApps_Voting: Trustee Key Commitments';
const RSA_MODULUS_BITS = 3072;

export interface CreateTrusteeKeysValue {
    /** The election public key (PEM), also stored on the election. */
    PublicKey: string;
    /** One share per trustee, returned once and never stored. */
    Shares: VotingTrusteeKeyShare[];
}

export interface SubmitKeyShareValue {
    Accepted: boolean;
    SharesReceived: number;
    SharesRequired: number;
    /** True once the private key has been reconstructed and verified on this instance. */
    KeyReady: boolean;
}

interface GeneratedPair {
    PublicKeyPem: string;
    PrivateKeyPem: string;
}

function generateRsaPair(): Promise<GeneratedPair> {
    return new Promise((resolve, reject) => {
        generateKeyPair(
            'rsa',
            {
                modulusLength: RSA_MODULUS_BITS,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            },
            (err, publicKey, privateKey) => (err ? reject(err) : resolve({ PublicKeyPem: publicKey, PrivateKeyPem: privateKey }))
        );
    });
}

export class TrusteeEngine extends BaseSingleton<TrusteeEngine> {
    private readonly vault = new TrusteeKeyVault();

    protected constructor() {
        super();
    }

    public static get Instance(): TrusteeEngine {
        return super.getInstance<TrusteeEngine>();
    }

    /** Generates the election key pair and distributes the private key as Shamir shares. See the file header. */
    public async CreateTrusteeKeys(input: VotingCreateTrusteeKeysInput, ctx: VotingContext): Promise<EngineResult<CreateTrusteeKeysValue>> {
        const trusteeIDs = input.TrusteePersonIDs;
        const n = trusteeIDs.length;
        const k = input.Threshold;
        const unique = new Set(trusteeIDs.map((id) => id.toLowerCase()));
        if (n < 2 || unique.size !== n) return Fail('InvalidTrustees', 'Name at least two distinct trustees.');
        if (!Number.isInteger(k) || k < 2 || k > n) return Fail('InvalidThreshold', 'The threshold must be a whole number from 2 up to the number of trustees.');

        const election = await LoadElectionEntity(input.ElectionID, ctx);
        if (!election) return Fail('ElectionNotFound', 'The election was not found.');
        if (election.AssuranceTier !== 'HighAssurance') return Fail('WrongTier', 'Trustee keys apply only to High assurance elections.');
        if (election.Status !== 'Draft' && election.Status !== 'Ready') {
            return Fail('KeysLocked', 'Trustee keys can be created only while the election is in Draft or Ready.');
        }
        if (election.ElectionPublicKey) return Fail('KeysAlreadyCreated', 'This election already has trustee keys.');
        const existing = await this.loadTrustees(election.ID, ctx);
        if (existing.length > 0) return Fail('KeysAlreadyCreated', 'This election already has trustees.');
        for (const personID of trusteeIDs) {
            if (!(await GetPerson(personID, ctx))) return Fail('TrusteeNotFound', 'A named trustee is not a known person.');
        }

        const pair = await generateRsaPair();
        const secret = Buffer.from(pair.PrivateKeyPem, 'utf8');
        let shares: string[];
        try {
            shares = SplitSecret(secret, n, k);
        } finally {
            secret.fill(0);
        }
        const publicKey = pair.PublicKeyPem;

        try {
            await RunTransactional(ctx, async () => {
                election.ElectionPublicKey = publicKey;
                election.TrusteeThreshold = k;
                await SaveOrThrow(election, 'The election key');
                for (let i = 0; i < n; i++) {
                    const trustee = await ctx.Provider.GetEntityObject<mjBizAppsVotingElectionTrusteeEntity>(TRUSTEES_ENTITY, ctx.ContextUser);
                    trustee.NewRecord();
                    trustee.ElectionID = election.ID;
                    trustee.TrusteePersonID = trusteeIDs[i];
                    trustee.ShareIndex = i + 1;
                    trustee.Status = 'KeyCommitted';
                    await SaveOrThrow(trustee, 'A trustee');
                    const stored = ComputeShareCommitment(shares[i]);
                    const commitment = await ctx.Provider.GetEntityObject<mjBizAppsVotingTrusteeKeyCommitmentEntity>(COMMITMENTS_ENTITY, ctx.ContextUser);
                    commitment.NewRecord();
                    commitment.ElectionTrusteeID = trustee.ID;
                    commitment.PublicShare = stored.PublicShare;
                    commitment.Commitment = stored.Commitment;
                    await SaveOrThrow(commitment, 'A key commitment');
                }
            });
        } catch (e) {
            return Fail('KeyCeremonyFailed', ErrorText(e));
        }

        await ElectionAudit.Record(ctx, election.ID, 'TrusteeKeysCreated', { TrusteeCount: n, Threshold: k });
        return Ok({
            PublicKey: publicKey,
            Shares: trusteeIDs.map((personID, i) => ({ TrusteePersonID: personID, ShareIndex: i + 1, Share: shares[i] })),
        });
    }

    /**
     * Verifies and holds one trustee's share; reconstructs the key when the threshold is reached.
     * `ctx` is the context the engine reads and writes under (the system context from a voter-facing operation: a trustee
     * is an ordinary member with no permission on the trustee tables); `caller` is who is asking, and is matched to the
     * trustee's Person. Both default to one another for in-process callers that already hold the right context.
     */
    public async SubmitKeyShare(input: VotingSubmitKeyShareInput, ctx: VotingContext, caller: VotingContext = ctx): Promise<EngineResult<SubmitKeyShareValue>> {
        const election = await LoadElectionEntity(input.ElectionID, ctx);
        if (!election) return Fail('ElectionNotFound', 'The election was not found.');
        if (election.AssuranceTier !== 'HighAssurance') return Fail('WrongTier', 'Key shares apply only to High assurance elections.');
        if (election.Status !== 'Closed' && election.Status !== 'Tallied') {
            return Fail('NotClosed', 'Key shares are accepted once voting has closed.');
        }
        const threshold = election.TrusteeThreshold;
        const publicKey = election.ElectionPublicKey;
        if (!threshold || !publicKey) return Fail('NoTrusteeKeys', 'This election has no trustee keys.');

        const person = await FindPersonForUser(caller, ctx);
        if (!person) return Fail('NotATrustee', 'You are not a trustee of this election.');
        const trustees = await this.loadTrustees(election.ID, ctx);
        const trustee = trustees.find((t) => t.ShareIndex === input.ShareIndex && t.Status !== 'Removed');
        if (!trustee || !UUIDsEqual(trustee.TrusteePersonID, person.ID)) return Fail('NotATrustee', 'You are not the trustee for that share.');

        const commitment = await this.loadCommitment(trustee.ID, ctx);
        if (!commitment) return Fail('NoCommitment', 'No key commitment is on file for that share.');
        if (!VerifyShareAgainstCommitment(input.Share, input.ShareIndex, commitment)) {
            await ElectionAudit.Record(ctx, election.ID, 'KeyShareRejected', { ShareIndex: input.ShareIndex });
            return Fail('ShareRejected', 'The share does not match its commitment.');
        }

        this.vault.AddShare(election.ID, input.Share);
        const status = this.vault.TryReconstruct(election.ID, threshold, publicKey);
        if (status === 'KeyMismatch') {
            await ElectionAudit.Record(ctx, election.ID, 'KeyReconstructionFailed', { Threshold: threshold });
            return Fail('KeyMismatch', 'The submitted shares do not reconstruct the election key. They were discarded; trustees must resubmit.');
        }
        await this.markShareSubmitted(trustee, ctx);
        const received = this.vault.ShareCount(election.ID);
        await ElectionAudit.Record(ctx, election.ID, 'KeyShareSubmitted', {
            ShareIndex: input.ShareIndex,
            SharesReceived: received,
            SharesRequired: threshold,
            KeyReady: status === 'Ready',
        });
        return Ok({ Accepted: true, SharesReceived: received, SharesRequired: threshold, KeyReady: status === 'Ready' });
    }

    /** The reconstructed election private key (PEM), or null when fewer than k verified shares have been submitted to this instance. */
    public GetReconstructedKey(electionID: string): string | null {
        return this.vault.GetKey(electionID);
    }

    /** Shares held on this instance for the election. */
    public GetShareCount(electionID: string): number {
        return this.vault.ShareCount(electionID);
    }

    /** Wipes the shares and the reconstructed key from memory. Called after every tally. */
    public ClearKeyMaterial(electionID: string): void {
        this.vault.Clear(electionID);
    }

    private async loadTrustees(electionID: string, ctx: VotingContext): Promise<mjBizAppsVotingElectionTrusteeEntity[]> {
        const res = await RunViewOf(ctx).RunView<mjBizAppsVotingElectionTrusteeEntity>(
            { EntityName: TRUSTEES_ENTITY, ExtraFilter: `ElectionID = ${SqlLiteral(electionID)}`, OrderBy: 'ShareIndex', ResultType: 'entity_object' },
            ctx.ContextUser
        );
        return res.Success ? res.Results : [];
    }

    private async loadCommitment(trusteeID: string, ctx: VotingContext): Promise<{ PublicShare: string; Commitment: string } | null> {
        const res = await RunViewOf(ctx).RunView<{ PublicShare: string; Commitment: string }>(
            {
                EntityName: COMMITMENTS_ENTITY,
                ExtraFilter: `ElectionTrusteeID = ${SqlLiteral(trusteeID)}`,
                Fields: ['PublicShare', 'Commitment'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        return res.Success && res.Results[0] ? res.Results[0] : null;
    }

    /** Best effort: the trustee row records that a share was submitted. Failure does not undo an accepted share. */
    private async markShareSubmitted(trustee: mjBizAppsVotingElectionTrusteeEntity, ctx: VotingContext): Promise<void> {
        if (trustee.Status === 'ShareSubmitted') return;
        try {
            const sys = SystemContext(ctx);
            const row = await sys.Provider.GetEntityObject<mjBizAppsVotingElectionTrusteeEntity>(TRUSTEES_ENTITY, sys.ContextUser);
            if (await row.Load(trustee.ID)) {
                row.Status = 'ShareSubmitted';
                await row.Save();
            }
        } catch {
            // the share is held in memory regardless; the status row is informational
        }
    }
}
