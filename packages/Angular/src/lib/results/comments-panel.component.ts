/**
 * CommentsPanelComponent — for Open-mode standards ballots: lists the ballot comments per item with the commenter,
 * type, reference, comment and proposed change, shows any existing resolution, and lets an administrator resolve a
 * comment with Voting.ResolveComment.
 */
import { Component, Input, OnChanges, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { VotingApiService } from '../shared/voting-api.service';

export const COMMENT_DISPOSITIONS: ReadonlyArray<{ Value: string; Label: string }> = [
    { Value: 'Accepted', Label: 'Accepted' },
    { Value: 'AcceptedInPrinciple', Label: 'Accepted in principle' },
    { Value: 'Rejected', Label: 'Rejected' },
    { Value: 'Withdrawn', Label: 'Withdrawn' },
    { Value: 'Deferred', Label: 'Deferred' },
];

interface CommentRow {
    ID: string;
    ContestID: string;
    ParticipationID: string;
    Sequence: number;
    CommentType: string;
    DocumentReference: string | null;
    Comment: string;
    ProposedChange: string | null;
}

interface ResolutionRow {
    ID: string;
    BallotCommentID: string;
    Disposition: string;
    Response: string | null;
    ResolvedAt: string;
    CommenterResponse: string | null;
}

interface CommentView extends CommentRow {
    Commenter: string;
    Resolution: ResolutionRow | null;
}

interface ItemGroup {
    ContestID: string;
    Name: string;
    Comments: CommentView[];
}

/** Display text for a disposition value. */
export function DispositionLabel(value: string): string {
    return COMMENT_DISPOSITIONS.find((d) => d.Value === value)?.Label ?? value;
}

@Component({
    selector: 'voting-comments-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    template: `
        <section class="panel" aria-labelledby="cm-h">
            <h3 id="cm-h"><i class="fa-solid fa-comments"></i> Comments <span class="muted">({{ Total }})</span></h3>
            @if (IsLoading) {
                <p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading comments...</p>
            } @else if (LoadError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ LoadError }}</span></div>
            } @else if (Groups.length === 0) {
                <p class="muted">No comments were submitted with the ballots.</p>
            } @else {
                @if (ActionError) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ ActionError }}</span></div>
                }
                @for (g of Groups; track g.ContestID) {
                    <h4>{{ g.Name }}</h4>
                    <ul class="comments">
                        @for (c of g.Comments; track c.ID) {
                            <li class="comment">
                                <div class="meta">
                                    <strong>{{ c.Commenter }}</strong>
                                    <span class="chip">{{ c.CommentType }}</span>
                                    @if (c.DocumentReference) {
                                        <span class="muted small">Ref: {{ c.DocumentReference }}</span>
                                    }
                                </div>
                                <p class="body">{{ c.Comment }}</p>
                                @if (c.ProposedChange) {
                                    <p class="body"><span class="muted">Proposed change:</span> {{ c.ProposedChange }}</p>
                                }
                                @if (c.Resolution) {
                                    <p class="resolution">
                                        <span class="chip chip-info">{{ DispositionText(c.Resolution.Disposition) }}</span>
                                        @if (c.Resolution.Response) {
                                            {{ c.Resolution.Response }}
                                        }
                                    </p>
                                } @else if (CanResolve) {
                                    @if (Open?.CommentID === c.ID) {
                                        <form class="resolve" (ngSubmit)="Resolve(c)">
                                            <div class="field">
                                                <label [for]="'disp-' + c.ID">Disposition</label>
                                                <select [id]="'disp-' + c.ID" name="disp" class="input" [(ngModel)]="Disposition">
                                                    @for (d of Dispositions; track d.Value) {
                                                        <option [value]="d.Value">{{ d.Label }}</option>
                                                    }
                                                </select>
                                            </div>
                                            <div class="field">
                                                <label [for]="'resp-' + c.ID">Response</label>
                                                <textarea [id]="'resp-' + c.ID" name="resp" class="input" rows="2" [(ngModel)]="Response"></textarea>
                                            </div>
                                            <div class="actions">
                                                <button type="submit" mjButton variant="primary" size="sm" [disabled]="IsBusy">
                                                    <i class="fa-solid" [class.fa-check]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Save resolution
                                                </button>
                                                <button type="button" mjButton variant="secondary" size="sm" (click)="Open = null" [disabled]="IsBusy">Cancel</button>
                                            </div>
                                        </form>
                                    } @else {
                                        <button type="button" mjButton variant="secondary" size="sm" (click)="BeginResolve(c)">
                                            <i class="fa-solid fa-gavel"></i> Resolve
                                        </button>
                                    }
                                }
                            </li>
                        }
                    </ul>
                }
            }
        </section>
    `,
    styles: [
        `
            :host { display: block; }
            .panel { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
            .panel h3 { margin: 0 0 0.5rem; font-size: 1.05rem; color: var(--mj-text-primary); }
            .panel h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
            h4 { margin: 0.75rem 0 0.35rem; font-size: 0.95rem; color: var(--mj-text-secondary); }
            .muted { color: var(--mj-text-muted); }
            .small { font-size: 0.85rem; }
            .comments { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
            .comment { padding: 0.7rem 0.9rem; border: 1px solid var(--mj-border-subtle); border-radius: 8px; background: var(--mj-bg-surface-card); color: var(--mj-text-primary); }
            .meta { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
            .body { margin: 0.35rem 0 0; white-space: pre-wrap; word-break: break-word; }
            .resolution { margin: 0.5rem 0 0; color: var(--mj-text-secondary); }
            .chip { display: inline-block; padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); border: 1px solid var(--mj-border-default); }
            .chip-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: transparent; }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 1rem; border-radius: 8px; margin: 0 0 0.75rem; border: 1px solid transparent; }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .resolve { margin-top: 0.6rem; max-width: 36rem; }
            .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
            .field label { font-weight: 600; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .input { padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; width: 100%; box-sizing: border-box; }
            .input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .actions { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
        `,
    ],
})
export class CommentsPanelComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly api = inject(VotingApiService);

    @Input({ required: true }) ElectionID!: string;
    @Input({ required: true }) Provider!: IMetadataProvider;
    /** Whether the viewer may resolve comments (a voting administrator). */
    @Input() CanResolve = false;

    public readonly Dispositions = COMMENT_DISPOSITIONS;
    public Groups: ItemGroup[] = [];
    public Total = 0;
    public IsLoading = false;
    public LoadError: string | null = null;
    public ActionError: string | null = null;
    public IsBusy = false;
    public Open: { CommentID: string } | null = null;
    public Disposition = 'Accepted';
    public Response = '';

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.Open = null;
            void this.Load();
        }
    }

    public DispositionText(value: string): string {
        return DispositionLabel(value);
    }

    public BeginResolve(c: CommentView): void {
        this.Open = { CommentID: c.ID };
        this.Disposition = 'Accepted';
        this.Response = '';
        this.ActionError = null;
    }

    public async Load(): Promise<void> {
        const electionId = this.ElectionID;
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.Provider);
            const contestRes = await rv.RunView<{ ID: string; Name: string; Sequence: number }>({
                EntityName: 'MJ_BizApps_Voting: Contests',
                ExtraFilter: `ElectionID='${electionId}' AND Kind='StandardsItem'`,
                OrderBy: 'Sequence',
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'Sequence'],
            });
            if (!contestRes.Success) throw new Error(contestRes.ErrorMessage || 'Items could not be loaded.');
            const contests = contestRes.Results;
            if (contests.length === 0) {
                this.Groups = [];
                this.Total = 0;
                return;
            }
            const idList = contests.map((c) => `'${c.ID}'`).join(',');
            const commentRes = await rv.RunView<CommentRow>({
                EntityName: 'MJ_BizApps_Voting: Ballot Comments',
                ExtraFilter: `ContestID IN (${idList})`,
                OrderBy: 'Sequence',
                ResultType: 'simple',
                Fields: ['ID', 'ContestID', 'ParticipationID', 'Sequence', 'CommentType', 'DocumentReference', 'Comment', 'ProposedChange'],
            });
            if (!commentRes.Success) throw new Error(commentRes.ErrorMessage || 'Comments could not be loaded.');
            const comments = commentRes.Results;
            const [resolutions, commenters] = await Promise.all([this.LoadResolutions(comments), this.LoadCommenters(comments)]);
            if (this.ElectionID !== electionId) return;
            this.Groups = contests
                .map((c) => ({
                    ContestID: c.ID,
                    Name: c.Name,
                    Comments: comments
                        .filter((m) => m.ContestID.toLowerCase() === c.ID.toLowerCase())
                        .map((m) => ({
                            ...m,
                            Commenter: commenters.get(m.ParticipationID.toLowerCase()) ?? 'Unknown voter',
                            Resolution: resolutions.get(m.ID.toLowerCase()) ?? null,
                        })),
                }))
                .filter((g) => g.Comments.length > 0);
            this.Total = comments.length;
        } catch (error) {
            LogError('[VotingResults] Failed to load comments', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Comments could not be loaded.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async LoadResolutions(comments: CommentRow[]): Promise<Map<string, ResolutionRow>> {
        const out = new Map<string, ResolutionRow>();
        if (comments.length === 0) return out;
        const rv = RunView.FromMetadataProvider(this.Provider);
        const res = await rv.RunView<ResolutionRow>({
            EntityName: 'MJ_BizApps_Voting: Comment Resolutions',
            ExtraFilter: `BallotCommentID IN (${comments.map((c) => `'${c.ID}'`).join(',')})`,
            OrderBy: 'ResolvedAt',
            ResultType: 'simple',
            Fields: ['ID', 'BallotCommentID', 'Disposition', 'Response', 'ResolvedAt', 'CommenterResponse'],
        });
        if (!res.Success) throw new Error(res.ErrorMessage || 'Resolutions could not be loaded.');
        for (const r of res.Results) out.set(r.BallotCommentID.toLowerCase(), r); // the latest wins
        return out;
    }

    /** Participation id -> voter's name, through the participation's eligible voter (Open ballots are attributable). */
    private async LoadCommenters(comments: CommentRow[]): Promise<Map<string, string>> {
        const out = new Map<string, string>();
        const ids = Array.from(new Set(comments.map((c) => c.ParticipationID)));
        if (ids.length === 0) return out;
        const rv = RunView.FromMetadataProvider(this.Provider);
        const pRes = await rv.RunView<{ ID: string; EligibleVoterID: string }>({
            EntityName: 'MJ_BizApps_Voting: Participations',
            ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`,
            ResultType: 'simple',
            Fields: ['ID', 'EligibleVoterID'],
        });
        if (!pRes.Success || pRes.Results.length === 0) return out;
        const voterIds = Array.from(new Set(pRes.Results.map((p) => p.EligibleVoterID)));
        const vRes = await rv.RunView<{ ID: string; Person: string }>({
            EntityName: 'MJ_BizApps_Voting: Eligible Voters',
            ExtraFilter: `ID IN (${voterIds.map((id) => `'${id}'`).join(',')})`,
            ResultType: 'simple',
            Fields: ['ID', 'Person'],
        });
        const names = new Map((vRes.Success ? vRes.Results : []).map((v) => [v.ID.toLowerCase(), v.Person]));
        for (const p of pRes.Results) {
            const name = names.get(p.EligibleVoterID.toLowerCase());
            if (name) out.set(p.ID.toLowerCase(), name);
        }
        return out;
    }

    public async Resolve(c: CommentView): Promise<void> {
        this.IsBusy = true;
        this.ActionError = null;
        try {
            const r = await this.api.ResolveComment({
                BallotCommentID: c.ID,
                Disposition: this.Disposition,
                Response: this.Response.trim() || undefined,
            });
            if (!r.Success) {
                this.ActionError = r.Message ?? 'The comment could not be resolved.';
                return;
            }
            this.Open = null;
            await this.Load();
        } finally {
            this.IsBusy = false;
            this.cdr.detectChanges();
        }
    }
}
