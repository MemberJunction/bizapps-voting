/**
 * PaperTab — staff entry of paper, in-person and proxy ballots. The control number identifies the voter on the
 * server; here staff pick the channel (and, for a proxy ballot, the accepted designation), fill the same contest
 * form the voter sees, review, and record the ballot with Voting.EnterPaperBallot. The server rebuilds the voter's
 * real ballot style and validates the submission against it.
 */
import { Component, EventEmitter, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LogError, RunView } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { BaseElectionAdminTab } from '@mj-biz-apps/voting-ng-widgets';
import type { ValidationIssue, VotingBallotStyle, VotingBallotStyleContest } from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { BallotContestComponent } from '../../ballot/ballot-contest.component';
import {
    BuildContestSubmission,
    BuildSubmission,
    FriendlyIssueMessage,
    NewBallotState,
    NewContestState,
    ValidateBallot,
    type ContestState,
} from '../../ballot/ballot-model';
import {
    BuildPaperStyle,
    ControlNumberLooksValid,
    type PaperContestRow,
    type PaperElectionRow,
    type PaperOptionRow,
} from '../../ballot/paper-ballot-model';
import { VotingApiService } from '../../shared/voting-api.service';
import { ELECTION_COMMON_STYLES } from '../election-styles';

type Channel = 'Paper' | 'InPerson' | 'Proxy';
type Step = 'entry' | 'review' | 'done';

interface ProxyChoice {
    ID: string;
    Label: string;
}

interface ContestRowRaw {
    ID: string;
    Name: string;
    Description: string | null;
    Sequence: number;
    Kind: PaperContestRow['Kind'];
    Seats: number;
    AllowAbstain: boolean;
    AllowWriteIn: boolean;
    MinSelections: number;
    MaxSelections: number | null;
    VotingClassFilter: string | null;
    TallyMethodID: string;
}

@Component({
    selector: 'election-paper-tab',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective, BallotContestComponent],
    template: `
        <div aria-live="polite">
            @if (LoadError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ LoadError }}</span></div>
            }
            @if (ActionError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ ActionError }}</span></div>
            }
        </div>

        @if (!IsAdministrator) {
            <p class="muted small">Only voting administrators can enter paper and proxy ballots.</p>
        } @else if (ElectionStatus !== 'Open') {
            <p class="muted">Paper, in-person and proxy ballots can be entered only while the election is Open.</p>
        } @else if (IsLoading) {
            <p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading the ballot...</p>
        } @else if (CurrentStep === 'done') {
            <section class="panel" aria-labelledby="pp-done">
                <h3 id="pp-done"><i class="fa-solid fa-circle-check"></i> Ballot recorded</h3>
                <div class="banner banner-ok" role="status"><i class="fa-solid fa-circle-check"></i><span>The ballot was recorded.</span></div>
                @if (ReceiptCode) {
                    <p>Receipt code: <code class="receipt">{{ ReceiptCode }}</code></p>
                    <p class="hint">Give this code to the voter if they asked for one. It does not reveal how they voted.</p>
                }
                <button type="button" mjButton variant="primary" size="sm" (click)="NextBallot()"><i class="fa-solid fa-plus"></i> Enter another ballot</button>
            </section>
        } @else if (CurrentStep === 'review') {
            <section class="panel" aria-labelledby="pp-review">
                <h3 id="pp-review"><i class="fa-solid fa-clipboard-check"></i> Review the ballot</h3>
                <p class="hint">Channel: <strong>{{ ChannelLabel }}</strong>. Check each choice against the paper ballot. Nothing is recorded until you confirm.</p>
                <ol class="review-list">
                    @for (r of ReviewRows; track r.ContestID) {
                        <li class="review-item">
                            <strong>{{ r.Name }}</strong>
                            @if (r.Abstain) {
                                <p class="muted">Abstain.</p>
                            } @else if (r.Choices.length === 0) {
                                <p class="muted">No selection (left blank).</p>
                            } @else {
                                <ul>
                                    @for (c of r.Choices; track c) {
                                        <li>{{ c }}</li>
                                    }
                                </ul>
                            }
                            @if (r.Comment) {
                                <p class="small"><strong>Comment:</strong> {{ r.Comment }}</p>
                            }
                        </li>
                    }
                </ol>
                <div class="actions">
                    <button type="button" mjButton variant="secondary" size="sm" (click)="CurrentStep = 'entry'" [disabled]="IsBusy"><i class="fa-solid fa-arrow-left"></i> Back to edit</button>
                    @if (!ConfirmRecord) {
                        <button type="button" mjButton variant="primary" size="sm" (click)="ConfirmRecord = true" [disabled]="IsBusy"><i class="fa-solid fa-check"></i> Record ballot</button>
                    } @else {
                        <span class="confirm-text">Record this ballot? The control number is used up and this cannot be undone.</span>
                        <button type="button" mjButton variant="primary" size="sm" (click)="Record()" [disabled]="IsBusy">
                            <i class="fa-solid" [class.fa-check]="!IsBusy" [class.fa-spinner]="IsBusy" [class.fa-spin]="IsBusy"></i> Yes, record
                        </button>
                        <button type="button" mjButton variant="secondary" size="sm" (click)="ConfirmRecord = false" [disabled]="IsBusy">Cancel</button>
                    }
                </div>
            </section>
        } @else {
            <section class="panel" aria-labelledby="pp-who">
                <h3 id="pp-who"><i class="fa-solid fa-file-pen"></i> Paper ballots</h3>
                <p class="hint">Enter a ballot on behalf of a voter. The control number identifies the voter; it is checked when you record the ballot.</p>
                <div class="field-grid">
                    <div class="field">
                        <label for="pp-cn">Control number</label>
                        <input id="pp-cn" name="cn" class="input mono" [(ngModel)]="ControlNumber" autocomplete="off" spellcheck="false" />
                    </div>
                    <div class="field">
                        <label for="pp-channel">Channel</label>
                        <select id="pp-channel" name="channel" class="input" [ngModel]="Channel" (ngModelChange)="OnChannelChanged($event)">
                            <option value="Paper">Paper</option>
                            <option value="InPerson">In person</option>
                            <option value="Proxy">Proxy</option>
                        </select>
                    </div>
                    @if (Channel === 'Proxy') {
                        <div class="field">
                            <label for="pp-proxy">Accepted proxy designation</label>
                            <select id="pp-proxy" name="proxy" class="input" [(ngModel)]="ProxyDesignationID">
                                <option [ngValue]="null">Choose a designation...</option>
                                @for (p of Proxies; track p.ID) {
                                    <option [ngValue]="p.ID">{{ p.Label }}</option>
                                }
                            </select>
                            @if (Proxies.length === 0) {
                                <p class="hint">There are no Accepted proxy designations. Accept one on the Roll tab first.</p>
                            }
                        </div>
                    }
                    <div class="field">
                        <label for="pp-class">Voter's voting class (optional)</label>
                        <input id="pp-class" name="class" class="input" [ngModel]="VotingClass" (ngModelChange)="OnClassChanged($event)" autocomplete="off" />
                        <p class="hint">Shows only the contests for that class, as printed on the paper ballot.</p>
                    </div>
                </div>
            </section>

            @if (Style && Style.Contests.length === 0) {
                <p class="muted">No contests apply to that voting class.</p>
            }
            @if (Style && Style.Contests.length > 0) {
                @if (ShowErrors && TotalIssueCount > 0) {
                    <div class="banner banner-error" role="alert">
                        <i class="fa-solid fa-circle-exclamation"></i>
                        <span>Please fix {{ TotalIssueCount }} {{ TotalIssueCount === 1 ? 'problem' : 'problems' }} below before reviewing.</span>
                    </div>
                }
                <form class="contests" (ngSubmit)="GoToReview()" novalidate>
                    @for (contest of Style.Contests; track contest.ContestID) {
                        <voting-ballot-contest
                            [Contest]="contest"
                            [State]="StateFor(contest)"
                            [Errors]="ShowErrors ? ErrorsFor(contest) : []"
                            (Changed)="OnContestChanged()"
                        ></voting-ballot-contest>
                    }
                    <div class="actions">
                        <button type="submit" mjButton variant="primary" size="sm" [disabled]="!HeaderComplete">
                            Review ballot <i class="fa-solid fa-arrow-right"></i>
                        </button>
                        @if (!HeaderComplete) {
                            <span class="muted small">{{ HeaderHint }}</span>
                        }
                    </div>
                </form>
            }
        }
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .contests { display: flex; flex-direction: column; gap: 1rem; }
            .review-list { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
            .review-item { padding: 0.6rem 0.8rem; border: 1px solid var(--mj-border-subtle); border-radius: 8px; background: var(--mj-bg-surface-card); color: var(--mj-text-primary); }
            .review-item ul { margin: 0.25rem 0 0; padding-left: 1.25rem; }
            .receipt { font-size: 1.15rem; letter-spacing: 0.08em; user-select: all; }
        `,
    ],
})
export class PaperTabComponent extends BaseElectionAdminTab implements OnChanges, OnDestroy {
    private readonly api = inject(VotingApiService);

    @Output() Changed = new EventEmitter<void>();

    public CurrentStep: Step = 'entry';
    public IsLoading = false;
    public LoadError: string | null = null;
    public ActionError: string | null = null;
    public IsBusy = false;
    public ConfirmRecord = false;

    public ControlNumber = '';
    public Channel: Channel = 'Paper';
    public ProxyDesignationID: string | null = null;
    public VotingClass = '';
    public Proxies: ProxyChoice[] = [];
    public ReceiptCode: string | null = null;

    public Style: VotingBallotStyle | null = null;
    public States: ContestState[] = [];
    public ShowErrors = false;
    public IssuesByContest = new Map<string, ValidationIssue[]>();

    private election: PaperElectionRow | null = null;
    private contests: PaperContestRow[] = [];
    private options: PaperOptionRow[] = [];

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['ElectionID'] || changes['ElectionStatus']) {
            this.Reset();
            if (changes['ElectionID']) {
                void this.LoadDefinition();
            }
        }
    }

    ngOnDestroy(): void {
        this.ControlNumber = '';
    }

    public get ChannelLabel(): string {
        return this.Channel === 'InPerson' ? 'In person' : this.Channel;
    }

    public get HeaderComplete(): boolean {
        return ControlNumberLooksValid(this.ControlNumber) && (this.Channel !== 'Proxy' || !!this.ProxyDesignationID);
    }

    public get HeaderHint(): string {
        if (!ControlNumberLooksValid(this.ControlNumber)) return 'Enter the control number first.';
        return 'Choose the proxy designation first.';
    }

    public get TotalIssueCount(): number {
        let n = 0;
        for (const list of this.IssuesByContest.values()) n += list.length;
        return n;
    }

    public get ReviewRows(): Array<{ ContestID: string; Name: string; Abstain: boolean; Choices: string[]; Comment: string }> {
        const style = this.Style;
        if (!style) return [];
        return style.Contests.map((contest) => {
            const state = this.StateFor(contest);
            const submission = BuildContestSubmission(contest, state);
            const choices = (submission.Selections ?? []).map((s) => {
                const label = contest.Options.find((o) => o.OptionID === s.OptionID)?.Label ?? s.OptionID;
                return s.WriteInText ? `${label}: ${s.WriteInText}` : label;
            });
            return { ContestID: contest.ContestID, Name: contest.Name, Abstain: state.Abstain, Choices: choices, Comment: submission.Comments?.[0]?.Comment ?? '' };
        });
    }

    private async LoadDefinition(): Promise<void> {
        if (!this.ElectionID) return;
        const electionId = this.ElectionID;
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            await VotingEngineBase.Instance.Config(false, undefined, this.ProviderToUse);
            const [elRes, cRes, pRes] = await rv.RunViews([
                { EntityName: 'MJ_BizApps_Voting: Elections', ExtraFilter: `ID='${electionId}'`, ResultType: 'simple', Fields: ['ID', 'Name', 'Description', 'SecrecyMode', 'AllowRevote', 'ClosesAt'] },
                { EntityName: 'MJ_BizApps_Voting: Contests', ExtraFilter: `ElectionID='${electionId}'`, OrderBy: 'Sequence', ResultType: 'simple', Fields: ['ID', 'Name', 'Description', 'Sequence', 'Kind', 'Seats', 'AllowAbstain', 'AllowWriteIn', 'MinSelections', 'MaxSelections', 'VotingClassFilter', 'TallyMethodID'] },
                { EntityName: 'MJ_BizApps_Voting: Proxy Designations', ExtraFilter: `ElectionID='${electionId}' AND Status='Accepted'`, OrderBy: 'ReceivedAt', ResultType: 'simple', Fields: ['ID', 'GrantorEligibleVoterID', 'ProxyPerson'] },
            ]);
            if (!elRes.Success || !cRes.Success || !pRes.Success) {
                throw new Error(elRes.ErrorMessage || cRes.ErrorMessage || pRes.ErrorMessage || 'The ballot definition could not be loaded.');
            }
            if (this.ElectionID !== electionId) return;
            const election = (elRes.Results as PaperElectionRow[])[0];
            if (!election) throw new Error('The election was not found, or you do not have access to it.');
            this.election = election;
            const contestRows = cRes.Results as ContestRowRaw[];
            this.contests = contestRows.map((c) => {
                const method = VotingEngineBase.Instance.GetTallyMethodByID(c.TallyMethodID);
                return { ...c, TallyCode: method?.Code ?? '', IsRanked: method?.IsRanked ?? false };
            });
            this.options = [];
            if (contestRows.length > 0) {
                const oRes = await rv.RunView<PaperOptionRow>({
                    EntityName: 'MJ_BizApps_Voting: Contest Options',
                    ExtraFilter: `ContestID IN (${contestRows.map((c) => `'${c.ID}'`).join(',')})`,
                    ResultType: 'simple',
                    Fields: ['ID', 'ContestID', 'Label', 'Description', 'Sequence', 'IsWriteIn', 'Status'],
                });
                if (!oRes.Success) throw new Error(oRes.ErrorMessage || 'Contest options could not be loaded.');
                this.options = oRes.Results;
            }
            const grantors = await this.LoadGrantorNames((pRes.Results as Array<{ GrantorEligibleVoterID: string }>).map((p) => p.GrantorEligibleVoterID));
            this.Proxies = (pRes.Results as Array<{ ID: string; GrantorEligibleVoterID: string; ProxyPerson: string }>).map((p) => ({
                ID: p.ID,
                Label: `${grantors.get(p.GrantorEligibleVoterID.toLowerCase()) ?? 'Unknown voter'} gives proxy to ${p.ProxyPerson}`,
            }));
            this.RebuildStyle();
        } catch (error) {
            LogError('[VotingElections] Failed to load paper ballot definition', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'The ballot definition could not be loaded.';
        } finally {
            this.IsLoading = false;
        }
    }

    private async LoadGrantorNames(ids: string[]): Promise<Map<string, string>> {
        const names = new Map<string, string>();
        const unique = Array.from(new Set(ids));
        if (unique.length === 0) return names;
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<{ ID: string; Person: string }>({
            EntityName: 'MJ_BizApps_Voting: Eligible Voters',
            ExtraFilter: `ID IN (${unique.map((id) => `'${id}'`).join(',')})`,
            ResultType: 'simple',
            Fields: ['ID', 'Person'],
        });
        if (res.Success) {
            for (const v of res.Results) names.set(v.ID.toLowerCase(), v.Person);
        }
        return names;
    }

    private RebuildStyle(): void {
        if (!this.election) return;
        this.Style = BuildPaperStyle(this.election, this.contests, this.options, this.VotingClass);
        this.States = NewBallotState(this.Style);
        this.IssuesByContest = new Map();
        this.ShowErrors = false;
    }

    public OnChannelChanged(channel: Channel): void {
        this.Channel = channel;
        if (channel !== 'Proxy') this.ProxyDesignationID = null;
    }

    public OnClassChanged(value: string): void {
        this.VotingClass = value;
        this.RebuildStyle();
    }

    public StateFor(contest: VotingBallotStyleContest): ContestState {
        let state = this.States.find((s) => s.ContestID === contest.ContestID);
        if (!state) {
            state = NewContestState(contest);
            this.States.push(state);
        }
        return state;
    }

    public ErrorsFor(contest: VotingBallotStyleContest): string[] {
        return (this.IssuesByContest.get(contest.ContestID) ?? []).map((i) => FriendlyIssueMessage(i, contest));
    }

    public OnContestChanged(): void {
        if (this.ShowErrors) this.Revalidate();
    }

    private Revalidate(): void {
        if (!this.Style) return;
        this.IssuesByContest = ValidateBallot(this.Style, BuildSubmission(this.Style, this.States));
    }

    public GoToReview(): void {
        if (!this.HeaderComplete) return;
        this.Revalidate();
        this.ShowErrors = true;
        if (this.TotalIssueCount > 0) return;
        this.ActionError = null;
        this.ConfirmRecord = false;
        this.CurrentStep = 'review';
    }

    public async Record(): Promise<void> {
        const style = this.Style;
        if (!style || this.IsBusy) return;
        this.IsBusy = true;
        this.ActionError = null;
        try {
            const r = await this.api.EnterPaperBallot({
                ElectionID: this.ElectionID,
                ControlNumber: this.ControlNumber.trim(),
                Submission: BuildSubmission(style, this.States),
                Channel: this.Channel,
                ProxyDesignationID: this.Channel === 'Proxy' ? (this.ProxyDesignationID ?? undefined) : undefined,
            });
            if (!r.Success) {
                this.ActionError = r.Message ?? 'The ballot could not be recorded.';
                this.ConfirmRecord = false;
                return;
            }
            this.ReceiptCode = r.Output?.ReceiptCode ?? null;
            this.ControlNumber = '';
            this.CurrentStep = 'done';
            this.Changed.emit();
        } finally {
            this.IsBusy = false;
        }
    }

    /** Starts the next ballot; the definition is reloaded because a used proxy designation is no longer available. */
    public NextBallot(): void {
        this.Reset();
        void this.LoadDefinition();
    }

    /** Back to a blank entry form. The control number is never kept between ballots. */
    public Reset(): void {
        this.CurrentStep = 'entry';
        this.ControlNumber = '';
        this.Channel = 'Paper';
        this.ProxyDesignationID = null;
        this.ReceiptCode = null;
        this.ActionError = null;
        this.ConfirmRecord = false;
        this.ShowErrors = false;
        if (this.election) {
            this.RebuildStyle();
        }
    }
}
