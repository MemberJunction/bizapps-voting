/**
 * Trustee key commitments (tier B). Pure helpers, no MJ imports.
 *
 * A "share" is the encoded string `${index}-${hex}` produced by shamir.ts. For each share the ceremony stores:
 *   PublicShare = hex SHA-256 of the share string
 *   Commitment  = hex SHA-256 of `${index}|${share}`
 * Neither value lets anyone recover the share (SHA-256 of a high-entropy secret), but a trustee presenting a share later
 * can be checked against both, and a wrong, truncated or swapped share is refused before it can poison the reconstruction.
 */

import { createHash, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { CombineShares, ParseShare, ShareIndexOf } from './shamir.js';

export interface ShareCommitment {
    PublicShare: string;
    Commitment: string;
}

function sha256Hex(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The two stored values for a share. */
export function ComputeShareCommitment(share: string): ShareCommitment {
    const normalized = share.trim().toLowerCase();
    const index = ShareIndexOf(normalized);
    if (index === null) throw new Error('Not a well-formed key share.');
    return { PublicShare: sha256Hex(normalized), Commitment: sha256Hex(`${index}|${normalized}`) };
}

function safeEqualHex(a: string, b: string): boolean {
    const ab = Buffer.from(a.toLowerCase(), 'utf8');
    const bb = Buffer.from(b.toLowerCase(), 'utf8');
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Whether a presented share matches the stored commitment and carries the expected index.
 * @param share The presented share string.
 * @param expectedIndex The ShareIndex of the trustee presenting it.
 * @param stored The TrusteeKeyCommitment values.
 */
export function VerifyShareAgainstCommitment(share: string, expectedIndex: number, stored: ShareCommitment): boolean {
    const index = ShareIndexOf(share);
    if (index === null || index !== expectedIndex) return false;
    const computed = ComputeShareCommitment(share);
    return safeEqualHex(computed.PublicShare, stored.PublicShare) && safeEqualHex(computed.Commitment, stored.Commitment);
}

// --- Key checks ---------------------------------------------------------------------------------------------

function normalizePem(pem: string): string {
    return pem.replace(/\s+/g, '');
}

/** Whether a private key PEM is the pair of the given public key PEM. False on any parse failure. */
export function PrivateKeyMatchesPublicKey(privateKeyPem: string, publicKeyPem: string): boolean {
    try {
        const derived = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: 'spki', format: 'pem' }).toString();
        return normalizePem(derived) === normalizePem(publicKeyPem);
    } catch {
        return false;
    }
}

// --- In-memory key vault ----------------------------------------------------------------------------------

export type ReconstructionStatus = 'WaitingForShares' | 'Ready' | 'KeyMismatch';

/**
 * Holds submitted shares and the reconstructed private key IN PROCESS MEMORY ONLY, per election. Nothing here is ever
 * written to the database, a log, or an error message.
 *
 * Multi-instance limitation: the vault belongs to one MJAPI process. Every trustee must submit to the SAME instance (pin
 * the tally ceremony to one node or route it by a sticky session); a restart loses the shares and the trustees resubmit.
 * That is deliberate for now: sharing key material through a database or cache would defeat the point of tier B.
 */
export class TrusteeKeyVault {
    private readonly shares = new Map<string, Map<number, string>>();
    private readonly keys = new Map<string, Buffer>();

    private static keyOf(electionID: string): string {
        return electionID.toLowerCase();
    }

    /** Stores a (verified) share, replacing any earlier one with the same index. Returns the number of distinct shares held. */
    public AddShare(electionID: string, share: string): number {
        const id = TrusteeKeyVault.keyOf(electionID);
        const normalized = share.trim().toLowerCase();
        const { Index } = ParseShare(normalized);
        const held = this.shares.get(id) ?? new Map<number, string>();
        held.set(Index, normalized);
        this.shares.set(id, held);
        return held.size;
    }

    public ShareCount(electionID: string): number {
        return this.shares.get(TrusteeKeyVault.keyOf(electionID))?.size ?? 0;
    }

    /**
     * Reconstructs the private key once `threshold` shares are held and checks it against the election public key. On a
     * mismatch the held shares are dropped (they cannot be trusted together).
     */
    public TryReconstruct(electionID: string, threshold: number, publicKeyPem: string): ReconstructionStatus {
        const id = TrusteeKeyVault.keyOf(electionID);
        if (this.keys.has(id)) return 'Ready';
        const held = this.shares.get(id);
        if (!held || held.size < threshold) return 'WaitingForShares';
        const chosen = Array.from(held.entries())
            .sort((a, b) => a[0] - b[0])
            .slice(0, threshold)
            .map(([, share]) => share);
        let secret: Uint8Array | null = null;
        try {
            secret = CombineShares(chosen);
            const pem = Buffer.from(secret).toString('utf8');
            if (!PrivateKeyMatchesPublicKey(pem, publicKeyPem)) {
                this.shares.delete(id);
                return 'KeyMismatch';
            }
            this.keys.set(id, Buffer.from(pem, 'utf8'));
            return 'Ready';
        } catch {
            this.shares.delete(id);
            return 'KeyMismatch';
        } finally {
            secret?.fill(0);
        }
    }

    /** The reconstructed private key PEM, or null until enough verified shares arrived. */
    public GetKey(electionID: string): string | null {
        const key = this.keys.get(TrusteeKeyVault.keyOf(electionID));
        return key ? key.toString('utf8') : null;
    }

    /** Wipes the key buffer and forgets the shares. */
    public Clear(electionID: string): void {
        const id = TrusteeKeyVault.keyOf(electionID);
        this.keys.get(id)?.fill(0);
        this.keys.delete(id);
        this.shares.delete(id);
    }
}
