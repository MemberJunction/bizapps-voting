import { Directive, Input } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Base class for election results view extensions registered by downstream apps.
 * Results views present the tally results to voters or administrators in election-type-specific
 * formats (e.g. a results summary, a detailed round breakdown, or a chart).
 *
 * Usage:
 *   @Directive()
 *   @RegisterClassEx(BaseElectionResultsView, 'MyAppElectionResultsView', {
 *     contributionKey: 'my-app:results-breakdown',
 *     electionTypes: ['board-election'],
 *     label: 'Detailed Breakdown',
 *     sequence: 20
 *   })
 *   export class MyAppElectionResultsViewComponent extends BaseElectionResultsView { ... }
 */
@Directive()
export abstract class BaseElectionResultsView extends BaseAngularComponent {
  /** The ID of the election whose results are being displayed */
  @Input() public ElectionID: string = '';

  /** The election type code (e.g. 'motion', 'board-election') */
  @Input() public ElectionTypeCode: string = '';

  /** The election's current status */
  @Input() public ElectionStatus: string = '';

  /** Whether the viewing user is an administrator (may see more detail) */
  @Input() public IsAdministrator: boolean = false;

  /** Whether the viewing user is a voter in this election (may see their own results) */
  @Input() public IsVoter: boolean = false;
}
