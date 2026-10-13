/**
 * VotingResultsResource — election results for administrators and inspectors: per-contest
 * outcomes (via Voting.GetResults), the running-results banner while voting is open,
 * certification status with a Certify action, a printable report and receipt verification.
 *
 * Deep-links with ?electionId=... (restored through OnQueryParamsChanged).
 */
import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJButtonDirective,
} from '@memberjunction/ng-ui-components';
import {
    VotingGetResultsOperation,
    type VotingGetResultsOutput,
} from '@mj-biz-apps/voting-entities';
import { LoadContestMeta, FallbackContestMeta, type ContestMetaWithSequence } from './contest-meta';
import { StatusChipComponent } from '../shared/status-chip.component';
import { ContestOutcomeComponent } from './contest-outcome.component';
import { CertificationPanelComponent } from './certification-panel.component';
import { ReceiptVerifyComponent } from './receipt-verify.component';
import { CommentsPanelComponent } from './comments-panel.component';
import { HasVotingAdministratorRole, HasVotingPrivilege, UnwrapOperation } from './op-result';
import { BuildReportHtml, PrintReport, type CertificationView, type ReportContest } from './results-report';

type ElectionStatus = 'Draft' | 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Tallied' | 'Certified' | 'Cancelled';

interface ElectionPick {
    ID: string;
    Name: string;
    Status: ElectionStatus;
    ResultsTiming: string;
    ResultsAudience: string;
    SecrecyMode: string;
    ClosesAt: string | null;
}

const RESULTS_TIMING_TEXT: Record<string, string> = {
    AfterClose: 'Results are released only after voting closes.',
    AfterVoting: 'Each voter sees results after casting their own ballot.',
    Live: 'Running results are visible to the results audience while voting is open.',
    AdministratorsOnly: 'Running results are visible to administrators only, and every view is audited.',
};

const REFRESH_MS = 60000;

@RegisterClass(BaseResourceComponent, 'VotingResultsResource')
@Component({
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJButtonDirective,
        SharedGenericModule,
        StatusChipComponent,
        ContestOutcomeComponent,
        CertificationPanelComponent,
        ReceiptVerifyComponent,
        CommentsPanelComponent,
    ],
    selector: 'voting-results-resource',
    template: `
        <mj-page-layout>
            <mj-page-header Title="Results" Icon="fa-solid fa-chart-column" Subtitle="Outcomes, certification and verification">
                <div actions>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="Reload()" [disabled]="IsLoadingElections || IsLoadingResults">
                        <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoadingResults"></i> Refresh
                    </button>
                    <button type="button" mjButton variant="primary" size="sm" (click)="Print()" [disabled]="!CanPrint">
                        <i class="fa-solid fa-print"></i> Print report
                    </button>
                </div>
            </mj-page-header>

            <mj-page-body [Padding]="true">
                @if (IsLoadingElections) {
                    <div class="state-box"><mj-loading text="Loading elections..." size="large"></mj-loading></div>
                } @else if (ElectionsError) {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>{{ ElectionsError }}</span>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="LoadElections()">Retry</button>
                    </div>
                } @else if (Elections.length === 0) {
                    <div class="state-box empty">
                        <i class="fa-solid fa-chart-column"></i>
                        <p>There are no elections yet. Create an election to see results here.</p>
                    </div>
                } @else {
                    <div class="picker">
                        <label for="results-election">Election</label>
                        <select id="results-election" [ngModel]="SelectedElectionID" (ngModelChange)="OnElectionChosen($event)">
                            <option [ngValue]="null">Choose an election...</option>
                            @for (e of Elections; track e.ID) {
                                <option [ngValue]="e.ID">{{ e.Name }} ({{ e.Status }})</option>
                            }
                        </select>
                        @if (SelectedElection) {
                            <voting-status-chip [Status]="SelectedElection.Status"></voting-status-chip>
                        }
                    </div>

                    @if (!SelectedElection) {
                        <div class="state-box empty">
                            <i class="fa-solid fa-hand-pointer"></i>
                            <p>Select an election to view its results.</p>
                        </div>
                    } @else {
                        <div class="content" aria-live="polite">
                            @if (IsLoadingResults && !Results) {
                                <div class="state-box"><mj-loading text="Loading results..." size="large"></mj-loading></div>
                            }

                            @if (ResultsError) {
                                <div class="banner banner-error" role="alert">
                                    <i class="fa-solid fa-circle-exclamation"></i>
                                    <span>{{ ResultsError }}</span>
                                    <button type="button" mjButton variant="secondary" size="sm" (click)="LoadResults()">Retry</button>
                                </div>
                            }

                            @if (Results) {
                                @if (Results.IsRunning) {
                                    <div class="banner banner-info" role="status">
                                        <i class="fa-solid fa-hourglass-half"></i>
                                        <span>
                                            <strong>Running results.</strong> Voting is still open; these are not final.
                                            @if (Results.SnapshotAt) {
                                                Snapshot taken {{ Results.SnapshotAt | date: 'medium' }}.
                                            }
                                            @if (Results.BallotCount !== undefined) {
                                                {{ Results.BallotCount }} {{ Results.BallotCount === 1 ? 'ballot' : 'ballots' }} counted so far.
                                            }
                                            Totals update in batches, not per ballot.
                                        </span>
                                    </div>
                                }

                                @if (Results.Visible === false) {
                                    <div class="state-box empty">
                                        <i class="fa-solid fa-eye-slash"></i>
                                        <p>Results are not visible.</p>
                                        @if (Results.Reason) {
                                            <p class="reason">{{ Results.Reason }}</p>
                                        }
                                    </div>
                                } @else if (ContestViews.length === 0) {
                                    <div class="state-box empty">
                                        <i class="fa-solid fa-list-check"></i>
                                        <p>No contest results have been published yet.</p>
                                    </div>
                                } @else {
                                    <p class="timing"><i class="fa-solid fa-clock"></i> {{ TimingText }}</p>
                                    <div class="contests">
                                        @for (c of ContestViews; track c.Meta.ContestID) {
                                            <voting-contest-outcome [Meta]="c.Meta" [Outcome]="c.Outcome" [IsRunning]="Results.IsRunning === true"></voting-contest-outcome>
                                        }
                                    </div>
                                }
                            }

                            @if (ShowComments) {
                                <voting-comments-panel [ElectionID]="SelectedElection.ID" [Provider]="ProviderToUse" [CanResolve]="CanResolveComments"></voting-comments-panel>
                            }

                            <div class="lower">
                                <voting-certification-panel
                                    [ElectionID]="SelectedElection.ID"
                                    [ElectionStatus]="SelectedElection.Status"
                                    [ResultsTimingFallback]="TimingText"
                                    [CanCertify]="CanCertify"
                                    [Provider]="ProviderToUse"
                                    (CertificationLoaded)="OnCertificationLoaded($event)"
                                    (Certified)="OnCertified()"
                                ></voting-certification-panel>
                                <voting-receipt-verify [ElectionID]="SelectedElection.ID"></voting-receipt-verify>
                            </div>

                            @if (PrintBlocked) {
                                <div class="banner banner-warn" role="alert">
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                    <span>The browser blocked the report window. Allow pop-ups for this site and try again.</span>
                                </div>
                            }
                        </div>
                    }
                }
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [
        `
            :host { display: block; width: 100%; height: 100%; }
            .state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 3rem 1rem; color: var(--mj-text-muted); text-align: center; }
            .state-box.empty i { font-size: 2rem; color: var(--mj-text-disabled); }
            .reason { max-width: 40rem; color: var(--mj-text-secondary); }
            .picker { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
            .picker label { font-weight: 600; color: var(--mj-text-secondary); }
            .picker select { min-width: 18rem; padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; }
            .picker select:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 8px; margin: 0 0 1rem; border: 1px solid transparent; }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border-color: var(--mj-status-warning-border); }
            .banner-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: var(--mj-status-info-border); }
            .timing { margin: 0 0 1rem; color: var(--mj-text-secondary); font-size: 0.9rem; }
            .timing i { margin-right: 0.35rem; color: var(--mj-text-muted); }
            .contests { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
            .lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: 1rem; align-items: start; }
            @media print {
                .picker, .banner-warn { display: none; }
            }
        `,
    ],
})
export class VotingResultsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public Elections: ElectionPick[] = [];
    public SelectedElectionID: string | null = null;
    public IsLoadingElections = true;
    public ElectionsError: string | null = null;

    public Results: VotingGetResultsOutput | null = null;
    public ResultsError: string | null = null;
    public IsLoadingResults = false;
    public ContestViews: ReportContest[] = [];

    public CanCertify = false;
    public CanResolveComments = false;
    public PrintBlocked = false;

    private certification: CertificationView | null = null;
    private StandardsElectionIDs = new Set<string>();
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private loadToken = 0;

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.CanCertify = this.ComputeCanCertify();
        this.CanResolveComments = this.ComputeCanResolveComments();
        await this.LoadElections();
        const initial = this.GetQueryParams()['electionId'];
        if (initial) {
            await this.SelectElection(initial, false);
        }
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        this.StopRefresh();
        super.ngOnDestroy();
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const id = params['electionId'] || null;
        if (id !== this.SelectedElectionID) {
            void this.SelectElection(id, false);
        }
    }

    public get SelectedElection(): ElectionPick | null {
        return this.Elections.find((e) => UUIDsEqual(e.ID, this.SelectedElectionID)) ?? null;
    }

    public get TimingText(): string {
        const timing = this.SelectedElection?.ResultsTiming ?? '';
        return RESULTS_TIMING_TEXT[timing] ?? timing;
    }

    /** Comments are listed for Open-mode ballots that carry standards items. */
    public get ShowComments(): boolean {
        return this.SelectedElection?.SecrecyMode === 'Open' && this.HasStandardsItems;
    }

    private get HasStandardsItems(): boolean {
        return this.StandardsElectionIDs.has(this.SelectedElectionID?.toLowerCase() ?? '');
    }

    public get CanPrint(): boolean {
        return !!this.Results && this.Results.Visible !== false && this.ContestViews.length > 0;
    }

    public async LoadElections(): Promise<void> {
        this.IsLoadingElections = true;
        this.ElectionsError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<ElectionPick>({
                EntityName: 'MJ_BizApps_Voting: Elections',
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'Status', 'ResultsTiming', 'ResultsAudience', 'SecrecyMode', 'ClosesAt'],
                OrderBy: '__mj_CreatedAt DESC',
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'Elections could not be loaded.');
            }
            this.Elections = res.Results;
            await this.LoadStandardsElections();
        } catch (error) {
            LogError('[VotingResults] Failed to load elections', undefined, error);
            this.ElectionsError = error instanceof Error ? error.message : 'Elections could not be loaded.';
        } finally {
            this.IsLoadingElections = false;
        }
    }

    /** Which elections contain standards-item contests (the ones whose comments are worth listing). */
    private async LoadStandardsElections(): Promise<void> {
        this.StandardsElectionIDs = new Set<string>();
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<{ ElectionID: string }>({
            EntityName: 'MJ_BizApps_Voting: Contests',
            ExtraFilter: `Kind='StandardsItem'`,
            ResultType: 'simple',
            Fields: ['ElectionID'],
        });
        if (res.Success) {
            this.StandardsElectionIDs = new Set(res.Results.map((c) => c.ElectionID.toLowerCase()));
        }
    }

    public async OnElectionChosen(id: string | null): Promise<void> {
        await this.SelectElection(id, true);
    }

    public async Reload(): Promise<void> {
        await this.LoadElections();
        await this.LoadResults();
    }

    public async LoadResults(): Promise<void> {
        const election = this.SelectedElection;
        if (!election) {
            return;
        }
        const token = ++this.loadToken;
        this.IsLoadingResults = true;
        this.ResultsError = null;
        try {
            const [res, meta] = await Promise.all([
                new VotingGetResultsOperation().Execute({ ElectionID: election.ID }),
                LoadContestMeta(this.ProviderToUse, election.ID),
            ]);
            if (token !== this.loadToken) {
                return; // a newer selection superseded this load
            }
            const unwrapped = UnwrapOperation(res, 'Results could not be retrieved.');
            if (unwrapped.Error || !unwrapped.Output) {
                this.Results = null;
                this.ContestViews = [];
                this.ResultsError = unwrapped.Error;
                return;
            }
            this.Results = unwrapped.Output;
            const views = (unwrapped.Output.Contests ?? []).map((outcome) => ({
                Meta: meta.get(outcome.ContestID.toLowerCase()) ?? FallbackContestMeta(outcome.ContestID),
                Outcome: outcome,
            }));
            this.ContestViews = this.OrderByContestSequence(views, meta);
            this.SyncRefresh();
        } catch (error) {
            LogError('[VotingResults] Failed to load results', undefined, error);
            if (token === this.loadToken) {
                this.ResultsError = error instanceof Error ? error.message : 'Results could not be retrieved.';
            }
        } finally {
            if (token === this.loadToken) {
                this.IsLoadingResults = false;
            }
        }
    }

    public OnCertificationLoaded(cert: CertificationView | null): void {
        this.certification = cert;
    }

    public async OnCertified(): Promise<void> {
        await this.LoadElections();
    }

    public Print(): void {
        const election = this.SelectedElection;
        if (!election || !this.Results) {
            return;
        }
        const html = BuildReportHtml({
            ElectionName: election.Name,
            ElectionStatus: election.Status,
            ResultsTimingText: this.TimingText,
            IsRunning: this.Results.IsRunning === true,
            IsFinal: this.Results.IsFinal === true,
            SnapshotAt: this.Results.SnapshotAt ?? null,
            BallotCount: this.Results.BallotCount ?? null,
            Contests: this.ContestViews,
            Certification: this.certification,
        });
        this.PrintBlocked = !PrintReport(html);
    }

    private async SelectElection(id: string | null, pushToUrl: boolean): Promise<void> {
        this.SelectedElectionID = id;
        this.Results = null;
        this.ContestViews = [];
        this.ResultsError = null;
        this.certification = null;
        this.PrintBlocked = false;
        this.StopRefresh();
        if (pushToUrl) {
            this.UpdateQueryParams({ electionId: id });
        }
        if (id) {
            await this.LoadResults();
        }
    }

    private OrderByContestSequence(views: ReportContest[], meta: Map<string, ContestMetaWithSequence>): ReportContest[] {
        const seq = (v: ReportContest): number => meta.get(v.Meta.ContestID.toLowerCase())?.Sequence ?? Number.MAX_SAFE_INTEGER;
        return [...views].sort((a, b) => seq(a) - seq(b));
    }

    private ComputeCanResolveComments(): boolean {
        try {
            const roles = this.ProviderToUse.CurrentUser?.UserRoles ?? [];
            return HasVotingAdministratorRole(roles.map((r) => r.Role));
        } catch {
            return false;
        }
    }

    private ComputeCanCertify(): boolean {
        try {
            const roles = this.ProviderToUse.CurrentUser?.UserRoles ?? [];
            return HasVotingPrivilege(roles.map((r) => r.Role));
        } catch {
            return false;
        }
    }

    /** Poll for newer snapshots only while the election is showing running results. */
    private SyncRefresh(): void {
        this.StopRefresh();
        if (this.Results?.IsRunning) {
            this.refreshTimer = setInterval(() => void this.LoadResults(), REFRESH_MS);
        }
    }

    private StopRefresh(): void {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Results';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-chart-column';
    }
}

export function LoadVotingResultsResource(): void {
    void VotingResultsResourceComponent;
}
