/**
 * CredentialsTab — issues voter credentials (Voting.IssueCredentials) per sign-in method and shows
 * the issuance log. The log never carries secrets: it lists method, timing and state only (the
 * stored control-number and secret hashes are not even requested).
 */
import { Component, EventEmitter, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
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
export class CredentialsTabComponent extends BaseElectionAdminTab implements OnChanges {
    private readonly api = inject(VotingApiService);

    @Output() Changed = new EventEmitter<void>();

    public Methods: MethodView[] = [];
    public BaseUrl = '';
    public SlugFound = false;

    public ConfirmCode: string | null = null;
    public IssuingCode: string | null = null;
    public IssueError: string | null = null;
    public IssueMessage: string | null = null;

    public Log: LogRow[] = [];
    public Total = 0;
    public Page = 1;
    public IsLoading = false;
    public LogError: string | null = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.Page = 1;
            void this.Init();
        }
    }

    public get PageCount(): number {
        return Math.max(1, Math.ceil(this.Total / PAGE_SIZE));
    }

    private async Init(): Promise<void> {
        await Promise.all([this.LoadMethods(), this.LoadBaseUrl(), this.LoadLog()]);
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
        }
    }
}
