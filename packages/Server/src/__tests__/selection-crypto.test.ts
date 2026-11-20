import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    DecryptCipher,
    DecryptSelections,
    EncryptSelections,
    EncryptTierA,
    EncryptTierB,
    ResolveTierAKey,
    SelectionCryptoError,
} from '../crypto/selection-crypto.js';
import { type ElectionGraph } from '../shared/election-graph.js';

const key = Buffer.alloc(32, 7);
const json = JSON.stringify({ Contests: [{ ContestID: 'c1', Selections: [{ OptionID: 'o1' }] }] });
const graphFor = (tier: string, pem: string | null = null): ElectionGraph =>
    ({ Election: { AssuranceTier: tier, ElectionPublicKey: pem } }) as unknown as ElectionGraph;

describe('SelectionCrypto tier A', () => {
    it('round-trips and uses the v1:a format', () => {
        const c = EncryptTierA(json, key);
        expect(c.startsWith('v1:a:')).toBe(true);
        expect(c.split(':')).toHaveLength(5);
        expect(c).not.toContain('OptionID');
        expect(DecryptCipher(c, () => key)).toBe(json);
    });
    it('uses a fresh IV each time', () => {
        expect(EncryptTierA(json, key)).not.toBe(EncryptTierA(json, key));
    });
    it('detects tampering and a wrong key', () => {
        const parts = EncryptTierA(json, key).split(':');
        const ct = Buffer.from(parts[4], 'base64');
        ct[0] ^= 1;
        parts[4] = ct.toString('base64');
        expect(() => DecryptCipher(parts.join(':'), () => key)).toThrow(SelectionCryptoError);
        expect(() => DecryptCipher(EncryptTierA(json, key), () => Buffer.alloc(32, 9))).toThrow(SelectionCryptoError);
    });
    it('resolves keys: valid env, invalid env, production fail-closed, dev fallback', () => {
        expect(ResolveTierAKey(key.toString('base64'), 'production').equals(key)).toBe(true);
        expect(() => ResolveTierAKey(Buffer.alloc(8).toString('base64'), 'development')).toThrow(SelectionCryptoError);
        expect(() => ResolveTierAKey(undefined, 'production')).toThrow(SelectionCryptoError);
        expect(ResolveTierAKey(undefined, 'development')).toHaveLength(32);
    });
});

describe('SelectionCrypto tier B', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    it('round-trips with the private key and uses the v1:b format', async () => {
        const c = await EncryptSelections(json, graphFor('HighAssurance', publicKey));
        expect(c.startsWith('v1:b:')).toBe(true);
        expect(c.split(':')).toHaveLength(6);
        expect(await DecryptSelections(c, graphFor('HighAssurance', publicKey), privateKey)).toBe(json);
    });
    it('needs the private key', async () => {
        const c = EncryptTierB(json, publicKey);
        await expect(DecryptSelections(c, graphFor('HighAssurance', publicKey))).rejects.toMatchObject({ Code: 'PrivateKeyRequired' });
    });
    it('detects tampering', () => {
        const parts = EncryptTierB(json, publicKey).split(':');
        const ct = Buffer.from(parts[5], 'base64');
        ct[0] ^= 1;
        parts[5] = ct.toString('base64');
        expect(() => DecryptCipher(parts.join(':'), () => key, privateKey)).toThrow(SelectionCryptoError);
    });
    it('refuses without a public key', async () => {
        await expect(EncryptSelections(json, graphFor('HighAssurance', null))).rejects.toMatchObject({ Code: 'KeyMissing' });
    });
});

describe('SelectionCrypto tier C', () => {
    it('is refused', async () => {
        await expect(EncryptSelections(json, graphFor('Verifiable'))).rejects.toMatchObject({ Code: 'TierNotSupported' });
        await expect(DecryptSelections('v1:a:x:y:z', graphFor('Verifiable'))).rejects.toMatchObject({ Code: 'TierNotSupported' });
    });
});
