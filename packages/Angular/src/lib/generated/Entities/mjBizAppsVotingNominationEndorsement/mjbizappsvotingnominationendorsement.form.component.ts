import { Component } from '@angular/core';
import { mjBizAppsVotingNominationEndorsementEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Nomination Endorsements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingnominationendorsement-form',
    templateUrl: './mjbizappsvotingnominationendorsement.form.component.html'
})
export class mjBizAppsVotingNominationEndorsementFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingNominationEndorsementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'endorsementInformation', sectionName: 'Endorsement Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

