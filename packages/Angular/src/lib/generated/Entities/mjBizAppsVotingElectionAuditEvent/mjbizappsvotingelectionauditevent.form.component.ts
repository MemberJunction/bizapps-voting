import { Component } from '@angular/core';
import { mjBizAppsVotingElectionAuditEventEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Election Audit Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelectionauditevent-form',
    templateUrl: './mjbizappsvotingelectionauditevent.form.component.html'
})
export class mjBizAppsVotingElectionAuditEventFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionAuditEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'electionDetails', sectionName: 'Election Details', isExpanded: true },
            { sectionKey: 'eventDetails', sectionName: 'Event Details', isExpanded: true },
            { sectionKey: 'actorAndActivity', sectionName: 'Actor and Activity', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

