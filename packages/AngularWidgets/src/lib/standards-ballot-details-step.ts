import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnChanges, inject, type SimpleChanges, Output, EventEmitter } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { mjBizAppsVotingStandardsBallotElectionEntity } from '@mj-biz-apps/voting-entities';
import { BaseElectionSetupStep } from './base-election-setup-step';
import { STANDARDS_BALLOT_EXTENSION_ENTITY } from './standards-ballot-ui-driver';
import {
  StandardsDetailsIssues,
  type PriorBallotOption,
  type StandardsDetailsValues,
} from './standards-ballot-details-rules';

/**
 * The document step of a standards ballot: DocumentTitle, DocumentVersion, RecirculationRound and the PriorElectionID a
 * recirculation follows, edited on the 'MJ_BizApps_Voting: Standards Ballot Elections' entity (the election's IS-A child row).
 * For an election that already exists the values load from, and Save() writes to, that row. For a new election the step only
 * gathers the values (DetailsChange); the wizard applies them when it creates the election.
 */
@RegisterClass(BaseElectionSetupStep, 'StandardsBallotDetailsStep')
@Component({
  selector: 'mj-standards-ballot-details-step',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step">
      <label>
        Document title
        <input type="text" [value]="Values.DocumentTitle" (input)="Edit('DocumentTitle', ValueOf($event))" />
      </label>
      <label>
        Document version
        <input type="text" [value]="Values.DocumentVersion" (input)="Edit('DocumentVersion', ValueOf($event))" />
      </label>
      <label>
        Recirculation round (0 for the first ballot)
        <input type="number" min="0" [value]="Values.RecirculationRound" (input)="Edit('RecirculationRound', ValueOf($event))" />
      </label>
      <label>
        Follows ballot
        <select (change)="Edit('PriorElectionID', ValueOf($event))">
          <option value="" [selected]="!Values.PriorElectionID">None (first ballot)</option>
          @for (prior of PriorBallots; track prior.ID) {
            <option [value]="prior.ID" [selected]="prior.ID === Values.PriorElectionID">{{ prior.Label }}</option>
          }
        </select>
      </label>
      @for (issue of Issues; track issue) {
        <p role="alert">{{ issue }}</p>
      }
      @if (ErrorMessage) {
        <p role="alert">{{ ErrorMessage }}</p>
      }
    </div>
  `,
  styles: [
    `
      .step { display: grid; gap: var(--mj-space-3, 0.75rem); max-width: 40rem; }
      label { display: grid; gap: var(--mj-space-1, 0.25rem); }
    `,
  ],
})
export class StandardsBallotDetailsStepComponent extends BaseElectionSetupStep implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  private row: mjBizAppsVotingStandardsBallotElectionEntity | null = null;

  /** The current values, for a wizard that applies them to a new election. */
  @Output() public DetailsChange = new EventEmitter<StandardsDetailsValues>();

  public Values: StandardsDetailsValues = { DocumentTitle: '', DocumentVersion: '', RecirculationRound: 0, PriorElectionID: '' };
  public PriorBallots: PriorBallotOption[] = [];
  public Issues: string[] = [];
  public ErrorMessage = '';

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['ElectionID']) void this.Load();
  }

  public ValueOf(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.value : '';
  }

  public Edit(field: keyof StandardsDetailsValues, raw: string): void {
    this.Values = {
      ...this.Values,
      [field]: field === 'RecirculationRound' ? Math.max(0, Math.trunc(Number(raw) || 0)) : raw,
    };
    this.Revalidate();
    this.Changed.emit();
    this.DetailsChange.emit(this.Values);
  }

  /** Writes the values to the election's Standards Ballot row. Returns false (and says why) when it can't. */
  public async Save(): Promise<boolean> {
    if (!this.row) {
      this.ErrorMessage = 'Save the election first; its document details are saved with it.';
      this.cdr.markForCheck();
      return false;
    }
    this.row.DocumentTitle = this.Values.DocumentTitle.trim();
    this.row.DocumentVersion = this.Values.DocumentVersion.trim() || null;
    this.row.RecirculationRound = this.Values.RecirculationRound;
    this.row.PriorElectionID = this.Values.PriorElectionID || null;
    const saved = await this.row.Save();
    this.ErrorMessage = saved ? '' : this.row.LatestResult?.Message || 'The document details could not be saved.';
    this.cdr.markForCheck();
    return saved;
  }

  private async Load(): Promise<void> {
    this.ErrorMessage = '';
    try {
      this.PriorBallots = await this.LoadPriorBallots();
      if (this.ElectionID) {
        const row = await this.ProviderToUse.GetEntityObject<mjBizAppsVotingStandardsBallotElectionEntity>(STANDARDS_BALLOT_EXTENSION_ENTITY);
        if (await row.Load(this.ElectionID)) {
          this.row = row;
          this.Values = {
            DocumentTitle: row.DocumentTitle,
            DocumentVersion: row.DocumentVersion ?? '',
            RecirculationRound: row.RecirculationRound,
            PriorElectionID: row.PriorElectionID ?? '',
          };
        }
      }
    } catch (e) {
      this.ErrorMessage = e instanceof Error ? e.message : 'The document details could not be loaded.';
    }
    this.Revalidate();
    this.cdr.markForCheck();
  }

  /** Certified standards ballots, the only ones a recirculation may follow. */
  private async LoadPriorBallots(): Promise<PriorBallotOption[]> {
    const result = await new RunView(this.RunViewToUse).RunView<{ ID: string; Name: string; DocumentTitle: string; RecirculationRound: number }>({
      EntityName: STANDARDS_BALLOT_EXTENSION_ENTITY,
      ExtraFilter: `Status = 'Certified'`,
      Fields: ['ID', 'Name', 'DocumentTitle', 'RecirculationRound'],
      OrderBy: 'DocumentTitle, RecirculationRound',
      ResultType: 'simple',
    });
    if (!result.Success) return [];
    return result.Results
      .filter((r) => !this.ElectionID || r.ID.toLowerCase() !== this.ElectionID.toLowerCase())
      .map((r) => ({ ID: r.ID, DocumentTitle: r.DocumentTitle, Label: `${r.DocumentTitle} (round ${r.RecirculationRound}) - ${r.Name}` }));
  }

  private Revalidate(): void {
    this.Issues = StandardsDetailsIssues(this.Values, this.PriorBallots);
    this.Valid.emit(this.Issues.length === 0);
  }
}
