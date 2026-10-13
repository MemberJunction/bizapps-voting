import { Component } from '@angular/core';
import { mjBizAppsVotingElectionAnchorEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Election Anchors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingelectionanchor-form',
    templateUrl: './mjbizappsvotingelectionanchor.form.component.html'
})
export class mjBizAppsVotingElectionAnchorFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingElectionAnchorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'anchorDetails', sectionName: 'Anchor Details', isExpanded: true },
            { sectionKey: 'configurationAndDisplay', sectionName: 'Configuration and Display', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

