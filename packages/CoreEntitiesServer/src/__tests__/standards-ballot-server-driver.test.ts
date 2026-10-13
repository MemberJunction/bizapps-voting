import { describe, it, expect } from 'vitest';
import type { BallotStyle, BallotSubmission } from '@mj-biz-apps/voting-entities';
import {
    StandardsBallotServerDriver,
    StandardsCastIssues,
    StandardsContestShapeIssues,
    StandardsExtensionIssues,
    StandardsStyleIssues,
    type PriorElectionFacts,
    type StandardsBallotFactSource,
    type StandardsContestFacts,
    type StandardsExtensionFacts,
} from '../drivers/standards-ballot-server-driver.js';
import type { BallotStyleContext, CastValidationContext, ElectionChangeContext } from '../drivers/base-election-type-server-driver.js';

const item = (id: string, overrides: Partial<StandardsContestFacts> = {}): StandardsContestFacts => ({
    ContestID: id,
    Name: `Item ${id}`,
    Kind: 'StandardsItem',
    Options: [
        { OptionID: `${id}-a`, Label: 'Approve', Sequence: 1 },
        { OptionID: `${id}-d`, Label: 'Disapprove', Sequence: 2 },
    ],
    ...overrides,
});

const goodExt: StandardsExtensionFacts = { DocumentTitle: 'Std 100', DocumentVersion: 'D3', RecirculationRound: 0, PriorElectionID: null };

describe('StandardsContestShapeIssues', () => {
    it('accepts Approve / Disapprove standards items', () => {
        expect(StandardsContestShapeIssues([item('c1'), item('c2')])).toEqual([]);
    });
    it('refuses other kinds, missing Disapprove, extra options and reversed order', () => {
        expect(StandardsContestShapeIssues([item('c1', { Kind: 'Motion' })])).toHaveLength(1);
        expect(StandardsContestShapeIssues([item('c1', { Options: [{ OptionID: 'x', Label: 'Approve', Sequence: 1 }] })])).toHaveLength(1);
        expect(StandardsContestShapeIssues([item('c1', { Options: [...item('c1').Options, { OptionID: 'z', Label: 'Abstain', Sequence: 3 }] })])).toHaveLength(1);
        expect(StandardsContestShapeIssues([item('c1', { Options: [{ OptionID: 'd', Label: 'Disapprove', Sequence: 1 }, { OptionID: 'a', Label: 'Approve', Sequence: 2 }] })])).toHaveLength(1);
    });
});

describe('StandardsStyleIssues', () => {
    const style = (required: string[] | undefined): BallotStyle => ({
        ElectionID: 'e', ElectionName: 'E', SecrecyMode: 'Open', AllowRevote: false, Hash: '', Language: 'en',
        Contests: [{
            ContestID: 'c1', Name: 'Item 1', Kind: 'StandardsItem', Seats: 1, IsRanked: false, AllowAbstain: true, AllowWriteIn: false,
            MinSelections: 1, MaxSelections: 1, RequireCommentOnOptionIDs: required,
            Options: [{ OptionID: 'a', Label: 'Approve', IsWriteIn: false }, { OptionID: 'd', Label: 'Disapprove', IsWriteIn: false }],
        }],
    });
    it('requires a comment on Disapprove', () => {
        expect(StandardsStyleIssues(style(['d']))).toEqual([]);
        expect(StandardsStyleIssues(style(['a']))).toHaveLength(1);
        expect(StandardsStyleIssues(style(undefined))).toHaveLength(1);
    });
});

describe('StandardsCastIssues', () => {
    const contests = [item('c1')];
    const sub = (selection: string | null, comment?: string, abstain = false): BallotSubmission => ({
        Contests: [{ ContestID: 'c1', Abstain: abstain, Selections: selection ? [{ OptionID: selection }] : [], Comments: comment === undefined ? undefined : [{ CommentType: 'Technical', Comment: comment }] }],
    });
    it('refuses Disapprove without a comment, accepts it with one', () => {
        expect(StandardsCastIssues(contests, sub('c1-d'))).toHaveLength(1);
        expect(StandardsCastIssues(contests, sub('c1-d', '   '))).toHaveLength(1);
        expect(StandardsCastIssues(contests, sub('c1-d', 'Clause 4 is ambiguous'))).toEqual([]);
    });
    it('needs no comment for Approve or abstain', () => {
        expect(StandardsCastIssues(contests, sub('c1-a'))).toEqual([]);
        expect(StandardsCastIssues(contests, sub(null, undefined, true))).toEqual([]);
    });
});

describe('StandardsExtensionIssues', () => {
    const prior = (o: Partial<PriorElectionFacts> = {}): PriorElectionFacts => ({ ElectionID: 'p', Status: 'Certified', ElectionTypeID: 't', DocumentTitle: 'std 100', ...o });
    it('accepts a first-round ballot', () => {
        expect(StandardsExtensionIssues('e', 't', goodExt, null)).toEqual([]);
    });
    it('requires a DocumentTitle unless told not to', () => {
        expect(StandardsExtensionIssues('e', 't', { ...goodExt, DocumentTitle: ' ' }, null)).toHaveLength(1);
        expect(StandardsExtensionIssues('e', 't', { ...goodExt, DocumentTitle: ' ' }, null, false)).toEqual([]);
    });
    it('accepts a recirculation of a Certified ballot on the same document', () => {
        expect(StandardsExtensionIssues('e', 't', { ...goodExt, RecirculationRound: 1, PriorElectionID: 'p' }, prior())).toEqual([]);
    });
    it('refuses a recirculation whose prior is not Certified, not a standards ballot, or on another document', () => {
        const ext = { ...goodExt, RecirculationRound: 1, PriorElectionID: 'p' };
        expect(StandardsExtensionIssues('e', 't', ext, prior({ Status: 'Closed' }))).toHaveLength(1);
        expect(StandardsExtensionIssues('e', 't', ext, prior({ ElectionTypeID: 'other' }))).toHaveLength(1);
        expect(StandardsExtensionIssues('e', 't', ext, prior({ DocumentTitle: 'Std 200' }))).toHaveLength(1);
        expect(StandardsExtensionIssues('e', 't', ext, null)).toHaveLength(1);
    });
    it('keeps round and prior consistent', () => {
        expect(StandardsExtensionIssues('e', 't', { ...goodExt, RecirculationRound: 2 }, null)).toHaveLength(1);
        expect(StandardsExtensionIssues('e', 't', { ...goodExt, RecirculationRound: 0, PriorElectionID: 'p' }, prior())).toHaveLength(1);
        expect(StandardsExtensionIssues('e', 't', { ...goodExt, RecirculationRound: 1, PriorElectionID: 'e' }, null)).toHaveLength(1);
    });
});

describe('StandardsBallotServerDriver', () => {
    function source(over: Partial<StandardsBallotFactSource> & { contests?: StandardsContestFacts[]; ext?: StandardsExtensionFacts | null } = {}): StandardsBallotFactSource {
        return {
            LoadContests: over.LoadContests ?? (async () => over.contests ?? [item('c1')]),
            LoadExtension: over.LoadExtension ?? (async () => (over.ext === undefined ? goodExt : over.ext)),
            LoadPrior: over.LoadPrior ?? (async () => null),
        };
    }
    const changeCtx = (action: ElectionChangeContext['Action'], secrecy = 'Open'): ElectionChangeContext =>
        ({ Action: action, Election: { ID: 'e', ElectionTypeID: 't', SecrecyMode: secrecy, IsSaved: true } }) as unknown as ElectionChangeContext;

    it('refuses a non-Open secrecy mode but lets a cancel through', async () => {
        const d = new StandardsBallotServerDriver(source());
        expect(await d.ValidateElectionChange(changeCtx('Update', 'Secret'))).toMatch(/Open/);
        expect(await d.ValidateElectionChange(changeCtx('Cancel', 'Secret'))).toBeNull();
    });
    it('accepts a coherent update and refuses a bad contest', async () => {
        expect(await new StandardsBallotServerDriver(source()).ValidateElectionChange(changeCtx('Update'))).toBeNull();
        expect(await new StandardsBallotServerDriver(source({ contests: [item('c1', { Kind: 'Motion' })] })).ValidateElectionChange(changeCtx('Update'))).toMatch(/StandardsItem/);
    });
    it('does not need the document row at Create, and never reads it', async () => {
        const failing = new StandardsBallotServerDriver(source({ ext: null, LoadExtension: async () => { throw new Error('must not be read'); } }));
        expect(await failing.ValidateElectionChange(changeCtx('Create'))).toBeNull();
    });
    it('lets Update proceed without the row or a title, but judges the row when it exists', async () => {
        expect(await new StandardsBallotServerDriver(source({ ext: null })).ValidateElectionChange(changeCtx('Update'))).toBeNull();
        expect(await new StandardsBallotServerDriver(source({ ext: { ...goodExt, DocumentTitle: '' } })).ValidateElectionChange(changeCtx('Update'))).toBeNull();
        expect(await new StandardsBallotServerDriver(source({ ext: { ...goodExt, RecirculationRound: 2 } })).ValidateElectionChange(changeCtx('Update'))).toMatch(/PriorElectionID/);
    });
    it('requires the document row with a title to Open, and reports a failed read as a refusal', async () => {
        expect(await new StandardsBallotServerDriver(source({ ext: null })).ValidateElectionChange(changeCtx('Open'))).toMatch(/details/);
        expect(await new StandardsBallotServerDriver(source({ ext: { ...goodExt, DocumentTitle: ' ' } })).ValidateElectionChange(changeCtx('Open'))).toMatch(/DocumentTitle/);
        expect(await new StandardsBallotServerDriver(source()).ValidateElectionChange(changeCtx('Open'))).toBeNull();
        const failing = new StandardsBallotServerDriver(source({ LoadExtension: async () => { throw new Error('no read'); } }));
        expect(await failing.ValidateElectionChange(changeCtx('Open'))).toMatch(/no read/);
    });
    it('requires an item before opening', async () => {
        expect(await new StandardsBallotServerDriver(source({ contests: [] })).ValidateElectionChange(changeCtx('Open'))).toMatch(/at least one item/);
    });
    it('does not re-judge the shape at Close / Tally / Certify', async () => {
        const d = new StandardsBallotServerDriver(source({ contests: [item('c1', { Kind: 'Motion' })] }));
        for (const a of ['Close', 'Tally', 'Certify'] as const) expect(await d.ValidateElectionChange(changeCtx(a))).toBeNull();
    });
    it('checks the recirculation prior through the source', async () => {
        const d = new StandardsBallotServerDriver(source({
            ext: { ...goodExt, RecirculationRound: 1, PriorElectionID: 'p' },
            LoadPrior: async () => ({ ElectionID: 'p', Status: 'Open', ElectionTypeID: 't', DocumentTitle: 'Std 100' }),
        }));
        expect(await d.ValidateElectionChange(changeCtx('Update'))).toMatch(/Certified/);
    });
    it('judges the ballot style and the cast', async () => {
        const d = new StandardsBallotServerDriver(source());
        const style = { Contests: [{ ContestID: 'c1', Name: 'I', Kind: 'StandardsItem', RequireCommentOnOptionIDs: [], Options: [{ OptionID: 'a', Label: 'Approve' }, { OptionID: 'd', Label: 'Disapprove' }] }] } as unknown as BallotStyle;
        expect(await d.ValidateBallotStyle({ Style: style } as unknown as BallotStyleContext)).toMatch(/comment/);
        const cast = { Submission: { Contests: [{ ContestID: 'c1', Selections: [{ OptionID: 'c1-d' }] }] }, Election: { ID: 'e', IsSaved: true } } as unknown as CastValidationContext;
        expect(await d.ValidateCast(cast)).toMatch(/comment/);
    });
});
