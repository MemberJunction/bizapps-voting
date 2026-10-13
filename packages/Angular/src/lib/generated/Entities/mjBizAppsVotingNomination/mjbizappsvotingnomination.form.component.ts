import { Component } from '@angular/core';
import { mjBizAppsVotingNominationEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Nominations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingnomination-form',
    templateUrl: './mjbizappsvotingnomination.form.component.html'
})
export class mjBizAppsVotingNominationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingNominationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'nominationDetails', sectionName: 'Nomination Details', isExpanded: true },
            { sectionKey: 'candidacyAndStatus', sectionName: 'Candidacy and Status', isExpanded: true },
            { sectionKey: 'reviewAndDecision', sectionName: 'Review and Decision', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingNominationEndorsements', sectionName: 'Nomination Endorsements', isExpanded: false }
        ]);
    }
}

