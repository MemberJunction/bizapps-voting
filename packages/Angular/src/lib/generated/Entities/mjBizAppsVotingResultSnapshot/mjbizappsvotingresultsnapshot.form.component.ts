import { Component } from '@angular/core';
import { mjBizAppsVotingResultSnapshotEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Result Snapshots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingresultsnapshot-form',
    templateUrl: './mjbizappsvotingresultsnapshot.form.component.html'
})
export class mjBizAppsVotingResultSnapshotFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingResultSnapshotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'electionDetails', sectionName: 'Election Details', isExpanded: true },
            { sectionKey: 'snapshotInformation', sectionName: 'Snapshot Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

