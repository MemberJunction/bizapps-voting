import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnChanges, inject, type SimpleChanges } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseElectionResultsView } from './base-election-results-view';
import {
  BuildCommentRows,
  IdListFilter,
  SummarizeComments,
  type CommentRow,
  type CommentRowSource,
  type CommentSummary,
  type ContestRowSource,
  type ResolutionRowSource,
} from './standards-ballot-comment-rows';

const ELECTIONS = 'MJ_BizApps_Voting: Elections';
const CONTESTS = 'MJ_BizApps_Voting: Contests';
const BALLOT_COMMENTS = 'MJ_BizApps_Voting: Ballot Comments';
const COMMENT_RESOLUTIONS = 'MJ_BizApps_Voting: Comment Resolutions';

/**
 * Results view of a standards ballot: every comment the voters made, with how it was resolved. Comments are tied to the
 * voter only in an Open (roll call) ballot, so the view shows nothing for any other secrecy mode.
 */
@RegisterClass(BaseElectionResultsView, 'StandardsBallotCommentsView')
@Component({
  selector: 'mj-standards-ballot-comments-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (Loading) {
      <p role="status">Loading comments...</p>
    } @else if (ErrorMessage) {
      <p role="alert">{{ ErrorMessage }}</p>
    } @else if (!IsOpenBallot) {
      <p>Comments are shown only for roll-call (Open) ballots.</p>
    } @else if (Rows.length === 0) {
      <p>No comments were submitted.</p>
    } @else {
      <p role="status">{{ Summary.Total }} comments, {{ Summary.Resolved }} resolved, {{ Summary.Unresolved }} unresolved.</p>
      <ul class="comment-list">
        @for (row of Rows; track row.CommentID) {
          <li class="comment">
            <strong>{{ row.ContestName }}</strong>
            <span> ({{ row.CommentType }}@if (row.DocumentReference) {, {{ row.DocumentReference }}})</span>
            <p>{{ row.Comment }}</p>
            @if (row.ProposedChange) {
              <p><em>Proposed change:</em> {{ row.ProposedChange }}</p>
            }
            @if (row.Disposition) {
              <p><em>Resolution:</em> {{ row.Disposition }}@if (row.Response) {: {{ row.Response }}}@if (row.CommenterResponse) { ({{ row.CommenterResponse }})}</p>
            } @else {
              <p><em>Unresolved</em></p>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      .comment-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--mj-space-3, 0.75rem); }
      .comment { border: 1px solid var(--mj-border-default, currentColor); border-radius: var(--mj-radius-md, 0.5rem); padding: var(--mj-space-3, 0.75rem); }
    `,
  ],
})
export class StandardsBallotCommentsViewComponent extends BaseElectionResultsView implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);

  public Loading = false;
  public ErrorMessage = '';
  public IsOpenBallot = false;
  public Rows: CommentRow[] = [];
  public Summary: CommentSummary = { Total: 0, Resolved: 0, Unresolved: 0 };

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['ElectionID']) void this.Load();
  }

  public async Load(): Promise<void> {
    if (!this.ElectionID) return;
    this.Loading = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();
    try {
      const rv = new RunView(this.RunViewToUse);
      const election = await rv.RunView<{ SecrecyMode: string }>({
        EntityName: ELECTIONS,
        ExtraFilter: IdListFilter('ID', [this.ElectionID]),
        Fields: ['SecrecyMode'],
        ResultType: 'simple',
      });
      this.IsOpenBallot = election.Success && election.Results[0]?.SecrecyMode === 'Open';
      this.Rows = this.IsOpenBallot ? await this.LoadRows(rv) : [];
      this.Summary = SummarizeComments(this.Rows);
    } catch (e) {
      this.ErrorMessage = e instanceof Error ? e.message : 'The comments could not be loaded.';
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  private async LoadRows(rv: RunView): Promise<CommentRow[]> {
    const contests = await rv.RunView<ContestRowSource>({
      EntityName: CONTESTS,
      ExtraFilter: `ElectionID = '${this.ElectionID.replace(/[^0-9a-fA-F-]/g, '')}'`,
      Fields: ['ID', 'Name', 'Sequence'],
      ResultType: 'simple',
    });
    if (!contests.Success) throw new Error(contests.ErrorMessage || 'The items could not be loaded.');
    if (contests.Results.length === 0) return [];
    const comments = await rv.RunView<CommentRowSource>({
      EntityName: BALLOT_COMMENTS,
      ExtraFilter: IdListFilter('ContestID', contests.Results.map((c) => c.ID)),
      Fields: ['ID', 'ContestID', 'Sequence', 'CommentType', 'DocumentReference', 'Comment', 'ProposedChange'],
      ResultType: 'simple',
    });
    if (!comments.Success) throw new Error(comments.ErrorMessage || 'The comments could not be loaded.');
    if (comments.Results.length === 0) return [];
    const resolutions = await rv.RunView<ResolutionRowSource>({
      EntityName: COMMENT_RESOLUTIONS,
      ExtraFilter: IdListFilter('BallotCommentID', comments.Results.map((c) => c.ID)),
      Fields: ['BallotCommentID', 'Disposition', 'Response', 'CommenterResponse'],
      ResultType: 'simple',
    });
    if (!resolutions.Success) throw new Error(resolutions.ErrorMessage || 'The resolutions could not be loaded.');
    return BuildCommentRows(comments.Results, resolutions.Results, contests.Results);
  }
}
