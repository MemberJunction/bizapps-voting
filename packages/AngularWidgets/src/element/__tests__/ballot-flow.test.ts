import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ValidateSubmission, type BallotStyle, type BallotStyleContest } from '@mj-biz-apps/voting-entities/contracts';
import {
  BallotFlow,
  BuildContestComments,
  CommentDraftKey,
  EmptyCommentDraft,
  GENERAL_COMMENT_KEY,
  classifyMyBallot,
  resolveLanguage,
  type CommentDraft,
} from '../api/ballot-flow';
import { BallotApiError } from '../api/ballot-api.client';
import type { VotingGetMyBallotOutput } from '../api/ballot-api.types';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const op = (output: unknown): Response =>
  json({ data: { ExecuteRemoteOperation: { success: true, resultCode: 'SUCCESS', outputJSON: JSON.stringify(output) } } });

function styleIn(language: string, hash: string) {
  return {
    ElectionID: 'e1',
    ElectionName: language === 'es' ? 'Junta' : 'Board',
    SecrecyMode: 'Secret' as const,
    AllowRevote: false,
    Language: language,
    Hash: hash,
    Contests: [
      {
        ContestID: 'c1', Name: 'Chair', Kind: 'Office' as const, Seats: 1, IsRanked: false, AllowAbstain: false, AllowWriteIn: false,
        MinSelections: 1, MaxSelections: 1,
        Options: [{ OptionID: 'o1', Label: 'Alice', IsWriteIn: false }],
      },
    ],
  };
}

interface Call { url: string; method?: string; body: Record<string, unknown> | null }
function call(i: number): Call {
  const [url, init] = fetchMock.mock.calls[i];
  return { url: String(url), method: init?.method, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
}
const inputOf = (i: number): Record<string, unknown> =>
  JSON.parse((call(i).body as { variables: { inputJSON: string } }).variables.inputJSON) as Record<string, unknown>;

describe('classifyMyBallot', () => {
  const style = styleIn('en', 'h');

  it('vote: not voted yet', () => {
    expect(classifyMyBallot({ Success: true, Style: style, HasVoted: false, CanRevote: false })).toEqual({ Kind: 'vote', Style: style, PreviousReceiptCode: undefined });
  });

  it('voted: HasVoted and not CanRevote shows the already-voted state with the receipt', () => {
    expect(classifyMyBallot({ Success: true, HasVoted: true, CanRevote: false, ReceiptCode: 'R-1' })).toEqual({ Kind: 'voted', ReceiptCode: 'R-1', Style: undefined });
  });

  it('voted without a receipt (null) still shows already-voted', () => {
    expect(classifyMyBallot({ Success: true, HasVoted: true, ReceiptCode: null })).toEqual({ Kind: 'voted', ReceiptCode: undefined, Style: undefined });
  });

  it('revote: HasVoted and CanRevote shows the ballot again, carrying the previous receipt', () => {
    expect(classifyMyBallot({ Success: true, Style: style, HasVoted: true, CanRevote: true, ReceiptCode: 'R-1' })).toEqual({
      Kind: 'vote', Style: style, PreviousReceiptCode: 'R-1',
    });
  });

  it('a ballot needed but no Style is a generic transport error', () => {
    const out: VotingGetMyBallotOutput = { Success: true };
    expect(() => classifyMyBallot(out)).toThrow(BallotApiError);
  });
});

describe('resolveLanguage', () => {
  it('attribute, then distribution default, then en', () => {
    const info = { ElectionName: 'x', AllowedMethods: [], Theme: null, DefaultLanguage: 'fr' };
    expect(resolveLanguage('es', info)).toBe('es');
    expect(resolveLanguage('', info)).toBe('fr');
    expect(resolveLanguage(undefined, undefined)).toBe('en');
    expect(resolveLanguage('  ', { ...info, DefaultLanguage: '' })).toBe('en');
  });
});

describe('BallotFlow end to end (mocked fetch)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const config = { apiRoot: 'https://edge.example.com/vote', graphqlUrl: 'https://api.example.com/graphql' };

  it('non-English round trip: info default language -> session -> GetMyBallot(es) -> Cast(es, style hash) -> results', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ElectionName: 'Junta', AllowedMethods: ['emailed-link'], Theme: null, DefaultLanguage: 'es' }))
      .mockResolvedValueOnce(json({ Token: 'jwt-1', ExpiresAt: '2030-01-01T00:00:00Z', ElectionID: 'e1' }))
      .mockResolvedValueOnce(op({ Success: true, Style: styleIn('es', 'hash-es'), HasVoted: false, CanRevote: false }))
      .mockResolvedValueOnce(op({ Success: true, ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' }))
      .mockResolvedValueOnce(
        op({
          Success: true, Visible: true, IsRunning: true, IsFinal: false, BallotCount: 3,
          Contests: [{ ContestID: 'c1', Outcome: 'Running', VotesCast: 3, Abstentions: 0, Options: [{ OptionID: 'o1', Votes: 3, Position: 1, Outcome: 'Counted' }] }],
        }),
      );

    const flow = new BallotFlow(config, 'junta-2030');
    const info = await flow.LoadInfo();
    const language = resolveLanguage(undefined, info);
    expect(language).toBe('es');

    await flow.SignIn('emailed-link', { Token: 'raw-token' });
    const view = await flow.LoadMyBallot(language);
    if (view.Kind !== 'vote') throw new Error('expected vote view');
    expect(view.Style.Language).toBe('es');

    const submission = { Contests: [{ ContestID: 'c1', Selections: [{ OptionID: 'o1' }] }] };
    const receipt = await flow.Cast(view.Style, submission, language);
    expect(receipt).toBe('AAAA-BBBB-CCCC-DDDD-EEEE');
    const results = await flow.LoadResults();

    // exact requests
    expect(call(0)).toMatchObject({ url: 'https://edge.example.com/vote/junta-2030/info', method: 'GET' });
    expect(call(1)).toMatchObject({ url: 'https://edge.example.com/vote/session', method: 'POST' });
    expect(call(1).body).toEqual({ Slug: 'junta-2030', MethodCode: 'emailed-link', Credential: { Token: 'raw-token' } });
    expect(call(2).url).toBe('https://api.example.com/graphql');
    expect(inputOf(2)).toEqual({ ElectionID: 'e1', Language: 'es' });
    expect(inputOf(3)).toEqual({ ElectionID: 'e1', BallotStyleHash: 'hash-es', Submission: submission, Language: 'es' });
    expect(inputOf(4)).toEqual({ ElectionID: 'e1' });
    // the bearer token from the session is used for every operation call
    for (const i of [2, 3, 4]) {
      expect(JSON.stringify(fetchMock.mock.calls[i][1]?.headers)).toContain('Bearer jwt-1');
    }

    expect(results.Visible).toBe(true);
    expect(results.IsRunning).toBe(true);
    expect(results.Output.Contests?.[0].Options[0].Votes).toBe(3);
  });

  it('already-voted path: GetMyBallot says HasVoted without revote, so no ballot and the receipt is shown', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ Token: 'jwt-1', ExpiresAt: '2030-01-01T00:00:00Z', ElectionID: 'e1' }))
      .mockResolvedValueOnce(op({ Success: true, HasVoted: true, CanRevote: false, ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE' }))
      .mockResolvedValueOnce(op({ Success: true, Visible: false, Reason: 'Results are released after the election closes.' }));
    const flow = new BallotFlow(config, 's');
    await flow.SignIn('host-assertion', { Assertion: 'a.b.c' });
    expect(call(0).body).toEqual({ Slug: 's', MethodCode: 'host-assertion', Credential: { Assertion: 'a.b.c' } });

    const view = await flow.LoadMyBallot('en');
    expect(view).toEqual({ Kind: 'voted', ReceiptCode: 'AAAA-BBBB-CCCC-DDDD-EEEE', Style: undefined });
    const results = await flow.LoadResults();
    expect(results).toMatchObject({ Visible: false, Reason: 'Results are released after the election closes.' });
  });

  it('operations before sign-in fail generically', async () => {
    await expect(new BallotFlow(config, 's').LoadMyBallot('en')).rejects.toThrow(BallotApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('StandardsItem comments', () => {
  const contest: BallotStyleContest = {
    ContestID: 'c1', Name: 'Item 7', Kind: 'StandardsItem', Seats: 1, IsRanked: false, AllowAbstain: false, AllowWriteIn: false,
    MinSelections: 1, MaxSelections: 1, RequireCommentOnOptionIDs: ['no'],
    Options: [
      { OptionID: 'yes', Label: 'Yes', IsWriteIn: false },
      { OptionID: 'no', Label: 'No', IsWriteIn: false },
    ],
  };
  const style: BallotStyle = {
    ElectionID: 'e1', ElectionName: 'Standards', SecrecyMode: 'Open', AllowRevote: false, Language: 'en', Hash: 'hs', Contests: [contest],
  };
  const drafts = (entries: Array<[string, Partial<CommentDraft>]>): Map<string, CommentDraft> =>
    new Map(entries.map(([key, d]) => [CommentDraftKey('c1', key), { ...EmptyCommentDraft(), ...d }]));

  it('includes the comment when the requiring option is selected, trimmed, defaulting to Technical', () => {
    const out = BuildContestComments(contest, [{ OptionID: 'no' }], drafts([['no', { Comment: '  Too vague  ', DocumentReference: ' 4.2 ', ProposedChange: '' }]]));
    expect(out).toEqual([{ CommentType: 'Technical', Comment: 'Too vague', DocumentReference: '4.2' }]);
  });

  it('omits it when the requiring option is not selected', () => {
    expect(BuildContestComments(contest, [{ OptionID: 'yes' }], drafts([['no', { Comment: 'stale text' }]]))).toEqual([]);
  });

  it('never sends blank comments, and adds the optional general comment for a StandardsItem', () => {
    expect(BuildContestComments(contest, [{ OptionID: 'no' }], drafts([['no', { Comment: '   ' }]]))).toEqual([]);
    const out = BuildContestComments(contest, [{ OptionID: 'yes' }], drafts([[GENERAL_COMMENT_KEY, { CommentType: 'Editorial', Comment: 'Typo', ProposedChange: 'fix it' }]]));
    expect(out).toEqual([{ CommentType: 'Editorial', Comment: 'Typo', ProposedChange: 'fix it' }]);
  });

  it('ValidateSubmission: CommentRequired until text is entered, then clears', () => {
    const base = { ContestID: 'c1', Selections: [{ OptionID: 'no' }] };
    const without = ValidateSubmission(style, { Contests: [{ ...base, Comments: BuildContestComments(contest, base.Selections, drafts([])) }] });
    expect(without.map((i) => i.Code)).toContain('CommentRequired');
    const withText = ValidateSubmission(style, {
      Contests: [{ ...base, Comments: BuildContestComments(contest, base.Selections, drafts([['no', { Comment: 'Because' }]])) }],
    });
    expect(withText).toEqual([]);
  });

  it('the CastBallot request body carries the comments', async () => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock
      .mockResolvedValueOnce(json({ Token: 'jwt', ExpiresAt: '2030-01-01T00:00:00Z', ElectionID: 'e1' }))
      .mockResolvedValueOnce(op({ Success: true, ReceiptCode: 'R' }));
    const flow = new BallotFlow({ apiRoot: '/vote', graphqlUrl: '/graphql' }, 's');
    await flow.SignIn('emailed-link', { Token: 't' });
    const selections = [{ OptionID: 'no' }];
    const Comments = BuildContestComments(contest, selections, drafts([['no', { Comment: 'Because', CommentType: 'General' }]]));
    await flow.Cast(style, { Contests: [{ ContestID: 'c1', Selections: selections, Comments }] }, 'en');
    expect(inputOf(1)).toMatchObject({
      Submission: { Contests: [{ ContestID: 'c1', Comments: [{ CommentType: 'General', Comment: 'Because' }] }] },
    });
    vi.unstubAllGlobals();
  });
});
