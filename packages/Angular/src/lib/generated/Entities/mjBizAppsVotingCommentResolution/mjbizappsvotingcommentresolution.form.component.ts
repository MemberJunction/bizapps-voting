import { Component } from '@angular/core';
import { mjBizAppsVotingCommentResolutionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Comment Resolutions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcommentresolution-form',
    templateUrl: './mjbizappsvotingcommentresolution.form.component.html'
})
export class mjBizAppsVotingCommentResolutionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingCommentResolutionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'commentResolutionDetails', sectionName: 'Comment Resolution Details', isExpanded: true },
            { sectionKey: 'resolutionTracking', sectionName: 'Resolution Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

