import { Directive, Input } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Base class for election admin tab extensions registered by downstream apps.
 * Tabs appear in the election admin interface and may present election-type-specific
 * configuration or operations.
 *
 * Usage:
 *   @Directive()
 *   @RegisterClassEx(BaseElectionAdminTab, 'MyAppElectionTab', {
 *     contributionKey: 'my-app:election-tab',
 *     electionTypes: ['motion', '*'],
 *     label: 'My Tab',
 *     icon: 'fa-solid fa-chart-pie',
 *     sequence: 50
 *   })
 *   export class MyAppElectionTabComponent extends BaseElectionAdminTab { ... }
 */
@Directive()
export abstract class BaseElectionAdminTab extends BaseAngularComponent {
  /** The ID of the election being administered */
  @Input() public ElectionID: string = '';

  /** The election type code (e.g. 'motion', 'board-election') */
  @Input() public ElectionTypeCode: string = '';

  /** The election's current status (e.g. 'Draft', 'Open', 'Closed') */
  @Input() public ElectionStatus: string = '';

  /** Whether the viewing user is an administrator */
  @Input() public IsAdministrator: boolean = false;
}
