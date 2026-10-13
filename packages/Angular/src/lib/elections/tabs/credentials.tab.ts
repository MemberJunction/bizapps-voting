/**
 * CredentialsTab — issues voter credentials (Voting.IssueCredentials) per sign-in method and shows
 * the issuance log. The log never carries secrets: it lists method, timing and state only (the
 * stored control-number and secret hashes are not even requested).
 */
import { Component, EventEmitter, OnChanges, OnDestroy, Output, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, RunView } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { ResolveApiOrigin } from '../../shared/api-origin';
import { VotingApiService } from '../../shared/voting-api.service';
import { ELECTION_COMMON_STYLES } from '../election-styles';
import { ControlNumbersCsv, PinsCsv, type IssuedSecretRow } from '../../shared/one-time-secrets';

interface MethodView {
    Code: string;
    Name: string;
    Description: string;
    IsSecondFactor: boolean;
}

interface CredentialRow {
    ID: string;
    EligibleVoterID: string;
    VoterCredentialMethod: string;
    IssuedAt: string;
    ExpiresAt: string | null;
    RedeemedAt: string | null;
    RevokedAt: string | null;
    FailedAttempts: number;
    LockedUntil: string | null;
}

interface LogRow extends CredentialRow {
    VoterName: string;
    State: 'Redeemed' | 'Revoked' | 'Locked' | 'Expired' | 'Active';
}

interface VoterName {
    ID: string;
    Person: string;
}

type SecretKind = 'control' | 'pin';

interface IssuedSecrets {
    Kind: SecretKind;
    Rows: IssuedSecretRow[];
    Skipped: number;
}

interface DistributionSlug {
    Slug: string;
    Status: string;
}

const PAGE_SIZE = 25;
const VOTER_ENTITY = 'MJ_BizApps_Voting: Eligible Voters';

@Component({
    selector: 'election-credentials-tab',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective],
    template: `
        <section class="panel" aria-labelledby="cred-issue">
            <h3 id="cred-issue"><i class="fa-solid fa-envelope-open-text"></i> Issue credentials</h3>
            <p class="hint">
                Issue sign-in credentials to all eligible, unchallenged voters using one method at a time. Voters who already hold an
                active credential for the method are skipped. Secrets are delivered to voters and are never shown here.
            </p>

            <div class="field">
                <label for="cred-base">Ballot link base URL (for emailed links)</label>
                <input id="cred-base" class="input mono" type="url" [(ngModel)]="BaseUrl" aria-describedby="cred-base-hint" />
                <p class="hint" id="cred-base-hint">
                    @if (SlugFound) {
                        Built from the election's ballot distribution.
                    } @else {
                        This election has no ballot distribution yet; create one under Settings so voters have a ballot page to open.
                    }
                </p>
            </div>

            <div aria-live="polite">
                @if (IssueError) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ IssueError }}</span></div>
                }
                @if (IssueMessage) {
                    <div class="banner banner-ok"><i class="fa-solid fa-circle-check"></i><span>{{ IssueMessage }}</span></div>
                }
            </div>

            @if (Methods.length === 0) {
                <p class="muted">No sign-in methods require issuance.</p>
            } @else if (!IsAdministrator) {
                <p class="muted small">Only voting administrators can issue credentials.</p>
            } @else {
                <ul class="method-list">
                    @for (m of Methods; track m.Code) {
                        <li>
                            <div>
                                <strong>{{ m.Name }}</strong> <code>{{ m.Code }}</code>
                                @if (m.IsSecondFactor) {
                                    <span class="chip">Second factor</span>
                                }
                                @if (m.Description) {
                                    <div class="muted small">{{ m.Description }}</div>
                                }
                            </div>
                            @if (ConfirmCode === m.Code) {
                                <div class="actions">
                                    <span class="confirm-text">Issue to all eligible voters?</span>
                                    <button type="button" mjButton variant="primary" size="sm" (click)="Issue(m)" [disabled]="IssuingCode !== null">
                                        <i class="fa-solid" [class.fa-check]="IssuingCode !== m.Code" [class.fa-spinner]="IssuingCode === m.Code" [class.fa-spin]="IssuingCode === m.Code"></i> Yes, issue
                                    </button>
                                    <button type="button" mjButton variant="secondary" size="sm" (click)="ConfirmCode = null" [disabled]="IssuingCode !== null">Cancel</button>
                                </div>
                            } @else {
                                <button type="button" mjButton variant="secondary" size="sm" (click)="ConfirmCode = m.Code" [disabled]="IssuingCode !== null" [attr.aria-label]="'Issue ' + m.Name + ' credentials'">
                                    <i class="fa-solid fa-paper-plane"></i> Issue
                                </button>
                            }
                        </li>
                    }
                </ul>
            }
        </section>

        @if (IsAdministrator) {
            <section class="panel" aria-labelledby="cred-secrets">
                <h3 id="cred-secrets"><i class="fa-solid fa-hashtag"></i> Control numbers and PINs</h3>
                <p class="hint">
                    Control numbers identify a voter for paper and proxy ballots; second-factor PINs are delivered to voters by you (print,
                    letter or phone). They are generated for the voters you select, or for every eligible voter. Only a hash is stored, so
                    each value is shown <strong>once</strong>, right after it is issued. Issuing again replaces a voter's earlier one.
                </p>
                <div aria-live="polite">
                    @if (SecretsError) {
                        <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ SecretsError }}</span></div>
                    }
                </div>
                @if (!CanIssueSecrets) {
                    <p class="muted small">Control numbers and PINs are issued once the election is Ready or Open.</p>
                } @else if (Secrets) {
                    <div class="banner banner-warn" role="alert">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>
                            These {{ Secrets.Kind === 'control' ? 'control numbers' : 'PINs' }} cannot be shown again. Copy or download them now,
                            then store them securely. Skipped voters: {{ Secrets.Skipped }}.
                        </span>
                    </div>
                    <div class="actions">
                        <button type="button" mjButton variant="primary" size="sm" (click)="CopySecrets()">
                            <i class="fa-solid fa-copy"></i> Copy CSV
                        </button>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="DownloadSecrets()">
                            <i class="fa-solid fa-download"></i> Download CSV
                        </button>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="DismissSecrets()">
                            <i class="fa-solid fa-check"></i> I have saved them, clear
                        </button>
                    </div>
                    @if (CopyNote) {
                        <p class="muted small" role="status">{{ CopyNote }}</p>
                    }
                    <div class="table-wrap">
                        <table class="grid">
                            <thead>
                                <tr>
                                    <th scope="col">Voter</th>
                                    @if (Secrets.Kind === 'pin') {
                                        <th scope="col">Roster key</th>
                                    }
                                    <th scope="col">{{ Secrets.Kind === 'control' ? 'Control number' : 'PIN' }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (r of Secrets.Rows; track r.Secret) {
                                    <tr>
                                        <th scope="row">{{ r.Voter }}</th>
                                        @if (Secrets.Kind === 'pin') {
                                            <td>{{ r.SourceKey }}</td>
                                        }
                                        <td><code>{{ r.Secret }}</code></td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                } @else {
                    <ul class="method-list">
                        @for (k of SecretKinds; track k.Kind) {
                            <li>
                                <div>
                                    <strong>{{ k.Name }}</strong>
                                    <div class="muted small">{{ k.Description }}</div>
                                </div>
                                @if (SecretConfirm === k.Kind) {
                                    <div class="actions">
                                        <span class="confirm-text">Issue to all eligible voters? Earlier ones stop working and the new values are shown only once.</span>
                                        <button type="button" mjButton variant="primary" size="sm" (click)="IssueSecrets(k.Kind)" [disabled]="IssuingSecrets">
                                            <i class="fa-solid" [class.fa-check]="!IssuingSecrets" [class.fa-spinner]="IssuingSecrets" [class.fa-spin]="IssuingSecrets"></i> Yes, issue
                                        </button>
                                        <button type="button" mjButton variant="secondary" size="sm" (click)="SecretConfirm = null" [disabled]="IssuingSecrets">Cancel</button>
                                    </div>
                                } @else {
                                    <button type="button" mjButton variant="secondary" size="sm" (click)="AskSecrets(k.Kind)" [disabled]="IssuingSecrets" [attr.aria-label]="'Issue ' + k.Name">
                                        <i class="fa-solid fa-paper-plane"></i> Issue
                                    </button>
                                }
                            </li>
                        }
                    </ul>
                }
            </section>
        }

        <section aria-labelledby="cred-log">
            <div class="log-head">
                <h3 id="cred-log">Issuance log <span class="muted">({{ Total }})</span></h3>
                <button type="button" mjButton variant="secondary" size="sm" (click)="LoadLog()" [disabled]="IsLoading">
                    <i class="fa-solid fa-arrows-rotate" [class.fa-spin]="IsLoading"></i> Refresh
                </button>
            </div>
            @if (IsLoading && Log.length === 0) {
                <div class="state-box"><mj-loading text="Loading issuance log..." size="large"></mj-loading></div>
            } @else if (LogError) {
                <div class="banner banner-error" role="alert">
                    <i class="fa-solid fa-triangle-exclamation"></i><span>{{ LogError }}</span>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="LoadLog()">Retry</button>
                </div>
            } @else if (Log.length === 0) {
                <div class="state-box empty"><i class="fa-solid fa-envelope"></i><p>No credentials have been issued for this election yet.</p></div>
            } @else {
                <div class="table-wrap">
                    <table class="grid">
                        <thead>
                            <tr>
                                <th scope="col">Voter</th>
                                <th scope="col">Method</th>
                                <th scope="col">Issued</th>
                                <th scope="col">Expires</th>
                                <th scope="col">State</th>
                                <th scope="col" class="num">Failed attempts</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (r of Log; track r.ID) {
                                <tr>
                                    <th scope="row">{{ r.VoterName }}</th>
                                    <td>{{ r.VoterCredentialMethod }}</td>
                                    <td>{{ r.IssuedAt | date: 'medium' }}</td>
                                    <td>{{ r.ExpiresAt ? (r.ExpiresAt | date: 'medium') : 'No expiry' }}</td>
                                    <td>
                                        <span class="chip" [class.chip-ok]="r.State === 'Redeemed'" [class.chip-info]="r.State === 'Active'" [class.chip-warn]="r.State === 'Locked' || r.State === 'Expired'" [class.chip-bad]="r.State === 'Revoked'">{{ r.State }}</span>
                                    </td>
                                    <td class="num">{{ r.FailedAttempts }}</td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
                <div class="pager" role="navigation" aria-label="Issuance log pages">
                    <button type="button" mjButton variant="secondary" size="sm" (click)="GoTo(Page - 1)" [disabled]="Page <= 1"><i class="fa-solid fa-chevron-left"></i> Previous</button>
                    <span>Page {{ Page }} of {{ PageCount }}</span>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="GoTo(Page + 1)" [disabled]="Page >= PageCount">Next <i class="fa-solid fa-chevron-right"></i></button>
                </div>
            }
        </section>
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .method-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
            .method-list li { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.6rem 0.75rem; border: 1px solid var(--mj-border-subtle); border-radius: 8px; background: var(--mj-bg-surface-card); }
            .log-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
            .log-head h3 { margin: 0; font-size: 1.05rem; color: var(--mj-text-primary); }
            .pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 0.75rem; color: var(--mj-text-secondary); }
        `,
    ],
})
export class CredentialsTabComponent extends BaseElectionAdminTab implements OnChanges, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly api = inject(VotingApiService);

    @Output() Changed = new EventEmitter<void>();

    public Methods: MethodView[] = [];
    public BaseUrl = '';
    public SlugFound = false;

    public ConfirmCode: string | null = null;
    public IssuingCode: string | null = null;
    public IssueError: string | null = null;
    public IssueMessage: string | null = null;

    public readonly SecretKinds: ReadonlyArray<{ Kind: SecretKind; Name: string; Description: string }> = [
        { Kind: 'control', Name: 'Control numbers', Description: 'One per voter, for paper and proxy ballots entered by staff.' },
        { Kind: 'pin', Name: 'Second-factor PINs', Description: 'One per voter with a roster key, presented together with that key at sign-in.' },
    ];
    public SecretConfirm: SecretKind | null = null;
    public IssuingSecrets = false;
    public SecretsError: string | null = null;
    /** The just-issued values. Held only here, in memory; cleared on dismiss, election change and destroy. */
    public Secrets: IssuedSecrets | null = null;
    public CopyNote = '';

    public Log: LogRow[] = [];
    public Total = 0;
    public Page = 1;
    public IsLoading = false;
    public LogError: string | null = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.DismissSecrets();
            this.Page = 1;
            void this.Init();
        }
    }

    ngOnDestroy(): void {
        this.DismissSecrets();
    }

    /** Offline credentials are issued for a Ready or Open election, matching the server rule. */
    public get CanIssueSecrets(): boolean {
        return this.ElectionStatus === 'Ready' || this.ElectionStatus === 'Open';
    }

    public get PageCount(): number {
        return Math.max(1, Math.ceil(this.Total / PAGE_SIZE));
    }

    private async Init(): Promise<void> {
        await Promise.all([this.LoadMethods(), this.LoadBaseUrl(), this.LoadLog()]);
        this.cdr.detectChanges();
    }

    private async LoadMethods(): Promise<void> {
        try {
            await VotingEngineBase.Instance.Config(false, undefined, this.ProviderToUse);
            this.Methods = VotingEngineBase.Instance.ActiveVoterCredentialMethods
                .filter((m) => m.RequiresIssuance)
                .map((m) => ({ Code: m.Code, Name: m.Name, Description: m.Description ?? '', IsSecondFactor: m.IsSecondFactor }));
        } catch (error) {
            LogError('[VotingElections] Failed to load sign-in methods', undefined, error);
            this.Methods = [];
        }
        this.cdr.detectChanges();
    }

    private async LoadBaseUrl(): Promise<void> {
        const origin = ResolveApiOrigin(this.ProviderToUse);
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<DistributionSlug>({
            EntityName: 'MJ_BizApps_Voting: Ballot Distributions',
            ExtraFilter: `ElectionID='${this.ElectionID}' AND Status<>'Retired'`,
            OrderBy: 'Status',
            ResultType: 'simple',
            Fields: ['Slug', 'Status'],
        });
        const dist = res.Success ? (res.Results.find((d) => d.Status === 'Active') ?? res.Results[0]) : undefined;
        this.SlugFound = !!dist;
        this.BaseUrl = dist ? `${origin}/vote/${encodeURIComponent(dist.Slug)}` : `${origin}/vote`;
        this.cdr.detectChanges();
    }

    public GoTo(page: number): void {
        if (page < 1 || page > this.PageCount) {
            return;
        }
        this.Page = page;
        void this.LoadLog();
    }

    public async LoadLog(): Promise<void> {
        if (!this.ElectionID) {
            return;
        }
        this.IsLoading = true;
        this.LogError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<CredentialRow>({
                EntityName: 'MJ_BizApps_Voting: Voter Credentials',
                ExtraFilter: `EligibleVoterID IN (SELECT ID FROM ${this.VoterViewName()} WHERE ElectionID='${this.ElectionID}')`,
                OrderBy: 'IssuedAt DESC',
                ResultType: 'simple',
                // Deliberately excludes ControlNumberHash and SecretHash.
                Fields: ['ID', 'EligibleVoterID', 'VoterCredentialMethod', 'IssuedAt', 'ExpiresAt', 'RedeemedAt', 'RevokedAt', 'FailedAttempts', 'LockedUntil'],
                StartRow: (this.Page - 1) * PAGE_SIZE,
                MaxRows: PAGE_SIZE,
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'The issuance log could not be loaded.');
            }
            const names = await this.LoadVoterNames(res.Results.map((r) => r.EligibleVoterID));
            this.Log = res.Results.map((r) => ({
                ...r,
                VoterName: names.get(r.EligibleVoterID.toLowerCase()) ?? 'Unknown voter',
                State: this.StateOf(r),
            }));
            this.Total = res.TotalRowCount;
        } catch (error) {
            LogError('[VotingElections] Issuance log load failed', undefined, error);
            this.LogError = error instanceof Error ? error.message : 'The issuance log could not be loaded.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** The eligible-voter base view, read from entity metadata so the schema name is never hard-coded. */
    private VoterViewName(): string {
        const entity = this.ProviderToUse.EntityByName(VOTER_ENTITY);
        if (!entity) {
            throw new Error(`Entity metadata for '${VOTER_ENTITY}' is not loaded.`);
        }
        return `[${entity.SchemaName}].[${entity.BaseView}]`;
    }

    private async LoadVoterNames(voterIds: string[]): Promise<Map<string, string>> {
        const names = new Map<string, string>();
        const unique = Array.from(new Set(voterIds));
        if (unique.length === 0) {
            return names;
        }
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<VoterName>({
            EntityName: VOTER_ENTITY,
            ExtraFilter: `ID IN (${unique.map((id) => `'${id}'`).join(',')})`,
            ResultType: 'simple',
            Fields: ['ID', 'Person'],
        });
        if (res.Success) {
            for (const v of res.Results) {
                names.set(v.ID.toLowerCase(), v.Person);
            }
        }
        return names;
    }

    private StateOf(r: CredentialRow): LogRow['State'] {
        const now = Date.now();
        if (r.RevokedAt) return 'Revoked';
        if (r.RedeemedAt) return 'Redeemed';
        if (r.LockedUntil && new Date(r.LockedUntil).getTime() > now) return 'Locked';
        if (r.ExpiresAt && new Date(r.ExpiresAt).getTime() < now) return 'Expired';
        return 'Active';
    }

    public async Issue(method: MethodView): Promise<void> {
        this.IssuingCode = method.Code;
        this.IssueError = null;
        this.IssueMessage = null;
        try {
            const r = await this.api.IssueCredentials({
                ElectionID: this.ElectionID,
                MethodCode: method.Code,
                BaseUrl: this.BaseUrl.trim() || undefined,
            });
            if (!r.Success) {
                this.IssueError = r.Message ?? 'Credentials could not be issued.';
                return;
            }
            this.ConfirmCode = null;
            this.IssueMessage = `${method.Name}: issued ${r.Output?.Issued ?? 0}, skipped ${r.Output?.Skipped ?? 0}.`;
            this.Page = 1;
            await this.LoadLog();
            this.Changed.emit();
        } finally {
            this.IssuingCode = null;
            this.cdr.detectChanges();
        }
    }
    public AskSecrets(kind: SecretKind): void {
        this.SecretsError = null;
        this.SecretConfirm = kind;
    }

    /** Issues control numbers or PINs for every eligible voter and keeps the returned values in memory for the one-time view. */
    public async IssueSecrets(kind: SecretKind): Promise<void> {
        this.IssuingSecrets = true;
        this.SecretsError = null;
        try {
            const result =
                kind === 'control'
                    ? await this.api.IssueControlNumbers({ ElectionID: this.ElectionID })
                    : await this.api.IssueSecondFactorPins({ ElectionID: this.ElectionID });
            if (!result.Success || !result.Output) {
                this.SecretsError = result.Message ?? 'The values could not be issued.';
                return;
            }
            const issued = result.Output.Issued ?? [];
            const names = await this.LoadVoterNames(issued.map((i) => i.EligibleVoterID));
            const rows: IssuedSecretRow[] = issued.map((i) => ({
                Voter: names.get(i.EligibleVoterID.toLowerCase()) ?? 'Unknown voter',
                SourceKey: 'SourceKey' in i ? (i.SourceKey ?? '') : '',
                Secret: 'Pin' in i ? i.Pin : i.ControlNumber,
            }));
            this.Secrets = { Kind: kind, Rows: rows, Skipped: result.Output.Skipped ?? 0 };
            this.SecretConfirm = null;
            this.CopyNote = '';
            await this.LoadLog();
            this.Changed.emit();
        } finally {
            this.IssuingSecrets = false;
            this.cdr.detectChanges();
        }
    }

    private SecretsCsv(): string {
        if (!this.Secrets) return '';
        return this.Secrets.Kind === 'control' ? ControlNumbersCsv(this.Secrets.Rows) : PinsCsv(this.Secrets.Rows);
    }

    public async CopySecrets(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.SecretsCsv());
            this.CopyNote = 'Copied to the clipboard.';
        } catch {
            this.CopyNote = 'Copying was blocked by the browser. Use Download CSV instead.';
        }
        this.cdr.detectChanges();
    }

    /** Hands the CSV to the browser as a file. The text is built here and never leaves the page. */
    public DownloadSecrets(): void {
        if (!this.Secrets) return;
        const url = URL.createObjectURL(new Blob([this.SecretsCsv()], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = this.Secrets.Kind === 'control' ? 'control-numbers.csv' : 'second-factor-pins.csv';
        link.click();
        URL.revokeObjectURL(url);
    }

    public DismissSecrets(): void {
        this.Secrets = null;
        this.CopyNote = '';
        this.SecretConfirm = null;
    }
}
