import { Directive, Input, Output, EventEmitter } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Base class for election setup wizard step extensions registered by downstream apps.
 * Steps appear in the election creation/configuration wizard and may gather election-type-specific
 * information or perform custom validation.
 *
 * Implementations should emit `Valid` and `Changed` events to signal step state to the wizard.
 *
 * Usage:
 *   @Directive()
 *   @RegisterClassEx(BaseElectionSetupStep, 'MyAppElectionSetupStep', {
 *     contributionKey: 'my-app:election-setup-step',
 *     electionTypes: ['board-election'],
 *     label: 'Board Details',
 *     sequence: 10
 *   })
 *   export class MyAppElectionSetupStepComponent extends BaseElectionSetupStep {
 *     ngOnInit() {
 *       this.Valid.emit(true);
 *     }
 *   }
 */
@Directive()
export abstract class BaseElectionSetupStep extends BaseAngularComponent {
  /** The ID of the election being set up (may be null if creating new) */
  @Input() public ElectionID: string | null = null;

  /** The election type code (e.g. 'motion', 'board-election') */
  @Input() public ElectionTypeCode: string = '';

  /** The step number in the wizard (1-based) */
  @Input() public StepNumber: number = 0;

  /** Emitted when the step's validation state changes; true = step is complete and valid */
  @Output() public Valid = new EventEmitter<boolean>();

  /** Emitted when the step's data changes (used to enable/disable Next button) */
  @Output() public Changed = new EventEmitter<void>();
}
