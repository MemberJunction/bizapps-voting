import { Component } from '@angular/core';
import { mjBizAppsVotingCastBallotEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Cast Ballots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingcastballot-form',
    templateUrl: './mjbizappsvotingcastballot.form.component.html'
})
export class mjBizAppsVotingCastBallotFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingCastBallotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ballotInformation', sectionName: 'Ballot Information', isExpanded: true },
            { sectionKey: 'encryptedSelections', sectionName: 'Encrypted Selections', isExpanded: true },
            { sectionKey: 'voterDemographics', sectionName: 'Voter Demographics', isExpanded: true },
            { sectionKey: 'mJBizAppsVotingBallotAttributions', sectionName: 'Ballot Attributions', isExpanded: false },
            { sectionKey: 'mJBizAppsVotingBallotSelections', sectionName: 'Ballot Selections', isExpanded: false }
        ]);
    }
}

