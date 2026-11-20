import { describe, expect, it } from 'vitest';
import { BuildBaseStyle, HashOfStyle, IsRankedMethod } from '../engines/ballot-style-builder.js';
import { type ElectionGraph } from '../shared/election-graph.js';

interface FakeContest {
    ID: string; Name: string; Sequence: number; Kind: string; Seats: number; AllowAbstain: boolean; AllowWriteIn: boolean;
    MinSelections: number; MaxSelections: number | null; VotingClassFilter: string | null; Description: string | null;
}
const contest = (id: string, seq: number, over: Partial<FakeContest> = {}): FakeContest => ({
    ID: id, Name: `Contest ${id}`, Sequence: seq, Kind: 'Office', Seats: 1, AllowAbstain: false, AllowWriteIn: false,
    MinSelections: 0, MaxSelections: null, VotingClassFilter: null, Description: null, ...over,
});
const option = (id: string, contestId: string, seq: number, over: Record<string, unknown> = {}) => ({
    ID: id, ContestID: contestId, Label: `Opt ${id}`, Description: null, Sequence: seq, IsWriteIn: false, Status: 'Active', ...over,
});

function graph(secrecy = 'Secret', allowRevote = true): ElectionGraph {
    const contests = [contest('c2', 2, { Kind: 'Motion' }), contest('c1', 1, { Seats: 2, VotingClassFilter: 'Member' }), contest('c3', 3, { Kind: 'StandardsItem' })];
    const options = new Map<string, unknown[]>([
        ['c1', [option('o1b', 'c1', 2), option('o1a', 'c1', 1), option('o1x', 'c1', 3, { Status: 'Withdrawn' })]],
        ['c2', [option('yes', 'c2', 1), option('no', 'c2', 2)]],
        ['c3', [option('ap', 'c3', 1), option('dis', 'c3', 2)]],
    ]);
    const codes = new Map<string, string>([['c1', 'stv'], ['c2', 'majority'], ['c3', 'majority']]);
    return {
        Election: { ID: 'e1', Name: 'E', Description: null, ClosesAt: null, SecrecyMode: secrecy, AllowRevote: allowRevote },
        // graph lists contests in Sequence order, as LoadElectionGraph returns them
        Contests: [...contests].sort((a, b) => a.Sequence - b.Sequence),
        OptionsByContestID: options,
        TallyMethodCodeByContestID: codes,
        ContestVotingClassFilters: {},
    } as unknown as ElectionGraph;
}

describe('BuildBaseStyle', () => {
    it('orders contests and active options by Sequence, dropping withdrawn options', () => {
        const s = BuildBaseStyle(graph(), 'Member', 'en');
        expect(s.Contests.map((c) => c.ContestID)).toEqual(['c1', 'c2', 'c3']);
        expect(s.Contests[0].Options.map((o) => o.OptionID)).toEqual(['o1a', 'o1b']);
    });
    it('filters contests by the voter class', () => {
        expect(BuildBaseStyle(graph(), 'Guest', 'en').Contests.map((c) => c.ContestID)).toEqual(['c2', 'c3']);
        expect(BuildBaseStyle(graph(), null, 'en').Contests.map((c) => c.ContestID)).toEqual(['c2', 'c3']);
    });
    it('derives ranked flag and max selections', () => {
        const s = BuildBaseStyle(graph(), 'Member', 'en');
        expect(s.Contests[0].IsRanked).toBe(true);
        expect(s.Contests[0].MaxSelections).toBe(2); // ranked: option count
        expect(s.Contests[1].IsRanked).toBe(false);
        expect(s.Contests[1].MaxSelections).toBe(1); // seats
        expect(IsRankedMethod('irv')).toBe(true);
        expect(IsRankedMethod('plurality')).toBe(false);
    });
    it('requires a comment on Disapprove for standards items', () => {
        const s = BuildBaseStyle(graph(), 'Member', 'en');
        expect(s.Contests[2].RequireCommentOnOptionIDs).toEqual(['dis']);
        expect(s.Contests[1].RequireCommentOnOptionIDs).toBeUndefined();
    });
    it('never allows revote in a Secret election', () => {
        expect(BuildBaseStyle(graph('Secret', true), null, 'en').AllowRevote).toBe(false);
        expect(BuildBaseStyle(graph('Open', true), null, 'en').AllowRevote).toBe(true);
    });
});

describe('style hash', () => {
    it('is stable across rebuilds and ignores the Hash field', () => {
        const a = BuildBaseStyle(graph(), 'Member', 'en');
        const b = BuildBaseStyle(graph(), 'Member', 'en');
        expect(HashOfStyle(a)).toBe(HashOfStyle(b));
        expect(HashOfStyle({ ...a, Hash: 'zzz' })).toBe(HashOfStyle(a));
        expect(HashOfStyle(a)).toMatch(/^[0-9a-f]{64}$/);
    });
    it('changes when the voter class, language or an option changes', () => {
        const base = HashOfStyle(BuildBaseStyle(graph(), 'Member', 'en'));
        expect(HashOfStyle(BuildBaseStyle(graph(), 'Guest', 'en'))).not.toBe(base);
        expect(HashOfStyle(BuildBaseStyle(graph(), 'Member', 'es'))).not.toBe(base);
        const g = graph();
        (g.OptionsByContestID.get('c2') as unknown as Array<{ Label: string }>)[0].Label = 'Changed';
        expect(HashOfStyle(BuildBaseStyle(g, 'Member', 'en'))).not.toBe(base);
    });
});
