/**
 * BallotContestComponent — one contest on the ballot form. Renders radio, checkbox or ranked
 * selection according to the contest's rules, plus abstain, write-in and standards comments.
 * It edits the ContestState it is given in place and reports changes through `Changed`.
 */
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { VotingBallotStyleContest, VotingBallotStyleOption } from '@mj-biz-apps/voting-entities';
import { CommentIsRequired, ContestTakesComments, type CommentType, type ContestState } from './ballot-model';

@Component({
    selector: 'voting-ballot-contest',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <fieldset class="contest" [attr.aria-describedby]="DescribedBy" [class.has-errors]="Errors.length > 0">
            <legend>
                <span class="contest-name">{{ Contest.Name }}</span>
                <span class="contest-kind">{{ Contest.Kind }}</span>
            </legend>

            @if (Contest.Description) {
                <p class="description">{{ Contest.Description }}</p>
            }
            <p class="instructions" [id]="'inst-' + Contest.ContestID">{{ Instructions }}</p>

            @if (Contest.AllowAbstain) {
                <label class="abstain">
                    <input type="checkbox" [checked]="State.Abstain" (change)="ToggleAbstain()" />
                    <span>Abstain on this contest</span>
                </label>
            }

            @if (Contest.IsRanked) {
                <div class="ranked">
                    <h4 [id]="'rank-h-' + Contest.ContestID">Your ranking</h4>
                    @if (State.Selected.length === 0) {
                        <p class="muted">Nothing ranked yet. Add options from the list below, in order of preference.</p>
                    } @else {
                        <ol class="rank-list" [attr.aria-labelledby]="'rank-h-' + Contest.ContestID">
                            @for (id of State.Selected; track id; let i = $index; let first = $first; let last = $last) {
                                <li class="rank-item" tabindex="0" (keydown)="OnRankKey($event, i)" [attr.aria-label]="RankLabel(id, i)">
                                    <span class="rank-no" aria-hidden="true">{{ i + 1 }}</span>
                                    <span class="rank-label">{{ Option(id)?.Label }}</span>
                                    @if (Option(id)?.IsWriteIn) {
                                        <input class="writein" type="text" maxlength="500" placeholder="Write-in name" [attr.aria-label]="'Write-in name for rank ' + (i + 1)" [ngModel]="State.WriteIns[id] ?? ''" (ngModelChange)="SetWriteIn(id, $event)" [ngModelOptions]="{ standalone: true }" />
                                    }
                                    <span class="rank-controls">
                                        <button type="button" class="icon-btn" (click)="Move(i, -1)" [disabled]="first || State.Abstain" [attr.aria-label]="'Move ' + Option(id)?.Label + ' up'">
                                            <i class="fa-solid fa-arrow-up"></i>
                                        </button>
                                        <button type="button" class="icon-btn" (click)="Move(i, 1)" [disabled]="last || State.Abstain" [attr.aria-label]="'Move ' + Option(id)?.Label + ' down'">
                                            <i class="fa-solid fa-arrow-down"></i>
                                        </button>
                                        <button type="button" class="icon-btn" (click)="Remove(id)" [disabled]="State.Abstain" [attr.aria-label]="'Remove ' + Option(id)?.Label + ' from ranking'">
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>
                                    </span>
                                </li>
                            }
                        </ol>
                        <p class="hint">Tip: focus a ranked option and press Alt + Up or Alt + Down to reorder it.</p>
                    }
                    <h4>Available options</h4>
                    <ul class="avail-list">
                        @for (o of UnrankedOptions; track o.OptionID) {
                            <li class="avail-item">
                                <div class="opt-body">
                                    <ng-container *ngTemplateOutlet="optionBody; context: { $implicit: o }"></ng-container>
                                </div>
                                <button type="button" class="add-btn" (click)="Add(o.OptionID)" [disabled]="State.Abstain || State.Selected.length >= Contest.MaxSelections" [attr.aria-label]="'Add ' + o.Label + ' to ranking'">
                                    <i class="fa-solid fa-plus"></i> Rank
                                </button>
                            </li>
                        } @empty {
                            <li class="muted">All options are ranked.</li>
                        }
                    </ul>
                </div>
            } @else {
                <ul class="options">
                    @for (o of Contest.Options; track o.OptionID) {
                        <li class="option" [class.selected]="State.Selected.includes(o.OptionID)">
                            <label class="option-label">
                                @if (Contest.MaxSelections === 1) {
                                    <input type="radio" [name]="'contest-' + Contest.ContestID" [checked]="State.Selected.includes(o.OptionID)" [disabled]="State.Abstain" (change)="ChooseSingle(o.OptionID)" />
                                } @else {
                                    <input type="checkbox" [checked]="State.Selected.includes(o.OptionID)" [disabled]="State.Abstain || (!State.Selected.includes(o.OptionID) && State.Selected.length >= Contest.MaxSelections)" (change)="ToggleOption(o.OptionID)" />
                                }
                                <span class="opt-body">
                                    <ng-container *ngTemplateOutlet="optionBody; context: { $implicit: o }"></ng-container>
                                </span>
                            </label>
                            @if (o.IsWriteIn && State.Selected.includes(o.OptionID)) {
                                <input class="writein" type="text" maxlength="500" placeholder="Write-in name" [attr.aria-label]="'Write-in name for ' + o.Label" [ngModel]="State.WriteIns[o.OptionID] ?? ''" (ngModelChange)="SetWriteIn(o.OptionID, $event)" [ngModelOptions]="{ standalone: true }" />
                            }
                        </li>
                    }
                </ul>
            }

            @if (TakesComments) {
                <div class="comments">
                    <h4>
                        Comment
                        @if (CommentRequired) {
                            <span class="req">(required for your selection)</span>
                        } @else {
                            <span class="muted">(optional)</span>
                        }
                    </h4>
                    <div class="comment-grid">
                        <div class="cfield">
                            <label [for]="'ct-' + Contest.ContestID">Type</label>
                            <select [id]="'ct-' + Contest.ContestID" class="input" [ngModel]="State.CommentType" (ngModelChange)="SetCommentType($event)" [ngModelOptions]="{ standalone: true }">
                                <option value="General">General</option>
                                <option value="Technical">Technical</option>
                                <option value="Editorial">Editorial</option>
                            </select>
                        </div>
                        <div class="cfield">
                            <label [for]="'cd-' + Contest.ContestID">Document reference</label>
                            <input [id]="'cd-' + Contest.ContestID" class="input" type="text" placeholder="Section, page or line" [ngModel]="State.DocumentReference" (ngModelChange)="SetField('DocumentReference', $event)" [ngModelOptions]="{ standalone: true }" />
                        </div>
                        <div class="cfield wide">
                            <label [for]="'cc-' + Contest.ContestID">Comment</label>
                            <textarea [id]="'cc-' + Contest.ContestID" class="input" rows="3" maxlength="10000" [ngModel]="State.Comment" (ngModelChange)="SetField('Comment', $event)" [ngModelOptions]="{ standalone: true }" [attr.aria-required]="CommentRequired"></textarea>
                        </div>
                        <div class="cfield wide">
                            <label [for]="'cp-' + Contest.ContestID">Proposed change</label>
                            <textarea [id]="'cp-' + Contest.ContestID" class="input" rows="2" [ngModel]="State.ProposedChange" (ngModelChange)="SetField('ProposedChange', $event)" [ngModelOptions]="{ standalone: true }"></textarea>
                        </div>
                    </div>
                </div>
            }

            <div class="errors" [id]="'err-' + Contest.ContestID" role="alert" aria-live="assertive">
                @for (e of Errors; track $index) {
                    <p class="error"><i class="fa-solid fa-circle-exclamation"></i> {{ e }}</p>
                }
            </div>
        </fieldset>

        <ng-template #optionBody let-o>
            @if (o.PhotoUrl) {
                <img class="photo" [src]="o.PhotoUrl" [alt]="'Photo of ' + o.Label" loading="lazy" />
            }
            <span class="opt-text">
                <span class="opt-name">{{ o.Label }}</span>
                @if (o.Description) {
                    <span class="opt-desc">{{ o.Description }}</span>
                }
                @if (o.StatementUrl) {
                    <a class="opt-link" [href]="o.StatementUrl" target="_blank" rel="noopener noreferrer">Candidate statement <span class="sr-only">(opens in a new tab)</span></a>
                }
            </span>
        </ng-template>
    `,
    styles: [
        `
            :host { display: block; }
            .contest { margin: 0; padding: 1rem 1.25rem; border: 1px solid var(--mj-border-default); border-radius: 10px; background: var(--mj-bg-surface); min-width: 0; }
            .contest.has-errors { border-color: var(--mj-status-error); }
            legend { padding: 0 0.5rem; display: flex; gap: 0.6rem; align-items: baseline; }
            .contest-name { font-size: 1.05rem; font-weight: 700; color: var(--mj-text-primary); }
            .contest-kind { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mj-text-muted); }
            .description { margin: 0 0 0.5rem; color: var(--mj-text-secondary); }
            .instructions { margin: 0 0 0.75rem; font-size: 0.85rem; color: var(--mj-text-muted); }
            .abstain { display: inline-flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; color: var(--mj-text-secondary); }
            .options, .avail-list, .rank-list { list-style: none; margin: 0 0 0.5rem; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
            .option, .avail-item, .rank-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem; border: 1px solid var(--mj-border-default); border-radius: 8px; background: var(--mj-bg-surface); flex-wrap: wrap; }
            .option.selected { border-color: var(--mj-brand-primary); background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface)); }
            .option-label { display: flex; align-items: center; gap: 0.75rem; flex: 1; cursor: pointer; min-width: 12rem; }
            .option-label input { width: 1.1rem; height: 1.1rem; flex-shrink: 0; }
            .opt-body { display: flex; align-items: center; gap: 0.75rem; flex: 1; }
            .opt-text { display: flex; flex-direction: column; gap: 0.15rem; }
            .opt-name { font-weight: 600; color: var(--mj-text-primary); }
            .opt-desc { font-size: 0.85rem; color: var(--mj-text-secondary); }
            .opt-link { font-size: 0.85rem; color: var(--mj-text-link); }
            .photo { width: 3rem; height: 3rem; border-radius: 50%; object-fit: cover; background: var(--mj-bg-surface-sunken); }
            .rank-item { background: color-mix(in srgb, var(--mj-brand-primary) 6%, var(--mj-bg-surface)); border-color: var(--mj-brand-primary); }
            .rank-item:focus-visible, .input:focus-visible, .writein:focus-visible, .icon-btn:focus-visible, .add-btn:focus-visible, input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; }
            .rank-no { display: inline-flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 50%; background: var(--mj-brand-primary); color: var(--mj-text-inverse); font-weight: 700; }
            .rank-label { flex: 1; font-weight: 600; color: var(--mj-text-primary); }
            .rank-controls { display: inline-flex; gap: 0.25rem; }
            .icon-btn, .add-btn { border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface-card); color: var(--mj-text-primary); border-radius: 6px; padding: 0.3rem 0.55rem; cursor: pointer; font: inherit; }
            .icon-btn:hover:not(:disabled), .add-btn:hover:not(:disabled) { background: var(--mj-bg-surface-hover); }
            .icon-btn:disabled, .add-btn:disabled { color: var(--mj-text-disabled); cursor: not-allowed; }
            .writein { flex: 1 1 14rem; padding: 0.4rem 0.6rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; }
            h4 { margin: 0.75rem 0 0.35rem; font-size: 0.9rem; color: var(--mj-text-secondary); }
            .req { color: var(--mj-status-error-text); font-weight: 600; font-size: 0.8rem; }
            .muted { color: var(--mj-text-muted); font-weight: 400; font-size: 0.85rem; }
            .hint { margin: 0.25rem 0 0.5rem; font-size: 0.8rem; color: var(--mj-text-muted); }
            .comment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.5rem 1rem; }
            .cfield { display: flex; flex-direction: column; gap: 0.2rem; }
            .cfield.wide { grid-column: 1 / -1; }
            .cfield label { font-size: 0.8rem; font-weight: 600; color: var(--mj-text-secondary); }
            .input { padding: 0.4rem 0.6rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; width: 100%; box-sizing: border-box; }
            textarea.input { resize: vertical; }
            .errors { margin-top: 0.5rem; }
            .error { margin: 0.25rem 0 0; color: var(--mj-status-error-text); font-size: 0.9rem; display: flex; gap: 0.4rem; align-items: center; }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        `,
    ],
})
export class BallotContestComponent {
    @Input({ required: true }) Contest!: VotingBallotStyleContest;
    @Input({ required: true }) State!: ContestState;
    /** Voter-facing validation messages for this contest (empty until the voter tries to continue). */
    @Input() Errors: string[] = [];
    @Output() Changed = new EventEmitter<void>();

    public get DescribedBy(): string {
        return `inst-${this.Contest.ContestID} err-${this.Contest.ContestID}`;
    }

    public get TakesComments(): boolean {
        return ContestTakesComments(this.Contest);
    }

    public get CommentRequired(): boolean {
        return CommentIsRequired(this.Contest, this.State);
    }

    public get Instructions(): string {
        const c = this.Contest;
        const max = c.MaxSelections;
        const parts: string[] = [];
        if (c.IsRanked) {
            parts.push(`Rank up to ${max} ${max === 1 ? 'option' : 'options'} in order of preference, first choice at the top.`);
        } else if (max === 1) {
            parts.push('Choose one option.');
        } else if (c.MinSelections > 0 && c.MinSelections !== max) {
            parts.push(`Choose between ${c.MinSelections} and ${max} options.`);
        } else {
            parts.push(`Choose up to ${max} options.`);
        }
        if (c.Seats > 1) {
            parts.push(`${c.Seats} seats are being filled.`);
        }
        return parts.join(' ');
    }

    public get UnrankedOptions(): VotingBallotStyleOption[] {
        return this.Contest.Options.filter((o) => !this.State.Selected.includes(o.OptionID));
    }

    public Option(id: string): VotingBallotStyleOption | undefined {
        return this.Contest.Options.find((o) => o.OptionID === id);
    }

    public RankLabel(id: string, index: number): string {
        return `Rank ${index + 1}: ${this.Option(id)?.Label ?? id}`;
    }

    public ToggleAbstain(): void {
        this.State.Abstain = !this.State.Abstain;
        if (this.State.Abstain) {
            this.State.Selected = [];
            this.State.WriteIns = {};
        }
        this.Changed.emit();
    }

    public ChooseSingle(id: string): void {
        this.State.Selected = [id];
        this.Changed.emit();
    }

    public ToggleOption(id: string): void {
        this.State.Selected = this.State.Selected.includes(id)
            ? this.State.Selected.filter((s) => s !== id)
            : [...this.State.Selected, id];
        this.Changed.emit();
    }

    public Add(id: string): void {
        if (!this.State.Selected.includes(id) && this.State.Selected.length < this.Contest.MaxSelections) {
            this.State.Selected = [...this.State.Selected, id];
            this.Changed.emit();
        }
    }

    public Remove(id: string): void {
        this.State.Selected = this.State.Selected.filter((s) => s !== id);
        this.Changed.emit();
    }

    public Move(index: number, delta: -1 | 1): void {
        const target = index + delta;
        if (target < 0 || target >= this.State.Selected.length) {
            return;
        }
        const next = [...this.State.Selected];
        [next[index], next[target]] = [next[target], next[index]];
        this.State.Selected = next;
        this.Changed.emit();
    }

    public OnRankKey(event: KeyboardEvent, index: number): void {
        if (!event.altKey) {
            return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const delta: -1 | 1 = event.key === 'ArrowUp' ? -1 : 1;
            this.Move(index, delta);
            // Keep keyboard focus on the moved item once Angular re-renders the list.
            const list = (event.currentTarget as HTMLElement).parentElement;
            const targetIndex = index + delta;
            setTimeout(() => {
                const items = list?.querySelectorAll<HTMLElement>('.rank-item');
                items?.[targetIndex]?.focus();
            });
        }
    }

    public SetWriteIn(id: string, text: string): void {
        this.State.WriteIns = { ...this.State.WriteIns, [id]: text };
        this.Changed.emit();
    }

    public SetCommentType(type: CommentType): void {
        this.State.CommentType = type;
        this.Changed.emit();
    }

    public SetField(field: 'DocumentReference' | 'Comment' | 'ProposedChange', value: string): void {
        this.State[field] = value;
        this.Changed.emit();
    }
}
