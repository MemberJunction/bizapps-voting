/**
 * VotingExplorerBallotComponent — the ballot for a signed-in MJ user inside Explorer.
 *
 * Flow: Voting.GetMyBallot -> contest form (with live validation from the shared contract) ->
 * review and confirm -> Voting.CastBallot -> receipt. A voter who has already voted sees their
 * receipt (and, when the election allows, a way to change their vote) plus results when
 * Voting.GetResults says they are visible.
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
    VotingCastBallotOperation,
    VotingGetMyBallotOperation,
    VotingGetResultsOperation,
    type ValidationIssue,
    type VotingBallotStyle,
    type VotingBallotStyleContest,
    type VotingContestOutcome,
    type VotingGetMyBallotOutput,
    type VotingGetResultsOutput,
} from '@mj-biz-apps/voting-entities';
import { ContestOutcomeComponent, type ContestResultMeta } from '../results/contest-outcome.component';
import { ReceiptVerifyComponent } from '../results/receipt-verify.component';
import { UnwrapOperation } from '../results/op-result';
import { BallotContestComponent } from './ballot-contest.component';
import {
    BuildContestSubmission,
    BuildSubmission,
    CountAnswered,
    FriendlyIssueMessage,
    NewBallotState,
    NewContestState,
    ValidateBallot,
    type ContestState,
} from './ballot-model';

type Step = 'loading' | 'error' | 'closed' | 'voted' | 'ballot' | 'review' | 'cast';

const SECRECY_TEXT: Record<string, string> = {
    Open: 'Open ballot: how you vote is recorded with your name.',
    Confidential: 'Confidential ballot: how you vote is tied to you only for authorized audit, never shown in results.',
    Secret: 'Secret ballot: your choices are stored separately from your identity and cannot be traced back to you.',
};

@Component({
    selector: 'mj-voting-explorer-ballot',
    standalone: true,
    // FormsModule: the ballot is a <form (ngSubmit)>; without NgForm the submit is a native one that reloads the page.
    imports: [CommonModule, FormsModule, MJButtonDirective, SharedGenericModule, BallotContestComponent, ContestOutcomeComponent, ReceiptVerifyComponent],
    template: `
        <div class="ballot" #root>
            <div class="sr-only" aria-live="polite" role="status">{{ Announcement }}</div>

            @switch (CurrentStep) {
                @case ('loading') {
                    <div class="state-box"><mj-loading text="Loading your ballot..." size="large"></mj-loading></div>
                }
                @case ('error') {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>{{ ErrorMessage }}</span>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Load()">Try again</button>
                    </div>
                }
                @case ('closed') {
                    <div class="state-box empty">
                        <i class="fa-solid fa-box-archive"></i>
                        <h2 tabindex="-1" #heading>No ballot available</h2>
                        <p>{{ ErrorMessage || 'There is no ballot for you in this election.' }}</p>
                    </div>
                }
                @case ('voted') {
                    <header class="head">
                        <h2 tabindex="-1" #heading>{{ Style?.ElectionName }}</h2>
                    </header>
                    <div class="banner banner-ok" role="status">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>You have already voted in this election. Thank you.</span>
                    </div>
                    <ng-container *ngTemplateOutlet="receiptCard"></ng-container>
                    @if (CanRevote) {
                        <section class="card">
                            <h3>Change your vote</h3>
                            <p class="muted">This election lets you vote again until it closes. Your new ballot replaces your earlier one. Your previous choices are not shown, so you will start with a blank ballot.</p>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="StartRevote()">
                                <i class="fa-solid fa-rotate"></i> Vote again
                            </button>
                        </section>
                    }
                    <ng-container *ngTemplateOutlet="resultsCard"></ng-container>
                }
                @case ('ballot') {
                    <header class="head">
                        <h2 tabindex="-1" #heading>{{ Style?.ElectionName }}</h2>
                        @if (Style?.Description) {
                            <p class="muted">{{ Style?.Description }}</p>
                        }
                        <p class="meta">
                            <span><i class="fa-solid fa-user-shield"></i> {{ SecrecyText }}</span>
                            @if (Style?.ClosesAt) {
                                <span><i class="fa-solid fa-clock"></i> Voting closes {{ Style?.ClosesAt | date: 'medium' }}</span>
                            }
                        </p>
                        <p class="progress" aria-live="polite">{{ AnsweredCount }} of {{ Style?.Contests?.length }} contests answered</p>
                    </header>

                    @if (IsRevote) {
                        <div class="banner banner-info" role="status">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>You are changing your vote. Your new ballot will replace your earlier one.</span>
                        </div>
                    }

                    @if (ShowErrors && TotalIssueCount > 0) {
                        <div class="banner banner-error" role="alert">
                            <i class="fa-solid fa-circle-exclamation"></i>
                            <span>Please fix {{ TotalIssueCount }} {{ TotalIssueCount === 1 ? 'problem' : 'problems' }} below before reviewing your ballot.</span>
                        </div>
                    }

                    <form class="contests" (ngSubmit)="GoToReview()" novalidate>
                        @for (contest of Style?.Contests; track contest.ContestID) {
                            <voting-ballot-contest
                                [Contest]="contest"
                                [State]="StateFor(contest)"
                                [Errors]="ShowErrors ? ErrorsFor(contest) : []"
                                (Changed)="OnContestChanged()"
                            ></voting-ballot-contest>
                        }
                        <div class="actions">
                            <button type="submit" mjButton variant="primary" size="md">
                                Review my ballot <i class="fa-solid fa-arrow-right"></i>
                            </button>
                        </div>
                    </form>
                }
                @case ('review') {
                    <header class="head">
                        <h2 tabindex="-1" #heading>Review your ballot</h2>
                        <p class="muted">Check your choices. Nothing is recorded until you confirm.</p>
                    </header>

                    <ol class="review-list">
                        @for (r of ReviewRows; track r.ContestID) {
                            <li class="card">
                                <h3>{{ r.Name }}</h3>
                                @if (r.Abstain) {
                                    <p class="abstain"><i class="fa-solid fa-ban"></i> You are abstaining.</p>
                                } @else if (r.Choices.length === 0) {
                                    <p class="abstain"><i class="fa-regular fa-circle"></i> No selection (left blank).</p>
                                } @else if (r.Ranked) {
                                    <ol class="choices">
                                        @for (c of r.Choices; track c) {
                                            <li>{{ c }}</li>
                                        }
                                    </ol>
                                } @else {
                                    <ul class="choices">
                                        @for (c of r.Choices; track c) {
                                            <li>{{ c }}</li>
                                        }
                                    </ul>
                                }
                                @if (r.Comment) {
                                    <p class="comment"><strong>Your comment:</strong> {{ r.Comment }}</p>
                                }
                            </li>
                        }
                    </ol>

                    @if (CastError) {
                        <div class="banner banner-error" role="alert">
                            <i class="fa-solid fa-circle-exclamation"></i>
                            <span>{{ CastError }}</span>
                            @if (StyleChanged) {
                                <button type="button" mjButton variant="secondary" size="sm" (click)="Load()">Reload ballot</button>
                            }
                        </div>
                    }

                    <div class="actions">
                        <button type="button" mjButton variant="secondary" size="md" (click)="BackToBallot()" [disabled]="IsCasting">
                            <i class="fa-solid fa-arrow-left"></i> Back to edit
                        </button>
                        <button type="button" mjButton variant="primary" size="md" (click)="Cast()" [disabled]="IsCasting">
                            <i class="fa-solid" [class.fa-check-to-slot]="!IsCasting" [class.fa-spinner]="IsCasting" [class.fa-spin]="IsCasting"></i>
                            {{ IsCasting ? 'Casting...' : 'Confirm and cast ballot' }}
                        </button>
                    </div>
                }
                @case ('cast') {
                    <header class="head">
                        <h2 tabindex="-1" #heading>Your ballot was recorded</h2>
                    </header>
                    <div class="banner banner-ok" role="status">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>Thank you for voting in {{ Style?.ElectionName }}.</span>
                    </div>
                    <ng-container *ngTemplateOutlet="receiptCard"></ng-container>
                    <ng-container *ngTemplateOutlet="resultsCard"></ng-container>
                }
            }
        </div>

        <ng-template #receiptCard>
            <section class="card" aria-labelledby="receipt-h">
                <h3 id="receipt-h"><i class="fa-solid fa-receipt"></i> Your receipt</h3>
                @if (ReceiptCode) {
                    <p class="receipt-code"><code>{{ ReceiptCode }}</code></p>
                    <p class="muted">Keep this code. You can use it to confirm your ballot was counted; it does not reveal how you voted.</p>
                } @else {
                    <p class="muted">No receipt code is available for this ballot.</p>
                }
                @if (Style) {
                    <voting-receipt-verify [ElectionID]="Style.ElectionID"></voting-receipt-verify>
                }
            </section>
        </ng-template>

        <ng-template #resultsCard>
            @if (ResultsLoading) {
                <p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Checking for results...</p>
            } @else if (Results && Results.Visible && ResultViews.length > 0) {
                <section class="results" aria-labelledby="results-h">
                    <h3 id="results-h"><i class="fa-solid fa-chart-column"></i> {{ Results.IsRunning ? 'Running results' : 'Results' }}</h3>
                    @if (Results.IsRunning) {
                        <div class="banner banner-info" role="status">
                            <i class="fa-solid fa-hourglass-half"></i>
                            <span>
                                Voting is still open; these results are not final.
                                @if (Results.SnapshotAt) {
                                    Snapshot taken {{ Results.SnapshotAt | date: 'medium' }}.
                                }
                                @if (Results.BallotCount !== undefined) {
                                    {{ Results.BallotCount }} {{ Results.BallotCount === 1 ? 'ballot' : 'ballots' }} so far.
                                }
                            </span>
                        </div>
                    }
                    <div class="result-list">
                        @for (v of ResultViews; track v.Meta.ContestID) {
                            <voting-contest-outcome [Meta]="v.Meta" [Outcome]="v.Outcome" [IsRunning]="Results.IsRunning === true"></voting-contest-outcome>
                        }
                    </div>
                </section>
            } @else if (Results && Results.Visible === false && Results.Reason) {
                <p class="muted"><i class="fa-solid fa-eye-slash"></i> {{ Results.Reason }}</p>
            }
        </ng-template>
    `,
    styles: [
        `
            :host { display: block; }
            .ballot { max-width: 52rem; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; color: var(--mj-text-primary); }
            .head h2 { margin: 0 0 0.25rem; font-size: 1.4rem; color: var(--mj-text-primary); }
            .head h2:focus { outline: none; }
            .meta { display: flex; gap: 1.25rem; flex-wrap: wrap; margin: 0.5rem 0 0; color: var(--mj-text-secondary); font-size: 0.9rem; }
            .meta i { color: var(--mj-text-muted); margin-right: 0.35rem; }
            .progress { margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--mj-text-muted); }
            .muted { color: var(--mj-text-muted); }
            .state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 3rem 1rem; color: var(--mj-text-muted); text-align: center; }
            .state-box.empty i { font-size: 2rem; color: var(--mj-text-disabled); }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid transparent; }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
            .banner-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: var(--mj-status-info-border); }
            .contests { display: flex; flex-direction: column; gap: 1rem; }
            .actions { display: flex; gap: 0.75rem; justify-content: flex-end; flex-wrap: wrap; }
            .card { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            .card h3 { margin: 0 0 0.5rem; font-size: 1.05rem; color: var(--mj-text-primary); }
            .card h3 i { color: var(--mj-brand-primary); margin-right: 0.35rem; }
            .review-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
            .choices { margin: 0; padding-left: 1.25rem; color: var(--mj-text-primary); }
            .abstain { margin: 0; color: var(--mj-text-secondary); }
            .comment { margin: 0.5rem 0 0; color: var(--mj-text-secondary); font-size: 0.9rem; }
            .receipt-code { margin: 0.25rem 0; }
            .receipt-code code { font-size: 1.25rem; letter-spacing: 0.08em; padding: 0.35rem 0.75rem; background: var(--mj-bg-surface-sunken); border-radius: 6px; color: var(--mj-text-primary); user-select: all; }
            .results h3 { margin: 0 0 0.5rem; color: var(--mj-text-primary); font-size: 1.05rem; }
            .result-list { display: flex; flex-direction: column; gap: 1rem; margin-top: 0.75rem; }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        `,
    ],
})
export class VotingExplorerBallotComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);
    /** The election the signed-in user is voting in. */
    @Input() electionId: string | null = null;
    /** Emits the receipt code after a ballot is recorded. */
    @Output() BallotCast = new EventEmitter<string>();

    @ViewChild('heading') private headingRef?: ElementRef<HTMLElement>;

    public CurrentStep: Step = 'loading';
    public ErrorMessage: string | null = null;
    public Announcement = '';

    public Style: VotingBallotStyle | null = null;
    public CanRevote = false;
    public ReceiptCode: string | null = null;
    public IsRevote = false;

    public States: ContestState[] = [];
    public ShowErrors = false;
    public IssuesByContest = new Map<string, ValidationIssue[]>();

    public IsCasting = false;
    public CastError: string | null = null;
    public StyleChanged = false;

    public Results: VotingGetResultsOutput | null = null;
    public ResultsLoading = false;
    public ResultViews: Array<{ Meta: ContestResultMeta; Outcome: VotingContestOutcome }> = [];

    async ngOnChanges(changes: SimpleChanges): Promise<void> {
        if (changes['electionId']) {
            await this.Load();
        }
        this.cdr.detectChanges();
    }

    public get SecrecyText(): string {
        return SECRECY_TEXT[this.Style?.SecrecyMode ?? ''] ?? '';
    }

    public get AnsweredCount(): number {
        return this.Style ? CountAnswered(this.Style, this.States) : 0;
    }

    public get TotalIssueCount(): number {
        let n = 0;
        this.IssuesByContest.forEach((list) => (n += list.length));
        return n;
    }

    public get ReviewRows(): Array<{ ContestID: string; Name: string; Abstain: boolean; Ranked: boolean; Choices: string[]; Comment: string }> {
        const style = this.Style;
        if (!style) {
            return [];
        }
        return style.Contests.map((contest) => {
            const state = this.StateFor(contest);
            const submission = BuildContestSubmission(contest, state);
            const choices = (submission.Selections ?? []).map((s) => {
                const option = contest.Options.find((o) => o.OptionID === s.OptionID);
                const label = option?.Label ?? s.OptionID;
                return s.WriteInText ? `${label}: ${s.WriteInText}` : label;
            });
            return {
                ContestID: contest.ContestID,
                Name: contest.Name,
                Abstain: state.Abstain,
                Ranked: contest.IsRanked,
                Choices: choices,
                Comment: submission.Comments?.[0]?.Comment ?? '',
            };
        });
    }

    public StateFor(contest: VotingBallotStyleContest): ContestState {
        let state = this.States.find((s) => s.ContestID === contest.ContestID);
        if (!state) {
            state = NewContestState(contest);
            this.States.push(state);
        }
        return state;
    }

    public ErrorsFor(contest: VotingBallotStyleContest): string[] {
        return (this.IssuesByContest.get(contest.ContestID) ?? []).map((i) => FriendlyIssueMessage(i, contest));
    }

    public OnContestChanged(): void {
        if (this.ShowErrors) {
            this.Revalidate();
        }
    }

    public async Load(): Promise<void> {
        const electionId = this.electionId;
        if (!electionId) {
            this.CurrentStep = 'closed';
            this.ErrorMessage = 'No election was selected.';
            return;
        }
        this.CurrentStep = 'loading';
        this.ErrorMessage = null;
        this.CastError = null;
        this.StyleChanged = false;
        this.ShowErrors = false;
        this.IsRevote = false;
        this.Results = null;
        this.ResultViews = [];
        try {
            const res = await new VotingGetMyBallotOperation().Execute({ ElectionID: electionId });
            if (this.electionId !== electionId) {
                this.cdr.detectChanges();
                return; // selection changed while loading
            }
            const unwrapped = UnwrapOperation<VotingGetMyBallotOutput>(res, 'Your ballot could not be loaded.');
            if (unwrapped.Error || !unwrapped.Output) {
                this.ErrorMessage = unwrapped.Error;
                this.SetStep(this.LooksLikeNoBallot(unwrapped.Error) ? 'closed' : 'error', 'Your ballot could not be loaded.');
                this.cdr.detectChanges();
                return;
            }
            const out = unwrapped.Output;
            if (!out.Style) {
                this.ErrorMessage = out.Message ?? 'There is no ballot for you in this election.';
                this.SetStep('closed', this.ErrorMessage);
                this.cdr.detectChanges();
                return;
            }
            this.Style = out.Style;
            this.CanRevote = out.CanRevote === true;
            this.ReceiptCode = out.ReceiptCode ?? null;
            this.States = NewBallotState(out.Style);
            this.IssuesByContest = new Map();
            if (out.HasVoted) {
                this.SetStep('voted', 'You have already voted in this election.');
                void this.LoadResults();
            } else {
                this.SetStep('ballot', `Ballot loaded: ${out.Style.ElectionName}`);
            }
        } catch (error) {
            LogError('[VotingBallot] Failed to load ballot', undefined, error);
            this.ErrorMessage = error instanceof Error ? error.message : 'Your ballot could not be loaded.';
            this.SetStep('error', this.ErrorMessage);
        }
        this.cdr.detectChanges();
    }

    public StartRevote(): void {
        if (!this.Style) {
            return;
        }
        this.IsRevote = true;
        this.States = NewBallotState(this.Style);
        this.ShowErrors = false;
        this.IssuesByContest = new Map();
        this.SetStep('ballot', 'Starting a new ballot to replace your earlier one.');
    }

    public GoToReview(): void {
        this.Revalidate();
        this.ShowErrors = true;
        if (this.TotalIssueCount > 0) {
            this.Announcement = `${this.TotalIssueCount} problems need fixing before you can review your ballot.`;
            return;
        }
        this.CastError = null;
        this.SetStep('review', 'Review your ballot.');
    }

    public BackToBallot(): void {
        this.SetStep('ballot', 'Back to editing your ballot.');
    }

    public async Cast(): Promise<void> {
        const style = this.Style;
        if (!style || this.IsCasting) {
            return;
        }
        this.Revalidate();
        if (this.TotalIssueCount > 0) {
            this.ShowErrors = true;
            this.SetStep('ballot', 'Your ballot has problems to fix.');
            return;
        }
        this.IsCasting = true;
        this.CastError = null;
        this.StyleChanged = false;
        try {
            const res = await new VotingCastBallotOperation().Execute({
                ElectionID: style.ElectionID,
                Language: style.Language,
                BallotStyleHash: style.Hash,
                Submission: BuildSubmission(style, this.States),
            });
            const unwrapped = UnwrapOperation(res, 'Your ballot could not be cast.');
            if (unwrapped.Error || !unwrapped.Output) {
                this.CastError = unwrapped.Error;
                this.StyleChanged = /style|changed|hash/i.test(unwrapped.Error ?? '');
                return;
            }
            this.ReceiptCode = unwrapped.Output.ReceiptCode ?? null;
            this.SetStep('cast', 'Your ballot was recorded.');
            if (this.ReceiptCode) {
                this.BallotCast.emit(this.ReceiptCode);
            }
            void this.LoadResults();
        } catch (error) {
            LogError('[VotingBallot] Cast failed', undefined, error);
            this.CastError = error instanceof Error ? error.message : 'Your ballot could not be cast.';
        } finally {
            this.IsCasting = false;
            this.cdr.detectChanges();
        }
    }

    private Revalidate(): void {
        if (!this.Style) {
            return;
        }
        this.IssuesByContest = ValidateBallot(this.Style, BuildSubmission(this.Style, this.States));
    }

    private LooksLikeNoBallot(message: string | null): boolean {
        return !!message && /not (on|in) the (voter )?roll|not eligible|no ballot|not open|has not opened|is closed|not found/i.test(message);
    }

    private SetStep(step: Step, announcement: string): void {
        this.CurrentStep = step;
        this.Announcement = announcement;
        // Move focus to the new step's heading so screen-reader and keyboard users land at the top of it.
        setTimeout(() => this.headingRef?.nativeElement.focus());
    }

    private async LoadResults(): Promise<void> {
        const style = this.Style;
        if (!style) {
            return;
        }
        this.ResultsLoading = true;
        try {
            const res = await new VotingGetResultsOperation().Execute({ ElectionID: style.ElectionID });
            const unwrapped = UnwrapOperation(res, 'Results are not available.');
            if (unwrapped.Error || !unwrapped.Output) {
                this.Results = null;
                return;
            }
            this.Results = unwrapped.Output;
            this.ResultViews = (unwrapped.Output.Contests ?? []).map((outcome) => ({
                Meta: this.MetaFor(style, outcome.ContestID),
                Outcome: outcome,
            }));
        } catch (error) {
            LogError('[VotingBallot] Failed to load results', undefined, error);
            this.Results = null;
        } finally {
            this.ResultsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private MetaFor(style: VotingBallotStyle, contestId: string): ContestResultMeta {
        const contest = style.Contests.find((c) => c.ContestID.toLowerCase() === contestId.toLowerCase());
        const labels: Record<string, string> = {};
        for (const o of contest?.Options ?? []) {
            labels[o.OptionID.toLowerCase()] = o.Label;
        }
        return {
            ContestID: contestId,
            Name: contest?.Name ?? 'Contest',
            Kind: contest?.Kind ?? 'Contest',
            Seats: contest?.Seats ?? 1,
            Threshold: 'None',
            CustomThreshold: null,
            ThresholdBasis: 'VotesCast',
            TallyMethodName: '',
            IsRanked: contest?.IsRanked ?? false,
            OptionLabels: labels,
        };
    }
}

export function LoadVotingExplorerBallot(): void {
    void VotingExplorerBallotComponent;
}
