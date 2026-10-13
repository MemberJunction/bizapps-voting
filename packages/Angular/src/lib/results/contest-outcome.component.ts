/**
 * ContestOutcomeComponent — presentational view of one contest's result: outcome chip,
 * threshold explanation, a per-option table with a bar visualization, and the IRV/STV
 * rounds table when the tally method produced rounds.
 */
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
    VotingContestOutcome,
    VotingTallyOptionOutcome,
    VotingThresholdBasis,
    VotingThresholdKind,
} from '@mj-biz-apps/voting-entities';

/** Contest definition details the result view needs alongside the outcome. */
export interface ContestResultMeta {
    ContestID: string;
    Name: string;
    Kind: string;
    Seats: number;
    Threshold: VotingThresholdKind;
    CustomThreshold: number | null;
    ThresholdBasis: VotingThresholdBasis;
    TallyMethodName: string;
    IsRanked: boolean;
    /** Option label by lower-cased option ID. */
    OptionLabels: Record<string, string>;
}

interface OptionRowView {
    OptionID: string;
    Label: string;
    Votes: number;
    Position: number;
    Outcome: VotingTallyOptionOutcome;
    BarPercent: number;
    SharePercent: number;
}

interface RoundView {
    Round: number;
    Cells: Array<{ OptionID: string; Value: string }>;
    Elected: string;
    Excluded: string;
    Exhausted: string;
    Note: string;
}

@Component({
    selector: 'voting-contest-outcome',
    standalone: true,
    imports: [CommonModule],
    template: `
        <article class="contest" [attr.aria-labelledby]="'contest-' + Meta.ContestID">
            <header class="contest-head">
                <div>
                    <h3 [id]="'contest-' + Meta.ContestID">{{ Meta.Name }}</h3>
                    <p class="sub">
                        {{ Meta.Kind }} &middot; {{ Meta.Seats }} {{ Meta.Seats === 1 ? 'seat' : 'seats' }}
                        @if (Meta.TallyMethodName) {
                            &middot; {{ Meta.TallyMethodName }}
                        }
                    </p>
                </div>
                <span class="outcome-chip" [ngClass]="OutcomeClass">
                    <i [class]="OutcomeIcon"></i> {{ OutcomeLabel }}
                </span>
            </header>

            @if (ThresholdText) {
                <p class="threshold"><i class="fa-solid fa-scale-balanced"></i> {{ ThresholdText }}</p>
            }

            <p class="tally-line">
                <strong>{{ Outcome.VotesCast }}</strong> {{ Outcome.VotesCast === 1 ? 'ballot' : 'ballots' }} counted
                @if (Outcome.Abstentions > 0) {
                    &middot; <strong>{{ Outcome.Abstentions }}</strong> abstained
                }
                @if (Outcome.TieBroken) {
                    &middot; <span class="tie-note"><i class="fa-solid fa-dice"></i> a tie was broken</span>
                }
            </p>

            @if (IsRunning && IsRanked) {
                <p class="note-line"><i class="fa-solid fa-circle-info"></i> Running view shows first preferences only. The full ranked count runs when voting closes.</p>
            }

            @if (OptionRows.length > 0) {
                <table class="grid">
                    <caption class="sr-only">Votes by option for {{ Meta.Name }}</caption>
                    <thead>
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Option</th>
                            <th scope="col" class="num">Votes</th>
                            <th scope="col" class="bar-col">Share</th>
                            <th scope="col">Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        @for (row of OptionRows; track row.OptionID) {
                            <tr [class.winner]="row.Outcome === 'Elected'">
                                <td>{{ row.Position }}</td>
                                <th scope="row">{{ row.Label }}</th>
                                <td class="num">{{ row.Votes | number: '1.0-2' }}</td>
                                <td class="bar-col">
                                    <div
                                        class="bar-track"
                                        role="img"
                                        [attr.aria-label]="row.Label + ': ' + (row.SharePercent | number: '1.0-1') + ' percent'"
                                    >
                                        <div class="bar-fill" [ngClass]="'bar-' + row.Outcome.toLowerCase()" [style.width.%]="row.BarPercent"></div>
                                    </div>
                                    <span class="bar-pct">{{ row.SharePercent | number: '1.0-1' }}%</span>
                                </td>
                                <td>
                                    <span class="chip" [ngClass]="'chip-' + row.Outcome.toLowerCase()">{{ row.Outcome }}</span>
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            } @else {
                <p class="muted">No option results are available for this contest.</p>
            }

            @if (RoundViews.length > 0) {
                <details class="rounds">
                    <summary>Round-by-round count ({{ RoundViews.length }} {{ RoundViews.length === 1 ? 'round' : 'rounds' }})</summary>
                    <div class="table-wrap">
                        <table class="grid rounds-grid">
                            <caption class="sr-only">Counting rounds for {{ Meta.Name }}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">Round</th>
                                    @for (opt of OptionRows; track opt.OptionID) {
                                        <th scope="col" class="num">{{ opt.Label }}</th>
                                    }
                                    <th scope="col">Elected</th>
                                    <th scope="col">Excluded</th>
                                    <th scope="col" class="num">Exhausted</th>
                                    <th scope="col">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (round of RoundViews; track round.Round) {
                                    <tr>
                                        <th scope="row">{{ round.Round }}</th>
                                        @for (cell of round.Cells; track cell.OptionID) {
                                            <td class="num">{{ cell.Value }}</td>
                                        }
                                        <td>{{ round.Elected }}</td>
                                        <td>{{ round.Excluded }}</td>
                                        <td class="num">{{ round.Exhausted }}</td>
                                        <td>{{ round.Note }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </details>
            }

            @if (Outcome.Notes && Outcome.Notes.length > 0) {
                <ul class="notes">
                    @for (note of Outcome.Notes; track $index) {
                        <li>{{ note }}</li>
                    }
                </ul>
            }
        </article>
    `,
    styles: [
        `
            :host { display: block; }
            .contest { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; break-inside: avoid; }
            .contest-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
            h3 { margin: 0; font-size: 1.05rem; color: var(--mj-text-primary); }
            .sub { margin: 0.2rem 0 0; color: var(--mj-text-muted); font-size: 0.85rem; }
            .threshold, .tally-line, .note-line { margin: 0.6rem 0 0; color: var(--mj-text-secondary); font-size: 0.9rem; }
            .threshold i, .note-line i { color: var(--mj-text-muted); margin-right: 0.35rem; }
            .tie-note { color: var(--mj-status-warning-text); }
            .outcome-chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.75rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; }
            .out-pass { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .out-fail { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
            .out-warn { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .out-info { background: var(--mj-status-info-bg); color: var(--mj-status-info-text); }
            .grid { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
            .grid th, .grid td { padding: 0.5rem 0.65rem; text-align: left; border-bottom: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); vertical-align: middle; }
            .grid thead th { background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; }
            .grid tbody th { font-weight: 600; }
            .grid .num { text-align: right; font-variant-numeric: tabular-nums; }
            .grid tr.winner td, .grid tr.winner th { background: color-mix(in srgb, var(--mj-status-success) 8%, var(--mj-bg-surface)); }
            .bar-col { min-width: 11rem; }
            .bar-track { display: inline-block; vertical-align: middle; width: 70%; height: 0.75rem; background: var(--mj-bg-surface-sunken); border-radius: 999px; overflow: hidden; }
            .bar-fill { height: 100%; border-radius: 999px; background: var(--mj-brand-primary); }
            .bar-elected, .bar-counted { background: var(--mj-status-success); }
            .bar-defeated, .bar-excluded { background: var(--mj-text-disabled); }
            .bar-tied { background: var(--mj-status-warning); }
            .bar-pct { display: inline-block; margin-left: 0.5rem; font-size: 0.8rem; color: var(--mj-text-secondary); font-variant-numeric: tabular-nums; }
            .chip { padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: var(--mj-bg-surface-card); color: var(--mj-text-secondary); }
            .chip-elected, .chip-counted { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
            .chip-tied { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
            .chip-defeated, .chip-excluded { background: var(--mj-bg-surface-sunken); color: var(--mj-text-muted); }
            .rounds { margin-top: 0.75rem; }
            .rounds summary { cursor: pointer; color: var(--mj-text-link); font-weight: 600; }
            .rounds summary:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; }
            .table-wrap { overflow-x: auto; }
            .notes { margin: 0.75rem 0 0; padding-left: 1.2rem; color: var(--mj-text-secondary); font-size: 0.85rem; }
            .muted { color: var(--mj-text-muted); }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
            @media print {
                .contest { border-color: var(--mj-border-strong); }
                .rounds:not([open]) .table-wrap { display: block; }
            }
        `,
    ],
})
export class ContestOutcomeComponent {
    @Input({ required: true }) Meta!: ContestResultMeta;
    @Input({ required: true }) Outcome!: VotingContestOutcome;
    @Input() IsRunning = false;

    public get IsRanked(): boolean {
        return this.Meta.IsRanked;
    }

    public get OutcomeLabel(): string {
        switch (this.Outcome.Outcome) {
            case 'NoQuorum':
                return 'No quorum';
            case 'Running':
                return 'Running';
            default:
                return this.Outcome.Outcome;
        }
    }

    public get OutcomeClass(): string {
        switch (this.Outcome.Outcome) {
            case 'Passed':
            case 'Decided':
                return 'out-pass';
            case 'Failed':
            case 'Void':
                return 'out-fail';
            case 'Tied':
            case 'NoQuorum':
                return 'out-warn';
            default:
                return 'out-info';
        }
    }

    public get OutcomeIcon(): string {
        switch (this.Outcome.Outcome) {
            case 'Passed':
            case 'Decided':
                return 'fa-solid fa-circle-check';
            case 'Failed':
            case 'Void':
                return 'fa-solid fa-circle-xmark';
            case 'Tied':
                return 'fa-solid fa-equals';
            case 'NoQuorum':
                return 'fa-solid fa-users-slash';
            default:
                return 'fa-solid fa-hourglass-half';
        }
    }

    /** Plain-language statement of the pass rule, or empty when the contest has no threshold. */
    public get ThresholdText(): string {
        const m = this.Meta;
        if (m.Threshold === 'None') {
            return '';
        }
        const basis = m.ThresholdBasis === 'Eligible' ? 'of all eligible voters' : 'of the votes cast (abstentions excluded)';
        switch (m.Threshold) {
            case 'Majority':
                return `Passes with more than half ${basis}.`;
            case 'ThreeFifths':
                return `Passes with at least three-fifths (60%) ${basis}.`;
            case 'TwoThirds':
                return `Passes with at least two-thirds ${basis}.`;
            case 'ThreeQuarters':
                return `Passes with at least three-quarters (75%) ${basis}.`;
            case 'Unanimous':
                return `Passes only if there is at least one yes vote and no opposing votes ${basis}.`;
            case 'Custom': {
                const v = m.CustomThreshold;
                if (v === null) {
                    return 'Passes with a custom threshold.';
                }
                const pct = v <= 1 ? v * 100 : v;
                return `Passes with at least ${Number(pct.toFixed(2))}% ${basis}.`;
            }
            default:
                return '';
        }
    }

    public get OptionRows(): OptionRowView[] {
        const options = [...this.Outcome.Options].sort((a, b) => a.Position - b.Position);
        const total = options.reduce((sum, o) => sum + o.Votes, 0);
        const max = options.reduce((mx, o) => Math.max(mx, o.Votes), 0);
        return options.map((o) => ({
            OptionID: o.OptionID,
            Label: this.Meta.OptionLabels[o.OptionID.toLowerCase()] ?? o.OptionID,
            Votes: o.Votes,
            Position: o.Position,
            Outcome: o.Outcome,
            BarPercent: max > 0 ? (o.Votes / max) * 100 : 0,
            SharePercent: total > 0 ? (o.Votes / total) * 100 : 0,
        }));
    }

    public get RoundViews(): RoundView[] {
        const rounds = this.Outcome.Rounds ?? [];
        const optionIds = this.OptionRows.map((o) => o.OptionID);
        const label = (id: string): string => this.Meta.OptionLabels[id.toLowerCase()] ?? id;
        return rounds.map((r) => ({
            Round: r.Round,
            Cells: optionIds.map((id) => ({
                OptionID: id,
                Value: r.Tallies[id] === undefined ? '' : String(Number(r.Tallies[id].toFixed(5))),
            })),
            Elected: r.Elected.map(label).join(', '),
            Excluded: r.Excluded.map(label).join(', '),
            Exhausted: r.Exhausted === undefined ? '' : String(Number(r.Exhausted.toFixed(5))),
            Note: r.Note ?? '',
        }));
    }
}
