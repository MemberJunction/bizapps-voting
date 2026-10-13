import { Component } from '@angular/core';
import { mjBizAppsVotingVoterCredentialEntity } from '@mj-biz-apps/voting-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Voting: Voter Credentials') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsvotingvotercredential-form',
    templateUrl: './mjbizappsvotingvotercredential.form.component.html'
})
export class mjBizAppsVotingVoterCredentialFormComponent extends BaseFormComponent {
    public record!: mjBizAppsVotingVoterCredentialEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'credentialInformation', sectionName: 'Credential Information', isExpanded: true },
            { sectionKey: 'securityAndAuthentication', sectionName: 'Security and Authentication', isExpanded: true },
            { sectionKey: 'lifecycleAndTimeline', sectionName: 'Lifecycle and Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

