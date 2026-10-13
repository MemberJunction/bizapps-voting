/**
 * ElectionWizardComponent — the New Election wizard:
 * type -> details (limited to the type's overridable keys) -> contests & options -> eligibility source
 * -> linked records -> review -> Voting.CreateElection.
 *
 * Steps are assembled through the voting-ng-widgets contribution assembly (the type's UI driver can replace
 * or add steps; other apps can add steps), so the step list is data, not a fixed template.
 */
import { Component, EventEmitter, Input, OnInit, Output, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IMetadataProvider, LogError } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ElectionSetupStepDescriptor, ElectionUIContext } from '@mj-biz-apps/voting-ng-widgets';
import type { IElectionTypeConfiguration, VotingContestKind } from '@mj-biz-apps/voting-entities';
import { VotingEngineBase } from '@mj-biz-apps/voting-engine-base';
import { VotingApiService } from '../shared/voting-api.service';
import { ContributionHostComponent } from './contribution-host.component';
import { AssembleSetupSteps, ResolveStepComponent } from './election-parts';
import { ELECTION_COMMON_STYLES } from './election-styles';
import {
    ApplyKindDefaults,
    BuildCreateInput,
    BuildPolicyOverrides,
    CONTEST_KINDS,
    IsYesNoKind,
    NewAnchor,
    NewContest,
    NewOption,
    NewWizardDraft,
    THRESHOLD_KINDS,
    ValidateAll,
    ValidateAnchorsStep,
    ValidateContestsStep,
    ValidateDetailsStep,
    ValidateEligibilityStep,
    ValidateTypeStep,
    type ContestDraft,
    type ValidationContext,
    type WizardDraft,
} from './wizard-model';

interface TypeChoice {
    Code: string;
    Name: string;
    Description: string;
    Icon: string;
    ID: string;
    UIDriverClass: string | null;
}

interface PolicyField {
    Key: string;
    Label: string;
    Control: 'select' | 'number' | 'boolean' | 'multi' | 'quorum' | 'days' | 'csv' | 'json';
    Options: string[];
    Help: string;
}

const SELECT_OPTIONS: Record<string, string[]> = {
    SecrecyMode: ['Open', 'Confidential', 'Secret'],
    AssuranceTier: ['Standard', 'HighAssurance', 'Verifiable'],
    ResultsTiming: ['AfterClose', 'AfterVoting', 'Live', 'AdministratorsOnly'],
    ResultsAudience: ['Voters', 'Eligible', 'HostMembers', 'Public', 'Administrators'],
};

const FIELD_LABELS: Record<string, [string, PolicyField['Control'], string]> = {
    SecrecyMode: ['Secrecy mode', 'select', 'How voter identity relates to the ballot.'],
    AssuranceTier: ['Assurance tier', 'select', 'Standard, or cryptographically verifiable tiers.'],
    ResultsTiming: ['Results timing', 'select', 'When results become visible.'],
    ResultsAudience: ['Results audience', 'select', 'Who may see results.'],
    ResultsMinCast: ['Minimum ballots before results', 'number', 'Results stay hidden until this many ballots are in.'],
    WeightClassMinSize: ['Minimum weight-class size', 'number', 'Smaller weight classes are suppressed from results.'],
    NoticePeriodDays: ['Notice period (days)', 'number', 'Days of notice required before voting opens.'],
    AllowRevote: ['Voters may change their vote', 'boolean', 'Not available with a secret ballot.'],
    PaperOptionAvailable: ['Paper ballots available', 'boolean', ''],
    IndependentAdministrator: ['Independent administrator', 'boolean', ''],
    AllowedCredentialMethodCodes: ['Allowed sign-in methods', 'multi', 'Methods voters may use to sign in.'],
    AllowedContestKinds: ['Allowed contest kinds', 'multi', ''],
    Quorum: ['Quorum', 'quorum', 'Minimum turnout for the result to stand.'],
    Reminders: ['Reminders (days before close)', 'days', 'Comma-separated, for example 7, 2, 1.'],
    Languages: ['Ballot languages', 'csv', 'Comma-separated language codes.'],
};

@Component({
    selector: 'voting-election-wizard',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective, ContributionHostComponent],
    template: `
        <section class="wizard" aria-labelledby="wiz-title">
            <header class="wiz-head">
                <h2 id="wiz-title">New election</h2>
                <button type="button" mjButton variant="secondary" size="sm" (click)="Cancelled.emit()" [disabled]="IsCreating">
                    <i class="fa-solid fa-xmark"></i> Cancel
                </button>
            </header>

            @if (IsLoading) {
                <p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading election types...</p>
            } @else if (LoadError) {
                <div class="banner banner-error" role="alert"><i class="fa-solid fa-triangle-exclamation"></i><span>{{ LoadError }}</span></div>
            } @else {
                <ol class="stepper" aria-label="Wizard steps">
                    @for (s of Steps; track s.key; let i = $index) {
                        <li [class.current]="i === StepIndex" [class.done]="i < StepIndex" [attr.aria-current]="i === StepIndex ? 'step' : null">
                            <span class="bubble">{{ i + 1 }}</span><span class="label">{{ s.label }}</span>
                        </li>
                    }
                </ol>

                <div class="step-body">
                    <h3 tabindex="-1" #stepHeading>{{ CurrentStep?.label }}</h3>

                    @switch (CurrentStep?.key) {
                        @case ('type') {
                            @if (Types.length === 0) {
                                <p class="muted">No active election types are available.</p>
                            }
                            <div class="type-grid" role="radiogroup" aria-label="Election type">
                                @for (t of Types; track t.Code) {
                                    <label class="type-card" [class.selected]="Draft.TypeCode === t.Code">
                                        <input type="radio" name="electionType" class="sr-only" [value]="t.Code" [ngModel]="Draft.TypeCode" (ngModelChange)="ChooseType($event)" />
                                        <i [class]="t.Icon"></i>
                                        <span class="type-name">{{ t.Name }}</span>
                                        <span class="type-desc">{{ t.Description }}</span>
                                    </label>
                                }
                            </div>
                        }
                        @case ('details') {
                            <div class="field-grid">
                                <div class="field wide">
                                    <label for="wiz-name">Name</label>
                                    <input id="wiz-name" class="input" [(ngModel)]="Draft.Name" />
                                </div>
                                <div class="field wide">
                                    <label for="wiz-desc">Description</label>
                                    <textarea id="wiz-desc" class="input" rows="3" [(ngModel)]="Draft.Description"></textarea>
                                </div>
                                <div class="field">
                                    <label for="wiz-record">Record date</label>
                                    <input id="wiz-record" type="date" class="input" [(ngModel)]="Draft.RecordDate" />
                                </div>
                                <div class="field">
                                    <label for="wiz-tz">Time zone</label>
                                    <input id="wiz-tz" class="input" [(ngModel)]="Draft.TimeZone" />
                                </div>
                                <div class="field">
                                    <label for="wiz-opens">Voting opens</label>
                                    <input id="wiz-opens" type="datetime-local" class="input" [(ngModel)]="Draft.OpensAt" />
                                </div>
                                <div class="field">
                                    <label for="wiz-closes">Voting closes</label>
                                    <input id="wiz-closes" type="datetime-local" class="input" [(ngModel)]="Draft.ClosesAt" />
                                </div>
                            </div>

                            <h4>Policy</h4>
                            <p class="hint">
                                {{ SelectedType?.Name }} sets the policy for this election. Only the settings its type allows to be changed are editable;
                                the rest are fixed.
                            </p>
                            @if (PolicyFields.length === 0) {
                                <p class="muted">This election type allows no per-election policy changes.</p>
                            }
                            <div class="field-grid">
                                @for (f of PolicyFields; track f.Key) {
                                    <div class="field" [class.wide]="f.Control === 'multi' || f.Control === 'json'">
                                        @switch (f.Control) {
                                            @case ('select') {
                                                <label [for]="'pf-' + f.Key">{{ f.Label }}</label>
                                                <select [id]="'pf-' + f.Key" class="input" [ngModel]="Draft.Policy[f.Key]" (ngModelChange)="SetPolicy(f.Key, $event)" [attr.aria-describedby]="'ph-' + f.Key">
                                                    @for (o of f.Options; track o) {
                                                        <option [value]="o">{{ o }}</option>
                                                    }
                                                </select>
                                            }
                                            @case ('number') {
                                                <label [for]="'pf-' + f.Key">{{ f.Label }}</label>
                                                <input [id]="'pf-' + f.Key" type="number" min="0" class="input" [ngModel]="Draft.Policy[f.Key]" (ngModelChange)="SetPolicy(f.Key, $event)" [attr.aria-describedby]="'ph-' + f.Key" />
                                            }
                                            @case ('boolean') {
                                                <span class="lbl">{{ f.Label }}</span>
                                                <label class="check"><input type="checkbox" [checked]="Draft.Policy[f.Key] === true" (change)="SetPolicy(f.Key, !(Draft.Policy[f.Key] === true))" [attr.aria-describedby]="'ph-' + f.Key" /> Enabled</label>
                                            }
                                            @case ('multi') {
                                                <fieldset class="field">
                                                    <legend>{{ f.Label }}</legend>
                                                    <div class="checks">
                                                        @for (o of f.Options; track o) {
                                                            <label class="check"><input type="checkbox" [checked]="PolicyHas(f.Key, o)" (change)="TogglePolicyItem(f.Key, o)" /> {{ o }}</label>
                                                        }
                                                    </div>
                                                </fieldset>
                                            }
                                            @case ('quorum') {
                                                <label [for]="'pf-' + f.Key">{{ f.Label }}</label>
                                                <div class="inline">
                                                    <select [id]="'pf-' + f.Key" class="input" [(ngModel)]="Draft.QuorumKind" [attr.aria-describedby]="'ph-' + f.Key">
                                                        <option value="">None</option>
                                                        <option value="Count">Number of voters</option>
                                                        <option value="Percent">Percent of eligible</option>
                                                    </select>
                                                    @if (Draft.QuorumKind) {
                                                        <input type="number" min="1" class="input" [(ngModel)]="Draft.QuorumValue" aria-label="Quorum value" />
                                                    }
                                                </div>
                                            }
                                            @case ('days') {
                                                <label [for]="'pf-' + f.Key">{{ f.Label }}</label>
                                                <input [id]="'pf-' + f.Key" class="input" [(ngModel)]="Draft.RemindersText" [attr.aria-describedby]="'ph-' + f.Key" />
                                            }
                                            @case ('csv') {
                                                <label [for]="'pf-' + f.Key">{{ f.Label }}</label>
                                                <input [id]="'pf-' + f.Key" class="input" [(ngModel)]="Draft.LanguagesText" [attr.aria-describedby]="'ph-' + f.Key" />
                                            }
                                            @case ('json') {
                                                <label [for]="'pf-' + f.Key">{{ f.Label }} (JSON)</label>
                                                <textarea [id]="'pf-' + f.Key" class="input mono" rows="3" [ngModel]="Draft.JsonPolicy[f.Key]" (ngModelChange)="SetJsonPolicy(f.Key, $event)"></textarea>
                                            }
                                        }
                                        @if (f.Help) {
                                            <p class="hint" [id]="'ph-' + f.Key">{{ f.Help }}</p>
                                        }
                                    </div>
                                }
                            </div>

                            @if (FixedPolicy.length > 0) {
                                <h4>Fixed by the election type</h4>
                                <dl class="facts">
                                    @for (f of FixedPolicy; track f.Key) {
                                        <div><dt>{{ f.Label }}</dt><dd>{{ f.Value }}</dd></div>
                                    }
                                </dl>
                            }
                        }
                        @case ('contests') {
                            @for (c of Draft.Contests; track $index; let ci = $index) {
                                <fieldset class="contest-card">
                                    <legend>Contest {{ ci + 1 }}</legend>
                                    <div class="field-grid">
                                        <div class="field wide">
                                            <label [for]="'c-name-' + ci">Name</label>
                                            <input [id]="'c-name-' + ci" class="input" [(ngModel)]="c.Name" />
                                        </div>
                                        <div class="field wide">
                                            <label [for]="'c-desc-' + ci">Description</label>
                                            <textarea [id]="'c-desc-' + ci" class="input" rows="2" [(ngModel)]="c.Description"></textarea>
                                        </div>
                                        <div class="field">
                                            <label [for]="'c-kind-' + ci">Kind</label>
                                            <select [id]="'c-kind-' + ci" class="input" [ngModel]="c.Kind" (ngModelChange)="ChangeKind(c, $event)">
                                                @for (k of AllowedKinds; track k) {
                                                    <option [value]="k">{{ k }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="field">
                                            <label [for]="'c-tally-' + ci">Tally method</label>
                                            <select [id]="'c-tally-' + ci" class="input" [(ngModel)]="c.TallyMethodCode">
                                                @for (m of TallyChoices; track m.Code) {
                                                    <option [value]="m.Code">{{ m.Name }}</option>
                                                }
                                            </select>
                                        </div>
                                        <div class="field">
                                            <label [for]="'c-seats-' + ci">Seats</label>
                                            <input [id]="'c-seats-' + ci" type="number" min="1" class="input" [(ngModel)]="c.Seats" [disabled]="IsYesNo(c)" />
                                        </div>
                                        <div class="field">
                                            <label [for]="'c-class-' + ci">Restrict to voting class (optional)</label>
                                            <input [id]="'c-class-' + ci" class="input" [(ngModel)]="c.VotingClassFilter" />
                                        </div>
                                        <div class="field">
                                            <label [for]="'c-min-' + ci">Minimum selections</label>
                                            <input [id]="'c-min-' + ci" type="number" min="0" class="input" [(ngModel)]="c.MinSelections" />
                                        </div>
                                        <div class="field">
                                            <label [for]="'c-max-' + ci">Maximum selections (blank for default)</label>
                                            <input [id]="'c-max-' + ci" type="number" min="1" class="input" [(ngModel)]="c.MaxSelections" />
                                        </div>
                                        @if (IsYesNo(c) || c.Threshold !== 'None') {
                                            <div class="field">
                                                <label [for]="'c-thr-' + ci">Pass threshold</label>
                                                <select [id]="'c-thr-' + ci" class="input" [(ngModel)]="c.Threshold">
                                                    @for (t of ThresholdKinds; track t) {
                                                        <option [value]="t">{{ t }}</option>
                                                    }
                                                </select>
                                            </div>
                                            @if (c.Threshold === 'Custom') {
                                                <div class="field">
                                                    <label [for]="'c-pct-' + ci">Custom threshold (%)</label>
                                                    <input [id]="'c-pct-' + ci" type="number" min="1" max="100" class="input" [(ngModel)]="c.CustomPercent" />
                                                </div>
                                            }
                                            <div class="field">
                                                <label [for]="'c-basis-' + ci">Threshold is measured against</label>
                                                <select [id]="'c-basis-' + ci" class="input" [(ngModel)]="c.ThresholdBasis">
                                                    <option value="VotesCast">Votes cast</option>
                                                    <option value="Eligible">All eligible voters</option>
                                                </select>
                                            </div>
                                        }
                                    </div>
                                    <div class="checks">
                                        <label class="check"><input type="checkbox" [(ngModel)]="c.AllowAbstain" [name]="'abstain-' + ci" /> Allow abstaining</label>
                                        @if (!IsYesNo(c)) {
                                            <label class="check"><input type="checkbox" [(ngModel)]="c.AllowWriteIn" [name]="'write-' + ci" (ngModelChange)="OnWriteInToggle(c)" /> Allow write-in candidates</label>
                                        }
                                    </div>

                                    <h4>Options</h4>
                                    @if (IsYesNo(c)) {
                                        <p class="hint">The first option is the affirmative. Labels can be renamed (for example Approve / Reject).</p>
                                    }
                                    <ul class="option-list">
                                        @for (o of c.Options; track $index; let oi = $index) {
                                            <li>
                                                <label class="sr-only" [for]="'o-label-' + ci + '-' + oi">Option {{ oi + 1 }} label</label>
                                                <input [id]="'o-label-' + ci + '-' + oi" class="input" placeholder="Label" [(ngModel)]="o.Label" />
                                                <label class="sr-only" [for]="'o-desc-' + ci + '-' + oi">Option {{ oi + 1 }} description</label>
                                                <input [id]="'o-desc-' + ci + '-' + oi" class="input" placeholder="Description (optional)" [(ngModel)]="o.Description" />
                                                @if (!IsYesNo(c)) {
                                                    <span class="row-actions">
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="MoveOption(c, oi, -1)" [disabled]="oi === 0" [attr.aria-label]="'Move option ' + (oi + 1) + ' up'"><i class="fa-solid fa-arrow-up"></i></button>
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="MoveOption(c, oi, 1)" [disabled]="oi === c.Options.length - 1" [attr.aria-label]="'Move option ' + (oi + 1) + ' down'"><i class="fa-solid fa-arrow-down"></i></button>
                                                        <button type="button" mjButton variant="secondary" size="sm" (click)="RemoveOption(c, oi)" [attr.aria-label]="'Remove option ' + (oi + 1)"><i class="fa-solid fa-trash"></i></button>
                                                    </span>
                                                }
                                            </li>
                                        }
                                    </ul>
                                    @if (!IsYesNo(c)) {
                                        <div class="actions">
                                            <button type="button" mjButton variant="secondary" size="sm" (click)="c.Options.push(NewOptionDraft())"><i class="fa-solid fa-plus"></i> Add option</button>
                                            @if (c.AllowWriteIn && !HasWriteInOption(c)) {
                                                <button type="button" mjButton variant="secondary" size="sm" (click)="AddWriteInOption(c)"><i class="fa-solid fa-pen"></i> Add write-in slot</button>
                                            }
                                        </div>
                                    }
                                    <div class="actions">
                                        <button type="button" mjButton variant="secondary" size="sm" (click)="RemoveContest(ci)"><i class="fa-solid fa-trash"></i> Remove contest</button>
                                    </div>
                                </fieldset>
                            }
                            <button type="button" mjButton variant="secondary" size="sm" (click)="AddContest()"><i class="fa-solid fa-plus"></i> Add contest</button>
                        }
                        @case ('eligibility') {
                            <div class="field">
                                <label for="el-source">Eligibility source</label>
                                <select id="el-source" class="input" [ngModel]="Draft.SourceCode" (ngModelChange)="ChooseSource($event)">
                                    <option value="">Choose a source...</option>
                                    @for (s of Sources; track s.Code) {
                                        <option [value]="s.Code">{{ s.Name }}</option>
                                    }
                                </select>
                                <p class="hint">{{ SourceDescription }}</p>
                            </div>
                            @switch (Draft.SourceCode) {
                                @case ('entity-query') {
                                    <div class="field-grid">
                                        <div class="field wide">
                                            <label for="eq-entity">Entity</label>
                                            <input id="eq-entity" class="input" list="wiz-entities" [(ngModel)]="Draft.EntityQuery.EntityName" />
                                        </div>
                                        <div class="field wide">
                                            <label for="eq-filter">Filter (SQL WHERE clause, optional)</label>
                                            <textarea id="eq-filter" class="input mono" rows="2" [(ngModel)]="Draft.EntityQuery.ExtraFilter"></textarea>
                                        </div>
                                        <div class="field"><label for="eq-person">Person ID field</label><input id="eq-person" class="input mono" [(ngModel)]="Draft.EntityQuery.PersonIDField" /></div>
                                        <div class="field"><label for="eq-class">Voting class field</label><input id="eq-class" class="input mono" [(ngModel)]="Draft.EntityQuery.VotingClassField" /></div>
                                        <div class="field"><label for="eq-weight">Weight field</label><input id="eq-weight" class="input mono" [(ngModel)]="Draft.EntityQuery.WeightField" /></div>
                                        <div class="field"><label for="eq-key">Source key field</label><input id="eq-key" class="input mono" [(ngModel)]="Draft.EntityQuery.SourceKeyField" /></div>
                                        <div class="field"><label for="eq-org">Representing organization field</label><input id="eq-org" class="input mono" [(ngModel)]="Draft.EntityQuery.RepresentingOrganizationIDField" /></div>
                                    </div>
                                    <datalist id="wiz-entities">
                                        @for (n of EntityNames; track n) {
                                            <option [value]="n"></option>
                                        }
                                    </datalist>
                                }
                                @case ('csv') {
                                    <div class="field">
                                        <label for="csv-file">Upload a CSV file</label>
                                        <input id="csv-file" type="file" accept=".csv,text/csv" class="input" (change)="OnCsvFile($event)" />
                                    </div>
                                    <div class="field">
                                        <label for="csv-text">Or paste CSV</label>
                                        <textarea id="csv-text" class="input mono" rows="8" [(ngModel)]="Draft.CsvText" aria-describedby="csv-hint"></textarea>
                                        <p class="hint" id="csv-hint">Columns: Email, SourceKey, VotingClass, Weight, RepresentingOrganization. People are matched by email; rows that do not match are reported, never created.</p>
                                    </div>
                                }
                                @default {
                                    @if (Draft.SourceCode) {
                                        <div class="field">
                                            <label for="raw-settings">Source settings (JSON)</label>
                                            <textarea id="raw-settings" class="input mono" rows="6" [(ngModel)]="Draft.RawSettings"></textarea>
                                        </div>
                                    }
                                }
                            }
                        }
                        @case ('anchors') {
                            <p class="hint">Link the election to the records it is about (for example a meeting, a motion or a project). This is optional.</p>
                            @for (a of Draft.Anchors; track $index; let ai = $index) {
                                <div class="anchor-row">
                                    <div class="field"><label [for]="'an-e-' + ai">Entity</label><input [id]="'an-e-' + ai" class="input" list="wiz-entities" [(ngModel)]="a.EntityName" /></div>
                                    <div class="field"><label [for]="'an-r-' + ai">Record ID</label><input [id]="'an-r-' + ai" class="input mono" [(ngModel)]="a.RecordID" /></div>
                                    <div class="field"><label [for]="'an-o-' + ai">Role</label><input [id]="'an-o-' + ai" class="input" [(ngModel)]="a.Role" /></div>
                                    <label class="check"><input type="checkbox" [(ngModel)]="a.IsPrimary" [name]="'prim-' + ai" /> Primary</label>
                                    <button type="button" mjButton variant="secondary" size="sm" (click)="Draft.Anchors.splice(ai, 1)" [attr.aria-label]="'Remove linked record ' + (ai + 1)"><i class="fa-solid fa-trash"></i></button>
                                </div>
                            }
                            <datalist id="wiz-entities">
                                @for (n of EntityNames; track n) {
                                    <option [value]="n"></option>
                                }
                            </datalist>
                            <button type="button" mjButton variant="secondary" size="sm" (click)="Draft.Anchors.push(NewAnchorDraft())"><i class="fa-solid fa-plus"></i> Add linked record</button>
                        }
                        @case ('review') {
                            <dl class="facts">
                                <div><dt>Type</dt><dd>{{ SelectedType?.Name }}</dd></div>
                                <div><dt>Name</dt><dd>{{ Draft.Name }}</dd></div>
                                <div><dt>Opens</dt><dd>{{ Draft.OpensAt ? (Draft.OpensAt | date: 'medium') : 'Not scheduled' }}</dd></div>
                                <div><dt>Closes</dt><dd>{{ Draft.ClosesAt ? (Draft.ClosesAt | date: 'medium') : 'Not scheduled' }}</dd></div>
                                <div><dt>Eligibility source</dt><dd>{{ SourceName }}</dd></div>
                                <div><dt>Linked records</dt><dd>{{ Draft.Anchors.length }}</dd></div>
                            </dl>
                            <h4>Policy changes from the type's defaults</h4>
                            @if (OverrideSummary.length === 0) {
                                <p class="muted">None. The election uses the type's defaults.</p>
                            } @else {
                                <ul>
                                    @for (o of OverrideSummary; track o) {
                                        <li>{{ o }}</li>
                                    }
                                </ul>
                            }
                            <h4>Contests</h4>
                            <ul>
                                @for (c of Draft.Contests; track $index) {
                                    <li>
                                        <strong>{{ c.Name }}</strong> ({{ c.Kind }}, {{ c.Seats }} {{ c.Seats === 1 ? 'seat' : 'seats' }}, {{ TallyName(c.TallyMethodCode) }}):
                                        {{ OptionList(c) }}
                                    </li>
                                }
                            </ul>
                        }
                        @default {
                            @if (CurrentComponent) {
                                <voting-contribution-host
                                    [ComponentType]="CurrentComponent"
                                    [Inputs]="ContributionInputs"
                                    (Valid)="OnContributedValid($event)"
                                ></voting-contribution-host>
                            } @else {
                                <p class="muted">This step is not available: its component is not registered.</p>
                            }
                        }
                    }

                    <div aria-live="assertive">
                        @if (ShowErrors && StepErrors.length > 0) {
                            <div class="banner banner-error" role="alert">
                                <i class="fa-solid fa-circle-exclamation"></i>
                                <ul>
                                    @for (e of StepErrors; track e) {
                                        <li>{{ e }}</li>
                                    }
                                </ul>
                            </div>
                        }
                        @if (CreateError) {
                            <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i><span>{{ CreateError }}</span></div>
                        }
                    </div>
                </div>

                <footer class="wiz-foot">
                    <button type="button" mjButton variant="secondary" size="md" (click)="Back()" [disabled]="StepIndex === 0 || IsCreating">
                        <i class="fa-solid fa-arrow-left"></i> Back
                    </button>
                    @if (IsReview) {
                        <button type="button" mjButton variant="primary" size="md" (click)="Create()" [disabled]="IsCreating">
                            <i class="fa-solid" [class.fa-check]="!IsCreating" [class.fa-spinner]="IsCreating" [class.fa-spin]="IsCreating"></i>
                            {{ IsCreating ? 'Creating...' : 'Create election' }}
                        </button>
                    } @else {
                        <button type="button" mjButton variant="primary" size="md" (click)="Next()">
                            Next <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    }
                </footer>
            }
        </section>
    `,
    styles: [
        ELECTION_COMMON_STYLES,
        `
            .wizard { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            .wiz-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
            .wiz-head h2 { margin: 0; font-size: 1.3rem; color: var(--mj-text-primary); }
            .stepper { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
            .stepper li { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--mj-text-muted); font-size: 0.85rem; }
            .stepper .bubble { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 50%; border: 1px solid var(--mj-border-strong); font-size: 0.75rem; }
            .stepper li.current { color: var(--mj-text-primary); font-weight: 700; }
            .stepper li.current .bubble { background: var(--mj-brand-primary); color: var(--mj-text-inverse); border-color: var(--mj-brand-primary); }
            .stepper li.done .bubble { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); border-color: var(--mj-status-success-border); }
            .step-body h3 { margin: 0 0 0.75rem; font-size: 1.1rem; color: var(--mj-text-primary); }
            .step-body h3:focus { outline: none; }
            .step-body h4 { margin: 1rem 0 0.35rem; font-size: 0.95rem; color: var(--mj-text-secondary); }
            .type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.75rem; }
            .type-card { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.9rem 1rem; border: 1px solid var(--mj-border-default); border-radius: 10px; cursor: pointer; background: var(--mj-bg-surface); }
            .type-card:hover { background: var(--mj-bg-surface-hover); }
            .type-card:focus-within { outline: 2px solid var(--mj-border-focus); outline-offset: 2px; }
            .type-card.selected { border-color: var(--mj-brand-primary); background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface)); }
            .type-card i { color: var(--mj-brand-primary); font-size: 1.25rem; }
            .type-name { font-weight: 700; color: var(--mj-text-primary); }
            .type-desc { font-size: 0.85rem; color: var(--mj-text-secondary); }
            .lbl { font-weight: 600; font-size: 0.85rem; color: var(--mj-text-secondary); }
            .inline { display: flex; gap: 0.5rem; }
            .contest-card { border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 0.75rem 1rem; margin: 0 0 1rem; }
            .contest-card legend { font-weight: 700; color: var(--mj-text-primary); padding: 0 0.4rem; }
            .option-list { list-style: none; margin: 0 0 0.5rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
            .option-list li { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
            .option-list .input { flex: 1; min-width: 10rem; width: auto; }
            .anchor-row { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: 0.5rem; }
            .anchor-row .field { flex: 1; min-width: 10rem; margin-bottom: 0; }
            .banner ul { margin: 0; padding-left: 1.1rem; flex: 1; }
            .wiz-foot { display: flex; justify-content: space-between; margin-top: 1.25rem; padding-top: 0.75rem; border-top: 1px solid var(--mj-border-subtle); }
        `,
    ],
})
export class ElectionWizardComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly api = inject(VotingApiService);

    @Input({ required: true }) Provider!: IMetadataProvider;
    @Output() Created = new EventEmitter<string>();
    @Output() Cancelled = new EventEmitter<void>();

    public readonly ThresholdKinds = THRESHOLD_KINDS;

    public IsLoading = true;
    public LoadError: string | null = null;
    public Types: TypeChoice[] = [];
    public TallyChoices: Array<{ Code: string; Name: string }> = [];
    public Sources: Array<{ Code: string; Name: string; Description: string }> = [];
    public EntityNames: string[] = [];

    public Draft: WizardDraft = NewWizardDraft();
    public Steps: ElectionSetupStepDescriptor[] = [];
    public StepIndex = 0;
    public ShowErrors = false;
    public StepErrors: string[] = [];
    public IsCreating = false;
    public CreateError: string | null = null;

    public PolicyFields: PolicyField[] = [];
    public FixedPolicy: Array<{ Key: string; Label: string; Value: string }> = [];

    private typeConfig: IElectionTypeConfiguration | null = null;
    private contributedValid = new Map<string, boolean>();
    private multiSeatCodes: string[] = [];

    async ngOnInit(): Promise<void> {
        try {
            const engine = VotingEngineBase.Instance;
            await engine.Config(false, undefined, this.Provider);
            this.Types = engine.ActiveElectionTypes.map((t) => ({
                ID: t.ID,
                Code: t.Code,
                Name: t.Name,
                Description: t.Description ?? '',
                Icon: t.IconClass || 'fa-solid fa-ballot-check',
                UIDriverClass: t.UIDriverClass,
            }));
            this.TallyChoices = engine.ActiveTallyMethods.map((m) => ({ Code: m.Code, Name: m.Name }));
            this.multiSeatCodes = engine.ActiveTallyMethods.filter((m) => m.SupportsMultipleSeats).map((m) => m.Code);
            this.Sources = engine.ActiveEligibilitySourceTypes.map((s) => ({ Code: s.Code, Name: s.Name, Description: s.Description ?? '' }));
            this.EntityNames = this.Provider.Entities.map((e) => e.Name).sort();
            this.Steps = this.AssembleSteps();
        } catch (error) {
            LogError('[VotingElections] Wizard failed to load', undefined, error);
            this.LoadError = error instanceof Error ? error.message : 'The wizard could not be loaded.';
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    // -- derived state -------------------------------------------------------------------------------------------

    public get CurrentStep(): ElectionSetupStepDescriptor | undefined {
        return this.Steps[this.StepIndex];
    }

    public get IsReview(): boolean {
        return this.CurrentStep?.key === 'review';
    }

    public get SelectedType(): TypeChoice | undefined {
        return this.Types.find((t) => t.Code === this.Draft.TypeCode);
    }

    public get AllowedKinds(): VotingContestKind[] {
        const allowed = this.typeConfig?.AllowedContestKinds;
        return allowed && allowed.length > 0 ? allowed : CONTEST_KINDS;
    }

    public get SourceDescription(): string {
        return this.Sources.find((s) => s.Code === this.Draft.SourceCode)?.Description ?? '';
    }

    public get SourceName(): string {
        return this.Sources.find((s) => s.Code === this.Draft.SourceCode)?.Name ?? 'Not chosen';
    }

    public get CurrentComponent(): ReturnType<typeof ResolveStepComponent> {
        const step = this.CurrentStep;
        return step ? ResolveStepComponent(step) : null;
    }

    public get ContributionInputs(): Record<string, unknown> {
        return {
            ElectionID: null,
            ElectionTypeCode: this.Draft.TypeCode,
            StepNumber: this.CurrentStep?.stepNumber ?? 0,
            Provider: this.Provider,
        };
    }

    public get OverrideSummary(): string[] {
        const overrides = BuildPolicyOverrides(this.Draft, this.typeConfig) as Record<string, unknown>;
        return Object.entries(overrides).map(([k, v]) => `${this.LabelFor(k)}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    }

    public IsYesNo(c: ContestDraft): boolean {
        return IsYesNoKind(c.Kind);
    }

    public HasWriteInOption(c: ContestDraft): boolean {
        return c.Options.some((o) => o.IsWriteIn);
    }

    /** The tally method's display name (the code only when the method is unknown). */
    public TallyName(code: string): string {
        return this.TallyChoices.find((m) => m.Code === code)?.Name ?? code;
    }

    public OptionList(c: ContestDraft): string {
        return c.Options.map((o) => (o.IsWriteIn ? `${o.Label || 'Write-in'} (write-in)` : o.Label)).join(', ');
    }

    public NewOptionDraft = NewOption;
    public NewAnchorDraft = NewAnchor;

    // -- step 1: type --------------------------------------------------------------------------------------------

    public ChooseType(code: string): void {
        if (code === this.Draft.TypeCode) {
            return;
        }
        const previous = this.Draft;
        const draft = NewWizardDraft();
        // Keep what the user already typed that does not depend on the type.
        draft.Name = previous.Name;
        draft.Description = previous.Description;
        draft.TypeCode = code;
        this.Draft = draft;
        const engine = VotingEngineBase.Instance;
        const type = this.Types.find((t) => t.Code === code);
        this.typeConfig = type ? engine.GetElectionTypeConfiguration(type.ID) : null;
        this.SeedPolicy();
        this.contributedValid.clear();
        this.Steps = this.AssembleSteps();
        this.ShowErrors = false;
    }

    private AssembleSteps(): ElectionSetupStepDescriptor[] {
        const type = this.SelectedType;
        const ctx: ElectionUIContext = {
            ElectionID: null,
            ElectionTypeID: type?.ID ?? '',
            ElectionTypeCode: this.Draft.TypeCode,
            Status: 'Draft',
            SecrecyMode: String(this.typeConfig?.SecrecyMode ?? ''),
            IsAdministrator: true,
        };
        return AssembleSetupSteps(ctx, type?.UIDriverClass ?? null);
    }

    // -- step 2: policy ------------------------------------------------------------------------------------------

    private SeedPolicy(): void {
        const config = this.typeConfig;
        const overridable = config?.OverridableKeys ?? [];
        const methods = VotingEngineBase.Instance.ActiveVoterCredentialMethods.map((m) => m.Code);
        const fields: PolicyField[] = [];
        for (const key of overridable) {
            const known = FIELD_LABELS[key];
            const control = known ? known[1] : 'json';
            const options =
                SELECT_OPTIONS[key] ??
                (key === 'AllowedCredentialMethodCodes' ? methods : key === 'AllowedContestKinds' ? [...CONTEST_KINDS] : []);
            fields.push({ Key: key, Label: known ? known[0] : key, Control: control, Options: options, Help: known ? known[2] : '' });
            const current = (config as Record<string, unknown> | null)?.[key];
            if (control === 'json') {
                this.Draft.JsonPolicy[key] = current === undefined ? '' : JSON.stringify(current, null, 2);
            } else if (key === 'Quorum') {
                const q = current as { Kind: 'Count' | 'Percent'; Value: number } | undefined;
                this.Draft.QuorumKind = q?.Kind ?? '';
                this.Draft.QuorumValue = q?.Value ?? null;
            } else if (key === 'Reminders') {
                this.Draft.RemindersText = ((current as { DaysBeforeClose?: number[] } | undefined)?.DaysBeforeClose ?? []).join(', ');
            } else if (key === 'Languages') {
                this.Draft.LanguagesText = ((current as string[] | undefined) ?? []).join(', ');
            } else {
                this.Draft.Policy[key] = current;
            }
        }
        this.PolicyFields = fields;

        const fixed: Array<{ Key: string; Label: string; Value: string }> = [];
        for (const key of Object.keys(FIELD_LABELS)) {
            const value = (config as Record<string, unknown> | null)?.[key];
            if (value !== undefined && !overridable.includes(key)) {
                fixed.push({ Key: key, Label: FIELD_LABELS[key][0], Value: Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value) });
            }
        }
        this.FixedPolicy = fixed;
        this.DefaultTally = config?.DefaultTallyMethodCode ?? 'plurality';
    }

    private DefaultTally = 'plurality';

    public SetPolicy(key: string, value: unknown): void {
        this.Draft.Policy[key] = value;
    }

    public SetJsonPolicy(key: string, text: string): void {
        this.Draft.JsonPolicy[key] = text;
    }

    public PolicyHas(key: string, item: string): boolean {
        const v = this.Draft.Policy[key];
        return Array.isArray(v) && v.includes(item);
    }

    public TogglePolicyItem(key: string, item: string): void {
        const current = Array.isArray(this.Draft.Policy[key]) ? (this.Draft.Policy[key] as string[]) : [];
        this.Draft.Policy[key] = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
    }

    private LabelFor(key: string): string {
        return FIELD_LABELS[key]?.[0] ?? key;
    }

    // -- step 3: contests ----------------------------------------------------------------------------------------

    public AddContest(): void {
        const kind = this.AllowedKinds[0] ?? 'Motion';
        this.Draft.Contests.push(NewContest(kind, this.DefaultTally));
    }

    public RemoveContest(index: number): void {
        this.Draft.Contests.splice(index, 1);
    }

    public ChangeKind(c: ContestDraft, kind: VotingContestKind): void {
        const wasYesNo = IsYesNoKind(c.Kind);
        c.Kind = kind;
        if (wasYesNo !== IsYesNoKind(kind)) {
            c.Options = [];
            c.TallyMethodCode = IsYesNoKind(kind) ? 'majority' : this.DefaultTally;
            c.Threshold = IsYesNoKind(kind) ? 'Majority' : 'None';
        }
        ApplyKindDefaults(c, this.DefaultTally);
    }

    public MoveOption(c: ContestDraft, index: number, delta: -1 | 1): void {
        const target = index + delta;
        if (target < 0 || target >= c.Options.length) {
            return;
        }
        [c.Options[index], c.Options[target]] = [c.Options[target], c.Options[index]];
    }

    public RemoveOption(c: ContestDraft, index: number): void {
        c.Options.splice(index, 1);
    }

    public AddWriteInOption(c: ContestDraft): void {
        c.Options.push({ Label: 'Write-in', Description: '', IsWriteIn: true });
    }

    public OnWriteInToggle(c: ContestDraft): void {
        if (!c.AllowWriteIn) {
            c.Options = c.Options.filter((o) => !o.IsWriteIn);
        }
    }

    // -- step 4: eligibility -------------------------------------------------------------------------------------

    public ChooseSource(code: string): void {
        this.Draft.SourceCode = code;
        const source = VotingEngineBase.Instance.GetEligibilitySourceTypeByCode(code);
        if (code !== 'entity-query' && code !== 'csv' && source?.Configuration) {
            this.Draft.RawSettings = source.Configuration;
        }
    }

    public async OnCsvFile(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            this.Draft.CsvText = await file.text();
        }
        this.cdr.detectChanges();
    }

    // -- navigation ----------------------------------------------------------------------------------------------

    public OnContributedValid(valid: boolean): void {
        const key = this.CurrentStep?.key;
        if (key) {
            this.contributedValid.set(key, valid);
        }
    }

    private ValidationContext(): ValidationContext {
        return {
            TypeConfig: this.typeConfig,
            ActiveTallyCodes: this.TallyChoices.map((t) => t.Code),
            MultiSeatTallyCodes: this.multiSeatCodes,
            ActiveSourceCodes: this.Sources.map((s) => s.Code),
        };
    }

    private ErrorsForStep(key: string): string[] {
        const ctx = this.ValidationContext();
        switch (key) {
            case 'type':
                return ValidateTypeStep(this.Draft);
            case 'details':
                return ValidateDetailsStep(this.Draft, ctx);
            case 'contests':
                return ValidateContestsStep(this.Draft, ctx);
            case 'eligibility':
                return ValidateEligibilityStep(this.Draft, ctx);
            case 'anchors':
                return ValidateAnchorsStep(this.Draft);
            case 'review':
                return ValidateAll(this.Draft, ctx);
            default:
                return this.contributedValid.get(key) === false ? ['Complete this step before continuing.'] : [];
        }
    }

    public Next(): void {
        const step = this.CurrentStep;
        if (!step) {
            return;
        }
        this.StepErrors = this.ErrorsForStep(step.key);
        this.ShowErrors = true;
        if (this.StepErrors.length > 0) {
            return;
        }
        this.ShowErrors = false;
        this.CreateError = null;
        if (this.StepIndex < this.Steps.length - 1) {
            this.StepIndex++;
            // Entering the contests step with nothing yet: start with one contest.
            if (this.CurrentStep?.key === 'contests' && this.Draft.Contests.length === 0) {
                this.AddContest();
            }
        }
    }

    public Back(): void {
        if (this.StepIndex > 0) {
            this.StepIndex--;
            this.ShowErrors = false;
            this.CreateError = null;
        }
    }

    public async Create(): Promise<void> {
        this.StepErrors = this.ErrorsForStep('review');
        this.ShowErrors = true;
        if (this.StepErrors.length > 0) {
            return;
        }
        this.IsCreating = true;
        this.CreateError = null;
        try {
            const result = await this.api.CreateElection(BuildCreateInput(this.Draft, this.typeConfig));
            if (!result.Success || !result.Output?.ElectionID) {
                this.CreateError = result.Message ?? 'The election could not be created.';
                return;
            }
            this.Created.emit(result.Output.ElectionID);
        } finally {
            this.IsCreating = false;
            this.cdr.detectChanges();
        }
    }
}
