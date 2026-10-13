import { describe, it, expect } from 'vitest';
import {
  StandardsBallotUIDriver,
  STANDARDS_BALLOT_COMMENTS_COMPONENT,
  STANDARDS_BALLOT_DETAILS_COMPONENT,
  STANDARDS_BALLOT_EXTENSION_ENTITY,
} from '../standards-ballot-ui-driver';
import type { ElectionResultsViewDescriptor, ElectionSetupStepDescriptor, ElectionUIContext } from '../base-election-type-ui-driver';
import { StandardsDetailsIssues, type PriorBallotOption, type StandardsDetailsValues } from '../standards-ballot-details-rules';
import { BuildCommentRows, SummarizeComments } from '../standards-ballot-comment-rows';

const ctx = (over: Partial<ElectionUIContext> = {}): ElectionUIContext => ({
  ElectionID: 'e1', ElectionTypeID: 't', ElectionTypeCode: 'standards-ballot', Status: 'Draft', SecrecyMode: 'Open', IsAdministrator: true, ...over,
});

describe('StandardsBallotUIDriver', () => {
  const driver = new StandardsBallotUIDriver();

  it('speaks the standards vocabulary and keeps the other labels', () => {
    expect(driver.GetVocabulary(ctx(), { Voter: 'Voter', Contest: 'Contest' })).toEqual({ Voter: 'Voter', Contest: 'Item', Option: 'Position', Vote: 'Ballot' });
  });

  it('adds one document step after the defaults, once', () => {
    const defaults: ElectionSetupStepDescriptor[] = [{ key: 'basics', label: 'Basics', stepNumber: 1 }, { key: 'items', label: 'Items', stepNumber: 2 }];
    const steps = driver.GetSetupSteps(ctx(), driver.GetSetupSteps(ctx(), defaults));
    expect(steps.map((s) => s.key)).toEqual(['basics', 'items', 'standards-ballot-details']);
    expect(steps[2]).toMatchObject({ stepNumber: 3, componentClass: STANDARDS_BALLOT_DETAILS_COMPONENT });
  });

  it('points the details form at the extension entity and component', () => {
    expect(driver.GetDetailsForm(ctx(), null)).toEqual({ entityName: STANDARDS_BALLOT_EXTENSION_ENTITY, componentClass: STANDARDS_BALLOT_DETAILS_COMPONENT });
  });

  it('offers the comments view only for a roll-call ballot', () => {
    const defaults: ElectionResultsViewDescriptor[] = [{ key: 'summary', label: 'Summary' }];
    expect(driver.GetResultsViews(ctx({ SecrecyMode: 'Open' }), defaults).map((v) => v.key)).toEqual(['summary', 'standards-ballot-comments']);
    expect(driver.GetResultsViews(ctx({ SecrecyMode: 'Open' }), defaults)[1].componentClass).toBe(STANDARDS_BALLOT_COMMENTS_COMPONENT);
    expect(driver.GetResultsViews(ctx({ SecrecyMode: 'Secret' }), defaults)).toEqual(defaults);
  });
});

describe('StandardsDetailsIssues', () => {
  const values = (o: Partial<StandardsDetailsValues> = {}): StandardsDetailsValues => ({ DocumentTitle: 'Std 100', DocumentVersion: '', RecirculationRound: 0, PriorElectionID: '', ...o });
  const priors: PriorBallotOption[] = [{ ID: 'P1', DocumentTitle: 'std 100', Label: 'p' }, { ID: 'P2', DocumentTitle: 'Std 200', Label: 'q' }];
  it('accepts a first ballot and a recirculation of the same document', () => {
    expect(StandardsDetailsIssues(values(), priors)).toEqual([]);
    expect(StandardsDetailsIssues(values({ RecirculationRound: 1, PriorElectionID: 'p1' }), priors)).toEqual([]);
  });
  it('requires a title, a round with a prior, and a prior on the same document', () => {
    expect(StandardsDetailsIssues(values({ DocumentTitle: ' ' }), priors)).toHaveLength(1);
    expect(StandardsDetailsIssues(values({ PriorElectionID: 'P1' }), priors)).toHaveLength(1);
    expect(StandardsDetailsIssues(values({ RecirculationRound: 2 }), priors)).toHaveLength(1);
    expect(StandardsDetailsIssues(values({ RecirculationRound: 1, PriorElectionID: 'P2' }), priors)).toHaveLength(1);
    expect(StandardsDetailsIssues(values({ RecirculationRound: 1, PriorElectionID: 'nope' }), priors)).toHaveLength(1);
  });
});

describe('BuildCommentRows', () => {
  const contests = [{ ID: 'C2', Name: 'Item 2', Sequence: 2 }, { ID: 'C1', Name: 'Item 1', Sequence: 1 }];
  const comment = (ID: string, ContestID: string, Sequence: number) => ({ ID, ContestID, Sequence, CommentType: 'Technical', DocumentReference: null, Comment: `c-${ID}`, ProposedChange: null });
  it('orders by item then comment order and joins resolutions case-insensitively', () => {
    const rows = BuildCommentRows(
      [comment('a', 'c2', 1), comment('b', 'C1', 2), comment('c', 'C1', 1)],
      [{ BallotCommentID: 'B', Disposition: 'Accepted', Response: 'Done', CommenterResponse: 'Satisfied' }],
      contests,
    );
    expect(rows.map((r) => r.CommentID)).toEqual(['c', 'b', 'a']);
    expect(rows[1]).toMatchObject({ ContestName: 'Item 1', Disposition: 'Accepted', Response: 'Done', CommenterResponse: 'Satisfied' });
    expect(rows[0].Disposition).toBeNull();
    expect(SummarizeComments(rows)).toEqual({ Total: 3, Resolved: 1, Unresolved: 2 });
  });
});
