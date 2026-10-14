/**
 * The options a contest is created with (`EffectiveOptions`): AllowWriteIn must produce a write-in option, or the ballot
 * offers nowhere to write a name and the flag does nothing.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mj-biz-apps/voting-core-entities-server', () => ({ ElectionTypeDriverRegistry: { Instance: {} } }));
vi.mock('@mj-biz-apps/voting-engine-base', () => ({ VotingEngineBase: { Instance: {} } }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { Instance: { GetSystemUser: () => ({ ID: 'sys' }) } } }));

import type { VotingContestSpec } from '@mj-biz-apps/voting-entities';
import { EffectiveOptions, WRITE_IN_OPTION_LABEL } from '../engines/election-administration-engine.js';

const office = (extra: Partial<VotingContestSpec>): VotingContestSpec => ({ Name: 'Secretary', Kind: 'Office', TallyMethodCode: 'plurality', ...extra });

describe('EffectiveOptions', () => {
    it('appends a write-in option after the candidates when AllowWriteIn is set', () => {
        const options = EffectiveOptions(office({ AllowWriteIn: true, Options: [{ Label: 'Ada' }, { Label: 'Grace' }] }));
        expect(options.map((o) => o.Label)).toEqual(['Ada', 'Grace', WRITE_IN_OPTION_LABEL]);
        expect(options[2].IsWriteIn).toBe(true);
        expect(options.filter((o) => o.IsWriteIn)).toHaveLength(1);
    });

    it('gives an office with no candidates yet a write-in option alone', () => {
        expect(EffectiveOptions(office({ AllowWriteIn: true }))).toEqual([{ Label: WRITE_IN_OPTION_LABEL, IsWriteIn: true }]);
    });

    it('does not add a second write-in when the spec already names one', () => {
        const options = EffectiveOptions(office({ AllowWriteIn: true, Options: [{ Label: 'Ada' }, { Label: 'Other', IsWriteIn: true }] }));
        expect(options.map((o) => o.Label)).toEqual(['Ada', 'Other']);
    });

    it('adds nothing when AllowWriteIn is false or absent', () => {
        expect(EffectiveOptions(office({ Options: [{ Label: 'Ada' }] }))).toEqual([{ Label: 'Ada' }]);
        expect(EffectiveOptions(office({ AllowWriteIn: false, Options: [{ Label: 'Ada' }] }))).toEqual([{ Label: 'Ada' }]);
    });

    it('keeps the yes/no defaults of a motion and appends the write-in only when asked', () => {
        expect(EffectiveOptions({ Name: 'M', Kind: 'Motion', TallyMethodCode: 'majority' }).map((o) => o.Label)).toEqual(['Yes', 'No']);
        expect(EffectiveOptions({ Name: 'M', Kind: 'Motion', TallyMethodCode: 'majority', AllowWriteIn: true }).map((o) => o.Label)).toEqual(['Yes', 'No', WRITE_IN_OPTION_LABEL]);
    });
});
