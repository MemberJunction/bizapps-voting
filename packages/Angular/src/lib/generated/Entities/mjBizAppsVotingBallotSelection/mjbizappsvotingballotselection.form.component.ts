import { Component } from '@angular/core';
import { mjBizAppsVotingBallotSelectionEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Ballot Selections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingballotselection-form',
    templateUrl: './mjbizappsvotingballotselection.form.component.html'
})
export class mjBizAppsVotingBallotSelectionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingBallotSelectionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ballotAndContestDetails', sectionName: 'Ballot and Contest Details', isExpanded: true },
            { sectionKey: 'selectionDetails', sectionName: 'Selection Details', isExpanded: true }
        ]);
    }
}

