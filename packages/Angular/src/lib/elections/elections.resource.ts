/**
 * VotingElectionsResource — the Elections admin dashboard.
 *
 * - List: search, status and type filters.
 * - New election: the setup wizard (type, details, contests, eligibility, linked records, review).
 * - Detail: tabs assembled through the voting-ng-widgets contribution assembly (built-in tabs, the type's
 *   UI driver, and additive contributions from other apps).
 *
 * State round-trips through query params: ?electionId=...&tab=...&wizard=1 (restored in OnQueryParamsChanged).
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJButtonDirective,
} from '@memberjunction/ng-ui-components';
import type { ElectionAdminTabDescriptor, ElectionUIContext } from '@mj-biz-apps/voting-ng-widgets';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { inject } from '@angular/core';
import { StatusChipComponent } from '../shared/status-chip.component';
import { HasVotingPrivilege } from '../results/op-result';
import { ContributionHostComponent, type HostedContribution } from './contribution-host.component';
import { AssembleAdminTabs, ResolveTabComponent } from './election-parts';
import { ElectionWizardComponent } from './election-wizard.component';
import { ELECTION_COMMON_STYLES } from './election-styles';

type ElectionStatus = 'Draft' | 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Tallied' | 'Certified' | 'Cancelled';

const STATUSES: ElectionStatus[] = ['Draft', 'Nominations', 'Ready', 'Open', 'Closed', 'Tallied', 'Certified', 'Cancelled'];
const ELECTION_ENTITY = 'MJ_BizApps_Voting: Elections';

interface ElectionListItem {
    ID: string;
    Name: string;
    ElectionTypeID: string;
    Status: ElectionStatus;
    SecrecyMode: string;
    RecordDate: string | null;
    OpensAt: string | null;
    ClosesAt: string | null;
}

interface TabView {
    Descriptor: ElectionAdminTabDescriptor;
    Component: ReturnType<typeof ResolveTabComponent>;
}

@RegisterClass(BaseResourceComponent, 'VotingElectionsResource')
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
        ContributionHostComponent,
        ElectionWizardComponent,
    ],
    selector: 'voting-elections-resource',
    template: `
        <mj-page-layout>
            <mj-page-header Title="Elections" Icon="fa-solid fa-check-to-slot" Subtitle="Create, run and close elections">
                <div actions>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="Reload()" [disabled]="IsLoading">
                        <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoading"></i> Refresh
                    </button>
                    @if (CanCreate) {
                        <button type="button" mjButton variant="primary" size="sm" (click)="OpenWizard()" [disabled]="IsLoading || WizardOpen">
                            <i class="fa-solid fa-plus"></i> New election
                        </button>
                    }
                </div>
            </mj-page-header>

            <mj-page-body [Padding]="true">
                @if (IsLoading && Elections.length === 0) {
                    <div class="state-box"><mj-loading text="Loading elections..." size="large"></mj-loading></div>
                } @else if (LoadError) {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i><span>{{ LoadError }}</span>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Reload()">Retry</button>
                    </div>
                } @else if (WizardOpen) {
                    <voting-election-wizard [Provider]="ProviderToUse" (Created)="OnCreated($event)" (Cancelled)="CloseWizard()"></voting-election-wizard>
                } @else if (SelectedId) {
                    <div class="detail-header">
                        <button type="button" mjButton variant="secondary" size="sm" (click)="ClearSelection()">
                            <i class="fa-solid fa-arrow-left"></i> All elections
                        </button>
                        @if (Selected) {
                            <h2>{{ Selected.Name }}</h2>
                            <voting-status-chip [Status]="Selected.Status"></voting-status-chip>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="OpenRecord()">
                                <i class="fa-solid fa-up-right-from-square"></i> Open record
                            </button>
                        }
                    </div>

                    @if (IsLoadingDetail && !Selected) {
                        <div class="state-box"><mj-loading text="Loading election..." size="large"></mj-loading></div>
                    } @else if (DetailError) {
                        <div class="banner banner-error" role="alert">
                            <i class="fa-solid fa-triangle-exclamation"></i><span>{{ DetailError }}</span>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="LoadSelected()">Retry</button>
                        </div>
                    } @else if (Selected) {
                        <div class="tabs" role="tablist" aria-label="Election sections" (keydown)="OnTabKey($event)">
                            @for (t of Tabs; track t.Descriptor.key) {
                                <button
                                    type="button"
                                    role="tab"
                                    class="tab-button"
                                    [id]="'tab-' + t.Descriptor.key"
                                    [class.active]="ActiveTab === t.Descriptor.key"
                                    [attr.aria-selected]="ActiveTab === t.Descriptor.key"
                                    [attr.aria-controls]="'panel-' + t.Descriptor.key"
                                    [attr.tabindex]="ActiveTab === t.Descriptor.key ? 0 : -1"
                                    (click)="SelectTab(t.Descriptor.key)"
                                >
                                    @if (t.Descriptor.icon) {
                                        <i [class]="t.Descriptor.icon"></i>
                                    }
                                    {{ t.Descriptor.label }}
                                </button>
                            }
                        </div>
                        @if (ActiveTabView) {
                            <div class="tab-panel" role="tabpanel" [id]="'panel-' + ActiveTabView.Descriptor.key" [attr.aria-labelledby]="'tab-' + ActiveTabView.Descriptor.key">
                                @if (ActiveTabView.Component) {
                                    <voting-contribution-host
                                        [ComponentType]="ActiveTabView.Component"
                                        [Inputs]="TabInputs"
                                        (Changed)="OnTabChanged()"
                                    ></voting-contribution-host>
                                } @else {
                                    <div class="banner banner-warn" role="alert">
                                        <i class="fa-solid fa-triangle-exclamation"></i>
                                        <span>The component for this tab ({{ ActiveTabView.Descriptor.componentClass }}) is not registered in this client.</span>
                                    </div>
                                }
                            </div>
                        }
                    }
                } @else {
                    <div class="toolbar">
                        <div class="field grow">
                            <label for="el-search" class="sr-only">Search elections</label>
                            <input id="el-search" class="input" type="search" placeholder="Search elections by name" [(ngModel)]="SearchText" />
                        </div>
                        <div class="field">
                            <label for="el-status" class="sr-only">Filter by status</label>
                            <select id="el-status" class="input" [(ngModel)]="StatusFilter">
                                <option value="">All statuses</option>
                                @for (s of Statuses; track s) {
                                    <option [value]="s">{{ s }}</option>
                                }
                            </select>
                        </div>
                        <div class="field">
                            <label for="el-type" class="sr-only">Filter by type</label>
                            <select id="el-type" class="input" [(ngModel)]="TypeFilter">
                                <option value="">All types</option>
                                @for (t of TypeOptions; track t.ID) {
                                    <option [value]="t.ID">{{ t.Name }}</option>
                                }
                            </select>
                        </div>
                        @if (HasFilters) {
                            <button type="button" mjButton variant="secondary" size="sm" (click)="ClearFilters()">Clear filters</button>
                        }
                    </div>

                    <p class="muted small" aria-live="polite">Showing {{ Filtered.length }} of {{ Elections.length }} {{ Elections.length === 1 ? 'election' : 'elections' }}</p>

                    @if (Filtered.length === 0) {
                        <div class="state-box empty">
                            <i class="fa-solid fa-inbox"></i>
                            <h3>{{ Elections.length === 0 ? 'No elections yet' : 'No elections match' }}</h3>
                            <p>{{ Elections.length === 0 ? 'Create your first election to get started.' : 'Try changing the search or filters.' }}</p>
                            @if (Elections.length === 0 && CanCreate) {
                                <button type="button" mjButton variant="primary" size="sm" (click)="OpenWizard()"><i class="fa-solid fa-plus"></i> New election</button>
                            }
                        </div>
                    } @else {
                        <div class="table-wrap">
                            <table class="grid">
                                <thead>
                                    <tr>
                                        <th scope="col">Name</th>
                                        <th scope="col">Type</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Secrecy</th>
                                        <th scope="col">Opens</th>
                                        <th scope="col">Closes</th>
                                        <th scope="col"><span class="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (e of Filtered; track e.ID) {
                                        <tr class="row">
                                            <th scope="row"><a href="#" class="name-link" (click)="Select(e.ID); $event.preventDefault()">{{ e.Name }}</a></th>
                                            <td>{{ TypeName(e.ElectionTypeID) }}</td>
                                            <td><voting-status-chip [Status]="e.Status"></voting-status-chip></td>
                                            <td>{{ e.SecrecyMode }}</td>
                                            <td>{{ e.OpensAt ? (e.OpensAt | date: 'medium') : 'Not scheduled' }}</td>
                                            <td>{{ e.ClosesAt ? (e.ClosesAt | date: 'medium') : 'Not scheduled' }}</td>
                                            <td>
                                                <button type="button" mjButton variant="secondary" size="sm" (click)="Select(e.ID)" [attr.aria-label]="'Manage ' + e.Name">Manage</button>
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                }
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            :host { display: block; width: 100%; height: 100%; }
            .toolbar { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.5rem; }
            .toolbar .field { margin-bottom: 0; }
            .toolbar .grow { flex: 1; min-width: 14rem; }
            .name-link { color: var(--mj-text-link); font-weight: 600; text-decoration: none; }
            .name-link:hover { text-decoration: underline; }
            .detail-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding-bottom: 0.75rem; margin-bottom: 0.75rem; border-bottom: 1px solid var(--mj-border-default); }
            .detail-header h2 { flex: 1; margin: 0; font-size: 1.4rem; color: var(--mj-text-primary); min-width: 10rem; }
            .tabs { display: flex; flex-wrap: wrap; gap: 0.25rem; border-bottom: 1px solid var(--mj-border-default); margin-bottom: 1rem; }
            .tab-button { display: inline-flex; gap: 0.4rem; align-items: center; padding: 0.6rem 1rem; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--mj-text-secondary); font: inherit; font-weight: 600; cursor: pointer; }
            .tab-button:hover { color: var(--mj-text-primary); background: var(--mj-bg-surface-hover); }
            .tab-button.active { color: var(--mj-brand-primary); border-bottom-color: var(--mj-brand-primary); }
            .state-box h3 { margin: 0; color: var(--mj-text-primary); }
        `,
    ],
})
export class VotingElectionsResource extends BaseResourceComponent implements OnInit {
    private readonly navService = inject(NavigationService, { optional: true });

    public readonly Statuses = STATUSES;

    public IsLoading = true;
    public LoadError: string | null = null;
    public Elections: ElectionListItem[] = [];
    public TypeOptions: Array<{ ID: string; Name: string }> = [];
    public SearchText = '';
    public StatusFilter = '';
    public TypeFilter = '';

    public WizardOpen = false;

    public SelectedId: string | null = null;
    public Selected: ElectionListItem | null = null;
    public IsLoadingDetail = false;
    public DetailError: string | null = null;
    public Tabs: TabView[] = [];
    public ActiveTab = 'overview';

    public IsAdministrator = false;

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.IsAdministrator = this.ComputeIsAdministrator();
        await this.LoadElections();
        await this.ApplyParams(this.GetQueryParams());
        this.NotifyLoadComplete();
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        void this.ApplyParams(params);
    }

    // -- derived state -------------------------------------------------------------------------------------------

    public get CanCreate(): boolean {
        return this.IsAdministrator;
    }

    public get HasFilters(): boolean {
        return !!(this.SearchText || this.StatusFilter || this.TypeFilter);
    }

    public get Filtered(): ElectionListItem[] {
        const q = this.SearchText.trim().toLowerCase();
        return this.Elections.filter(
            (e) =>
                (!q || e.Name.toLowerCase().includes(q)) &&
                (!this.StatusFilter || e.Status === this.StatusFilter) &&
                (!this.TypeFilter || UUIDsEqual(e.ElectionTypeID, this.TypeFilter))
        );
    }

    public get ActiveTabView(): TabView | undefined {
        return this.Tabs.find((t) => t.Descriptor.key === this.ActiveTab);
    }

    public get TabInputs(): Record<string, unknown> {
        const type = this.Selected ? VotingEngineBase.Instance.GetElectionTypeByID(this.Selected.ElectionTypeID) : undefined;
        return {
            ElectionID: this.Selected?.ID ?? '',
            ElectionTypeCode: type?.Code ?? '',
            ElectionStatus: this.Selected?.Status ?? '',
            IsAdministrator: this.IsAdministrator,
            Provider: this.ProviderToUse,
        };
    }

    public TypeName(typeId: string): string {
        return VotingEngineBase.Instance.GetElectionTypeByID(typeId)?.Name ?? 'Unknown type';
    }

    public ClearFilters(): void {
        this.SearchText = '';
        this.StatusFilter = '';
        this.TypeFilter = '';
    }

    // -- loading -------------------------------------------------------------------------------------------------

    public async Reload(): Promise<void> {
        await this.LoadElections();
        if (this.SelectedId) {
            await this.LoadSelected();
        }
    }

    private async LoadElections(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const engine = VotingEngineBase.Instance;
            await engine.Config(false, undefined, this.ProviderToUse);
            this.TypeOptions = engine.ElectionTypes.map((t) => ({ ID: t.ID, Name: t.Name }));
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<ElectionListItem>({
                EntityName: ELECTION_ENTITY,
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'ElectionTypeID', 'Status', 'SecrecyMode', 'RecordDate', 'OpensAt', 'ClosesAt'],
                OrderBy: '__mj_CreatedAt DESC',
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'Elections could not be loaded.');
            }
            this.Elections = res.Results;
        } catch (error) {
            LogError('[VotingElections] Failed to load elections', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Elections could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    public async LoadSelected(): Promise<void> {
        const id = this.SelectedId;
        if (!id) {
            return;
        }
        this.IsLoadingDetail = true;
        this.DetailError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<ElectionListItem>({
                EntityName: ELECTION_ENTITY,
                ExtraFilter: `ID='${id}'`,
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'ElectionTypeID', 'Status', 'SecrecyMode', 'RecordDate', 'OpensAt', 'ClosesAt'],
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'The election could not be loaded.');
            }
            const election = res.Results[0];
            if (!election) {
                throw new Error('The election was not found, or you do not have access to it.');
            }
            if (this.SelectedId !== id) {
                return; // selection changed while loading
            }
            this.Selected = election;
            this.Tabs = this.BuildTabs(election);
            if (!this.Tabs.some((t) => t.Descriptor.key === this.ActiveTab)) {
                this.ActiveTab = this.Tabs[0]?.Descriptor.key ?? 'overview';
            }
        } catch (error) {
            LogError('[VotingElections] Failed to load election', undefined, error);
            this.DetailError = error instanceof Error ? error.message : 'The election could not be loaded.';
        } finally {
            this.IsLoadingDetail = false;
        }
    }

    private BuildTabs(election: ElectionListItem): TabView[] {
        const type = VotingEngineBase.Instance.GetElectionTypeByID(election.ElectionTypeID);
        const ctx: ElectionUIContext = {
            ElectionID: election.ID,
            ElectionTypeID: election.ElectionTypeID,
            ElectionTypeCode: type?.Code ?? '',
            Status: election.Status,
            SecrecyMode: election.SecrecyMode,
            IsAdministrator: this.IsAdministrator,
            ViewingUser: this.ProviderToUse.CurrentUser,
        };
        return AssembleAdminTabs(ctx, type?.UIDriverClass ?? null).map((d) => ({ Descriptor: d, Component: ResolveTabComponent(d) }));
    }

    // -- navigation + query params --------------------------------------------------------------------------------

    private async ApplyParams(params: Record<string, string>): Promise<void> {
        const wizard = params['wizard'] === '1';
        const id = params['electionId'] || null;
        const tab = params['tab'] || null;
        this.WizardOpen = wizard && this.CanCreate;
        if (!this.WizardOpen && id !== this.SelectedId) {
            this.SelectedId = id;
            this.Selected = null;
            this.Tabs = [];
            if (id) {
                if (tab) {
                    this.ActiveTab = tab;
                }
                await this.LoadSelected();
            }
        } else if (!this.WizardOpen && id && tab && tab !== this.ActiveTab) {
            this.ActiveTab = tab;
        }
    }

    public Select(id: string): void {
        this.ActiveTab = 'overview';
        this.UpdateQueryParams({ electionId: id, tab: null, wizard: null });
        void this.ApplyParams({ electionId: id });
    }

    public ClearSelection(): void {
        this.UpdateQueryParams({ electionId: null, tab: null, wizard: null });
        void this.ApplyParams({});
    }

    public SelectTab(key: string): void {
        this.ActiveTab = key;
        this.UpdateQueryParams({ tab: key });
    }

    public OnTabKey(event: KeyboardEvent): void {
        const keys = this.Tabs.map((t) => t.Descriptor.key);
        const i = keys.indexOf(this.ActiveTab);
        let next = -1;
        if (event.key === 'ArrowRight') next = (i + 1) % keys.length;
        else if (event.key === 'ArrowLeft') next = (i - 1 + keys.length) % keys.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = keys.length - 1;
        if (next >= 0) {
            event.preventDefault();
            this.SelectTab(keys[next]);
            setTimeout(() => document.getElementById(`tab-${keys[next]}`)?.focus());
        }
    }

    public OpenWizard(): void {
        this.UpdateQueryParams({ wizard: '1', electionId: null, tab: null });
        void this.ApplyParams({ wizard: '1' });
    }

    public CloseWizard(): void {
        this.UpdateQueryParams({ wizard: null });
        void this.ApplyParams({});
    }

    public async OnCreated(electionId: string): Promise<void> {
        await this.LoadElections();
        this.UpdateQueryParams({ wizard: null, electionId, tab: null });
        this.ActiveTab = 'overview';
        await this.ApplyParams({ electionId });
    }

    public async OnTabChanged(): Promise<void> {
        await this.LoadElections();
        await this.LoadSelected();
    }

    public OpenRecord(): void {
        if (this.Selected && this.navService) {
            this.navService.OpenEntityRecord(ELECTION_ENTITY, CompositeKey.FromID(this.Selected.ID));
        }
    }

    private ComputeIsAdministrator(): boolean {
        try {
            const user = this.ProviderToUse.CurrentUser;
            return HasVotingPrivilege((user?.UserRoles ?? []).map((r) => r.Role)) || user?.Type === 'Owner';
        } catch {
            return false;
        }
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Elections';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-check-to-slot';
    }
}

export function LoadVotingElectionsResource(): void {
    void VotingElectionsResource;
}
