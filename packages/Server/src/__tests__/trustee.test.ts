import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { SplitSecret } from '../crypto/shamir.js';
import {
    ComputeShareCommitment,
    PrivateKeyMatchesPublicKey,
    TrusteeKeyVault,
    VerifyShareAgainstCommitment,
} from '../crypto/trustee-commitments.js';

const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const other = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('trustee commitments', () => {
    const shares = SplitSecret(Buffer.from('some secret bytes'), 3, 2);

    it('verifies the right share at the right index', () => {
        const stored = ComputeShareCommitment(shares[0]);
        expect(stored.PublicShare).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.Commitment).toMatch(/^[0-9a-f]{64}$/);
        expect(VerifyShareAgainstCommitment(shares[0], 1, stored)).toBe(true);
        expect(VerifyShareAgainstCommitment(shares[0].toUpperCase(), 1, stored)).toBe(true);
    });

    it('rejects a wrong index, another share, or a tampered share', () => {
        const stored = ComputeShareCommitment(shares[0]);
        expect(VerifyShareAgainstCommitment(shares[0], 2, stored)).toBe(false);
        expect(VerifyShareAgainstCommitment(shares[1], 1, stored)).toBe(false);
        const tampered = shares[0].slice(0, -1) + (shares[0].endsWith('0') ? '1' : '0');
        expect(VerifyShareAgainstCommitment(tampered, 1, stored)).toBe(false);
        expect(VerifyShareAgainstCommitment('nonsense', 1, stored)).toBe(false);
    });

    it('commitment differs from the public share', () => {
        const stored = ComputeShareCommitment(shares[1]);
        expect(stored.Commitment).not.toBe(stored.PublicShare);
    });
});

describe('TrusteeKeyVault', () => {
    const shares = SplitSecret(Buffer.from(pair.privateKey, 'utf8'), 4, 3);

    it('reconstructs and verifies the key at the threshold', () => {
        const vault = new TrusteeKeyVault();
        vault.AddShare('E1', shares[0]);
        vault.AddShare('E1', shares[2]);
        expect(vault.TryReconstruct('E1', 3, pair.publicKey)).toBe('WaitingForShares');
        expect(vault.GetKey('E1')).toBeNull();
        expect(vault.AddShare('e1', shares[3])).toBe(3);
        expect(vault.TryReconstruct('E1', 3, pair.publicKey)).toBe('Ready');
        expect(vault.GetKey('E1')).toBe(pair.privateKey);
        vault.Clear('E1');
        expect(vault.GetKey('E1')).toBeNull();
        expect(vault.ShareCount('E1')).toBe(0);
    });

    it('resubmitting the same index does not count twice', () => {
        const vault = new TrusteeKeyVault();
        vault.AddShare('E2', shares[0]);
        expect(vault.AddShare('E2', shares[0])).toBe(1);
    });

    it('detects a key that does not match the election public key and drops the shares', () => {
        const vault = new TrusteeKeyVault();
        shares.slice(0, 3).forEach((s) => vault.AddShare('E3', s));
        expect(vault.TryReconstruct('E3', 3, other.publicKey)).toBe('KeyMismatch');
        expect(vault.GetKey('E3')).toBeNull();
        expect(vault.ShareCount('E3')).toBe(0);
    });

    it('keeps elections separate', () => {
        const vault = new TrusteeKeyVault();
        shares.slice(0, 3).forEach((s) => vault.AddShare('A', s));
        expect(vault.TryReconstruct('A', 3, pair.publicKey)).toBe('Ready');
        expect(vault.GetKey('B')).toBeNull();
    });
});

describe('PrivateKeyMatchesPublicKey', () => {
    it('matches pairs only', () => {
        expect(PrivateKeyMatchesPublicKey(pair.privateKey, pair.publicKey)).toBe(true);
        expect(PrivateKeyMatchesPublicKey(pair.privateKey, other.publicKey)).toBe(false);
        expect(PrivateKeyMatchesPublicKey('not a key', pair.publicKey)).toBe(false);
    });
});
