/**
 * VotingBallotResource — hosts the Explorer ballot for the signed-in user. Deep-links with
 * ?electionId=...; without one it lists the open elections the user can vote in.
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LogError, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJButtonDirective,
} from '@memberjunction/ng-ui-components';
import { VotingExplorerBallotComponent } from './ballot.component';

interface OpenElection {
    ID: string;
    Name: string;
    Description: string | null;
    ClosesAt: string | null;
}

@RegisterClass(BaseResourceComponent, 'VotingBallotResource')
@Component({
    standalone: true,
    imports: [
        CommonModule,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJButtonDirective,
        SharedGenericModule,
        VotingExplorerBallotComponent,
    ],
    selector: 'voting-ballot-resource',
    template: `
        <mj-page-layout>
            <mj-page-header Title="My Ballot" Icon="fa-solid fa-check-to-slot" Subtitle="Cast your vote in an open election">
                <div actions>
                    @if (ElectionId) {
                        <button type="button" mjButton variant="secondary" size="sm" (click)="ChooseAnother()">
                            <i class="fa-solid fa-list"></i> All open elections
                        </button>
                    }
                </div>
            </mj-page-header>

            <mj-page-body [Padding]="true">
                @if (ElectionId) {
                    <mj-voting-explorer-ballot [electionId]="ElectionId"></mj-voting-explorer-ballot>
                } @else if (IsLoading) {
                    <div class="state-box"><mj-loading text="Loading open elections..." size="large"></mj-loading></div>
                } @else if (LoadError) {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>{{ LoadError }}</span>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="LoadOpenElections()">Retry</button>
                    </div>
                } @else if (OpenElections.length === 0) {
                    <div class="state-box empty">
                        <i class="fa-solid fa-box-open"></i>
                        <p>There are no open elections right now.</p>
                    </div>
                } @else {
                    <ul class="election-list" aria-label="Open elections">
                        @for (e of OpenElections; track e.ID) {
                            <li class="election">
                                <div>
                                    <h3>{{ e.Name }}</h3>
                                    @if (e.Description) {
                                        <p class="muted">{{ e.Description }}</p>
                                    }
                                    @if (e.ClosesAt) {
                                        <p class="muted small"><i class="fa-solid fa-clock"></i> Closes {{ e.ClosesAt | date: 'medium' }}</p>
                                    }
                                </div>
                                <button type="button" mjButton variant="primary" size="sm" (click)="Open(e.ID)">
                                    <i class="fa-solid fa-check-to-slot"></i> Open ballot
                                </button>
                            </li>
                        }
                    </ul>
                }
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [
        `
            :host { display: block; width: 100%; height: 100%; }
            .state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 3rem 1rem; color: var(--mj-text-muted); text-align: center; }
            .state-box.empty i { font-size: 2rem; color: var(--mj-text-disabled); }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid transparent; }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .election-list { list-style: none; margin: 0 auto; padding: 0; max-width: 52rem; display: flex; flex-direction: column; gap: 0.75rem; }
            .election { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1rem 1.25rem; background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; }
            .election h3 { margin: 0; font-size: 1.05rem; color: var(--mj-text-primary); }
            .election p { margin: 0.25rem 0 0; }
            .muted { color: var(--mj-text-muted); }
            .small { font-size: 0.85rem; }
        `,
    ],
})
export class VotingBallotResourceComponent extends BaseResourceComponent implements OnInit {
    public ElectionId: string | null = null;
    public OpenElections: OpenElection[] = [];
    public IsLoading = false;
    public LoadError: string | null = null;

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.ElectionId = this.GetQueryParams()['electionId'] || null;
        if (!this.ElectionId) {
            await this.LoadOpenElections();
        }
        this.NotifyLoadComplete();
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const id = params['electionId'] || null;
        if (id !== this.ElectionId) {
            this.ElectionId = id;
            if (!id) {
                void this.LoadOpenElections();
            }
        }
    }

    public Open(id: string): void {
        this.ElectionId = id;
        this.UpdateQueryParams({ electionId: id });
    }

    public ChooseAnother(): void {
        this.ElectionId = null;
        this.UpdateQueryParams({ electionId: null });
        void this.LoadOpenElections();
    }

    public async LoadOpenElections(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<OpenElection>({
                EntityName: 'MJ_BizApps_Voting: Elections',
                ExtraFilter: `Status='Open'`,
                OrderBy: 'ClosesAt',
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'Description', 'ClosesAt'],
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'Open elections could not be loaded.');
            }
            this.OpenElections = res.Results;
        } catch (error) {
            LogError('[VotingBallot] Failed to load open elections', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Open elections could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'My Ballot';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-check-to-slot';
    }
}

export function LoadVotingBallotResource(): void {
    void VotingBallotResourceComponent;
}
