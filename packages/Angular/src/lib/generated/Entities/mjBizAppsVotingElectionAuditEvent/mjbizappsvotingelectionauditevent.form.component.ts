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
            { sectionKey: 'auditEventDetails', sectionName: 'Audit Event Details', isExpanded: true },
            { sectionKey: 'actorInformation', sectionName: 'Actor Information', isExpanded: true },
            { sectionKey: 'eventPayload', sectionName: 'Event Payload', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

