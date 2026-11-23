/**
 * Pure model for the New Election wizard: the draft, defaults per contest kind, validation per step,
 * and conversion to the Voting.CreateElection input. No Angular, so it can be unit tested.
 */
import {
    ResolveElectionConfiguration,
    ValidateResolvedConfiguration,
    VOTING_APP_DEFAULTS,
    type IElectionConfiguration,
    type IElectionTypeConfiguration,
    type VotingAnchor,
    type VotingContestKind,
    type VotingContestSpec,
    type VotingCreateElectionInput,
    type VotingThresholdBasis,
    type VotingThresholdKind,
} from '@mj-biz-apps/voting-entities';

export const CONTEST_KINDS: VotingContestKind[] = ['Motion', 'Office', 'Question', 'Amendment', 'StandardsItem'];
export const THRESHOLD_KINDS: VotingThresholdKind[] = ['None', 'Majority', 'ThreeFifths', 'TwoThirds', 'ThreeQuarters', 'Unanimous', 'Custom'];

/** Kinds whose options are fixed Yes/No choices (the first option is the affirmative). */
export function IsYesNoKind(kind: VotingContestKind): boolean {
    return kind === 'Motion' || kind === 'Question' || kind === 'Amendment';
}

/** Top-level CreateElection fields that policy keys map to; every other policy key goes in Configuration. */
export const TOP_LEVEL_POLICY_KEYS = ['SecrecyMode', 'AssuranceTier', 'ResultsTiming', 'ResultsAudience'] as const;

export interface OptionDraft {
    Label: string;
    Description: string;
    IsWriteIn: boolean;
}

export interface ContestDraft {
    Name: string;
    Description: string;
    Kind: VotingContestKind;
    Seats: number;
    TallyMethodCode: string;
    Threshold: VotingThresholdKind;
    /** Percent (0-100) when Threshold is Custom. */
    CustomPercent: number | null;
    ThresholdBasis: VotingThresholdBasis;
    AllowAbstain: boolean;
    AllowWriteIn: boolean;
    MinSelections: number;
    MaxSelections: number | null;
    VotingClassFilter: string;
    Options: OptionDraft[];
}

export interface AnchorDraft {
    EntityName: string;
    RecordID: string;
    Role: string;
    IsPrimary: boolean;
}

export interface EntityQueryDraft {
    EntityName: string;
    ExtraFilter: string;
    PersonIDField: string;
    VotingClassField: string;
    WeightField: string;
    SourceKeyField: string;
    RepresentingOrganizationIDField: string;
}

export interface WizardDraft {
    TypeCode: string;
    Name: string;
    Description: string;
    /** `YYYY-MM-DD`. */
    RecordDate: string;
    /** `datetime-local` values. */
    OpensAt: string;
    ClosesAt: string;
    TimeZone: string;
    /** Values for the type's overridable keys, seeded from the type's resolved defaults. */
    Policy: Record<string, unknown>;
    QuorumKind: '' | 'Count' | 'Percent';
    QuorumValue: number | null;
    RemindersText: string;
    LanguagesText: string;
    /** Raw JSON text for overridable keys this wizard has no dedicated editor for. */
    JsonPolicy: Record<string, string>;
    Contests: ContestDraft[];
    SourceCode: string;
    EntityQuery: EntityQueryDraft;
    CsvText: string;
    /** Settings JSON for eligibility sources other than entity-query and csv. */
    RawSettings: string;
    Anchors: AnchorDraft[];
}

export function NewEntityQueryDraft(): EntityQueryDraft {
    return {
        EntityName: '',
        ExtraFilter: '',
        PersonIDField: 'PersonID',
        VotingClassField: '',
        WeightField: '',
        SourceKeyField: '',
        RepresentingOrganizationIDField: '',
    };
}

export function NewWizardDraft(): WizardDraft {
    return {
        TypeCode: '',
        Name: '',
        Description: '',
        RecordDate: '',
        OpensAt: '',
        ClosesAt: '',
        TimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        Policy: {},
        QuorumKind: '',
        QuorumValue: null,
        RemindersText: '',
        LanguagesText: '',
        JsonPolicy: {},
        Contests: [],
        SourceCode: '',
        EntityQuery: NewEntityQueryDraft(),
        CsvText: '',
        RawSettings: '',
        Anchors: [],
    };
}

export function NewOption(label = ''): OptionDraft {
    return { Label: label, Description: '', IsWriteIn: false };
}

/** Applies the defaults that go with a contest kind (options, selection limits, threshold). */
export function ApplyKindDefaults(contest: ContestDraft, defaultTallyCode: string): void {
    if (IsYesNoKind(contest.Kind)) {
        contest.Seats = 1;
        contest.MinSelections = 1;
        contest.MaxSelections = 1;
        contest.AllowWriteIn = false;
        if (contest.Threshold === 'None') {
            contest.Threshold = 'Majority';
        }
        if (contest.Options.length === 0 || contest.Options.some((o) => o.IsWriteIn)) {
            contest.Options = [NewOption('Yes'), NewOption('No')];
        }
        if (!contest.TallyMethodCode) {
            contest.TallyMethodCode = 'majority';
        }
    } else {
        contest.Threshold = contest.Kind === 'Office' ? 'None' : contest.Threshold;
        if (!contest.TallyMethodCode) {
            contest.TallyMethodCode = defaultTallyCode;
        }
    }
}

export function NewContest(kind: VotingContestKind, defaultTallyCode: string): ContestDraft {
    const contest: ContestDraft = {
        Name: '',
        Description: '',
        Kind: kind,
        Seats: 1,
        TallyMethodCode: '',
        Threshold: 'None',
        CustomPercent: null,
        ThresholdBasis: 'VotesCast',
        AllowAbstain: true,
        AllowWriteIn: false,
        MinSelections: 0,
        MaxSelections: null,
        VotingClassFilter: '',
        Options: [],
    };
    ApplyKindDefaults(contest, defaultTallyCode);
    return contest;
}

export function NewAnchor(): AnchorDraft {
    return { EntityName: '', RecordID: '', Role: '', IsPrimary: false };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ValidationContext {
    TypeConfig: IElectionTypeConfiguration | null;
    ActiveTallyCodes: string[];
    MultiSeatTallyCodes: string[];
    ActiveSourceCodes: string[];
}

// -- policy ------------------------------------------------------------------------------------------------------

function ParseDays(text: string): number[] | null {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    const days = parts.map(Number);
    return days.every((d) => Number.isInteger(d) && d >= 0) ? days : null;
}

/** The election-level overrides the draft represents: only overridable keys whose value differs from the type default. */
export function BuildPolicyOverrides(draft: WizardDraft, typeConfig: IElectionTypeConfiguration | null): IElectionConfiguration {
    const overridable = typeConfig?.OverridableKeys ?? [];
    const resolvedDefaults = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig ?? undefined, undefined) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of overridable) {
        let value: unknown;
        if (key === 'Quorum') {
            value = draft.QuorumKind && draft.QuorumValue !== null ? { Kind: draft.QuorumKind, Value: draft.QuorumValue } : undefined;
        } else if (key === 'Reminders') {
            const days = draft.RemindersText.trim() ? ParseDays(draft.RemindersText) : null;
            value = days ? { DaysBeforeClose: days } : undefined;
        } else if (key === 'Languages') {
            const langs = draft.LanguagesText.split(/[\s,;]+/).filter(Boolean);
            value = langs.length > 0 ? langs : undefined;
        } else if (key in draft.JsonPolicy) {
            const text = draft.JsonPolicy[key].trim();
            try {
                value = text ? (JSON.parse(text) as unknown) : undefined;
            } catch {
                value = undefined;
            }
        } else {
            value = draft.Policy[key];
        }
        if (value === undefined) {
            continue;
        }
        if (JSON.stringify(value) !== JSON.stringify(resolvedDefaults[key])) {
            out[key] = value;
        }
    }
    return out as IElectionConfiguration;
}

/** Problems with the policy values, using the same rules the database enforces. */
export function ValidatePolicy(draft: WizardDraft, typeConfig: IElectionTypeConfiguration | null): string[] {
    const errors: string[] = [];
    const overridable = typeConfig?.OverridableKeys ?? [];
    if (overridable.includes('Reminders') && draft.RemindersText.trim() && ParseDays(draft.RemindersText) === null) {
        errors.push('Reminders must be whole numbers of days before close, separated by commas.');
    }
    if (overridable.includes('Quorum') && draft.QuorumKind) {
        if (draft.QuorumValue === null || draft.QuorumValue <= 0) {
            errors.push('The quorum value must be greater than zero.');
        } else if (draft.QuorumKind === 'Percent' && draft.QuorumValue > 100) {
            errors.push('A percentage quorum cannot exceed 100.');
        }
    }
    for (const [key, text] of Object.entries(draft.JsonPolicy)) {
        if (text.trim()) {
            try {
                JSON.parse(text);
            } catch {
                errors.push(`${key} is not valid JSON.`);
            }
        }
    }
    const resolved = ResolveElectionConfiguration(VOTING_APP_DEFAULTS, typeConfig ?? undefined, BuildPolicyOverrides(draft, typeConfig));
    errors.push(...ValidateResolvedConfiguration(resolved));
    return errors;
}

// -- step validation ---------------------------------------------------------------------------------------------

export function ValidateTypeStep(draft: WizardDraft): string[] {
    return draft.TypeCode ? [] : ['Choose an election type.'];
}

export function ValidateDetailsStep(draft: WizardDraft, ctx: ValidationContext): string[] {
    const errors: string[] = [];
    if (!draft.Name.trim()) {
        errors.push('A name is required.');
    }
    if (draft.OpensAt && draft.ClosesAt && new Date(draft.ClosesAt).getTime() <= new Date(draft.OpensAt).getTime()) {
        errors.push('Voting must close after it opens.');
    }
    errors.push(...ValidatePolicy(draft, ctx.TypeConfig));
    return errors;
}

export function ValidateContestsStep(draft: WizardDraft, ctx: ValidationContext): string[] {
    const errors: string[] = [];
    const allowedKinds = ctx.TypeConfig?.AllowedContestKinds;
    if (draft.Contests.length === 0) {
        errors.push('Add at least one contest.');
    }
    draft.Contests.forEach((c, i) => {
        const label = c.Name.trim() ? `"${c.Name.trim()}"` : `Contest ${i + 1}`;
        if (!c.Name.trim()) {
            errors.push(`${label} needs a name.`);
        }
        if (allowedKinds && allowedKinds.length > 0 && !allowedKinds.includes(c.Kind)) {
            errors.push(`${label}: this election type does not allow ${c.Kind} contests.`);
        }
        if (!ctx.ActiveTallyCodes.includes(c.TallyMethodCode)) {
            errors.push(`${label} needs a tally method.`);
        }
        if (!Number.isInteger(c.Seats) || c.Seats < 1) {
            errors.push(`${label}: seats must be a whole number of at least 1.`);
        }
        if (c.Seats > 1 && c.TallyMethodCode && !ctx.MultiSeatTallyCodes.includes(c.TallyMethodCode)) {
            errors.push(`${label}: the chosen tally method cannot fill more than one seat.`);
        }
        const realOptions = c.Options.filter((o) => o.Label.trim());
        if (c.Options.some((o) => !o.Label.trim())) {
            errors.push(`${label}: every option needs a label.`);
        }
        if (IsYesNoKind(c.Kind)) {
            if (realOptions.length !== 2) {
                errors.push(`${label}: a ${c.Kind.toLowerCase()} has exactly two options (the first is the affirmative).`);
            }
        } else if (realOptions.length < Math.max(1, c.Seats)) {
            errors.push(`${label}: add at least ${Math.max(1, c.Seats)} ${c.Seats === 1 ? 'option' : 'options'}.`);
        }
        const labels = realOptions.map((o) => o.Label.trim().toLowerCase());
        if (new Set(labels).size !== labels.length) {
            errors.push(`${label}: option labels must be unique.`);
        }
        if (c.MaxSelections !== null && c.MaxSelections < 1) {
            errors.push(`${label}: the maximum selections must be at least 1.`);
        }
        if (c.MaxSelections !== null && c.MinSelections > c.MaxSelections) {
            errors.push(`${label}: the minimum selections cannot exceed the maximum.`);
        }
        if (c.MaxSelections !== null && c.MaxSelections > realOptions.length && realOptions.length > 0) {
            errors.push(`${label}: the maximum selections cannot exceed the number of options.`);
        }
        if (c.Threshold === 'Custom' && (c.CustomPercent === null || c.CustomPercent <= 0 || c.CustomPercent > 100)) {
            errors.push(`${label}: enter a custom threshold between 0 and 100 percent.`);
        }
    });
    return errors;
}

export function ValidateEligibilityStep(draft: WizardDraft, ctx: ValidationContext): string[] {
    const errors: string[] = [];
    if (!draft.SourceCode || !ctx.ActiveSourceCodes.includes(draft.SourceCode)) {
        errors.push('Choose an eligibility source.');
        return errors;
    }
    if (draft.SourceCode === 'entity-query') {
        const q = draft.EntityQuery;
        if (!q.EntityName.trim()) {
            errors.push('Enter the entity the roll is built from.');
        }
        for (const [label, value] of [
            ['person ID field', q.PersonIDField],
            ['voting class field', q.VotingClassField],
            ['weight field', q.WeightField],
            ['source key field', q.SourceKeyField],
            ['organization field', q.RepresentingOrganizationIDField],
        ] as const) {
            if (value.trim() && !FIELD_PATTERN.test(value.trim())) {
                errors.push(`The ${label} must be a plain field name.`);
            }
        }
        if (!q.PersonIDField.trim()) {
            errors.push('Name the field that holds the person ID.');
        }
    } else if (draft.SourceCode === 'csv') {
        if (!draft.CsvText.trim()) {
            errors.push('Paste or upload the CSV (columns: Email, SourceKey, VotingClass, Weight, RepresentingOrganization).');
        } else if (!/email/i.test(draft.CsvText.split(/\r?\n/, 1)[0] ?? '')) {
            errors.push('The first CSV row must be a header that includes an Email column.');
        }
    } else if (draft.RawSettings.trim()) {
        try {
            const parsed: unknown = JSON.parse(draft.RawSettings);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                errors.push('The source settings must be a JSON object.');
            }
        } catch {
            errors.push('The source settings are not valid JSON.');
        }
    }
    return errors;
}

export function ValidateAnchorsStep(draft: WizardDraft): string[] {
    const errors: string[] = [];
    draft.Anchors.forEach((a, i) => {
        const label = `Linked record ${i + 1}`;
        if (!a.EntityName.trim()) {
            errors.push(`${label} needs an entity.`);
        }
        if (!UUID_PATTERN.test(a.RecordID.trim())) {
            errors.push(`${label} needs a record ID (a UUID).`);
        }
    });
    if (draft.Anchors.filter((a) => a.IsPrimary).length > 1) {
        errors.push('Only one linked record can be primary.');
    }
    return errors;
}

/** All problems across the built-in steps. */
export function ValidateAll(draft: WizardDraft, ctx: ValidationContext): string[] {
    return [
        ...ValidateTypeStep(draft),
        ...ValidateDetailsStep(draft, ctx),
        ...ValidateContestsStep(draft, ctx),
        ...ValidateEligibilityStep(draft, ctx),
        ...ValidateAnchorsStep(draft),
    ];
}

// -- conversion --------------------------------------------------------------------------------------------------

function BlankToUndefined(text: string): string | undefined {
    const t = text.trim();
    return t ? t : undefined;
}

function ToContestSpec(c: ContestDraft): VotingContestSpec {
    return {
        Name: c.Name.trim(),
        Description: BlankToUndefined(c.Description),
        Kind: c.Kind,
        Seats: c.Seats,
        TallyMethodCode: c.TallyMethodCode,
        Threshold: c.Threshold,
        CustomThreshold: c.Threshold === 'Custom' && c.CustomPercent !== null ? c.CustomPercent / 100 : undefined,
        ThresholdBasis: c.ThresholdBasis,
        AllowAbstain: c.AllowAbstain,
        AllowWriteIn: c.AllowWriteIn,
        MinSelections: c.MinSelections,
        MaxSelections: c.MaxSelections ?? undefined,
        VotingClassFilter: BlankToUndefined(c.VotingClassFilter),
        Options: c.Options.map((o) => ({
            Label: o.Label.trim(),
            Description: BlankToUndefined(o.Description),
            IsWriteIn: o.IsWriteIn || undefined,
        })),
    };
}

/** The settings object for the chosen eligibility source. */
export function BuildEligibilitySettings(draft: WizardDraft): Record<string, unknown> {
    if (draft.SourceCode === 'entity-query') {
        const q = draft.EntityQuery;
        return {
            EntityName: q.EntityName.trim(),
            ExtraFilter: BlankToUndefined(q.ExtraFilter) ?? null,
            PersonIDField: q.PersonIDField.trim(),
            VotingClassField: BlankToUndefined(q.VotingClassField) ?? null,
            WeightField: BlankToUndefined(q.WeightField) ?? null,
            SourceKeyField: BlankToUndefined(q.SourceKeyField) ?? null,
            RepresentingOrganizationIDField: BlankToUndefined(q.RepresentingOrganizationIDField) ?? null,
        };
    }
    if (draft.SourceCode === 'csv') {
        return { CsvText: draft.CsvText };
    }
    return draft.RawSettings.trim() ? (JSON.parse(draft.RawSettings) as Record<string, unknown>) : {};
}

export function BuildCreateInput(draft: WizardDraft, typeConfig: IElectionTypeConfiguration | null): VotingCreateElectionInput {
    const overrides = BuildPolicyOverrides(draft, typeConfig) as Record<string, unknown>;
    const configuration: Record<string, unknown> = {};
    const top: Partial<Pick<VotingCreateElectionInput, 'SecrecyMode' | 'AssuranceTier' | 'ResultsTiming' | 'ResultsAudience'>> = {};
    for (const [key, value] of Object.entries(overrides)) {
        if ((TOP_LEVEL_POLICY_KEYS as readonly string[]).includes(key)) {
            (top as Record<string, unknown>)[key] = value;
        } else {
            configuration[key] = value;
        }
    }
    const anchors: VotingAnchor[] = draft.Anchors.map((a) => ({
        EntityName: a.EntityName.trim(),
        RecordID: a.RecordID.trim(),
        Role: BlankToUndefined(a.Role),
        IsPrimary: a.IsPrimary || undefined,
    }));
    return {
        ElectionTypeCode: draft.TypeCode,
        Name: draft.Name.trim(),
        Description: BlankToUndefined(draft.Description),
        Anchors: anchors.length > 0 ? anchors : undefined,
        EligibilitySource: { Code: draft.SourceCode, Settings: BuildEligibilitySettings(draft) },
        Contests: draft.Contests.map(ToContestSpec),
        ...top,
        RecordDate: draft.RecordDate ? new Date(`${draft.RecordDate}T00:00`).toISOString() : undefined,
        OpensAt: draft.OpensAt ? new Date(draft.OpensAt).toISOString() : undefined,
        ClosesAt: draft.ClosesAt ? new Date(draft.ClosesAt).toISOString() : undefined,
        TimeZone: BlankToUndefined(draft.TimeZone),
        Configuration: Object.keys(configuration).length > 0 ? configuration : undefined,
    };
}
