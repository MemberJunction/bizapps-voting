import { describe, expect, it } from 'vitest';
import { BuildPaperStyle, ControlNumberLooksValid, type PaperContestRow, type PaperElectionRow, type PaperOptionRow } from '../paper-ballot-model';

const election: PaperElectionRow = { ID: 'E1', Name: 'Board', Description: null, SecrecyMode: 'Secret', AllowRevote: true, ClosesAt: null };

function contest(id: string, seq: number, filter: string | null, extra: Partial<PaperContestRow> = {}): PaperContestRow {
    return {
        ID: id, Name: id, Description: null, Sequence: seq, Kind: 'Office', Seats: 1, AllowAbstain: true, AllowWriteIn: false,
        MinSelections: 0, MaxSelections: null, VotingClassFilter: filter, TallyCode: 'plurality', IsRanked: false, ...extra,
    };
}
function option(id: string, contestId: string, seq: number, status = 'Active'): PaperOptionRow {
    return { ID: id, ContestID: contestId, Label: id, Description: null, Sequence: seq, IsWriteIn: false, Status: status };
}

describe('BuildPaperStyle', () => {
    it('orders contests and active options by sequence and drops withdrawn options', () => {
        const style = BuildPaperStyle(election, [contest('B', 2, null), contest('A', 1, null)], [option('o2', 'A', 2), option('o1', 'A', 1), option('o3', 'A', 3, 'Withdrawn')], null);
        expect(style.Contests.map((c) => c.ContestID)).toEqual(['A', 'B']);
        expect(style.Contests[0].Options.map((o) => o.OptionID)).toEqual(['o1', 'o2']);
    });
    it('filters contests by voting class', () => {
        const contests = [contest('all', 1, null), contest('mem', 2, 'Member')];
        expect(BuildPaperStyle(election, contests, [], null).Contests.map((c) => c.ContestID)).toEqual(['all']);
        expect(BuildPaperStyle(election, contests, [], 'member').Contests.map((c) => c.ContestID)).toEqual(['all', 'mem']);
    });
    it('defaults max selections by method and disables revote for secret ballots', () => {
        const ranked = contest('R', 1, null, { IsRanked: true, TallyCode: 'irv' });
        const style = BuildPaperStyle(election, [ranked, contest('S', 2, null, { Seats: 3 })], [option('a', 'R', 1), option('b', 'R', 2)], null);
        expect(style.Contests[0].MaxSelections).toBe(2);
        expect(style.Contests[1].MaxSelections).toBe(3);
        expect(style.AllowRevote).toBe(false);
    });
    it('requires a comment on the second option of a standards item', () => {
        const std = contest('S', 1, null, { Kind: 'StandardsItem' });
        const style = BuildPaperStyle(election, [std], [option('approve', 'S', 1), option('disapprove', 'S', 2)], null);
        expect(style.Contests[0].RequireCommentOnOptionIDs).toEqual(['disapprove']);
    });
});

describe('ControlNumberLooksValid', () => {
    it('rejects blanks and accepts plausible values', () => {
        expect(ControlNumberLooksValid('  ')).toBe(false);
        expect(ControlNumberLooksValid('ABCD-1234')).toBe(true);
    });
});
