/**
 * VotingSettingsResource — ballot distribution management per election: list/create/edit/retire
 * BallotDistribution records, embed snippets built from the API origin, and credential issuance.
 *
 * Deep-links with ?electionId=... (restored through OnQueryParamsChanged).
 */
import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
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
import { DescribeDistributionCreateRefusal, type mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { ResolveApiOrigin } from '../shared/api-origin';
import { StatusChipComponent } from '../shared/status-chip.component';
import { DistributionEditorComponent, type SignInMethodOption } from './distribution-editor.component';
import { EmbedSnippetsComponent } from './embed-snippets.component';
import { CredentialIssuerComponent } from './credential-issuer.component';
import { ParseJsonStringArray } from './distribution-validation';
import { HasVotingAdministratorRole } from '../results/op-result';

type ElectionStatus = 'Draft' | 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Tallied' | 'Certified' | 'Cancelled';

interface ElectionPick {
    ID: string;
    Name: string;
    Status: ElectionStatus;
}

const DISTRIBUTION_ENTITY = 'MJ_BizApps_Voting: Ballot Distributions';
const ELECTION_ENTITY = 'MJ_BizApps_Voting: Elections';

@RegisterClass(BaseResourceComponent, 'VotingSettingsResource')
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
        DistributionEditorComponent,
        EmbedSnippetsComponent,
        CredentialIssuerComponent,
    ],
    selector: 'voting-settings-resource',
    template: `
        <mj-page-layout>
            <mj-page-header Title="Settings" Icon="fa-solid fa-sliders" Subtitle="Ballot distributions, embedding and voter credentials">
                @if (IsAdministrator) {
                    <div actions>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Reload()" [disabled]="IsLoading">
                            <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoading"></i> Refresh
                        </button>
                        <button type="button" mjButton variant="primary" size="sm" (click)="StartCreate()" [disabled]="!SelectedElection || EditorOpen || !!CreateRefusal" [attr.title]="CreateRefusal">
                            <i class="fa-solid fa-plus"></i> New distribution
                        </button>
                    </div>
                }
            </mj-page-header>

            <mj-page-body [Padding]="true">
                @if (!IsAdministrator) {
                    <div class="state-box empty" role="status">
                        <i class="fa-solid fa-lock"></i>
                        <p>Ballot distributions, embedding and voter credentials are managed by voting administrators.</p>
                    </div>
                } @else if (IsLoading && Elections.length === 0) {
                    <div class="state-box"><mj-loading text="Loading settings..." size="large"></mj-loading></div>
                } @else if (LoadError) {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>{{ LoadError }}</span>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Reload()">Retry</button>
                    </div>
                } @else if (Elections.length === 0) {
                    <div class="state-box empty">
                        <i class="fa-solid fa-sliders"></i>
                        <p>There are no elections yet. Create an election before configuring its ballot distribution.</p>
                    </div>
                } @else {
                    <div class="picker">
                        <label for="settings-election">Election</label>
                        <select id="settings-election" [ngModel]="SelectedElectionID" (ngModelChange)="OnElectionChosen($event)">
                            <option [ngValue]="null">Choose an election...</option>
                            @for (e of Elections; track e.ID) {
                                <option [ngValue]="e.ID">{{ e.Name }} ({{ e.Status }})</option>
                            }
                        </select>
                        @if (SelectedElection) {
                            <voting-status-chip [Status]="SelectedElection.Status"></voting-status-chip>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="OpenElectionDashboard()">
                                <i class="fa-solid fa-up-right-from-square"></i> Open in Elections
                            </button>
                        }
                    </div>

                    @if (!SelectedElection) {
                        <div class="state-box empty">
                            <i class="fa-solid fa-hand-pointer"></i>
                            <p>Select an election to manage its ballot distributions.</p>
                        </div>
                    } @else {
                        @if (CreateRefusal) {
                            <div class="banner banner-info" role="status">
                                <i class="fa-solid fa-circle-info"></i>
                                <span>{{ CreateRefusal }} Existing distributions can still be paused or retired.</span>
                            </div>
                        }
                        @if (ActionError) {
                            <div class="banner banner-error" role="alert">
                                <i class="fa-solid fa-circle-exclamation"></i>
                                <span>{{ ActionError }}</span>
                                <button type="button" mjButton variant="secondary" size="sm" (click)="ActionError = null">Dismiss</button>
                            </div>
                        }

                        @if (EditorOpen && EditingEntity) {
                            <voting-distribution-editor
                                [Distribution]="EditingEntity"
                                [IsNew]="EditingIsNew"
                                [MethodOptions]="MethodOptions"
                                [Provider]="ProviderToUse"
                                (Saved)="OnSaved($event)"
                                (Cancelled)="CloseEditor()"
                            ></voting-distribution-editor>
                        }

                        <section class="list" aria-labelledby="dist-list-heading">
                            <h3 id="dist-list-heading">Ballot distributions</h3>
                            @if (IsLoadingDistributions) {
                                <div class="state-box"><mj-loading text="Loading distributions..." size="large"></mj-loading></div>
                            } @else if (Distributions.length === 0) {
                                <div class="state-box empty">
                                    <i class="fa-solid fa-link"></i>
                                    <p>This election has no ballot distribution yet. Create one to publish a public ballot link.</p>
                                </div>
                            } @else {
                                <div class="table-wrap">
                                    <table class="grid">
                                        <thead>
                                            <tr>
                                                <th scope="col">Name</th>
                                                <th scope="col">Slug</th>
                                                <th scope="col">Status</th>
                                                <th scope="col">Origins</th>
                                                <th scope="col">Sign-in methods</th>
                                                <th scope="col"><span class="sr-only">Actions</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (d of Distributions; track d.ID) {
                                                <tr [class.selected]="SnippetFor && UUIDsEqual(SnippetFor.ID, d.ID)">
                                                    <th scope="row">{{ d.Name }}</th>
                                                    <td><code>{{ d.Slug }}</code></td>
                                                    <td><span class="chip" [ngClass]="StatusClass(d.Status)">{{ d.Status }}</span></td>
                                                    <td>{{ OriginCount(d) }}</td>
                                                    <td>
                                                        @for (m of MethodCodes(d); track m) {
                                                            <span class="chip chip-neutral">{{ m }}</span>
                                                        } @empty {
                                                            <span class="muted">Election default</span>
                                                        }
                                                    </td>
                                                    <td class="row-actions">
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="ShowEmbed(d)">
                                                            <i class="fa-solid fa-code"></i> Embed
                                                        </button>
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="StartEdit(d)" [disabled]="EditorOpen">
                                                            <i class="fa-solid fa-pen"></i> Edit
                                                        </button>
                                                        @if (d.Status !== 'Retired') {
                                                            @if (RetiringID === d.ID) {
                                                                <button type="button" mjButton variant="primary" size="sm" (click)="Retire(d)" [disabled]="IsRetiring">
                                                                    <i class="fa-solid fa-check"></i> Confirm retire
                                                                </button>
                                                                <button type="button" mjButton variant="secondary" size="sm" (click)="RetiringID = null" [disabled]="IsRetiring">Cancel</button>
                                                            } @else {
                                                                <button type="button" mjButton variant="secondary" size="sm" (click)="RetiringID = d.ID" [disabled]="EditorOpen">
                                                                    <i class="fa-solid fa-box-archive"></i> Retire
                                                                </button>
                                                            }
                                                        }
                                                    </td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        </section>

                        <div class="lower">
                            @if (SnippetFor) {
                                <voting-embed-snippets [Slug]="SnippetFor.Slug" [ApiOrigin]="ApiOrigin"></voting-embed-snippets>
                            }
                            <voting-credential-issuer
                                [ElectionID]="SelectedElection.ID"
                                [Methods]="IssuableMethods"
                                [DefaultBaseUrl]="IssuerBaseUrl"
                                (OpenElection)="OpenElectionDashboard()"
                            ></voting-credential-issuer>
                        </div>
                    }
                }
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [
        `
            :host { display: block; width: 100%; height: 100%; }
            .state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 2.5rem 1rem; color: var(--mj-text-muted); text-align: center; }
            .state-box.empty i { font-size: 2rem; color: var(--mj-text-disabled); }
            .picker { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
            .picker label { font-weight: 600; color: var(--mj-text-secondary); }
            .picker select { min-width: 18rem; padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; }
            .picker select:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 8px; margin: 0 0 1rem; border: 1px solid transparent; }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); border-color: var(--mj-status-info-border); }
            .list { margin: 1rem 0; }
            .list h3 { margin: 0 0 0.5rem; color: var(--mj-text-primary); font-size: 1.05rem; }
            .table-wrap { overflow-x: auto; background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; }
            .grid { width: 100%; border-collapse: collapse; }
            .grid th, .grid td { padding: 0.6rem 0.75rem; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); }
            .grid thead th { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
            .grid tr.selected td, .grid tr.selected th { background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface)); }
            .row-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
            code { background: var(--mj-bg-surface-sunken); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.85em; }
            .chip { display: inline-block; padding: 0.1rem 0.55rem; margin-right: 0.25rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
            .chip-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .chip-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .chip-muted { background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); }
            .chip-neutral { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); border: 1px solid var(--mj-border-default); }
            .muted { color: var(--mj-text-muted); }
            .lower { display: grid; grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr)); gap: 1rem; align-items: start; }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        `,
    ],
})
export class VotingSettingsResourceComponent extends BaseResourceComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly navService = inject(NavigationService, { optional: true });

    public readonly UUIDsEqual = UUIDsEqual;

    public Elections: ElectionPick[] = [];
    public SelectedElectionID: string | null = null;
    public IsLoading = true;
    public LoadError: string | null = null;

    public Distributions: mjBizAppsVotingBallotDistributionEntity[] = [];
    public IsLoadingDistributions = false;
    public ActionError: string | null = null;

    public EditorOpen = false;
    public EditingEntity: mjBizAppsVotingBallotDistributionEntity | null = null;
    public EditingIsNew = false;

    public SnippetFor: mjBizAppsVotingBallotDistributionEntity | null = null;
    public RetiringID: string | null = null;
    public IsRetiring = false;

    public MethodOptions: SignInMethodOption[] = [];
    public IssuableMethods: SignInMethodOption[] = [];

    private loadToken = 0;

    /** Only voting administrators manage distributions and credentials (the server enforces the real check). */
    public IsAdministrator = false;

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.IsAdministrator = this.ComputeIsAdministrator();
        if (!this.IsAdministrator) {
            this.IsLoading = false;
            this.NotifyLoadComplete();
            return;
        }
        await this.LoadAll();
        const initial = this.GetQueryParams()['electionId'];
        if (initial) {
            await this.SelectElection(initial, false);
        }
        this.NotifyLoadComplete();
        this.cdr.detectChanges();
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const id = params['electionId'] || null;
        if (this.IsAdministrator && id !== this.SelectedElectionID) {
            void this.SelectElection(id, false);
        }
    }

    private ComputeIsAdministrator(): boolean {
        try {
            const user = this.ProviderToUse.CurrentUser;
            return HasVotingAdministratorRole((user?.UserRoles ?? []).map((r) => r.Role)) || user?.Type === 'Owner';
        } catch {
            return false;
        }
    }

    public get SelectedElection(): ElectionPick | null {
        return this.Elections.find((e) => UUIDsEqual(e.ID, this.SelectedElectionID)) ?? null;
    }

    /** Why no new distribution can be created for the selected election (the same rule the server enforces), or null. */
    public get CreateRefusal(): string | null {
        const election = this.SelectedElection;
        return election ? DescribeDistributionCreateRefusal(election.Status) : null;
    }

    /** Origin of the MJ API serving the ballot edge (/vote), derived from the GraphQL endpoint. */
    public get ApiOrigin(): string {
        return ResolveApiOrigin(this.ProviderToUse);
    }

    public get IssuerBaseUrl(): string {
        const dist = this.SnippetFor ?? this.Distributions.find((d) => d.Status === 'Active') ?? this.Distributions[0];
        return dist ? `${this.ApiOrigin}/vote/${encodeURIComponent(dist.Slug)}` : `${this.ApiOrigin}/vote`;
    }

    public async Reload(): Promise<void> {
        await this.LoadAll();
        if (this.SelectedElectionID) {
            await this.LoadDistributions();
        }
        this.cdr.detectChanges();
    }

    public async OnElectionChosen(id: string | null): Promise<void> {
        await this.SelectElection(id, true);
        this.cdr.detectChanges();
    }

    public StatusClass(status: string): string {
        switch (status) {
            case 'Active':
                return 'chip-ok';
            case 'Paused':
            case 'Draft':
                return 'chip-warn';
            default:
                return 'chip-muted';
        }
    }

    public OriginCount(d: mjBizAppsVotingBallotDistributionEntity): string {
        const n = ParseJsonStringArray(d.AllowedOrigins).length;
        return n === 0 ? 'Same-origin only' : `${n} ${n === 1 ? 'origin' : 'origins'}`;
    }

    public MethodCodes(d: mjBizAppsVotingBallotDistributionEntity): string[] {
        return ParseJsonStringArray(d.AllowedCredentialMethods);
    }

    public ShowEmbed(d: mjBizAppsVotingBallotDistributionEntity): void {
        this.SnippetFor = d;
    }

    public async StartCreate(): Promise<void> {
        const election = this.SelectedElection;
        if (!election) {
            return;
        }
        this.ActionError = null;
        try {
            const entity = await this.ProviderToUse.GetEntityObject<mjBizAppsVotingBallotDistributionEntity>(DISTRIBUTION_ENTITY);
            entity.NewRecord();
            entity.ElectionID = election.ID;
            entity.Status = 'Draft';
            entity.DefaultLanguage = 'en';
            this.EditingEntity = entity;
            this.EditingIsNew = true;
            this.EditorOpen = true;
        } catch (error) {
            LogError('[VotingSettings] Failed to start a new distribution', undefined, error);
            this.ActionError = error instanceof Error ? error.message : 'A new distribution could not be started.';
        }
        this.cdr.detectChanges();
    }

    public StartEdit(d: mjBizAppsVotingBallotDistributionEntity): void {
        this.ActionError = null;
        this.EditingEntity = d;
        this.EditingIsNew = false;
        this.EditorOpen = true;
    }

    public CloseEditor(): void {
        const entity = this.EditingEntity;
        // Editing an existing row mutated its in-memory fields; reload to discard unsaved changes.
        const wasEdit = !this.EditingIsNew && entity !== null;
        this.EditorOpen = false;
        this.EditingEntity = null;
        if (wasEdit) {
            void this.LoadDistributions();
        }
    }

    public async OnSaved(saved: mjBizAppsVotingBallotDistributionEntity): Promise<void> {
        this.EditorOpen = false;
        this.EditingEntity = null;
        await this.LoadDistributions();
        this.SnippetFor = this.Distributions.find((d) => UUIDsEqual(d.ID, saved.ID)) ?? this.SnippetFor;
        this.cdr.detectChanges();
    }

    public async Retire(d: mjBizAppsVotingBallotDistributionEntity): Promise<void> {
        this.IsRetiring = true;
        this.ActionError = null;
        try {
            d.Status = 'Retired';
            const ok = await d.Save();
            if (!ok) {
                this.ActionError = d.LatestResult?.CompleteMessage || d.LatestResult?.Message || 'The distribution could not be retired.';
                await this.LoadDistributions();
                return;
            }
            this.RetiringID = null;
            await this.LoadDistributions();
        } catch (error) {
            LogError('[VotingSettings] Failed to retire distribution', undefined, error);
            this.ActionError = error instanceof Error ? error.message : 'The distribution could not be retired.';
        } finally {
            this.IsRetiring = false;
            this.cdr.detectChanges();
        }
    }

    public OpenElectionDashboard(): void {
        const id = this.SelectedElectionID;
        if (!this.navService || !id) {
            return;
        }
        void this.navService.OpenNavItemByName('Elections', { queryParams: { electionId: id } }).then((tabId) => {
            if (tabId === null) {
                this.navService?.OpenEntityRecord(ELECTION_ENTITY, CompositeKey.FromID(id));
            }
        });
    }

    private async LoadAll(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const engine = VotingEngineBase.Instance;
            await engine.Config(false, undefined, this.ProviderToUse);
            this.MethodOptions = engine.ActiveVoterCredentialMethods.map((m) => ({ Code: m.Code, Name: m.Name }));
            this.IssuableMethods = engine.ActiveVoterCredentialMethods.filter((m) => m.RequiresIssuance).map((m) => ({ Code: m.Code, Name: m.Name }));

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<ElectionPick>({
                EntityName: ELECTION_ENTITY,
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'Status'],
                OrderBy: '__mj_CreatedAt DESC',
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'Elections could not be loaded.');
            }
            this.Elections = res.Results;
        } catch (error) {
            LogError('[VotingSettings] Failed to load', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Settings could not be loaded.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async SelectElection(id: string | null, pushToUrl: boolean): Promise<void> {
        this.SelectedElectionID = id;
        this.Distributions = [];
        this.SnippetFor = null;
        this.EditorOpen = false;
        this.EditingEntity = null;
        this.RetiringID = null;
        this.ActionError = null;
        if (pushToUrl) {
            this.UpdateQueryParams({ electionId: id });
        }
        if (id) {
            await this.LoadDistributions();
        }
        this.cdr.detectChanges();
    }

    private async LoadDistributions(): Promise<void> {
        const id = this.SelectedElectionID;
        if (!id) {
            return;
        }
        const token = ++this.loadToken;
        this.IsLoadingDistributions = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<mjBizAppsVotingBallotDistributionEntity>({
                EntityName: DISTRIBUTION_ENTITY,
                ExtraFilter: `ElectionID='${id}'`,
                OrderBy: 'Name',
                ResultType: 'entity_object',
            });
            if (token !== this.loadToken) {
                return;
            }
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'Ballot distributions could not be loaded.');
            }
            this.Distributions = res.Results;
            if (this.SnippetFor) {
                const keep = this.SnippetFor;
                this.SnippetFor = this.Distributions.find((d) => UUIDsEqual(d.ID, keep.ID)) ?? null;
            }
            if (!this.SnippetFor && this.Distributions.length > 0) {
                this.SnippetFor = this.Distributions.find((d) => d.Status === 'Active') ?? this.Distributions[0];
            }
        } catch (error) {
            LogError('[VotingSettings] Failed to load distributions', undefined, error);
            if (token === this.loadToken) {
                this.ActionError = error instanceof Error ? error.message : 'Ballot distributions could not be loaded.';
            }
        } finally {
            if (token === this.loadToken) {
                this.IsLoadingDistributions = false;
            }
            this.cdr.detectChanges();
        }
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Settings';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-sliders';
    }
}

export function LoadVotingSettingsResource(): void {
    void VotingSettingsResourceComponent;
}
