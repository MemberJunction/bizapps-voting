/**
 * Request validation for the public edge. Everything here is allowlist-based: only known fields are copied out of the
 * body, each must be a bounded string, and nothing from a failed validation (above all the credential) is echoed back.
 */
import type { VoterCredentialPresentation } from '../credentials/credential-types.js';

/** POST bodies are tiny: a slug, a method code and one credential. */
export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_BODY_LIMIT = '8kb';

/** Longest accepted value per field. A host assertion is a signed JWT, so it gets the most room. */
export const FIELD_LIMITS = {
    Slug: 100,
    MethodCode: 64,
    Token: 2048,
    Assertion: 6144,
    Short: 320,
} as const;

export interface SessionRequest {
    Slug: string;
    MethodCode: string;
    Credential: VoterCredentialPresentation;
}

export type SessionRequestResult = { Ok: true; Value: SessionRequest } | { Ok: false; Code: 'bad_request' };

const BAD: SessionRequestResult = { Ok: false, Code: 'bad_request' };

function str(value: unknown, max: number): string | undefined | null {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return null; // wrong type: reject the whole request
    if (value.length > max) return null;
    return value;
}

function plainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates and narrows a POST /session body. */
export function ValidateSessionRequest(body: unknown): SessionRequestResult {
    if (!plainObject(body)) return BAD;
    const slug = str(body.Slug, FIELD_LIMITS.Slug);
    const method = str(body.MethodCode, FIELD_LIMITS.MethodCode);
    if (!slug || !method || !/^[A-Za-z0-9._-]+$/.test(method)) return BAD;
    if (!plainObject(body.Credential)) return BAD;

    const c = body.Credential;
    const token = str(c.Token, FIELD_LIMITS.Token);
    const assertion = str(c.Assertion, FIELD_LIMITS.Assertion);
    const sourceKey = str(c.SourceKey, FIELD_LIMITS.Short);
    const pin = str(c.Pin, FIELD_LIMITS.Short);
    // Email and ExternalID are deliberately NOT read: only the SSO driver consumes them, it trusts them as already
    // validated by an identity provider, and this edge does not validate IdP tokens. A client-asserted identity is ignored.
    if ([token, assertion, sourceKey, pin].some((v) => v === null)) return BAD;

    const credential: VoterCredentialPresentation = {};
    if (token) credential.Token = token;
    if (assertion) credential.Assertion = assertion;
    if (sourceKey) credential.SourceKey = sourceKey;
    if (pin) credential.Pin = pin;

    if (c.SecondFactor !== undefined && c.SecondFactor !== null) {
        if (!plainObject(c.SecondFactor)) return BAD;
        const sfKey = str(c.SecondFactor.SourceKey, FIELD_LIMITS.Short);
        const sfPin = str(c.SecondFactor.Pin, FIELD_LIMITS.Short);
        if (!sfKey || !sfPin) return BAD;
        credential.SecondFactor = { SourceKey: sfKey, Pin: sfPin };
    }
    if (Object.keys(credential).length === 0) return BAD;
    return { Ok: true, Value: { Slug: slug, MethodCode: method.toLowerCase(), Credential: credential } };
}
