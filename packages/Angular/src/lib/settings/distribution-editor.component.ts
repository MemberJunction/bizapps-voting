/**
 * DistributionEditorComponent — create/edit form for one BallotDistribution. Works on the entity
 * object directly (list/create/edit/retire all go through Save()), validating each field before
 * the entity is touched.
 */
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { mjBizAppsVotingBallotDistributionEntity } from '@mj-biz-apps/voting-entities';
import {
    GenerateDistributionKey,
    NormalizeOrigin,
    ParseJsonStringArray,
    ValidateHostPublicKey,
    ValidateSlug,
    ValidateTheme,
} from './distribution-validation';

export interface SignInMethodOption {
    Code: string;
    Name: string;
}

type DistributionStatus = mjBizAppsVotingBallotDistributionEntity['Status'];

interface FieldErrors {
    Name?: string;
    Slug?: string;
    Origin?: string;
    HostPublicKey?: string;
    Theme?: string;
    DefaultLanguage?: string;
}

@Component({
    selector: 'voting-distribution-editor',
    standalone: true,
    imports: [CommonModule, FormsModule, MJButtonDirective],
    template: `
        <form class="editor" (ngSubmit)="Save()" novalidate aria-labelledby="editor-heading">
            <h3 id="editor-heading">{{ IsNew ? 'New ballot distribution' : 'Edit ' + Distribution.Name }}</h3>

            <div class="grid">
                <div class="field">
                    <label for="dist-name">Name</label>
                    <input id="dist-name" name="name" class="input" type="text" maxlength="255" [(ngModel)]="Form.Name" [attr.aria-invalid]="!!Errors.Name" aria-describedby="err-name" />
                    <p class="error" id="err-name" role="alert">{{ Errors.Name }}</p>
                </div>

                <div class="field">
                    <label for="dist-slug">Slug</label>
                    <input id="dist-slug" name="slug" class="input mono" type="text" maxlength="100" autocomplete="off" [(ngModel)]="Form.Slug" [attr.aria-invalid]="!!Errors.Slug" aria-describedby="hint-slug err-slug" />
                    <p class="hint" id="hint-slug">Used in the public URL (/vote/slug). Lowercase letters, digits and hyphens.</p>
                    <p class="error" id="err-slug" role="alert">{{ Errors.Slug }}</p>
                </div>

                <div class="field">
                    <label for="dist-status">Status</label>
                    <select id="dist-status" name="status" class="input" [(ngModel)]="Form.Status">
                        @for (s of StatusOptions; track s) {
                            <option [value]="s">{{ s }}</option>
                        }
                    </select>
                    <p class="hint">Only Active distributions accept voter sessions. Paused refuses them temporarily; Retired is permanent.</p>
                </div>

                <div class="field">
                    <label for="dist-lang">Default language</label>
                    <input id="dist-lang" name="lang" class="input mono" type="text" maxlength="20" [(ngModel)]="Form.DefaultLanguage" [attr.aria-invalid]="!!Errors.DefaultLanguage" aria-describedby="err-lang" />
                    <p class="error" id="err-lang" role="alert">{{ Errors.DefaultLanguage }}</p>
                </div>

                <div class="field wide">
                    <label for="dist-key">Distribution key</label>
                    <div class="inline">
                        <input id="dist-key" class="input mono" type="text" readonly [value]="Form.DistributionKey" aria-describedby="hint-key" />
                        @if (IsNew) {
                            <button type="button" mjButton variant="secondary" size="sm" (click)="RegenerateKey()">
                                <i class="fa-solid fa-dice"></i> Regenerate
                            </button>
                        }
                    </div>
                    <p class="hint" id="hint-key">
                        Public identifier used as the audience of host assertions.
                        @if (!IsNew) {
                            It cannot change after creation, because hosts sign assertions for this value.
                        }
                    </p>
                </div>
            </div>

            <fieldset class="field wide">
                <legend>Allowed origins</legend>
                <p class="hint">Websites allowed to embed the ballot. Leave empty to allow same-origin use only.</p>
                @if (Form.AllowedOrigins.length > 0) {
                    <ul class="origin-list">
                        @for (origin of Form.AllowedOrigins; track origin) {
                            <li>
                                <code>{{ origin }}</code>
                                <button type="button" mjButton variant="secondary" size="sm" (click)="RemoveOrigin(origin)" [attr.aria-label]="'Remove origin ' + origin">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </li>
                        }
                    </ul>
                }
                <div class="inline">
                    <label for="dist-origin" class="sr-only">Add origin</label>
                    <input
                        id="dist-origin"
                        name="origin"
                        class="input mono"
                        type="text"
                        placeholder="https://www.example.org"
                        [(ngModel)]="OriginDraft"
                        (keydown.enter)="$event.preventDefault(); AddOrigin()"
                        [attr.aria-invalid]="!!Errors.Origin"
                        aria-describedby="err-origin"
                    />
                    <button type="button" mjButton variant="secondary" size="sm" (click)="AddOrigin()" [disabled]="!OriginDraft.trim()">
                        <i class="fa-solid fa-plus"></i> Add
                    </button>
                </div>
                <p class="error" id="err-origin" role="alert">{{ Errors.Origin }}</p>
            </fieldset>

            <fieldset class="field wide">
                <legend>Allowed sign-in methods</legend>
                <p class="hint">Credential methods voters may use through this distribution. Leave all unchecked to defer to the election's allowed methods.</p>
                @if (MethodOptions.length === 0) {
                    <p class="muted">No active sign-in methods are registered.</p>
                } @else {
                    <div class="checks">
                        @for (m of MethodOptions; track m.Code) {
                            <label class="check">
                                <input type="checkbox" [name]="'method-' + m.Code" [checked]="Form.Methods.includes(m.Code)" (change)="ToggleMethod(m.Code)" />
                                <span>{{ m.Name }} <code>{{ m.Code }}</code></span>
                            </label>
                        }
                    </div>
                }
            </fieldset>

            <div class="field wide">
                <label for="dist-pem">Host public key (PEM)</label>
                <textarea id="dist-pem" name="pem" class="input mono" rows="6" spellcheck="false" placeholder="-----BEGIN PUBLIC KEY-----" [(ngModel)]="Form.HostPublicKey" [attr.aria-invalid]="!!Errors.HostPublicKey" aria-describedby="hint-pem err-pem"></textarea>
                <p class="hint" id="hint-pem">RS256 public key the host portal's assertions are verified against. Required when the host-assertion sign-in method is allowed.</p>
                <p class="error" id="err-pem" role="alert">{{ Errors.HostPublicKey }}</p>
            </div>

            <div class="field wide">
                <label for="dist-theme">Theme (JSON)</label>
                <textarea id="dist-theme" name="theme" class="input mono" rows="5" spellcheck="false" placeholder='{"primaryColor": "..."}' [(ngModel)]="Form.Theme" [attr.aria-invalid]="!!Errors.Theme" aria-describedby="err-theme"></textarea>
                <p class="error" id="err-theme" role="alert">{{ Errors.Theme }}</p>
            </div>

            <div aria-live="polite">
                @if (SaveError) {
                    <div class="banner banner-error" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ SaveError }}</div>
                }
            </div>

            <div class="actions">
                <button type="submit" mjButton variant="primary" size="sm" [disabled]="IsSaving">
                    <i class="fa-solid" [class.fa-floppy-disk]="!IsSaving" [class.fa-spinner]="IsSaving" [class.fa-spin]="IsSaving"></i>
                    {{ IsNew ? 'Create distribution' : 'Save changes' }}
                </button>
                <button type="button" mjButton variant="secondary" size="sm" (click)="Cancelled.emit()" [disabled]="IsSaving">Cancel</button>
            </div>
        </form>
    `,
    styles: [
        `
            :host { display: block; }
            .editor { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: 10px; padding: 1rem 1.25rem; }
            h3 { margin: 0 0 0.75rem; color: var(--mj-text-primary); font-size: 1.05rem; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.75rem 1.25rem; }
            .field { display: flex; flex-direction: column; gap: 0.25rem; margin: 0 0 0.75rem; padding: 0; border: 0; min-width: 0; }
            .field.wide { grid-column: 1 / -1; }
            label, legend { font-weight: 600; font-size: 0.85rem; color: var(--mj-text-secondary); padding: 0; }
            .input { padding: 0.45rem 0.65rem; border: 1px solid var(--mj-border-default); border-radius: 6px; background: var(--mj-bg-surface); color: var(--mj-text-primary); font: inherit; width: 100%; box-sizing: border-box; }
            .input.mono, .mono { font-family: monospace; font-size: 0.85rem; }
            .input:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .input[aria-invalid='true'] { border-color: var(--mj-status-error); }
            textarea.input { resize: vertical; }
            .inline { display: flex; gap: 0.5rem; align-items: center; }
            .hint { margin: 0; font-size: 0.8rem; color: var(--mj-text-muted); }
            .error { margin: 0; font-size: 0.8rem; color: var(--mj-status-error-text); min-height: 0; }
            .error:empty { display: none; }
            .origin-list { list-style: none; margin: 0 0 0.5rem; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
            .origin-list li { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; padding: 0.3rem 0.5rem; background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-subtle); border-radius: 6px; }
            code { background: var(--mj-bg-surface-sunken); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.8em; color: var(--mj-text-primary); }
            .checks { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; }
            .check { display: inline-flex; gap: 0.5rem; align-items: center; font-weight: 400; color: var(--mj-text-primary); }
            .banner { display: flex; gap: 0.6rem; align-items: center; padding: 0.6rem 0.8rem; border-radius: 8px; margin-bottom: 0.75rem; }
            .banner-error { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border: 1px solid var(--mj-status-error-border); }
            .actions { display: flex; gap: 0.5rem; }
            .muted { color: var(--mj-text-muted); }
            .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        `,
    ],
})
export class DistributionEditorComponent implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);
    /** The distribution to edit, or a freshly created (NewRecord) entity for create. */
    @Input({ required: true }) Distribution!: mjBizAppsVotingBallotDistributionEntity;
    @Input() IsNew = false;
    @Input() MethodOptions: SignInMethodOption[] = [];
    @Input() Provider: IMetadataProvider | null = null;
    @Output() Saved = new EventEmitter<mjBizAppsVotingBallotDistributionEntity>();
    @Output() Cancelled = new EventEmitter<void>();

    public readonly StatusOptions: DistributionStatus[] = ['Draft', 'Active', 'Paused', 'Retired'];

    public Form = {
        Name: '',
        Slug: '',
        Status: 'Draft' as DistributionStatus,
        DefaultLanguage: 'en',
        DistributionKey: '',
        AllowedOrigins: [] as string[],
        Methods: [] as string[],
        HostPublicKey: '',
        Theme: '',
    };
    public OriginDraft = '';
    public Errors: FieldErrors = {};
    public SaveError: string | null = null;
    public IsSaving = false;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Distribution']) {
            this.LoadForm();
        }
    }

    public RegenerateKey(): void {
        this.Form.DistributionKey = GenerateDistributionKey();
    }

    public AddOrigin(): void {
        const result = NormalizeOrigin(this.OriginDraft);
        if (!result.Origin) {
            this.Errors.Origin = result.Error ?? 'Enter an http or https origin.';
            return;
        }
        this.Errors.Origin = undefined;
        if (!this.Form.AllowedOrigins.includes(result.Origin)) {
            this.Form.AllowedOrigins = [...this.Form.AllowedOrigins, result.Origin];
        }
        this.OriginDraft = '';
    }

    public RemoveOrigin(origin: string): void {
        this.Form.AllowedOrigins = this.Form.AllowedOrigins.filter((o) => o !== origin);
    }

    public ToggleMethod(code: string): void {
        this.Form.Methods = this.Form.Methods.includes(code)
            ? this.Form.Methods.filter((m) => m !== code)
            : [...this.Form.Methods, code];
    }

    public async Save(): Promise<void> {
        this.SaveError = null;
        if (this.OriginDraft.trim()) {
            this.AddOrigin();
            if (this.Errors.Origin) {
                return;
            }
        }
        this.Errors = await this.Validate();
        if (Object.values(this.Errors).some((e) => !!e)) {
            return;
        }

        this.IsSaving = true;
        try {
            const d = this.Distribution;
            d.Name = this.Form.Name.trim();
            d.Slug = this.Form.Slug.trim();
            d.Status = this.Form.Status;
            d.DefaultLanguage = this.Form.DefaultLanguage.trim();
            if (this.IsNew) {
                d.DistributionKey = this.Form.DistributionKey;
            }
            d.AllowedOrigins = this.Form.AllowedOrigins.length > 0 ? JSON.stringify(this.Form.AllowedOrigins) : null;
            d.AllowedCredentialMethods = this.Form.Methods.length > 0 ? JSON.stringify(this.Form.Methods) : null;
            d.HostPublicKey = this.Form.HostPublicKey.trim() ? this.Form.HostPublicKey.trim() : null;
            d.Theme = this.Form.Theme.trim() ? this.Form.Theme.trim() : null;

            const ok = await d.Save();
            if (!ok) {
                this.SaveError = d.LatestResult?.CompleteMessage || d.LatestResult?.Message || 'The distribution could not be saved.';
                return;
            }
            this.Saved.emit(d);
        } catch (error) {
            LogError('[VotingSettings] Failed to save distribution', undefined, error);
            this.SaveError = error instanceof Error ? error.message : 'The distribution could not be saved.';
        } finally {
            this.IsSaving = false;
            this.cdr.detectChanges();
        }
    }

    private LoadForm(): void {
        const d = this.Distribution;
        this.Errors = {};
        this.SaveError = null;
        this.OriginDraft = '';
        this.Form = {
            Name: d.Name ?? '',
            Slug: d.Slug ?? '',
            Status: d.Status ?? 'Draft',
            DefaultLanguage: d.DefaultLanguage || 'en',
            DistributionKey: this.IsNew ? GenerateDistributionKey() : d.DistributionKey,
            AllowedOrigins: ParseJsonStringArray(d.AllowedOrigins),
            Methods: ParseJsonStringArray(d.AllowedCredentialMethods).map((m) => m.toLowerCase()),
            HostPublicKey: d.HostPublicKey ?? '',
            Theme: d.Theme ?? '',
        };
    }

    private async Validate(): Promise<FieldErrors> {
        const errors: FieldErrors = {};
        if (!this.Form.Name.trim()) {
            errors.Name = 'A name is required.';
        }
        const slugError = ValidateSlug(this.Form.Slug.trim());
        if (slugError) {
            errors.Slug = slugError;
        } else if (await this.SlugTaken(this.Form.Slug.trim())) {
            errors.Slug = 'Another distribution already uses this slug. Slugs are unique across all elections.';
        }
        if (!this.Form.DefaultLanguage.trim()) {
            errors.DefaultLanguage = 'A default language is required (for example, en).';
        }
        const needsKey = this.Form.Methods.includes('host-assertion');
        const pemError = ValidateHostPublicKey(this.Form.HostPublicKey, needsKey);
        if (pemError) {
            errors.HostPublicKey = pemError;
        }
        const themeError = ValidateTheme(this.Form.Theme);
        if (themeError) {
            errors.Theme = themeError;
        }
        return errors;
    }

    private async SlugTaken(slug: string): Promise<boolean> {
        if (!this.Provider) {
            return false;
        }
        const rv = RunView.FromMetadataProvider(this.Provider);
        const res = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ_BizApps_Voting: Ballot Distributions',
            ExtraFilter: `Slug='${slug.replace(/'/g, "''")}'`,
            ResultType: 'simple',
            Fields: ['ID'],
        });
        if (!res.Success) {
            return false; // the unique constraint still protects the write
        }
        return res.Results.some((r) => this.IsNew || r.ID.toLowerCase() !== this.Distribution.ID.toLowerCase());
    }
}
