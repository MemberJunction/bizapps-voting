/**
 * TurnoutTab — live turnout for an election via Voting.GetTurnout. It shows counts only: no
 * results of any kind. While the election is Open it refreshes every 30 seconds.
 */
import { Component, EventEmitter, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import type { VotingGetTurnoutOutput } from '@mj-biz-apps/voting-entities';
import { VotingApiService } from '../../shared/voting-api.service';
import { ELECTION_COMMON_STYLES } from '../election-styles';

interface BreakdownRow {
    Label: string;
    Count: number;
    Percent: number;
}

const REFRESH_MS = 30000;

@Component({
    selector: 'election-turnout-tab',
    standalone: true,
    imports: [CommonModule, SharedGenericModule, MJButtonDirective],
    template: `
        <div class="head">
            <p class="hint">
                Turnout shows how many eligible voters have voted. It never shows how anyone voted or how the contests are going.
                @if (IsPolling) {
                    This view refreshes every 30 seconds while voting is open.
                }
            </p>
            <button type="button" mjButton variant="secondary" size="sm" (click)="Load()" [disabled]="IsLoading">
                <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoading"></i> Refresh
            </button>
        </div>

        <div aria-live="polite">
            @if (IsLoading && !Turnout) {
                <div class="state-box"><mj-loading text="Loading turnout..." size="large"></mj-loading></div>
            } @else if (ErrorMessage) {
                <div class="banner banner-error" role="alert">
                    <i class="fa-solid fa-triangle-exclamation"></i><span>{{ ErrorMessage }}</span>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="Load()">Retry</button>
                </div>
            } @else if (Turnout) {
                <div class="kpis">
                    <div class="kpi"><span class="kpi-label">Eligible voters</span><span class="kpi-value">{{ Turnout.Eligible ?? 0 }}</span></div>
                    <div class="kpi"><span class="kpi-label">Voted</span><span class="kpi-value">{{ Turnout.Voted ?? 0 }}</span></div>
                    <div class="kpi"><span class="kpi-label">Turnout</span><span class="kpi-value">{{ Turnout.TurnoutPercent ?? 0 | number: '1.0-1' }}%</span></div>
                    <div class="kpi" [class.ok]="Turnout.QuorumMet === true" [class.warn]="Turnout.QuorumMet === false">
                        <span class="kpi-label">Quorum</span>
                        <span class="kpi-value">{{ Turnout.QuorumMet === undefined ? 'None required' : Turnout.QuorumMet ? 'Met' : 'Not met' }}</span>
                    </div>
                </div>

                <div class="bar-wrap" role="img" [attr.aria-label]="'Turnout ' + (Turnout.TurnoutPercent ?? 0) + ' percent'">
                    <div class="bar-fill" [style.width.%]="Clamp(Turnout.TurnoutPercent ?? 0)"></div>
                </div>

                <div class="breakdowns">
                    @if (ByChannel.length > 0) {
                        <section class="panel" aria-labelledby="to-channel">
                            <h3 id="to-channel">By channel</h3>
                            <ng-container *ngTemplateOutlet="breakdown; context: { $implicit: ByChannel }"></ng-container>
                        </section>
                    }
                    @if (ByMethod.length > 0) {
                        <section class="panel" aria-labelledby="to-method">
                            <h3 id="to-method">By sign-in method</h3>
                            <ng-container *ngTemplateOutlet="breakdown; context: { $implicit: ByMethod }"></ng-container>
                        </section>
                    }
                </div>
                @if (LastUpdated) {
                    <p class="muted small">Updated {{ LastUpdated | date: 'mediumTime' }}</p>
                }
            }
        </div>

        <ng-template #breakdown let-rows>
            <ul class="bd">
                @for (r of rows; track r.Label) {
                    <li>
                        <span class="bd-label">{{ r.Label }}</span>
                        <span class="bd-track" aria-hidden="true"><span class="bd-fill" [style.width.%]="r.Percent"></span></span>
                        <span class="bd-count">{{ r.Count }}</span>
                    </li>
                }
            </ul>
        </ng-template>
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
            .head .hint { flex: 1; min-width: 16rem; }
            .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
            .kpi { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.9rem 1rem; background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; }
            .kpi.ok { border-color: var(--mj-status-success-border); background: var(--mj-status-success-bg); }
            .kpi.warn { border-color: var(--mj-status-warning-border); background: var(--mj-status-warning-bg); }
            .kpi-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); }
            .kpi-value { font-size: 1.5rem; font-weight: 700; color: var(--mj-text-primary); }
            .bar-wrap { height: 0.9rem; background: var(--mj-bg-surface-sunken); border-radius: 999px; overflow: hidden; margin-bottom: 1rem; }
            .bar-fill { height: 100%; background: var(--mj-brand-primary); border-radius: 999px; }
            .breakdowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; }
            .bd { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
            .bd li { display: grid; grid-template-columns: 9rem 1fr 3rem; gap: 0.6rem; align-items: center; }
            .bd-label { color: var(--mj-text-secondary); font-size: 0.9rem; }
            .bd-track { height: 0.6rem; background: var(--mj-bg-surface-sunken); border-radius: 999px; overflow: hidden; }
            .bd-fill { display: block; height: 100%; background: var(--mj-brand-primary); }
            .bd-count { text-align: right; font-variant-numeric: tabular-nums; color: var(--mj-text-primary); }
        `,
    ],
})
export class TurnoutTabComponent extends BaseElectionAdminTab implements OnChanges, OnDestroy {
    private readonly api = inject(VotingApiService);

    @Output() Changed = new EventEmitter<void>();

    public Turnout: VotingGetTurnoutOutput | null = null;
    public ByChannel: BreakdownRow[] = [];
    public ByMethod: BreakdownRow[] = [];
    public IsLoading = false;
    public ErrorMessage: string | null = null;
    public LastUpdated: Date | null = null;
    public IsPolling = false;

    private timer: ReturnType<typeof setInterval> | null = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.Turnout = null;
            void this.Load();
        }
        if (changes['ElectionID'] || changes['ElectionStatus']) {
            this.SyncPolling();
        }
    }

    ngOnDestroy(): void {
        this.StopPolling();
    }

    public Clamp(percent: number): number {
        return Math.min(100, Math.max(0, percent));
    }

    public async Load(): Promise<void> {
        if (!this.ElectionID) {
            return;
        }
        this.IsLoading = true;
        try {
            const r = await this.api.GetTurnout({ ElectionID: this.ElectionID });
            if (!r.Success || !r.Output) {
                this.ErrorMessage = r.Message ?? 'Turnout could not be retrieved.';
                return;
            }
            this.ErrorMessage = null;
            this.Turnout = r.Output;
            this.ByChannel = this.ToRows(r.Output.ByChannel);
            this.ByMethod = this.ToRows(r.Output.ByMethod);
            this.LastUpdated = new Date();
        } finally {
            this.IsLoading = false;
        }
    }

    private ToRows(map: Record<string, number> | undefined): BreakdownRow[] {
        const entries = Object.entries(map ?? {});
        const max = entries.reduce((m, [, n]) => Math.max(m, n), 0);
        return entries
            .map(([Label, Count]) => ({ Label, Count, Percent: max > 0 ? (Count / max) * 100 : 0 }))
            .sort((a, b) => b.Count - a.Count);
    }

    private SyncPolling(): void {
        this.StopPolling();
        if (this.ElectionStatus === 'Open') {
            this.IsPolling = true;
            this.timer = setInterval(() => void this.Load(), REFRESH_MS);
        }
    }

    private StopPolling(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.IsPolling = false;
    }
}
