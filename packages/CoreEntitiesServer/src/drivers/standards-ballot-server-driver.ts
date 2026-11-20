/**
 * StandardsBallotServerDriver
 * The server rules of the Standards Ballot election type (design §3, §6): a roll-call (Open) ballot whose contests are
 * Approve / Disapprove items, where every Disapprove carries a comment, and which may recirculate a certified earlier ballot
 * on the same document.
 *
 * The decision logic lives in exported pure functions (tested without a database); the driver only gathers facts
 * (contests, the IS-A extension row, the prior election) through a small data-access seam and applies the rules.
 */

import { RegisterClass } from '@memberjunction/global';
import { type IRunViewProvider, RunView } from '@memberjunction/core';
import {
    type BallotStyle,
    type BallotSubmission,
    type mjBizAppsVotingContestEntity,
    type mjBizAppsVotingContestOptionEntity,
} from '@mj-biz-apps/voting-entities';
import {
    BaseElectionTypeServerDriver,
    type BallotStyleContext,
    type CastValidationContext,
    type DriverBaseContext,
    type ElectionChangeContext,
} from './base-election-type-server-driver.js';

/** The IS-A child entity every standards ballot has. */
export const STANDARDS_BALLOT_EXTENSION_ENTITY = 'MJ_BizApps_Voting: Standards Ballot Elections';
const CONTESTS = 'MJ_BizApps_Voting: Contests';
const CONTEST_OPTIONS = 'MJ_BizApps_Voting: Contest Options';
const ELECTIONS = 'MJ_BizApps_Voting: Elections';

// === Facts the rules judge ===

export interface StandardsOptionFacts {
    OptionID: string;
    Label: string;
    Sequence: number;
}

export interface StandardsContestFacts {
    ContestID: string;
    Name: string;
    Kind: string;
    /** Active options only. */
    Options: StandardsOptionFacts[];
}

/** The standards-specific columns of an election (the IS-A child row). */
export interface StandardsExtensionFacts {
    DocumentTitle: string;
    DocumentVersion: string | null;
    RecirculationRound: number;
    PriorElectionID: string | null;
}

/** What the rules need to know about the election a recirculation follows. */
export interface PriorElectionFacts {
    ElectionID: string;
    Status: string;
    ElectionTypeID: string;
    /** The document title of the prior ballot's extension row; null when it has none. */
    DocumentTitle: string | null;
}

// === Pure rules ===

const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
    (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const sameId = (a: string | null | undefined, b: string | null | undefined): boolean => sameText(a, b);

/** The Approve option of a standards item (first by Sequence), or null when the item isn't shaped Approve / Disapprove. */
export function ApproveOptionOf(options: readonly StandardsOptionFacts[]): StandardsOptionFacts | null {
    const sorted = [...options].sort((a, b) => a.Sequence - b.Sequence);
    return sorted.length === 2 && /^approve/i.test(sorted[0].Label.trim()) ? sorted[0] : null;
}

/** The Disapprove option of a standards item (second by Sequence), or null when the item isn't shaped Approve / Disapprove. */
export function DisapproveOptionOf(options: readonly StandardsOptionFacts[]): StandardsOptionFacts | null {
    const sorted = [...options].sort((a, b) => a.Sequence - b.Sequence);
    return sorted.length === 2 && /^approve/i.test(sorted[0].Label.trim()) && /^disapprove/i.test(sorted[1].Label.trim()) ? sorted[1] : null;
}

/** Every contest must be a StandardsItem offering exactly Approve then Disapprove (abstaining is the contest's AllowAbstain). */
export function StandardsContestShapeIssues(contests: readonly StandardsContestFacts[]): string[] {
    const issues: string[] = [];
    for (const contest of contests) {
        if (contest.Kind !== 'StandardsItem') {
            issues.push(`Item "${contest.Name}" is a ${contest.Kind}; every contest of a standards ballot must be a StandardsItem.`);
        } else if (!DisapproveOptionOf(contest.Options)) {
            issues.push(`Item "${contest.Name}" must offer exactly two positions, Approve and then Disapprove (abstaining is set on the item, not as a position).`);
        }
    }
    return issues;
}

/** A Disapprove selection needs a comment: the ballot style must require one on the Disapprove option of each item. */
export function StandardsStyleIssues(style: BallotStyle): string[] {
    const issues: string[] = [];
    for (const contest of style.Contests) {
        if (contest.Kind !== 'StandardsItem') {
            issues.push(`Item "${contest.Name}" is a ${contest.Kind}; every contest of a standards ballot must be a StandardsItem.`);
            continue;
        }
        const options: StandardsOptionFacts[] = contest.Options.map((o, i) => ({ OptionID: o.OptionID, Label: o.Label, Sequence: i }));
        const disapprove = DisapproveOptionOf(options);
        if (!disapprove) {
            issues.push(`Item "${contest.Name}" must offer exactly two positions, Approve and then Disapprove.`);
        } else if (!(contest.RequireCommentOnOptionIDs ?? []).some((id) => sameId(id, disapprove.OptionID))) {
            issues.push(`Item "${contest.Name}" must require a comment on its Disapprove position.`);
        }
    }
    return issues;
}

/** A ballot that disapproves an item without a (non-blank) comment is refused. Abstentions need no comment. */
export function StandardsCastIssues(contests: readonly StandardsContestFacts[], submission: BallotSubmission): string[] {
    const issues: string[] = [];
    for (const sub of submission.Contests) {
        if (sub.Abstain) continue;
        const contest = contests.find((c) => sameId(c.ContestID, sub.ContestID));
        const disapprove = contest ? DisapproveOptionOf(contest.Options) : null;
        if (!contest || !disapprove) continue;
        const disapproves = sub.Selections.some((s) => sameId(s.OptionID, disapprove.OptionID));
        const commented = (sub.Comments ?? []).some((c) => (c.Comment ?? '').trim().length > 0);
        if (disapproves && !commented) issues.push(`A Disapprove on item "${contest.Name}" must come with a comment.`);
    }
    return issues;
}

/** The document and recirculation columns, and the prior ballot a recirculation follows. */
export function StandardsExtensionIssues(
    electionId: string,
    electionTypeId: string,
    ext: StandardsExtensionFacts,
    prior: PriorElectionFacts | null,
    requireTitle = true
): string[] {
    const issues: string[] = [];
    if (requireTitle && (!ext.DocumentTitle || ext.DocumentTitle.trim() === '')) issues.push('A standards ballot needs a DocumentTitle (set it on the Standards Ballot details).');
    if (ext.RecirculationRound < 0) issues.push('RecirculationRound cannot be negative.');
    if (!ext.PriorElectionID) {
        if (ext.RecirculationRound > 0) issues.push('A recirculation (RecirculationRound above 0) must name the PriorElectionID it follows.');
        return issues;
    }
    if (ext.RecirculationRound < 1) issues.push('A ballot that names a PriorElectionID is a recirculation: RecirculationRound must be 1 or more.');
    if (sameId(ext.PriorElectionID, electionId)) {
        issues.push('A ballot cannot follow itself.');
    } else if (!prior) {
        issues.push('The prior election of this recirculation could not be read.');
    } else {
        if (prior.Status !== 'Certified') issues.push(`The prior election must be Certified before it can be recirculated (it is ${prior.Status}).`);
        if (!sameId(prior.ElectionTypeID, electionTypeId)) issues.push('The prior election must be a standards ballot.');
        else if (!sameText(prior.DocumentTitle, ext.DocumentTitle)) issues.push('The prior election must be a ballot on the same document (the DocumentTitle differs).');
    }
    return issues;
}

/** The first issue as the single message the driver contract returns; null when none. */
function firstIssue(issues: readonly string[]): string | null {
    return issues.length === 0 ? null : issues.length === 1 ? issues[0] : `${issues[0]} (and ${issues.length - 1} more: ${issues.slice(1).join(' ')})`;
}

// === Data access seam ===

/** How the driver reads the facts it judges. Replaceable so the rules are tested without a database. */
export interface StandardsBallotFactSource {
    /** The election's contests with their active options, in Sequence order. Empty for an election that isn't saved. */
    LoadContests(ctx: DriverBaseContext): Promise<StandardsContestFacts[]>;
    /** The standards extension row of the election; null while it doesn't exist (it is saved after the election, by the Document step). */
    LoadExtension(ctx: DriverBaseContext): Promise<StandardsExtensionFacts | null>;
    /** A prior election's facts; null when it can't be read. */
    LoadPrior(ctx: DriverBaseContext, electionId: string): Promise<PriorElectionFacts | null>;
}

function isRunViewProvider(p: DriverBaseContext['Provider']): p is DriverBaseContext['Provider'] & IRunViewProvider {
    return typeof (p as Partial<IRunViewProvider>).RunView === 'function';
}

function runViewOf(ctx: DriverBaseContext): RunView {
    return isRunViewProvider(ctx.Provider) ? new RunView(ctx.Provider) : new RunView();
}

const uuidLiteral = (id: string): string => `'${id.replace(/[^0-9a-fA-F-]/g, '')}'`;

export class RunViewStandardsBallotFactSource implements StandardsBallotFactSource {
    public async LoadContests(ctx: DriverBaseContext): Promise<StandardsContestFacts[]> {
        if (!ctx.Election.IsSaved) return [];
        const rv = runViewOf(ctx);
        const contests = await rv.RunView<Pick<mjBizAppsVotingContestEntity, 'ID' | 'Name' | 'Kind'>>(
            { EntityName: CONTESTS, ExtraFilter: `ElectionID = ${uuidLiteral(ctx.Election.ID)}`, Fields: ['ID', 'Name', 'Kind'], OrderBy: 'Sequence', ResultType: 'simple' },
            ctx.ContextUser
        );
        if (!contests.Success) throw new Error(`The contests could not be read: ${contests.ErrorMessage ?? 'unknown error'}`);
        const rows = contests.Results ?? [];
        if (rows.length === 0) return [];
        const ids = rows.map((c) => uuidLiteral(c.ID)).join(',');
        const options = await rv.RunView<Pick<mjBizAppsVotingContestOptionEntity, 'ID' | 'ContestID' | 'Label' | 'Sequence'>>(
            { EntityName: CONTEST_OPTIONS, ExtraFilter: `ContestID IN (${ids}) AND Status = 'Active'`, Fields: ['ID', 'ContestID', 'Label', 'Sequence'], OrderBy: 'Sequence', ResultType: 'simple' },
            ctx.ContextUser
        );
        if (!options.Success) throw new Error(`The contest options could not be read: ${options.ErrorMessage ?? 'unknown error'}`);
        return rows.map((c) => ({
            ContestID: c.ID,
            Name: c.Name,
            Kind: c.Kind,
            Options: (options.Results ?? []).filter((o) => sameId(o.ContestID, c.ID)).map((o) => ({ OptionID: o.ID, Label: o.Label, Sequence: o.Sequence })),
        }));
    }

    public async LoadExtension(ctx: DriverBaseContext): Promise<StandardsExtensionFacts | null> {
        if (!ctx.Election.IsSaved) return null;
        const result = await runViewOf(ctx).RunView<StandardsExtensionFacts>(
            {
                EntityName: STANDARDS_BALLOT_EXTENSION_ENTITY,
                ExtraFilter: `ID = ${uuidLiteral(ctx.Election.ID)}`,
                Fields: ['DocumentTitle', 'DocumentVersion', 'RecirculationRound', 'PriorElectionID'],
                ResultType: 'simple',
            },
            ctx.ContextUser
        );
        if (!result.Success) throw new Error(`The Standards Ballot details could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
        return result.Results?.[0] ?? null;
    }

    public async LoadPrior(ctx: DriverBaseContext, electionId: string): Promise<PriorElectionFacts | null> {
        const rv = runViewOf(ctx);
        const filter = `ID = ${uuidLiteral(electionId)}`;
        const [election, ext] = await Promise.all([
            rv.RunView<{ ID: string; Status: string; ElectionTypeID: string }>(
                { EntityName: ELECTIONS, ExtraFilter: filter, Fields: ['ID', 'Status', 'ElectionTypeID'], ResultType: 'simple' },
                ctx.ContextUser
            ),
            rv.RunView<{ DocumentTitle: string }>(
                { EntityName: STANDARDS_BALLOT_EXTENSION_ENTITY, ExtraFilter: filter, Fields: ['DocumentTitle'], ResultType: 'simple' },
                ctx.ContextUser
            ),
        ]);
        const row = election.Success ? election.Results?.[0] : undefined;
        if (!row) return null;
        return { ElectionID: row.ID, Status: row.Status, ElectionTypeID: row.ElectionTypeID, DocumentTitle: ext.Success ? (ext.Results?.[0]?.DocumentTitle ?? null) : null };
    }
}

// === The driver ===

@RegisterClass(BaseElectionTypeServerDriver, 'StandardsBallotServerDriver')
export class StandardsBallotServerDriver extends BaseElectionTypeServerDriver {
    private readonly facts: StandardsBallotFactSource;

    public constructor(facts?: StandardsBallotFactSource) {
        super();
        this.facts = facts ?? new RunViewStandardsBallotFactSource();
    }

    /** Roll call only; Approve / Disapprove items only; the standards extension row present with a title at Open and coherent whenever it exists; a recirculation follows a Certified ballot on the same document. */
    public override async ValidateElectionChange(ctx: ElectionChangeContext): Promise<string | null> {
        try {
            if (ctx.Action === 'Cancel') return null;
            if (ctx.Election.SecrecyMode !== 'Open') return 'A standards ballot is a roll call: its SecrecyMode must be Open.';
            if (ctx.Action === 'Close' || ctx.Action === 'Tally' || ctx.Action === 'Certify') return null;

            const issues: string[] = [];
            // The document row is saved after the election (the Document step), so Create never needs it; Open does.
            if (ctx.Action === 'Update' || ctx.Action === 'Open') {
                const ext = await this.facts.LoadExtension(ctx);
                if (ext) {
                    const prior = ext.PriorElectionID && !sameId(ext.PriorElectionID, ctx.Election.ID) ? await this.facts.LoadPrior(ctx, ext.PriorElectionID) : null;
                    issues.push(...StandardsExtensionIssues(ctx.Election.ID, ctx.Election.ElectionTypeID, ext, prior, ctx.Action === 'Open'));
                } else if (ctx.Action === 'Open') {
                    issues.push('Set the Standards Ballot details (the document title) before opening the ballot.');
                }
            }
            const contests = await this.facts.LoadContests(ctx);
            issues.push(...StandardsContestShapeIssues(contests));
            if (ctx.Action === 'Open' && contests.length === 0) issues.push('A standards ballot needs at least one item before it opens.');
            return firstIssue(issues);
        } catch (e) {
            return `Standards ballot check failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    /** Each item requires a comment on its Disapprove position. */
    public override async ValidateBallotStyle(ctx: BallotStyleContext): Promise<string | null> {
        return firstIssue(StandardsStyleIssues(ctx.Style));
    }

    /** A Disapprove without a comment is refused (comments arrive on ContestSubmission.Comments). */
    public override async ValidateCast(ctx: CastValidationContext): Promise<string | null> {
        try {
            return firstIssue(StandardsCastIssues(await this.facts.LoadContests(ctx), ctx.Submission));
        } catch (e) {
            return `Standards ballot check failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
}
