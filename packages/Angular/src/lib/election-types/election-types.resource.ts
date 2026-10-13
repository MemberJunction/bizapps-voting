/**
 * VotingElectionTypesResource — read-only catalog of everything an election is built from:
 * election types (with their resolved default configuration), tally methods, eligibility
 * sources and sign-in (voter credential) methods. All data comes from VotingEngineBase's
 * cached lookups; a row opens in the standard entity form through NavigationService.
 */
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, LogError } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
    MJPageLayoutComponent,
    MJPageHeaderComponent,
    MJPageBodyComponent,
    MJButtonDirective,
} from '@memberjunction/ng-ui-components';
import {
    IElectionTypeConfiguration,
    mjBizAppsVotingElectionTypeEntity,
    mjBizAppsVotingEligibilitySourceTypeEntity,
    mjBizAppsVotingTallyMethodEntity,
    mjBizAppsVotingVoterCredentialMethodEntity,
} from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { ElectionTypeUIDriverRegistry } from '@mj-biz-apps/voting-ng-widgets';

type CatalogSection = 'types' | 'tally' | 'eligibility' | 'signin';

/** One rendered line of an election type's configuration defaults. */
interface ConfigRow {
    Key: string;
    Label: string;
    Text: string;
    Items: string[];
    Overridable: boolean;
}

interface ElectionTypeRow {
    Entity: mjBizAppsVotingElectionTypeEntity;
    UIDriverResolved: boolean;
    ConfigRows: ConfigRow[];
    OverridableKeys: string[];
    ConfigError: string | null;
    Expanded: boolean;
}

interface LookupRow {
    ID: string;
    Code: string;
    Name: string;
    Description: string;
    Status: string;
    DriverClass: string;
    Flags: string[];
    ConfigText: string;
}

const ENTITY_NAMES: Record<CatalogSection, string> = {
    types: 'MJ_BizApps_Voting: Election Types',
    tally: 'MJ_BizApps_Voting: Tally Methods',
    eligibility: 'MJ_BizApps_Voting: Eligibility Source Types',
    signin: 'MJ_BizApps_Voting: Voter Credential Methods',
};

@RegisterClass(BaseResourceComponent, 'VotingElectionTypesResource')
@Component({
    standalone: true,
    imports: [
        CommonModule,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJButtonDirective,
        SharedGenericModule,
    ],
    selector: 'voting-election-types-resource',
    template: `
        <mj-page-layout>
            <mj-page-header
                Title="Election Types"
                Icon="fa-solid fa-layer-group"
                Subtitle="Election types, tally methods, eligibility sources and sign-in methods"
            >
                <div actions>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="Refresh()" [disabled]="IsLoading">
                        <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoading"></i> Refresh
                    </button>
                </div>
            </mj-page-header>

            <mj-page-body [Padding]="true">
                @if (IsLoading) {
                    <div class="state-box"><mj-loading text="Loading election catalog..." size="large"></mj-loading></div>
                } @else if (ErrorMessage) {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>{{ ErrorMessage }}</span>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Refresh()">Retry</button>
                    </div>
                } @else {
                    <div class="section-tabs" role="tablist" aria-label="Catalog sections">
                        @for (tab of Tabs; track tab.Key) {
                            <button
                                type="button"
                                role="tab"
                                class="section-tab"
                                [class.active]="Section === tab.Key"
                                [attr.aria-selected]="Section === tab.Key"
                                (click)="SelectSection(tab.Key)"
                            >
                                <i [class]="tab.Icon"></i> {{ tab.Label }}
                                <span class="count">{{ CountFor(tab.Key) }}</span>
                            </button>
                        }
                    </div>

                    @switch (Section) {
                        @case ('types') {
                            @if (TypeRows.length === 0) {
                                <div class="state-box empty">
                                    <i class="fa-solid fa-layer-group"></i>
                                    <p>No election types have been defined.</p>
                                </div>
                            } @else {
                                <div class="card-list">
                                    @for (row of TypeRows; track row.Entity.ID) {
                                        <section class="card" [class.disabled]="row.Entity.Status !== 'Active'">
                                            <header class="card-head">
                                                <div class="card-title">
                                                    <i [class]="row.Entity.IconClass || 'fa-solid fa-ballot-check'"></i>
                                                    <h3>{{ row.Entity.Name }}</h3>
                                                    <code>{{ row.Entity.Code }}</code>
                                                    <span class="chip" [class.chip-ok]="row.Entity.Status === 'Active'" [class.chip-muted]="row.Entity.Status !== 'Active'">
                                                        {{ row.Entity.Status }}
                                                    </span>
                                                </div>
                                                <div class="card-actions">
                                                    <button type="button" mjButton variant="secondary" size="sm" (click)="OpenRecord('types', row.Entity.ID)">
                                                        <i class="fa-solid fa-up-right-from-square"></i> Open record
                                                    </button>
                                                    <button
                                                        type="button"
                                                        mjButton
                                                        variant="secondary"
                                                        size="sm"
                                                        [attr.aria-expanded]="row.Expanded"
                                                        (click)="row.Expanded = !row.Expanded"
                                                    >
                                                        <i [class]="row.Expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i>
                                                        {{ row.Expanded ? 'Hide configuration' : 'Show configuration' }}
                                                    </button>
                                                </div>
                                            </header>

                                            @if (row.Entity.Description) {
                                                <p class="description">{{ row.Entity.Description }}</p>
                                            }

                                            <dl class="facts">
                                                <div>
                                                    <dt>Server driver</dt>
                                                    <dd>
                                                        @if (row.Entity.ServerDriverClass) {
                                                            <code>{{ row.Entity.ServerDriverClass }}</code>
                                                        } @else {
                                                            <span class="muted">Base driver</span>
                                                        }
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>UI driver</dt>
                                                    <dd>
                                                        @if (row.Entity.UIDriverClass) {
                                                            <code>{{ row.Entity.UIDriverClass }}</code>
                                                            @if (!row.UIDriverResolved) {
                                                                <span class="chip chip-warn" title="No UI driver is registered under this class name; the base driver is used instead.">
                                                                    <i class="fa-solid fa-triangle-exclamation"></i> Not registered
                                                                </span>
                                                            } @else {
                                                                <span class="chip chip-ok"><i class="fa-solid fa-check"></i> Registered</span>
                                                            }
                                                        } @else {
                                                            <span class="muted">Base driver</span>
                                                        }
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt>Extension entity</dt>
                                                    <dd>
                                                        @if (row.Entity.ElectionExtensionEntity) {
                                                            {{ row.Entity.ElectionExtensionEntity }}
                                                        } @else {
                                                            <span class="muted">None (plain election)</span>
                                                        }
                                                    </dd>
                                                </div>
                                            </dl>

                                            @if (!row.UIDriverResolved && row.Entity.UIDriverClass) {
                                                <div class="banner banner-warn" role="alert">
                                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                                    <span>
                                                        UI driver class <code>{{ row.Entity.UIDriverClass }}</code> is not registered in this
                                                        client bundle. Elections of this type render with the base UI driver until the
                                                        package that ships it is loaded.
                                                    </span>
                                                </div>
                                            }

                                            @if (row.Expanded) {
                                                <div class="config">
                                                    <h4>Configuration defaults</h4>
                                                    @if (row.ConfigError) {
                                                        <div class="banner banner-error" role="alert">
                                                            <i class="fa-solid fa-circle-exclamation"></i>
                                                            <span>{{ row.ConfigError }}</span>
                                                        </div>
                                                    } @else if (row.ConfigRows.length === 0) {
                                                        <p class="muted">This type defines no configuration; app defaults apply.</p>
                                                    } @else {
                                                        <table class="grid">
                                                            <thead>
                                                                <tr>
                                                                    <th scope="col">Setting</th>
                                                                    <th scope="col">Default</th>
                                                                    <th scope="col">Elections may override</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                @for (cfg of row.ConfigRows; track cfg.Key) {
                                                                    <tr>
                                                                        <th scope="row">{{ cfg.Label }}</th>
                                                                        <td>
                                                                            @if (cfg.Items.length > 0) {
                                                                                <span class="chip-row">
                                                                                    @for (item of cfg.Items; track item) {
                                                                                        <span class="chip chip-neutral">{{ item }}</span>
                                                                                    }
                                                                                </span>
                                                                            } @else {
                                                                                {{ cfg.Text }}
                                                                            }
                                                                        </td>
                                                                        <td>
                                                                            @if (cfg.Overridable) {
                                                                                <span class="chip chip-info">Yes</span>
                                                                            } @else {
                                                                                <span class="muted">Fixed by type</span>
                                                                            }
                                                                        </td>
                                                                    </tr>
                                                                }
                                                            </tbody>
                                                        </table>
                                                    }
                                                    @if (row.OverridableKeys.length > 0) {
                                                        <p class="overridable">
                                                            <strong>Overridable keys:</strong>
                                                            <span class="chip-row">
                                                                @for (key of row.OverridableKeys; track key) {
                                                                    <span class="chip chip-info">{{ key }}</span>
                                                                }
                                                            </span>
                                                        </p>
                                                    }
                                                </div>
                                            }
                                        </section>
                                    }
                                </div>
                            }
                        }
                        @default {
                            @if (CurrentLookups.length === 0) {
                                <div class="state-box empty">
                                    <i [class]="ActiveTab.Icon"></i>
                                    <p>No {{ ActiveTab.Label.toLowerCase() }} are registered.</p>
                                </div>
                            } @else {
                                <div class="table-wrap">
                                    <table class="grid">
                                        <thead>
                                            <tr>
                                                <th scope="col">Code</th>
                                                <th scope="col">Name</th>
                                                <th scope="col">Status</th>
                                                <th scope="col">Driver class</th>
                                                <th scope="col">Traits</th>
                                                <th scope="col">Configuration</th>
                                                <th scope="col"><span class="sr-only">Actions</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            @for (row of CurrentLookups; track row.ID) {
                                                <tr>
                                                    <td><code>{{ row.Code }}</code></td>
                                                    <td>
                                                        <strong>{{ row.Name }}</strong>
                                                        @if (row.Description) {
                                                            <div class="muted small">{{ row.Description }}</div>
                                                        }
                                                    </td>
                                                    <td>
                                                        <span class="chip" [class.chip-ok]="row.Status === 'Active'" [class.chip-muted]="row.Status !== 'Active'">{{ row.Status }}</span>
                                                    </td>
                                                    <td><code>{{ row.DriverClass }}</code></td>
                                                    <td>
                                                        <span class="chip-row">
                                                            @for (flag of row.Flags; track flag) {
                                                                <span class="chip chip-neutral">{{ flag }}</span>
                                                            }
                                                        </span>
                                                    </td>
                                                    <td>
                                                        @if (row.ConfigText) {
                                                            <pre class="json">{{ row.ConfigText }}</pre>
                                                        } @else {
                                                            <span class="muted">None</span>
                                                        }
                                                    </td>
                                                    <td>
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="OpenRecord(Section, row.ID)">
                                                            <i class="fa-solid fa-up-right-from-square"></i> Open
                                                        </button>
                                                    </td>
                                                </tr>
                                            }
                                        </tbody>
                                    </table>
                                </div>
                            }
                        }
                    }
                }
            </mj-page-body>
        </mj-page-layout>
    `,
    styles: [
        `
            :host { display: block; width: 100%; height: 100%; }
            .state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 3rem 1rem; color: var(--mj-text-muted); }
            .state-box.empty i { font-size: 2rem; color: var(--mj-text-disabled); }
            .banner { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 8px; margin: 0.75rem 0; border: 1px solid var(--mj-border-default); }
            .banner span { flex: 1; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border-color: var(--mj-status-error-border); }
            .banner-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); border-color: var(--mj-status-warning-border); }
            .section-tabs { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; border-bottom: 1px solid var(--mj-border-default); }
            .section-tab { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; background: transparent; border: 0; border-bottom: 2px solid transparent; color: var(--mj-text-secondary); font: inherit; font-weight: 600; cursor: pointer; }
            .section-tab:hover { color: var(--mj-text-primary); background: var(--mj-bg-surface-hover); }
            .section-tab.active { color: var(--mj-brand-primary); border-bottom-color: var(--mj-brand-primary); }
            .section-tab:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; }
            .count { padding: 0 0.5rem; border-radius: 999px; background: var(--mj-bg-surface-sunken); color: var(--mj-text-secondary); font-size: 0.75rem; }
            .card-list { display: flex; flex-direction: column; gap: 1rem; }
            .card { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            .card.disabled { opacity: 0.75; }
            .card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
            .card-title { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
            .card-title i { color: var(--mj-brand-primary); }
            .card-title h3 { margin: 0; font-size: 1.05rem; color: var(--mj-text-primary); }
            .card-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
            .description { margin: 0.5rem 0 0; color: var(--mj-text-secondary); }
            .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.75rem 1.5rem; margin: 0.75rem 0 0; }
            .facts dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); }
            .facts dd { margin: 0.15rem 0 0; color: var(--mj-text-primary); display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
            .config { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--mj-border-subtle); }
            .config h4 { margin: 0 0 0.5rem; color: var(--mj-text-primary); }
            .overridable { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; color: var(--mj-text-secondary); }
            .table-wrap { overflow-x: auto; background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; }
            .grid { width: 100%; border-collapse: collapse; }
            .grid th, .grid td { padding: 0.6rem 0.75rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); }
            .grid thead th { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
            .grid tbody th { font-weight: 600; color: var(--mj-text-secondary); white-space: nowrap; }
            code { padding: 0.1rem 0.4rem; background: var(--mj-bg-surface-sunken); border-radius: 4px; font-size: 0.85em; color: var(--mj-text-primary); }
            pre.json { margin: 0; padding: 0.4rem 0.6rem; background: var(--mj-bg-surface-sunken); border-radius: 6px; font-size: 0.75rem; max-width: 26rem; max-height: 9rem; overflow: auto; color: var(--mj-text-secondary); }
            .chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
            .chip-row { display: inline-flex; flex-wrap: wrap; gap: 0.35rem; }
            .chip-ok { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .chip-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .chip-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); }
            .chip-muted { background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); }
            .chip-neutral { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); border: 1px solid var(--mj-border-default); }
            .muted { color: var(--mj-text-muted); }
            .small { font-size: 0.8rem; }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        `,
    ],
})
export class VotingElectionTypesResourceComponent extends BaseResourceComponent implements OnInit {
    private readonly navService = inject(NavigationService, { optional: true });

    public IsLoading = true;
    public ErrorMessage: string | null = null;
    public Section: CatalogSection = 'types';

    public readonly Tabs: ReadonlyArray<{ Key: CatalogSection; Label: string; Icon: string }> = [
        { Key: 'types', Label: 'Election types', Icon: 'fa-solid fa-layer-group' },
        { Key: 'tally', Label: 'Tally methods', Icon: 'fa-solid fa-calculator' },
        { Key: 'eligibility', Label: 'Eligibility sources', Icon: 'fa-solid fa-users-viewfinder' },
        { Key: 'signin', Label: 'Sign-in methods', Icon: 'fa-solid fa-right-to-bracket' },
    ];

    public TypeRows: ElectionTypeRow[] = [];
    public TallyRows: LookupRow[] = [];
    public EligibilityRows: LookupRow[] = [];
    public SignInRows: LookupRow[] = [];

    override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        await this.LoadCatalog();
        this.NotifyLoadComplete();
    }

    public get ActiveTab(): { Key: CatalogSection; Label: string; Icon: string } {
        return this.Tabs.find((t) => t.Key === this.Section) ?? this.Tabs[0];
    }

    public get CurrentLookups(): LookupRow[] {
        switch (this.Section) {
            case 'tally':
                return this.TallyRows;
            case 'eligibility':
                return this.EligibilityRows;
            case 'signin':
                return this.SignInRows;
            default:
                return [];
        }
    }

    public CountFor(section: CatalogSection): number {
        switch (section) {
            case 'types':
                return this.TypeRows.length;
            case 'tally':
                return this.TallyRows.length;
            case 'eligibility':
                return this.EligibilityRows.length;
            default:
                return this.SignInRows.length;
        }
    }

    public SelectSection(section: CatalogSection): void {
        this.Section = section;
    }

    public async Refresh(): Promise<void> {
        await this.LoadCatalog(true);
    }

    public OpenRecord(section: CatalogSection, id: string): void {
        if (!this.navService) {
            return;
        }
        this.navService.OpenEntityRecord(ENTITY_NAMES[section], CompositeKey.FromID(id));
    }

    private async LoadCatalog(forceRefresh = false): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = null;
        try {
            const engine = VotingEngineBase.Instance;
            await engine.Config(forceRefresh, undefined, this.ProviderToUse);

            const registry = ElectionTypeUIDriverRegistry.Instance;
            this.TypeRows = engine.ElectionTypes.map((t) => this.BuildTypeRow(t, engine, registry));
            this.TallyRows = engine.TallyMethods.map((m) => this.BuildTallyRow(m));
            this.EligibilityRows = engine.EligibilitySourceTypes.map((s) => this.BuildEligibilityRow(s));
            this.SignInRows = engine.VoterCredentialMethods.map((c) => this.BuildSignInRow(c));
        } catch (error) {
            LogError('[VotingElectionTypes] Failed to load catalog', undefined, error);
            this.ErrorMessage = error instanceof Error ? error.message : 'The election catalog could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    private BuildTypeRow(
        type: mjBizAppsVotingElectionTypeEntity,
        engine: VotingEngineBase,
        registry: ElectionTypeUIDriverRegistry
    ): ElectionTypeRow {
        const uiClass = (type.UIDriverClass ?? '').trim();
        // The registry falls back to the base driver for an unregistered class; a named class that
        // comes back as the default driver therefore means it did not resolve.
        const resolved = uiClass === '' ? true : registry.ResolveDriver(uiClass) !== registry.GetDefaultDriver();

        let config: IElectionTypeConfiguration | null = null;
        let configError: string | null = null;
        if (type.Configuration && type.Configuration.trim() !== '') {
            config = engine.GetElectionTypeConfiguration(type.ID);
            if (config === null) {
                configError = 'The Configuration column is not valid JSON and could not be read.';
            }
        }
        const overridable = config?.OverridableKeys ?? [];
        return {
            Entity: type,
            UIDriverResolved: resolved,
            ConfigRows: config ? this.BuildConfigRows(config, overridable) : [],
            OverridableKeys: overridable,
            ConfigError: configError,
            Expanded: false,
        };
    }

    private BuildConfigRows(config: IElectionTypeConfiguration, overridable: string[]): ConfigRow[] {
        const rows: ConfigRow[] = [];
        for (const [key, value] of Object.entries(config)) {
            if (key === 'OverridableKeys' || value === undefined || value === null) {
                continue;
            }
            const row: ConfigRow = {
                Key: key,
                Label: this.Humanize(key),
                Text: '',
                Items: [],
                Overridable: overridable.includes(key),
            };
            if (Array.isArray(value)) {
                row.Items = value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
                if (row.Items.length === 0) {
                    row.Text = 'None';
                }
            } else if (typeof value === 'boolean') {
                row.Text = value ? 'Yes' : 'No';
            } else if (typeof value === 'object') {
                row.Text = JSON.stringify(value);
            } else {
                row.Text = String(value);
            }
            rows.push(row);
        }
        return rows;
    }

    private BuildTallyRow(m: mjBizAppsVotingTallyMethodEntity): LookupRow {
        const flags: string[] = [m.IsRanked ? 'Ranked ballots' : 'Unranked ballots'];
        flags.push(m.SupportsMultipleSeats ? 'Multi-seat' : 'Single seat');
        return this.ToLookup(m.ID, m.Code, m.Name, m.Description, m.Status, m.DriverClass, flags, m.Configuration);
    }

    private BuildEligibilityRow(s: mjBizAppsVotingEligibilitySourceTypeEntity): LookupRow {
        return this.ToLookup(s.ID, s.Code, s.Name, s.Description, s.Status, s.DriverClass, [], s.Configuration);
    }

    private BuildSignInRow(c: mjBizAppsVotingVoterCredentialMethodEntity): LookupRow {
        const flags: string[] = [];
        if (c.IsSecondFactor) {
            flags.push('Second factor');
        }
        if (c.RequiresIssuance) {
            flags.push('Requires issuance');
        }
        return this.ToLookup(c.ID, c.Code, c.Name, c.Description, c.Status, c.DriverClass, flags, c.Configuration);
    }

    private ToLookup(
        id: string,
        code: string,
        name: string,
        description: string | null,
        status: string,
        driverClass: string,
        flags: string[],
        configuration: string | null
    ): LookupRow {
        return {
            ID: id,
            Code: code,
            Name: name,
            Description: description ?? '',
            Status: status,
            DriverClass: driverClass,
            Flags: flags,
            ConfigText: this.PrettyJson(configuration),
        };
    }

    private PrettyJson(text: string | null): string {
        if (!text || text.trim() === '') {
            return '';
        }
        try {
            return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
            return text;
        }
    }

    private Humanize(key: string): string {
        return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Election Types';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-layer-group';
    }
}

export function LoadVotingElectionTypesResource(): void {
    void VotingElectionTypesResourceComponent;
}
