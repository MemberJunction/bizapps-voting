/**
 * RollTab — the voter roll: a paged, searchable list of eligible voters, the freeze action,
 * amendment through a People search, removal, and challenge decisions.
 */
import { Component, EventEmitter, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EscapeSQLString } from '@memberjunction/global';
import { LogError, RunView } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import { VotingApiService } from '../../shared/voting-api.service';
import { ELECTION_COMMON_STYLES } from '../election-styles';

interface VoterRow {
    ID: string;
    PersonID: string;
    Person: string;
    RepresentingOrganization: string | null;
    VotingClass: string | null;
    Weight: number;
    Status: 'Challenged' | 'Eligible' | 'Removed';
    StatusReason: string | null;
    AddedAfterFreeze: boolean;
}

interface PersonHit {
    ID: string;
    DisplayName: string;
    Email: string | null;
}

interface RollState {
    RollFrozenAt: string | null;
    RollHash: string | null;
}

type RowAction = { VoterID: string; Kind: 'remove' | 'challenge' | 'decide' } | null;

const PAGE_SIZE = 25;
const PEOPLE_ENTITY = 'MJ_BizApps_Common: People';

@Component({
    selector: 'election-roll-tab',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective],
    template: `
        <section class="panel" aria-labelledby="roll-freeze">
            <h3 id="roll-freeze"><i class="fa-solid fa-snowflake"></i> Roll status</h3>
            @if (Roll?.RollFrozenAt) {
                <p>Frozen {{ Roll?.RollFrozenAt | date: 'medium' }}. Changes after the freeze are recorded as amendments.</p>
                @if (Roll?.RollHash) {
                    <p class="small">Roll hash <code>{{ Roll?.RollHash }}</code></p>
                }
            } @else {
                <p>The roll is not frozen. Freezing fixes the eligible voters and records a verifiable hash of the roll.</p>
                @if (IsAdministrator) {
                    @if (!ConfirmFreeze) {
                        <button type="button" mjButton variant="primary" size="sm" (click)="ConfirmFreeze = true" [disabled]="IsBusy">
                            <i class="fa-solid fa-snowflake"></i> Freeze roll
                        </button>
                    } @else {
                        <div class="actions">
                            <span class="confirm-text">Freeze the roll now? Later changes become tracked amendments.</span>
                            <button type="button" mjButton variant="primary" size="sm" (click)="Freeze()" [disabled]="IsBusy">
                                <i class="fa-solid fa-check"></i> Yes, freeze
                            </button>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="ConfirmFreeze = false" [disabled]="IsBusy">Cancel</button>
                        </div>
                    }
                }
            }
        </section>

        <div aria-live="polite">
            @if (ActionError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ ActionError }}</span></div>
            }
            @if (ActionMessage) {
                <div class="banner banner-ok"><i class="fa-solid fa-circle-check"></i><span>{{ ActionMessage }}</span></div>
            }
        </div>

        @if (IsAdministrator) {
            <section class="panel" aria-labelledby="roll-add">
                <h3 id="roll-add"><i class="fa-solid fa-user-plus"></i> Add a voter</h3>
                <form class="search-row" (ngSubmit)="SearchPeople()" role="search">
                    <label for="people-q" class="sr-only">Search people by name or email</label>
                    <input id="people-q" name="peopleq" class="input" type="search" placeholder="Search people by name or email" [(ngModel)]="PeopleQuery" />
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
                                <button type="button" mjButton variant="secondary" size="sm" (click)="PickPerson(p)">
                                    <i class="fa-solid fa-plus"></i> Select
                                </button>
                            </li>
                        }
                    </ul>
                }
                @if (Picked) {
                    <form class="add-form" (ngSubmit)="AddPicked()">
                        <p><strong>{{ Picked.DisplayName }}</strong> will be added to the roll.</p>
                        <div class="field-grid">
                            <div class="field">
                                <label for="add-class">Voting class (optional)</label>
                                <input id="add-class" name="vclass" class="input" [(ngModel)]="AddClass" />
                            </div>
                            <div class="field">
                                <label for="add-weight">Weight</label>
                                <input id="add-weight" name="weight" class="input" type="number" min="0" step="any" [(ngModel)]="AddWeight" />
                            </div>
                        </div>
                        <div class="actions">
                            <button type="submit" mjButton variant="primary" size="sm" [disabled]="IsBusy || AddWeight <= 0">
                                <i class="fa-solid fa-user-plus"></i> Add to roll
                            </button>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="Picked = null" [disabled]="IsBusy">Cancel</button>
                        </div>
                    </form>
                }
            </section>
        }

        <section aria-labelledby="roll-list">
            <div class="list-head">
                <h3 id="roll-list">Voters <span class="muted">({{ Total }})</span></h3>
                <form class="search-row" (ngSubmit)="ApplyFilters()" role="search">
                    <label for="roll-q" class="sr-only">Search voters by name</label>
                    <input id="roll-q" name="rollq" class="input" type="search" placeholder="Search voters" [(ngModel)]="Search" />
                    <label for="roll-status" class="sr-only">Filter by status</label>
                    <select id="roll-status" name="rollstatus" class="input status-select" [(ngModel)]="StatusFilter" (ngModelChange)="ApplyFilters()">
                        <option value="">All statuses</option>
                        <option value="Eligible">Eligible</option>
                        <option value="Challenged">Challenged</option>
                        <option value="Removed">Removed</option>
                    </select>
                    <button type="submit" mjButton variant="secondary" size="sm"><i class="fa-solid fa-magnifying-glass"></i> Search</button>
                </form>
            </div>

            @if (IsLoading) {
                <div class="state-box"><mj-loading text="Loading voters..." size="large"></mj-loading></div>
            } @else if (LoadError) {
                <div class="banner banner-error" role="alert">
                    <i class="fa-solid fa-triangle-exclamation"></i><span>{{ LoadError }}</span>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="LoadPage()">Retry</button>
                </div>
            } @else if (Voters.length === 0) {
                <div class="state-box empty">
                    <i class="fa-solid fa-users-slash"></i>
                    <p>{{ Search || StatusFilter ? 'No voters match these filters.' : 'The roll is empty. Add voters above, or build the roll from the eligibility source.' }}</p>
                </div>
            } @else {
                <div class="table-wrap">
                    <table class="grid">
                        <thead>
                            <tr>
                                <th scope="col">Voter</th>
                                <th scope="col">Organization</th>
                                <th scope="col">Class</th>
                                <th scope="col" class="num">Weight</th>
                                <th scope="col">Status</th>
                                <th scope="col"><span class="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (v of Voters; track v.ID) {
                                <tr>
                                    <th scope="row">
                                        {{ v.Person }}
                                        @if (v.AddedAfterFreeze) {
                                            <span class="chip chip-info">Added after freeze</span>
                                        }
                                    </th>
                                    <td>{{ v.RepresentingOrganization || '' }}</td>
                                    <td>{{ v.VotingClass || '' }}</td>
                                    <td class="num">{{ v.Weight }}</td>
                                    <td>
                                        <span class="chip" [class.chip-ok]="v.Status === 'Eligible'" [class.chip-warn]="v.Status === 'Challenged'" [class.chip-bad]="v.Status === 'Removed'">{{ v.Status }}</span>
                                        @if (v.StatusReason) {
                                            <div class="muted small">{{ v.StatusReason }}</div>
                                        }
                                    </td>
                                    <td>
                                        @if (IsAdministrator && v.Status !== 'Removed') {
                                            <div class="row-actions">
                                                @if (v.Status === 'Eligible') {
                                                    <button type="button" mjButton variant="secondary" size="sm" (click)="BeginAction(v, 'challenge')" [attr.aria-label]="'Challenge ' + v.Person">Challenge</button>
                                                } @else {
                                                    <button type="button" mjButton variant="secondary" size="sm" (click)="BeginAction(v, 'decide')" [attr.aria-label]="'Decide challenge for ' + v.Person">Decide</button>
                                                }
                                                <button type="button" mjButton variant="secondary" size="sm" (click)="BeginAction(v, 'remove')" [attr.aria-label]="'Remove ' + v.Person">Remove</button>
                                            </div>
                                        }
                                    </td>
                                </tr>
                                @if (Action && Action.VoterID === v.ID) {
                                    <tr class="action-row">
                                        <td colspan="6">
                                            <form (ngSubmit)="SubmitAction(v)">
                                                <div class="field">
                                                    <label [for]="'reason-' + v.ID">
                                                        {{ Action.Kind === 'remove' ? 'Reason for removal' : Action.Kind === 'challenge' ? 'Grounds for the challenge' : 'Reason for the decision' }} (required)
                                                    </label>
                                                    <textarea [id]="'reason-' + v.ID" name="reason" class="input" rows="2" [(ngModel)]="Reason"></textarea>
                                                </div>
                                                @if (Action.Kind === 'decide') {
                                                    <fieldset class="field">
                                                        <legend>Decision</legend>
                                                        <div class="checks">
                                                            <label class="check"><input type="radio" name="decision" value="Uphold" [(ngModel)]="Decision" /> Uphold the challenge (remove from roll)</label>
                                                            <label class="check"><input type="radio" name="decision" value="Reject" [(ngModel)]="Decision" /> Reject the challenge (stays eligible)</label>
                                                        </div>
                                                    </fieldset>
                                                }
                                                <div class="actions">
                                                    <button type="submit" mjButton variant="primary" size="sm" [disabled]="IsBusy || !Reason.trim()">
                                                        <i class="fa-solid fa-check"></i> Submit
                                                    </button>
                                                    <button type="button" mjButton variant="secondary" size="sm" (click)="Action = null" [disabled]="IsBusy">Cancel</button>
                                                </div>
                                            </form>
                                        </td>
                                    </tr>
                                }
                            }
                        </tbody>
                    </table>
                </div>
                <div class="pager" role="navigation" aria-label="Roll pages">
                    <button type="button" mjButton variant="secondary" size="sm" (click)="GoTo(Page - 1)" [disabled]="Page <= 1">
                        <i class="fa-solid fa-chevron-left"></i> Previous
                    </button>
                    <span>Page {{ Page }} of {{ PageCount }}</span>
                    <button type="button" mjButton variant="secondary" size="sm" (click)="GoTo(Page + 1)" [disabled]="Page >= PageCount">
                        Next <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
            }
        </section>
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .search-row { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
            .search-row .input { flex: 1; min-width: 12rem; width: auto; }
            .search-row .status-select { flex: 0 0 auto; }
            .list-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
            .list-head h3 { margin: 0; color: var(--mj-text-primary); font-size: 1.05rem; }
            .people { list-style: none; padding: 0; margin: 0.75rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }
            .people li { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.4rem 0.6rem; border: 1px solid var(--mj-border-subtle); border-radius: 6px; background: var(--mj-bg-surface-card); }
            .add-form { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--mj-border-subtle); }
            .action-row td { background: var(--mj-bg-surface-card); }
            .pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 0.75rem; color: var(--mj-text-secondary); }
        `,
    ],
})
export class RollTabComponent extends BaseElectionAdminTab implements OnChanges {
    private readonly api = inject(VotingApiService);

    @Output() Changed = new EventEmitter<void>();

    public Roll: RollState | null = null;
    public Voters: VoterRow[] = [];
    public Total = 0;
    public Page = 1;
    public Search = '';
    public StatusFilter = '';
    public IsLoading = false;
    public LoadError: string | null = null;

    public IsBusy = false;
    public ActionError: string | null = null;
    public ActionMessage: string | null = null;
    public ConfirmFreeze = false;

    public PeopleQuery = '';
    public People: PersonHit[] = [];
    public PeopleSearched = false;
    public PeopleError: string | null = null;
    public IsSearching = false;
    public Picked: PersonHit | null = null;
    public AddClass = '';
    public AddWeight = 1;

    public Action: RowAction = null;
    public Reason = '';
    public Decision: 'Uphold' | 'Reject' = 'Reject';

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID']) {
            this.Page = 1;
            void this.LoadAll();
        }
    }

    public get PageCount(): number {
        return Math.max(1, Math.ceil(this.Total / PAGE_SIZE));
    }

    public async LoadAll(): Promise<void> {
        await Promise.all([this.LoadRollState(), this.LoadPage()]);
    }

    public ApplyFilters(): void {
        this.Page = 1;
        void this.LoadPage();
    }

    public GoTo(page: number): void {
        if (page < 1 || page > this.PageCount) {
            return;
        }
        this.Page = page;
        void this.LoadPage();
    }

    public async LoadPage(): Promise<void> {
        if (!this.ElectionID) {
            return;
        }
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const filters = [`ElectionID='${this.ElectionID}'`];
            if (this.StatusFilter) {
                filters.push(`Status='${EscapeSQLString(this.StatusFilter)}'`);
            }
            if (this.Search.trim()) {
                filters.push(`Person LIKE '%${EscapeSQLString(this.Search.trim())}%'`);
            }
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView<VoterRow>({
                EntityName: 'MJ_BizApps_Voting: Eligible Voters',
                ExtraFilter: filters.join(' AND '),
                OrderBy: 'Person',
                ResultType: 'simple',
                Fields: ['ID', 'PersonID', 'Person', 'RepresentingOrganization', 'VotingClass', 'Weight', 'Status', 'StatusReason', 'AddedAfterFreeze'],
                StartRow: (this.Page - 1) * PAGE_SIZE,
                MaxRows: PAGE_SIZE,
            });
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'The roll could not be loaded.');
            }
            this.Voters = res.Results;
            this.Total = res.TotalRowCount;
        } catch (error) {
            LogError('[VotingElections] Roll load failed', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'The roll could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    private async LoadRollState(): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<RollState>({
            EntityName: 'MJ_BizApps_Voting: Elections',
            ExtraFilter: `ID='${this.ElectionID}'`,
            ResultType: 'simple',
            Fields: ['RollFrozenAt', 'RollHash'],
        });
        this.Roll = res.Success ? (res.Results[0] ?? null) : null;
    }

    public async Freeze(): Promise<void> {
        await this.Run(async () => {
            const r = await this.api.FreezeRoll({ ElectionID: this.ElectionID });
            if (r.Success) {
                this.ConfirmFreeze = false;
                this.ActionMessage = `Roll frozen with ${r.Output?.VoterCount ?? 0} voters.`;
            }
            return r;
        });
    }

    public async SearchPeople(): Promise<void> {
        const q = this.PeopleQuery.trim();
        if (q.length < 2) {
            return;
        }
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
            if (!res.Success) {
                throw new Error(res.ErrorMessage || 'The search failed.');
            }
            this.People = res.Results;
            this.PeopleSearched = true;
        } catch (error) {
            LogError('[VotingElections] People search failed', undefined, error);
            this.PeopleError = error instanceof Error ? error.message : 'The search failed.';
        } finally {
            this.IsSearching = false;
        }
    }

    public PickPerson(p: PersonHit): void {
        this.Picked = p;
        this.AddClass = '';
        this.AddWeight = 1;
    }

    public async AddPicked(): Promise<void> {
        const person = this.Picked;
        if (!person) {
            return;
        }
        await this.Run(async () => {
            const r = await this.api.AmendRoll({
                ElectionID: this.ElectionID,
                Add: [{ PersonID: person.ID, VotingClass: this.AddClass.trim() || undefined, Weight: this.AddWeight }],
            });
            if (r.Success) {
                this.ActionMessage = `${person.DisplayName} was added to the roll.`;
                this.Picked = null;
                this.People = [];
                this.PeopleSearched = false;
            }
            return r;
        });
    }

    public BeginAction(v: VoterRow, kind: 'remove' | 'challenge' | 'decide'): void {
        this.Action = { VoterID: v.ID, Kind: kind };
        this.Reason = '';
        this.Decision = 'Reject';
    }

    public async SubmitAction(v: VoterRow): Promise<void> {
        const action = this.Action;
        if (!action || !this.Reason.trim()) {
            return;
        }
        await this.Run(async () => {
            const reason = this.Reason.trim();
            if (action.Kind === 'remove') {
                const r = await this.api.AmendRoll({ ElectionID: this.ElectionID, Remove: [{ EligibleVoterID: v.ID, Reason: reason }] });
                if (r.Success) {
                    this.ActionMessage = `${v.Person} was removed from the roll.`;
                }
                return r;
            }
            const r = await this.api.ChallengeVoter({
                EligibleVoterID: v.ID,
                Reason: reason,
                Decision: action.Kind === 'decide' ? this.Decision : undefined,
            });
            if (r.Success) {
                this.ActionMessage = action.Kind === 'challenge' ? `${v.Person} was challenged.` : `Decision recorded for ${v.Person}.`;
            }
            return r;
        });
    }

    /** Runs a mutation, surfaces its failure, and on success refreshes the roll and tells the host. */
    private async Run(work: () => Promise<{ Success: boolean; Message?: string }>): Promise<void> {
        this.IsBusy = true;
        this.ActionError = null;
        this.ActionMessage = null;
        try {
            const result = await work();
            if (!result.Success) {
                this.ActionError = result.Message ?? 'The action failed.';
                return;
            }
            this.Action = null;
            await this.LoadAll();
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
        }
    }
}
