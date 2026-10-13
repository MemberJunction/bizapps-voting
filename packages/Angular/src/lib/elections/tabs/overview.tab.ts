/**
 * OverviewTab — an election's configuration and lifecycle: details, contests, anchors, and the
 * Open / Close / Cancel actions (plus editing of the basics while the election is still being set up).
 */
import { Component, EventEmitter, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, RunView } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import { CanTransition, type ElectionStatus } from '@mj-biz-apps/voting-entities';
import { VotingApiService } from '../../shared/voting-api.service';
import { StatusChipComponent } from '../../shared/status-chip.component';
import { ELECTION_COMMON_STYLES } from '../election-styles';
import { FromDateTimeLocal, ToDateTimeLocal } from '../date-utils';

interface ElectionRow {
    ID: string;
    Name: string;
    Description: string | null;
    Status: ElectionStatus;
    ElectionType: string;
    SecrecyMode: string;
    AssuranceTier: string;
    ResultsTiming: string;
    ResultsAudience: string;
    ResultsMinCast: number;
    AllowRevote: boolean;
    TimeZone: string;
    RecordDate: string | null;
    OpensAt: string | null;
    ClosesAt: string | null;
    RollFrozenAt: string | null;
    RollHash: string | null;
    Configuration: string | null;
}

interface ContestRow {
    ID: string;
    Name: string;
    Kind: string;
    Seats: number;
    TallyMethod: string;
    Threshold: string;
}

interface NominationRow {
    ID: string;
    ContestID: string;
    Contest: string;
    NomineePerson: string;
    NominatedByPerson: string | null;
    Status: string;
    Statement: string | null;
    SubmittedAt: string | null;
    DecidedAt: string | null;
    DecisionNotes: string | null;
}

interface NominationGroup {
    ContestID: string;
    Contest: string;
    Rows: NominationRow[];
}

interface AnchorRow {
    ID: string;
    Entity: string;
    RecordID: string;
    Role: string;
    IsPrimary: boolean;
}

type LifecycleAction = 'open' | 'close' | 'cancel' | 'openNominations' | 'closeNominations';

const LIFECYCLE_DONE: Record<LifecycleAction, string> = {
    open: 'Voting is now open.',
    close: 'Voting is closed.',
    cancel: 'The election was cancelled.',
    openNominations: 'Nominations are now open.',
    closeNominations: 'Nominations are closed; the election is Ready.',
};

const EDITABLE_STATUSES: ElectionStatus[] = ['Draft', 'Nominations', 'Ready'];
/** Nominations can be decided until voting opens (matches the server rule). */
const NOMINATION_DECIDABLE_STATUSES: ElectionStatus[] = ['Draft', 'Nominations', 'Ready'];
/** A nomination awaiting a decision. */
const UNDECIDED_NOMINATION_STATUSES = ['Submitted', 'Accepted'];

@Component({
    selector: 'election-overview-tab',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective, StatusChipComponent],
    template: `
        @if (IsLoading) {
            <div class="state-box"><mj-loading text="Loading overview..." size="large"></mj-loading></div>
        } @else if (LoadError) {
            <div class="banner banner-error" role="alert">
                <i class="fa-solid fa-triangle-exclamation"></i><span>{{ LoadError }}</span>
                <button type="button" mjButton variant="secondary" size="sm" (click)="Load()">Retry</button>
            </div>
        } @else if (Election) {
            <div aria-live="polite">
                @if (ActionError) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ ActionError }}</span></div>
                }
                @if (ActionMessage) {
                    <div class="banner banner-ok"><i class="fa-solid fa-circle-check"></i><span>{{ ActionMessage }}</span></div>
                }
            </div>

            <section class="panel" aria-labelledby="ov-life">
                <h3 id="ov-life"><i class="fa-solid fa-flag-checkered"></i> Lifecycle</h3>
                <p class="hint">Current status: <voting-status-chip [Status]="Election.Status"></voting-status-chip></p>
                @if (IsAdministrator) {
                    <div class="actions">
                        @if (Can('Nominations')) {
                            <button type="button" mjButton variant="secondary" size="sm" (click)="Ask('openNominations')" [disabled]="IsBusy">
                                <i class="fa-solid fa-user-plus"></i> Open nominations
                            </button>
                        }
                        @if (Election.Status === 'Nominations' && Can('Ready')) {
                            <button type="button" mjButton variant="secondary" size="sm" (click)="Ask('closeNominations')" [disabled]="IsBusy">
                                <i class="fa-solid fa-user-lock"></i> Close nominations
                            </button>
                        }
                        @if (Can('Open')) {
                            <button type="button" mjButton variant="primary" size="sm" (click)="Ask('open')" [disabled]="IsBusy">
                                <i class="fa-solid fa-play"></i> Open voting
                            </button>
                        }
                        @if (Can('Closed')) {
                            <button type="button" mjButton variant="primary" size="sm" (click)="Ask('close')" [disabled]="IsBusy">
                                <i class="fa-solid fa-lock"></i> Close voting
                            </button>
                        }
                        @if (Can('Cancelled')) {
                            <button type="button" mjButton variant="secondary" size="sm" (click)="Ask('cancel')" [disabled]="IsBusy">
                                <i class="fa-solid fa-ban"></i> Cancel election
                            </button>
                        }
                    </div>
                    @if (Pending) {
                        <div class="confirm">
                            @if (Pending === 'cancel') {
                                <div class="field">
                                    <label for="cancel-reason">Reason for cancelling (required)</label>
                                    <textarea id="cancel-reason" class="input" rows="2" [(ngModel)]="CancelReason"></textarea>
                                </div>
                            }
                            <p class="confirm-text">{{ ConfirmText }}</p>
                            <div class="actions">
                                <button type="button" mjButton variant="primary" size="sm" (click)="Confirm()" [disabled]="IsBusy || (Pending === 'cancel' && !CancelReason.trim())">
                                    <i class="fa-solid" [class.fa-check]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Yes, continue
                                </button>
                                <button type="button" mjButton variant="secondary" size="sm" (click)="Pending = null" [disabled]="IsBusy">Back</button>
                            </div>
                        </div>
                    }
                } @else {
                    <p class="muted small">Only voting administrators can change an election's status.</p>
                }
            </section>

            <section class="panel" aria-labelledby="ov-details">
                <h3 id="ov-details"><i class="fa-solid fa-circle-info"></i> Details</h3>
                @if (Editing) {
                    <form (ngSubmit)="SaveEdit()" class="field-grid" novalidate>
                        <div class="field wide">
                            <label for="ov-name">Name</label>
                            <input id="ov-name" name="name" class="input" [(ngModel)]="Form.Name" />
                        </div>
                        <div class="field wide">
                            <label for="ov-desc">Description</label>
                            <textarea id="ov-desc" name="desc" class="input" rows="3" [(ngModel)]="Form.Description"></textarea>
                        </div>
                        <div class="field">
                            <label for="ov-opens">Opens</label>
                            <input id="ov-opens" name="opens" type="datetime-local" class="input" [(ngModel)]="Form.OpensAt" />
                        </div>
                        <div class="field">
                            <label for="ov-closes">Closes</label>
                            <input id="ov-closes" name="closes" type="datetime-local" class="input" [(ngModel)]="Form.ClosesAt" />
                        </div>
                        <div class="actions wide">
                            <button type="submit" mjButton variant="primary" size="sm" [disabled]="IsBusy || !Form.Name.trim()">
                                <i class="fa-solid fa-floppy-disk"></i> Save changes
                            </button>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="Editing = false" [disabled]="IsBusy">Cancel</button>
                        </div>
                    </form>
                } @else {
                    <dl class="facts">
                        <div><dt>Name</dt><dd>{{ Election.Name }}</dd></div>
                        <div><dt>Type</dt><dd>{{ Election.ElectionType }}</dd></div>
                        <div><dt>Secrecy mode</dt><dd>{{ Election.SecrecyMode }}</dd></div>
                        <div><dt>Assurance tier</dt><dd>{{ Election.AssuranceTier }}</dd></div>
                        <div><dt>Results timing</dt><dd>{{ Election.ResultsTiming }}</dd></div>
                        <div><dt>Results audience</dt><dd>{{ Election.ResultsAudience }}</dd></div>
                        <div><dt>Minimum ballots before results</dt><dd>{{ Election.ResultsMinCast }}</dd></div>
                        <div><dt>Voters may change their vote</dt><dd>{{ Election.AllowRevote ? 'Yes' : 'No' }}</dd></div>
                        <div><dt>Time zone</dt><dd>{{ Election.TimeZone }}</dd></div>
                        <div><dt>Record date</dt><dd>{{ Election.RecordDate ? (Election.RecordDate | date: 'mediumDate') : 'Not set' }}</dd></div>
                        <div><dt>Opens</dt><dd>{{ Election.OpensAt ? (Election.OpensAt | date: 'medium') : 'Not set' }}</dd></div>
                        <div><dt>Closes</dt><dd>{{ Election.ClosesAt ? (Election.ClosesAt | date: 'medium') : 'Not set' }}</dd></div>
                        <div><dt>Roll</dt><dd>{{ Election.RollFrozenAt ? 'Frozen ' + (Election.RollFrozenAt | date: 'medium') : 'Not frozen' }}</dd></div>
                        @if (Election.RollHash) {
                            <div><dt>Roll hash</dt><dd><code>{{ Election.RollHash }}</code></dd></div>
                        }
                    </dl>
                    @if (Election.Description) {
                        <h4>Description</h4>
                        <p>{{ Election.Description }}</p>
                    }
                    @if (IsAdministrator && CanEdit) {
                        <div class="actions">
                            <button type="button" mjButton variant="secondary" size="sm" (click)="StartEdit()">
                                <i class="fa-solid fa-pen"></i> Edit details
                            </button>
                        </div>
                    }
                }
            </section>

            <section class="panel" aria-labelledby="ov-contests">
                <h3 id="ov-contests"><i class="fa-solid fa-list-check"></i> Contests</h3>
                @if (Contests.length === 0) {
                    <p class="muted">This election has no contests.</p>
                } @else {
                    <div class="table-wrap">
                        <table class="grid">
                            <thead><tr><th scope="col">Contest</th><th scope="col">Kind</th><th scope="col" class="num">Seats</th><th scope="col">Tally method</th><th scope="col">Threshold</th></tr></thead>
                            <tbody>
                                @for (c of Contests; track c.ID) {
                                    <tr>
                                        <th scope="row">{{ c.Name }}</th>
                                        <td>{{ c.Kind }}</td>
                                        <td class="num">{{ c.Seats }}</td>
                                        <td>{{ c.TallyMethod }}</td>
                                        <td>{{ c.Threshold }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                }
            </section>

            @if (ShowNominations) {
                <section class="panel" aria-labelledby="ov-noms">
                    <h3 id="ov-noms"><i class="fa-solid fa-user-tie"></i> Nominations</h3>
                    @if (NominationError) {
                        <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ NominationError }}</span></div>
                    }
                    @if (NominationGroups.length === 0) {
                        <p class="muted">No nominations have been submitted yet.</p>
                    }
                    @for (g of NominationGroups; track g.ContestID) {
                        <h4>{{ g.Contest }}</h4>
                        <div class="table-wrap">
                            <table class="grid">
                                <thead>
                                    <tr>
                                        <th scope="col">Nominee</th>
                                        <th scope="col">Nominated by</th>
                                        <th scope="col">Statement</th>
                                        <th scope="col">Status</th>
                                        <th scope="col"><span class="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (n of g.Rows; track n.ID) {
                                        <tr>
                                            <th scope="row">{{ n.NomineePerson }}</th>
                                            <td>{{ n.NominatedByPerson || '' }}</td>
                                            <td>{{ n.Statement || '' }}</td>
                                            <td>
                                                <span class="chip" [class.chip-ok]="n.Status === 'Approved'" [class.chip-bad]="n.Status === 'Rejected'" [class.chip-info]="IsUndecided(n)">{{ n.Status }}</span>
                                                @if (n.DecisionNotes) {
                                                    <div class="muted small">{{ n.DecisionNotes }}</div>
                                                }
                                            </td>
                                            <td>
                                                @if (IsAdministrator && CanDecideNominations && IsUndecided(n)) {
                                                    <div class="row-actions">
                                                        <button type="button" mjButton variant="primary" size="sm" (click)="BeginDecision(n, 'Approved')" [attr.aria-label]="'Approve ' + n.NomineePerson">Approve</button>
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="BeginDecision(n, 'Rejected')" [attr.aria-label]="'Reject ' + n.NomineePerson">Reject</button>
                                                    </div>
                                                }
                                            </td>
                                        </tr>
                                        @if (Deciding && Deciding.ID === n.ID) {
                                            <tr class="action-row">
                                                <td colspan="5">
                                                    <div class="field">
                                                        <label [for]="'nom-notes-' + n.ID">Notes for the {{ DecidingKind === 'Approved' ? 'approval' : 'rejection' }} (optional)</label>
                                                        <textarea [id]="'nom-notes-' + n.ID" class="input" rows="2" [(ngModel)]="DecisionNotes"></textarea>
                                                    </div>
                                                    <div class="actions">
                                                        <button type="button" mjButton variant="primary" size="sm" (click)="ConfirmDecision()" [disabled]="IsBusy">
                                                            <i class="fa-solid fa-check"></i> {{ DecidingKind === 'Approved' ? 'Approve nominee' : 'Reject nomination' }}
                                                        </button>
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="Deciding = null" [disabled]="IsBusy">Cancel</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        }
                                    }
                                </tbody>
                            </table>
                        </div>
                    }
                </section>
            }

            @if (Anchors.length > 0) {
                <section class="panel" aria-labelledby="ov-anchors">
                    <h3 id="ov-anchors"><i class="fa-solid fa-anchor"></i> Linked records</h3>
                    <ul class="anchor-list">
                        @for (a of Anchors; track a.ID) {
                            <li>
                                <strong>{{ a.Entity }}</strong> <code>{{ a.RecordID }}</code>
                                <span class="chip">{{ a.Role }}</span>
                                @if (a.IsPrimary) {
                                    <span class="chip chip-info">Primary</span>
                                }
                            </li>
                        }
                    </ul>
                </section>
            }
        }
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .confirm { margin-top: 0.75rem; padding: 0.75rem; border: 1px solid var(--mj-status-warning-border); background: color-mix(in srgb, var(--mj-status-warning) 8%, var(--mj-bg-surface)); border-radius: 8px; }
            .anchor-list { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.35rem; }
            .actions.wide { grid-column: 1 / -1; }
            .action-row td { background: var(--mj-bg-surface-card); }
        `,
    ],
})
export class OverviewTabComponent extends BaseElectionAdminTab implements OnChanges {
    private readonly api = inject(VotingApiService);

    /** Emits after the election's status or details changed, so the host can refresh. */
    @Output() Changed = new EventEmitter<void>();

    public IsLoading = false;
    public LoadError: string | null = null;
    public Election: ElectionRow | null = null;
    public Contests: ContestRow[] = [];
    public Anchors: AnchorRow[] = [];

    public IsBusy = false;
    public ActionError: string | null = null;
    public ActionMessage: string | null = null;
    public Pending: LifecycleAction | null = null;
    public CancelReason = '';

    public Nominations: NominationRow[] = [];
    public NominationError: string | null = null;
    public Deciding: NominationRow | null = null;
    public DecidingKind: 'Approved' | 'Rejected' = 'Approved';
    public DecisionNotes = '';

    public Editing = false;
    public Form = { Name: '', Description: '', OpensAt: '', ClosesAt: '' };

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID'] || changes['ElectionStatus']) {
            void this.Load();
        }
    }

    public get CanEdit(): boolean {
        return !!this.Election && EDITABLE_STATUSES.includes(this.Election.Status);
    }

    /** Nominations are shown once they can exist: a nomination period, or any nomination already on file. */
    public get ShowNominations(): boolean {
        return !!this.Election && (this.Election.Status === 'Nominations' || this.Nominations.length > 0);
    }

    public get CanDecideNominations(): boolean {
        return !!this.Election && NOMINATION_DECIDABLE_STATUSES.includes(this.Election.Status);
    }

    /** Nominations grouped by office contest, in contest order. */
    public get NominationGroups(): NominationGroup[] {
        const groups = new Map<string, NominationGroup>();
        for (const n of this.Nominations) {
            const key = n.ContestID.toLowerCase();
            const group = groups.get(key) ?? { ContestID: n.ContestID, Contest: n.Contest, Rows: [] };
            group.Rows.push(n);
            groups.set(key, group);
        }
        return Array.from(groups.values());
    }

    public IsUndecided(n: NominationRow): boolean {
        return UNDECIDED_NOMINATION_STATUSES.includes(n.Status);
    }

    public get ConfirmText(): string {
        switch (this.Pending) {
            case 'openNominations':
                return 'Opening nominations lets voters and administrators nominate candidates for the office contests. Continue?';
            case 'closeNominations':
                return 'Closing nominations ends the nomination period and makes the election Ready. Approve or reject pending nominations first. Continue?';
            case 'open':
                return 'Opening voting lets eligible voters cast ballots. Continue?';
            case 'close':
                return 'Closing voting stops all further ballots. Continue?';
            case 'cancel':
                return 'Cancelling is permanent: ballots are voided and the election cannot be reopened. Continue?';
            default:
                return '';
        }
    }

    /** Whether the state machine allows moving to the target; 'Open' is the voting-open status. */
    public Can(target: 'Nominations' | 'Ready' | 'Open' | 'Closed' | 'Cancelled'): boolean {
        return !!this.Election && CanTransition(this.Election.Status, target);
    }

    public Ask(action: LifecycleAction): void {
        this.ActionError = null;
        this.ActionMessage = null;
        this.CancelReason = '';
        this.Pending = action;
    }

    public async Load(): Promise<void> {
        if (!this.ElectionID) {
            return;
        }
        this.IsLoading = this.Election === null;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [e, c, a] = await rv.RunViews([
                {
                    EntityName: 'MJ_BizApps_Voting: Elections',
                    ExtraFilter: `ID='${this.ElectionID}'`,
                    ResultType: 'simple',
                    Fields: [
                        'ID', 'Name', 'Description', 'Status', 'ElectionType', 'SecrecyMode', 'AssuranceTier', 'ResultsTiming',
                        'ResultsAudience', 'ResultsMinCast', 'AllowRevote', 'TimeZone', 'RecordDate', 'OpensAt', 'ClosesAt',
                        'RollFrozenAt', 'RollHash', 'Configuration',
                    ],
                },
                {
                    EntityName: 'MJ_BizApps_Voting: Contests',
                    ExtraFilter: `ElectionID='${this.ElectionID}'`,
                    OrderBy: 'Sequence',
                    ResultType: 'simple',
                    Fields: ['ID', 'Name', 'Kind', 'Seats', 'TallyMethod', 'Threshold'],
                },
                {
                    EntityName: 'MJ_BizApps_Voting: Election Anchors',
                    ExtraFilter: `ElectionID='${this.ElectionID}'`,
                    OrderBy: 'Sequence',
                    ResultType: 'simple',
                    Fields: ['ID', 'Entity', 'RecordID', 'Role', 'IsPrimary'],
                },
            ]);
            if (!e.Success || !c.Success || !a.Success) {
                throw new Error(e.ErrorMessage || c.ErrorMessage || a.ErrorMessage || 'The election could not be loaded.');
            }
            const rows = e.Results as ElectionRow[];
            this.Election = rows[0] ?? null;
            if (!this.Election) {
                throw new Error('The election was not found, or you do not have access to it.');
            }
            this.Contests = c.Results as ContestRow[];
            this.Anchors = a.Results as AnchorRow[];
            await this.LoadNominations();
        } catch (error) {
            LogError('[VotingElections] Overview load failed', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'The election could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    /** Nominations of the election's office contests. A failure shows in the panel and does not block the overview. */
    private async LoadNominations(): Promise<void> {
        this.NominationError = null;
        const officeIds = this.Contests.filter((c) => c.Kind === 'Office').map((c) => c.ID);
        if (officeIds.length === 0) {
            this.Nominations = [];
            return;
        }
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<NominationRow>({
            EntityName: 'MJ_BizApps_Voting: Nominations',
            ExtraFilter: `ContestID IN (${officeIds.map((id) => `'${id}'`).join(',')})`,
            OrderBy: 'SubmittedAt',
            ResultType: 'simple',
            Fields: ['ID', 'ContestID', 'Contest', 'NomineePerson', 'NominatedByPerson', 'Status', 'Statement', 'SubmittedAt', 'DecidedAt', 'DecisionNotes'],
        });
        if (!res.Success) {
            this.NominationError = res.ErrorMessage || 'Nominations could not be loaded.';
            this.Nominations = [];
            return;
        }
        // Keep contests in election order rather than the order nominations arrived in.
        const order = new Map(this.Contests.map((c, i) => [c.ID.toLowerCase(), i]));
        this.Nominations = [...res.Results].sort((x, y) => (order.get(x.ContestID.toLowerCase()) ?? 0) - (order.get(y.ContestID.toLowerCase()) ?? 0));
    }

    public BeginDecision(n: NominationRow, kind: 'Approved' | 'Rejected'): void {
        this.NominationError = null;
        this.DecisionNotes = '';
        this.DecidingKind = kind;
        this.Deciding = n;
    }

    public async ConfirmDecision(): Promise<void> {
        const n = this.Deciding;
        if (!n) {
            return;
        }
        this.IsBusy = true;
        this.NominationError = null;
        try {
            const result = await this.api.DecideNomination({ NominationID: n.ID, Decision: this.DecidingKind, Notes: this.DecisionNotes.trim() || undefined });
            if (!result.Success) {
                this.NominationError = result.Message ?? 'The nomination could not be decided.';
                return;
            }
            this.ActionMessage = this.DecidingKind === 'Approved' ? `${n.NomineePerson} was approved and added to the contest.` : `The nomination of ${n.NomineePerson} was rejected.`;
            this.Deciding = null;
            await this.Load();
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
        }
    }

    public async Confirm(): Promise<void> {
        const action = this.Pending;
        if (!action || !this.Election) {
            return;
        }
        this.IsBusy = true;
        this.ActionError = null;
        this.ActionMessage = null;
        try {
            const id = this.Election.ID;
            const result = await this.RunLifecycle(action, id);
            if (!result.Success) {
                this.ActionError = result.Message ?? 'The action failed.';
                return;
            }
            this.ActionMessage = LIFECYCLE_DONE[action];
            this.Pending = null;
            await this.Load();
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
        }
    }

    private RunLifecycle(action: LifecycleAction, id: string): Promise<{ Success: boolean; Message?: string }> {
        switch (action) {
            case 'open':
                return this.api.OpenElection({ ElectionID: id });
            case 'close':
                return this.api.CloseElection({ ElectionID: id });
            case 'openNominations':
                return this.api.OpenNominations({ ElectionID: id });
            case 'closeNominations':
                return this.api.CloseNominations({ ElectionID: id });
            case 'cancel':
                return this.api.CancelElection({ ElectionID: id, Reason: this.CancelReason.trim() });
        }
    }

    public StartEdit(): void {
        if (!this.Election) {
            return;
        }
        this.Form = {
            Name: this.Election.Name,
            Description: this.Election.Description ?? '',
            OpensAt: ToDateTimeLocal(this.Election.OpensAt),
            ClosesAt: ToDateTimeLocal(this.Election.ClosesAt),
        };
        this.ActionError = null;
        this.Editing = true;
    }

    public async SaveEdit(): Promise<void> {
        if (!this.Election) {
            return;
        }
        this.IsBusy = true;
        this.ActionError = null;
        try {
            const result = await this.api.UpdateElection({
                ElectionID: this.Election.ID,
                Name: this.Form.Name.trim(),
                Description: this.Form.Description.trim(),
                OpensAt: FromDateTimeLocal(this.Form.OpensAt),
                ClosesAt: FromDateTimeLocal(this.Form.ClosesAt),
            });
            if (!result.Success) {
                this.ActionError = result.Message ?? 'The changes could not be saved.';
                return;
            }
            this.Editing = false;
            this.ActionMessage = 'Changes saved.';
            await this.Load();
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
        }
    }
}
