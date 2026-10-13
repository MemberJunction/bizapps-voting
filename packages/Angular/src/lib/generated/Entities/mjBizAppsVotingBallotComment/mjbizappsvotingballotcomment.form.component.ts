import { Component } from '@angular/core';
import { mjBizAppsVotingBallotCommentEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Ballot Comments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingballotcomment-form',
    templateUrl: './mjbizappsvotingballotcomment.form.component.html'
})
export class mjBizAppsVotingBallotCommentFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingBallotCommentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ballotContext', sectionName: 'Ballot Context', isExpanded: true },
            { sectionKey: 'commentDetails', sectionName: 'Comment Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingCommentResolutions', sectionName: 'Comment Resolutions', isExpanded: false }
        ]);
    }
}

