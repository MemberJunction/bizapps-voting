/**
 * SelectionCrypto: encryption of ballot selections at rest (design section 4.4).
 *
 * Tier Standard (A): AES-256-GCM. Format `v1:a:<iv>:<tag>:<ct>` (base64 parts).
 * Tier HighAssurance (B): hybrid. A random AES-256 key encrypts the selections; that key is encrypted with the
 *   election's RSA-OAEP (SHA-256) public key (Election.ElectionPublicKey, PEM). The private key is never on the
 *   server (trustee shares). Format `v1:b:<encKey>:<iv>:<tag>:<ct>`.
 * Tier Verifiable (C): refused (`TierNotSupported`) until an ElectionGuard provider is registered.
 *
 * KEY SOURCE (tier A) - decision: environment variable `VOTING_SELECTIONS_KEY` (base64, 32 bytes).
 * MJ's EncryptionEngine encrypts a value under a key row identified by its UUID (EncryptionKeyID); it offers no
 * way to resolve a named key without a metadata record, and an Open App cannot assume one exists. The env key
 * keeps the key outside the database (operators who can read the DB cannot decrypt). In production a missing or
 * malformed key fails closed. Outside production a derived dev key is used with a logged warning.
 *
 * Nothing here logs plaintext, ciphertext or keys.
 */

import { createCipheriv, createDecipheriv, createHash, privateDecrypt, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { LogError, LogStatus } from '@memberjunction/core';
import { type ElectionGraph } from '../shared/election-graph.js';

export class SelectionCryptoError extends Error {
    constructor(public readonly Code: 'TierNotSupported' | 'KeyMissing' | 'KeyInvalid' | 'BadCiphertext' | 'PrivateKeyRequired', message: string) {
        super(message);
        this.name = 'SelectionCryptoError';
    }
}

export const SELECTIONS_KEY_ENV = 'VOTING_SELECTIONS_KEY';
const GCM_IV_BYTES = 12;
const AES_KEY_BYTES = 32;
let warnedDevKey = false;

const b64 = (b: Buffer): string => b.toString('base64');

/** Resolves the tier A key from an env value; fails closed in production. Exported for tests. */
export function ResolveTierAKey(envValue: string | undefined, nodeEnv: string | undefined): Buffer {
    if (envValue && envValue.trim()) {
        const key = Buffer.from(envValue.trim(), 'base64');
        if (key.length !== AES_KEY_BYTES) {
            throw new SelectionCryptoError('KeyInvalid', `${SELECTIONS_KEY_ENV} must be base64 of exactly 32 bytes.`);
        }
        return key;
    }
    if (nodeEnv === 'production') {
        throw new SelectionCryptoError('KeyMissing', `${SELECTIONS_KEY_ENV} is not configured; ballots cannot be recorded.`);
    }
    if (!warnedDevKey) {
        warnedDevKey = true;
        LogStatus(`${SELECTIONS_KEY_ENV} is not set; using a derived DEVELOPMENT key. Never do this in production.`);
    }
    return createHash('sha256').update('bizapps-voting-dev-selections-key').digest();
}

function aesEncrypt(plaintext: string, key: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { iv, tag: cipher.getAuthTag(), ct };
}

function aesDecrypt(iv: Buffer, tag: Buffer, ct: Buffer, key: Buffer): string {
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
        throw new SelectionCryptoError('BadCiphertext', 'The ballot ciphertext failed authentication.');
    }
}

/** Tier A encrypt with an explicit key. */
export function EncryptTierA(json: string, key: Buffer): string {
    const { iv, tag, ct } = aesEncrypt(json, key);
    return `v1:a:${b64(iv)}:${b64(tag)}:${b64(ct)}`;
}

/** Tier B encrypt to an RSA public key (PEM). */
export function EncryptTierB(json: string, publicKeyPem: string): string {
    const dataKey = randomBytes(AES_KEY_BYTES);
    const { iv, tag, ct } = aesEncrypt(json, dataKey);
    let encKey: Buffer;
    try {
        encKey = publicEncrypt({ key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dataKey);
    } catch {
        throw new SelectionCryptoError('KeyInvalid', 'The election public key is not a valid RSA public key.');
    }
    return `v1:b:${b64(encKey)}:${b64(iv)}:${b64(tag)}:${b64(ct)}`;
}

/** Decrypts either format. Tier B needs the reconstructed private key PEM. */
export function DecryptCipher(cipher: string, tierAKey: () => Buffer, privateKeyPem?: string): string {
    const parts = cipher.split(':');
    if (parts[0] !== 'v1') throw new SelectionCryptoError('BadCiphertext', 'Unknown ciphertext version.');
    if (parts[1] === 'a' && parts.length === 5) {
        return aesDecrypt(Buffer.from(parts[2], 'base64'), Buffer.from(parts[3], 'base64'), Buffer.from(parts[4], 'base64'), tierAKey());
    }
    if (parts[1] === 'b' && parts.length === 6) {
        if (!privateKeyPem) throw new SelectionCryptoError('PrivateKeyRequired', 'This ballot needs the election private key (trustee ceremony).');
        let dataKey: Buffer;
        try {
            dataKey = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(parts[2], 'base64'));
        } catch {
            throw new SelectionCryptoError('BadCiphertext', 'The data key could not be unwrapped with the election private key.');
        }
        return aesDecrypt(Buffer.from(parts[3], 'base64'), Buffer.from(parts[4], 'base64'), Buffer.from(parts[5], 'base64'), dataKey);
    }
    throw new SelectionCryptoError('BadCiphertext', 'Unrecognized ciphertext format.');
}

const envTierAKey = (): Buffer => ResolveTierAKey(process.env[SELECTIONS_KEY_ENV], process.env.NODE_ENV);

/** Encrypts the submission JSON for the election's assurance tier. */
export async function EncryptSelections(json: string, graph: ElectionGraph): Promise<string> {
    const tier = graph.Election.AssuranceTier;
    if (tier === 'Standard') return EncryptTierA(json, envTierAKey());
    if (tier === 'HighAssurance') {
        const pem = graph.Election.ElectionPublicKey;
        if (!pem) throw new SelectionCryptoError('KeyMissing', 'The election has no public key; run the trustee key ceremony first.');
        return EncryptTierB(json, pem);
    }
    throw new SelectionCryptoError('TierNotSupported', 'The Verifiable assurance tier needs an ElectionGuard provider, which is not registered.');
}

/** Decrypts stored selections. `graph` is accepted for symmetry and future tier routing. */
export async function DecryptSelections(cipher: string, graph: ElectionGraph, privateKeyPem?: string): Promise<string> {
    if (graph.Election.AssuranceTier === 'Verifiable') {
        throw new SelectionCryptoError('TierNotSupported', 'The Verifiable assurance tier needs an ElectionGuard provider, which is not registered.');
    }
    try {
        return DecryptCipher(cipher, envTierAKey, privateKeyPem);
    } catch (e) {
        if (e instanceof SelectionCryptoError) LogError(`SelectionCrypto: ${e.Code}`);
        throw e;
    }
}

/** Namespace-style access matching the engine contract. */
export class SelectionCrypto {
    public static EncryptSelections = EncryptSelections;
    public static DecryptSelections = DecryptSelections;
}
