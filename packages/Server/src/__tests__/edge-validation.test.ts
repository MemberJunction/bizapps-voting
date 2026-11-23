import { describe, expect, it } from 'vitest';
import { FIELD_LIMITS, MAX_BODY_BYTES, ValidateSessionRequest } from '../edge/request-validation.js';

const ok = { Slug: '2027-board', MethodCode: 'Emailed-Link', Credential: { Token: 'tok' } };

describe('ValidateSessionRequest', () => {
    it('accepts a minimal valid request and lower-cases the method', () => {
        const r = ValidateSessionRequest(ok);
        expect(r).toEqual({ Ok: true, Value: { Slug: '2027-board', MethodCode: 'emailed-link', Credential: { Token: 'tok' } } });
    });

    it('rejects missing or mistyped fields', () => {
        for (const body of [
            null,
            'x',
            [],
            {},
            { ...ok, Slug: undefined },
            { ...ok, Slug: 5 },
            { ...ok, MethodCode: '' },
            { ...ok, MethodCode: 'a b' },
            { ...ok, Credential: undefined },
            { ...ok, Credential: {} },
            { ...ok, Credential: { Token: 5 } },
            { ...ok, Credential: { Token: { a: 1 } } },
            { ...ok, Credential: { SecondFactor: { SourceKey: 'k' } } },
        ]) {
            expect(ValidateSessionRequest(body)).toEqual({ Ok: false, Code: 'bad_request' });
        }
    });

    it('rejects oversized fields', () => {
        expect(ValidateSessionRequest({ ...ok, Credential: { Token: 'x'.repeat(FIELD_LIMITS.Token + 1) } }).Ok).toBe(false);
        expect(ValidateSessionRequest({ ...ok, Slug: 'x'.repeat(FIELD_LIMITS.Slug + 1) }).Ok).toBe(false);
        expect(MAX_BODY_BYTES).toBe(8192);
    });

    it('copies only known fields and never trusts a client-asserted Email or ExternalID', () => {
        const r = ValidateSessionRequest({ ...ok, Credential: { Token: 't', Email: 'boss@org.example', ExternalID: 'x', Admin: true } });
        expect(r.Ok && r.Value.Credential).toEqual({ Token: 't' });
    });

    it('accepts a second factor and a host assertion', () => {
        const r = ValidateSessionRequest({
            Slug: 's',
            MethodCode: 'host-assertion',
            Credential: { Assertion: 'a.b.c', SecondFactor: { SourceKey: 'k', Pin: '1234' } },
        });
        expect(r.Ok && r.Value.Credential).toEqual({ Assertion: 'a.b.c', SecondFactor: { SourceKey: 'k', Pin: '1234' } });
    });
});
