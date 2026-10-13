/**
 * TallyTab — Close & Tally: closes voting, runs the tally (with an optional seed so tie-breaks by lot
 * are reproducible) and shows the per-contest outcome. Re-tallying is allowed until certification.
 */
import { Component, EventEmitter, OnChanges, Output, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import type { VotingContestTallyResult } from '@mj-biz-apps/voting-entities';
import { ContestOutcomeComponent } from '../../results/contest-outcome.component';
import { FallbackContestMeta, LoadContestMeta, type ContestMetaWithSequence } from '../../results/contest-meta';
import { VotingApiService } from '../../shared/voting-api.service';
import { ELECTION_COMMON_STYLES } from '../election-styles';

interface TallyView {
    Meta: ContestMetaWithSequence;
    Outcome: VotingContestTallyResult;
}

@Component({
    selector: 'election-tally-tab',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective, ContestOutcomeComponent],
    template: `
        <section class="panel" aria-labelledby="tally-steps">
            <h3 id="tally-steps"><i class="fa-solid fa-calculator"></i> Close and tally</h3>
            <ol class="steps">
                <li [class.done]="StepDone(1)" [class.current]="CurrentStep === 1">
                    <strong>1. Close voting.</strong> No more ballots are accepted.
                </li>
                <li [class.done]="StepDone(2)" [class.current]="CurrentStep === 2">
                    <strong>2. Tally.</strong> Counts the ballots and computes each contest's outcome.
                </li>
                <li [class.done]="StepDone(3)" [class.current]="CurrentStep === 3">
                    <strong>3. Certify.</strong> Locks the result with a signed certification.
                </li>
            </ol>

            <div aria-live="polite">
                @if (ActionError) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ ActionError }}</span></div>
                }
                @if (ActionMessage) {
                    <div class="banner banner-ok"><i class="fa-solid fa-circle-check"></i><span>{{ ActionMessage }}</span></div>
                }
            </div>

            @if (!IsAdministrator) {
                <p class="muted small">Only voting administrators can close and tally an election.</p>
            } @else if (ElectionStatus === 'Open') {
                @if (!ConfirmClose) {
                    <button type="button" mjButton variant="primary" size="sm" (click)="ConfirmClose = true" [disabled]="IsBusy">
                        <i class="fa-solid fa-lock"></i> Close voting
                    </button>
                } @else {
                    <div class="actions">
                        <span class="confirm-text">Close voting now? This cannot be undone.</span>
                        <button type="button" mjButton variant="primary" size="sm" (click)="Close()" [disabled]="IsBusy">
                            <i class="fa-solid fa-check"></i> Yes, close
                        </button>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="ConfirmClose = false" [disabled]="IsBusy">Cancel</button>
                    </div>
                }
            } @else if (ElectionStatus === 'Closed' || ElectionStatus === 'Tallied') {
                <div class="field seed-field">
                    <label for="tally-seed">Tie-break seed (optional)</label>
                    <input id="tally-seed" class="input mono" [(ngModel)]="Seed" aria-describedby="tally-seed-hint" />
                    <p class="hint" id="tally-seed-hint">
                        When a tie must be settled by lot, the same seed always produces the same draw. Record it if you want the result to be reproducible by an auditor.
                    </p>
                </div>
                <button type="button" mjButton variant="primary" size="sm" (click)="RunTally()" [disabled]="IsBusy">
                    <i class="fa-solid" [class.fa-calculator]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i>
                    {{ ElectionStatus === 'Tallied' ? 'Re-tally' : 'Tally ballots' }}
                </button>
            } @else {
                <p class="muted">
                    @if (ElectionStatus === 'Tallied' || ElectionStatus === 'Certified') {
                        The ballots have been counted.
                    } @else {
                        Voting cannot be closed or tallied while the election is {{ ElectionStatus }}.
                    }
                </p>
            }
        </section>

        @if (Views.length > 0) {
            <section aria-labelledby="tally-out">
                <h3 id="tally-out">Tally outcome</h3>
                <div class="outcomes">
                    @for (v of Views; track v.Meta.ContestID) {
                        <voting-contest-outcome [Meta]="v.Meta" [Outcome]="v.Outcome"></voting-contest-outcome>
                    }
                </div>
            </section>
        }
        @if (ElectionStatus === 'Tallied' || ElectionStatus === 'Certified') {
            <div class="actions">
                <button type="button" mjButton variant="secondary" size="sm" (click)="OpenResults()">
                    <i class="fa-solid fa-chart-column"></i> Open Results &amp; Certification
                </button>
            </div>
        }
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .steps { margin: 0 0 1rem; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.35rem; color: var(--mj-text-muted); }
            .steps li.current { color: var(--mj-text-primary); }
            .steps li.done { color: var(--mj-status-success-text); }
            .seed-field { max-width: 24rem; }
            .outcomes { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
        `,
    ],
})
export class TallyTabComponent extends BaseElectionAdminTab implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly api = inject(VotingApiService);
    private readonly navService = inject(NavigationService, { optional: true });

    @Output() Changed = new EventEmitter<void>();

    public IsBusy = false;
    public ConfirmClose = false;
    public Seed = '';
    public ActionError: string | null = null;
    public ActionMessage: string | null = null;
    public Views: TallyView[] = [];

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.Views = [];
        }
    }

    public get CurrentStep(): number {
        switch (this.ElectionStatus) {
            case 'Open':
                return 1;
            case 'Closed':
                return 2;
            case 'Tallied':
                return 3;
            default:
                return 0;
        }
    }

    public StepDone(step: number): boolean {
        return step <= this.DoneCount;
    }

    private get DoneCount(): number {
        switch (this.ElectionStatus) {
            case 'Closed':
                return 1;
            case 'Tallied':
                return 2;
            case 'Certified':
                return 3;
            default:
                return 0;
        }
    }

    public async Close(): Promise<void> {
        this.IsBusy = true;
        this.ActionError = null;
        this.ActionMessage = null;
        try {
            const r = await this.api.CloseElection({ ElectionID: this.ElectionID });
            if (!r.Success) {
                this.ActionError = r.Message ?? 'Voting could not be closed.';
                return;
            }
            this.ConfirmClose = false;
            this.ActionMessage = 'Voting is closed. The ballots are ready to be tallied.';
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
            this.cdr.detectChanges();
        }
    }

    public async RunTally(): Promise<void> {
        this.IsBusy = true;
        this.ActionError = null;
        this.ActionMessage = null;
        try {
            const r = await this.api.Tally({ ElectionID: this.ElectionID, TieBreakSeed: this.Seed.trim() || undefined });
            if (!r.Success || !r.Output) {
                this.ActionError = r.Message ?? 'The election could not be tallied.';
                return;
            }
            this.ActionMessage = 'The ballots were tallied.';
            await this.ShowOutcomes(r.Output.Contests ?? []);
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
            this.cdr.detectChanges();
        }
    }

    private async ShowOutcomes(outcomes: VotingContestTallyResult[]): Promise<void> {
        try {
            const meta = await LoadContestMeta(this.ProviderToUse, this.ElectionID);
            this.Views = outcomes
                .map((o) => ({ Meta: meta.get(o.ContestID.toLowerCase()) ?? FallbackContestMeta(o.ContestID), Outcome: o }))
                .sort((a, b) => a.Meta.Sequence - b.Meta.Sequence);
        } catch (error) {
            LogError('[VotingElections] Failed to load contest details for the tally', undefined, error);
            this.Views = outcomes.map((o) => ({ Meta: FallbackContestMeta(o.ContestID), Outcome: o }));
        }
        this.cdr.detectChanges();
    }

    public OpenResults(): void {
        void this.navService?.OpenNavItemByName('Results & Certification', { queryParams: { electionId: this.ElectionID } });
    }
}
