/**
 * TrusteesTab — the key ceremony for high-assurance elections: choose trustees and a k-of-n threshold,
 * create the trustee keys behind a confirm step, and show each trustee's share exactly once.
 * The shares exist only in this component's memory; they are cleared on dismiss, election change and destroy.
 */
import { Component, EventEmitter, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EscapeSQLString } from '@memberjunction/global';
import { LogError, RunView } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import { VotingApiService } from '../../shared/voting-api.service';
import { TrusteeSharesCsv, type TrusteeShareRow } from '../../shared/one-time-secrets';
import { ELECTION_COMMON_STYLES } from '../election-styles';

interface PersonHit {
    ID: string;
    DisplayName: string;
    Email: string | null;
}

interface TrusteeRow {
    ID: string;
    TrusteePerson: string;
    ShareIndex: number;
    Status: 'Invited' | 'KeyCommitted' | 'ShareSubmitted' | 'Removed';
}

const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';

@Component({
    selector: 'election-trustees-tab',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective],
    template: `
        <div aria-live="polite">
            @if (ActionError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ ActionError }}</span></div>
            }
        </div>

        @if (Shares) {
            <section class="panel" aria-labelledby="tr-shares">
                <h3 id="tr-shares"><i class="fa-solid fa-key"></i> Trustee key shares</h3>
                <div class="banner banner-warn" role="alert">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>
                        These shares are shown only once and are never stored. Give each trustee only their own share, through a secure channel.
                        Once you clear this view they cannot be recovered. Threshold: {{ ThresholdUsed }} of {{ Shares.length }}.
                    </span>
                </div>
                <div class="actions">
                    <button type="button" mjButton variant="primary" size="sm" (click)="CopyShares()"><i class="fa-solid fa-copy"></i> Copy all</button>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="DownloadShares()"><i class="fa-solid fa-download"></i> Download CSV</button>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="DismissShares()"><i class="fa-solid fa-check"></i> I have distributed them, clear</button>
                </div>
                @if (CopyNote) {
                    <p class="muted small" role="status">{{ CopyNote }}</p>
                }
                <div class="table-wrap">
                    <table class="grid">
                        <thead><tr><th scope="col">Trustee</th><th scope="col" class="num">Share index</th><th scope="col">Share</th><th scope="col"><span class="sr-only">Copy</span></th></tr></thead>
                        <tbody>
                            @for (s of Shares; track s.ShareIndex) {
                                <tr>
                                    <th scope="row">{{ s.Trustee }}</th>
                                    <td class="num">{{ s.ShareIndex }}</td>
                                    <td><code>{{ s.Share }}</code></td>
                                    <td><button type="button" mjButton variant="secondary" size="sm" (click)="CopyOne(s)" [attr.aria-label]="'Copy share for ' + s.Trustee"><i class="fa-solid fa-copy"></i></button></td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </section>
        }

        <section class="panel" aria-labelledby="tr-list">
            <h3 id="tr-list"><i class="fa-solid fa-user-shield"></i> Trustees <span class="muted">({{ Trustees.length }})</span></h3>
            @if (LoadError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ LoadError }}</span></div>
            } @else if (IsLoading) {
                <p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading trustees...</p>
            } @else if (Trustees.length === 0) {
                <p class="muted">No trustees have been set up for this election.</p>
            } @else {
                <div class="table-wrap">
                    <table class="grid">
                        <thead><tr><th scope="col">Trustee</th><th scope="col" class="num">Share index</th><th scope="col">Status</th></tr></thead>
                        <tbody>
                            @for (t of Trustees; track t.ID) {
                                <tr>
                                    <th scope="row">{{ t.TrusteePerson }}</th>
                                    <td class="num">{{ t.ShareIndex }}</td>
                                    <td><span class="chip" [ngClass]="StatusClass(t.Status)">{{ StatusText(t.Status) }}</span></td>
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            }
        </section>

        @if (IsAdministrator && CanCreate) {
            <section class="panel" aria-labelledby="tr-create">
                <h3 id="tr-create"><i class="fa-solid fa-wand-magic-sparkles"></i> Create trustee keys</h3>
                <p class="hint">
                    The election key is split among the trustees. Any {{ Threshold }} of {{ Picked.length || 'n' }} shares can reconstruct it to open the ballot box.
                    Creating keys again is only possible before voting opens.
                </p>
                <form class="search-row" (ngSubmit)="SearchPeople()" role="search">
                    <label for="tr-q" class="sr-only">Search people by name or email</label>
                    <input id="tr-q" name="trq" class="input" type="search" placeholder="Search people by name or email" [(ngModel)]="PeopleQuery" />
                    <button type="submit" mjButton variant="secondary" size="sm" [disabled]="IsSearching || PeopleQuery.trim().length < 2">
                        <i class="fa-solid fa-magnifying-glass"></i> Search
                    </button>
                </form>
                @if (PeopleError) {
                    <p class="error" role="alert">{{ PeopleError }}</p>
                }
                @if (PeopleSearched && People.length === 0 && !PeopleError) {
                    <p class="muted">No people matched.</p>
                }
                @if (People.length > 0) {
                    <ul class="people">
                        @for (p of People; track p.ID) {
                            <li>
                                <span><strong>{{ p.DisplayName }}</strong> <span class="muted">{{ p.Email }}</span></span>
                                <button type="button" mjButton variant="secondary" size="sm" (click)="AddTrustee(p)" [disabled]="IsPicked(p)">
                                    <i class="fa-solid fa-plus"></i> {{ IsPicked(p) ? 'Added' : 'Add' }}
                                </button>
                            </li>
                        }
                    </ul>
                }

                <h4>Chosen trustees ({{ Picked.length }})</h4>
                @if (Picked.length === 0) {
                    <p class="muted small">Search and add at least two trustees.</p>
                } @else {
                    <ul class="people">
                        @for (p of Picked; track p.ID) {
                            <li>
                                <span><strong>{{ p.DisplayName }}</strong> <span class="muted">{{ p.Email }}</span></span>
                                <button type="button" mjButton variant="secondary" size="sm" (click)="RemoveTrustee(p)" [attr.aria-label]="'Remove ' + p.DisplayName">
                                    <i class="fa-solid fa-xmark"></i> Remove
                                </button>
                            </li>
                        }
                    </ul>
                }

                <div class="field threshold">
                    <label for="tr-k">Threshold (shares needed)</label>
                    <input id="tr-k" name="trk" class="input" type="number" min="1" [max]="Picked.length || 1" [(ngModel)]="Threshold" [attr.aria-invalid]="ThresholdError ? 'true' : null" />
                    <p class="error" role="alert">{{ ThresholdError }}</p>
                </div>

                @if (!Confirm) {
                    <button type="button" mjButton variant="primary" size="sm" (click)="Confirm = true" [disabled]="IsBusy || !!ValidationError">
                        <i class="fa-solid fa-key"></i> Create trustee keys
                    </button>
                    @if (ValidationError && Picked.length > 0) {
                        <p class="muted small">{{ ValidationError }}</p>
                    }
                } @else {
                    <div class="actions">
                        <span class="confirm-text">Create keys for {{ Picked.length }} trustees with a threshold of {{ Threshold }}? The shares will be shown once.</span>
                        <button type="button" mjButton variant="primary" size="sm" (click)="Create()" [disabled]="IsBusy">
                            <i class="fa-solid" [class.fa-check]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Yes, create
                        </button>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="Confirm = false" [disabled]="IsBusy">Cancel</button>
                    </div>
                }
            </section>
        } @else if (!IsAdministrator) {
            <p class="muted small">Only voting administrators can create trustee keys.</p>
        }
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .search-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
            .search-row .input { flex: 1; min-width: 12rem; width: auto; }
            .people { list-style: none; padding: 0; margin: 0.5rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }
            .people li { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.4rem 0.6rem; border: 1px solid var(--mj-border-subtle); border-radius: 6px; background: var(--mj-bg-surface-card); }
            .threshold { max-width: 14rem; margin-top: 0.75rem; }
        `,
    ],
})
export class TrusteesTabComponent extends BaseElectionAdminTab implements OnChanges, OnDestroy {
    private readonly api = inject(VotingApiService);

    @Output() Changed = new EventEmitter<void>();

    public Trustees: TrusteeRow[] = [];
    public IsLoading = false;
    public LoadError: string | null = null;

    public PeopleQuery = '';
    public People: PersonHit[] = [];
    public PeopleSearched = false;
    public PeopleError: string | null = null;
    public IsSearching = false;
    public Picked: PersonHit[] = [];
    public Threshold = 2;

    public Confirm = false;
    public IsBusy = false;
    public ActionError: string | null = null;

    /** The just-created shares. Held only here, in memory; cleared on dismiss, election change and destroy. */
    public Shares: TrusteeShareRow[] | null = null;
    public ThresholdUsed = 0;
    public CopyNote = '';

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.DismissShares();
            this.Picked = [];
            this.People = [];
            void this.LoadTrustees();
        }
    }

    ngOnDestroy(): void {
        this.DismissShares();
    }

    /** Keys can be created until voting opens, matching the ceremony's order. */
    public get CanCreate(): boolean {
        return ['Draft', 'Nominations', 'Ready'].includes(this.ElectionStatus);
    }

    public get ThresholdError(): string {
        const k = Number(this.Threshold);
        if (!Number.isInteger(k) || k < 1) return 'Enter a whole number of at least 1.';
        if (this.Picked.length > 0 && k > this.Picked.length) return 'The threshold cannot exceed the number of trustees.';
        return '';
    }

    public get ValidationError(): string {
        if (this.Picked.length < 2) return 'Choose at least two trustees.';
        return this.ThresholdError;
    }

    public StatusText(status: TrusteeRow['Status']): string {
        switch (status) {
            case 'Invited': return 'Invited';
            case 'KeyCommitted': return 'Key committed';
            case 'ShareSubmitted': return 'Share submitted';
            default: return 'Removed';
        }
    }

    public StatusClass(status: TrusteeRow['Status']): string {
        switch (status) {
            case 'ShareSubmitted': return 'chip-ok';
            case 'KeyCommitted': return 'chip-info';
            case 'Removed': return 'chip-bad';
            default: return 'chip-warn';
        }
    }

    public async LoadTrustees(): Promise<void> {
        if (!this.ElectionID) return;
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<TrusteeRow>({
                EntityName: 'MJ_BizApps_Voting: Election Trustees',
                ExtraFilter: `ElectionID='${this.ElectionID}'`,
                OrderBy: 'ShareIndex',
                ResultType: 'simple',
                Fields: ['ID', 'TrusteePerson', 'ShareIndex', 'Status'],
            });
            if (!res.Success) throw new Error(res.ErrorMessage || 'Trustees could not be loaded.');
            this.Trustees = res.Results;
        } catch (error) {
            LogError('[VotingElections] Failed to load trustees', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'Trustees could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    public async SearchPeople(): Promise<void> {
        const q = this.PeopleQuery.trim();
        if (q.length < 2) return;
        this.IsSearching = true;
        this.PeopleError = null;
        try {
            const safe = EscapeSQLString(q);
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<PersonHit>({
                EntityName: PEOPLE_ENTITY,
                ExtraFilter: `DisplayName LIKE '%${safe}%' OR Email LIKE '%${safe}%'`,
                OrderBy: 'DisplayName',
                ResultType: 'simple',
                Fields: ['ID', 'DisplayName', 'Email'],
                MaxRows: 10,
            });
            if (!res.Success) throw new Error(res.ErrorMessage || 'The search failed.');
            this.People = res.Results;
            this.PeopleSearched = true;
        } catch (error) {
            LogError('[VotingElections] People search failed', undefined, error);
            this.PeopleError = error instanceof Error ? error.message : 'The search failed.';
        } finally {
            this.IsSearching = false;
        }
    }

    public IsPicked(p: PersonHit): boolean {
        return this.Picked.some((x) => x.ID.toLowerCase() === p.ID.toLowerCase());
    }

    public AddTrustee(p: PersonHit): void {
        if (!this.IsPicked(p)) this.Picked = [...this.Picked, p];
        this.Confirm = false;
    }

    public RemoveTrustee(p: PersonHit): void {
        this.Picked = this.Picked.filter((x) => x.ID.toLowerCase() !== p.ID.toLowerCase());
        this.Confirm = false;
    }

    public async Create(): Promise<void> {
        if (this.ValidationError) return;
        this.IsBusy = true;
        this.ActionError = null;
        try {
            const r = await this.api.CreateTrusteeKeys({
                ElectionID: this.ElectionID,
                TrusteePersonIDs: this.Picked.map((p) => p.ID),
                Threshold: Number(this.Threshold),
            });
            if (!r.Success || !r.Output) {
                this.ActionError = r.Message ?? 'Trustee keys could not be created.';
                return;
            }
            const names = new Map(this.Picked.map((p) => [p.ID.toLowerCase(), p.DisplayName]));
            this.Shares = (r.Output.Shares ?? [])
                .map((s) => ({ Trustee: names.get(s.TrusteePersonID.toLowerCase()) ?? 'Unknown trustee', ShareIndex: s.ShareIndex, Share: s.Share }))
                .sort((a, b) => a.ShareIndex - b.ShareIndex);
            this.ThresholdUsed = Number(this.Threshold);
            this.Confirm = false;
            this.Picked = [];
            this.CopyNote = '';
            await this.LoadTrustees();
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
        }
    }

    public async CopyShares(): Promise<void> {
        await this.WriteClipboard(this.Shares ? TrusteeSharesCsv(this.Shares) : '');
    }

    public async CopyOne(s: TrusteeShareRow): Promise<void> {
        await this.WriteClipboard(`Share index ${s.ShareIndex}\n${s.Share}`);
    }

    private async WriteClipboard(text: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            this.CopyNote = 'Copied to the clipboard.';
        } catch {
            this.CopyNote = 'Copying was blocked by the browser. Use Download CSV instead.';
        }
    }

    /** Hands the CSV to the browser as a file. The text is built here and never leaves the page. */
    public DownloadShares(): void {
        if (!this.Shares) return;
        const url = URL.createObjectURL(new Blob([TrusteeSharesCsv(this.Shares)], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'trustee-key-shares.csv';
        link.click();
        URL.revokeObjectURL(url);
    }

    public DismissShares(): void {
        this.Shares = null;
        this.CopyNote = '';
        this.ThresholdUsed = 0;
    }
}
