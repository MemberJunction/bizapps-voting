/**
 * Pure ballot-form model: per-contest voter state, conversion to a BallotSubmission, and
 * plain-language validation messages. Kept free of Angular so it can be unit tested.
 */
import {
    ValidateSubmission,
    type BallotStyle,
    type BallotSubmission,
    type ContestSubmission,
    type SubmittedComment,
    type ValidationIssue,
    type VotingBallotStyle,
    type VotingBallotStyleContest,
} from '@mj-biz-apps/voting-entities';

export type CommentType = SubmittedComment['CommentType'];

/** What the voter has entered for one contest. `Selected` holds option IDs; for ranked contests its order is the ranking. */
export interface ContestState {
    ContestID: string;
    Abstain: boolean;
    Selected: string[];
    WriteIns: Record<string, string | undefined>;
    CommentType: CommentType;
    DocumentReference: string;
    Comment: string;
    ProposedChange: string;
}

export function NewContestState(contest: VotingBallotStyleContest): ContestState {
    return {
        ContestID: contest.ContestID,
        Abstain: false,
        Selected: [],
        WriteIns: {},
        CommentType: 'General',
        DocumentReference: '',
        Comment: '',
        ProposedChange: '',
    };
}

export function NewBallotState(style: VotingBallotStyle): ContestState[] {
    return style.Contests.map(NewContestState);
}

/** Whether a contest collects a free-text comment (standards items, or any contest that requires comments). */
export function ContestTakesComments(contest: VotingBallotStyleContest): boolean {
    return contest.Kind === 'StandardsItem' || (contest.RequireCommentOnOptionIDs?.length ?? 0) > 0;
}

/** Whether the voter's current selections make a comment mandatory. */
export function CommentIsRequired(contest: VotingBallotStyleContest, state: ContestState): boolean {
    const required = contest.RequireCommentOnOptionIDs ?? [];
    return required.some((id) => state.Selected.includes(id));
}

export function BuildContestSubmission(contest: VotingBallotStyleContest, state: ContestState): ContestSubmission {
    if (state.Abstain) {
        return { ContestID: contest.ContestID, Abstain: true, Selections: [] };
    }
    const optionById = new Map(contest.Options.map((o) => [o.OptionID, o]));
    const selections = state.Selected.map((optionId, index) => {
        const option = optionById.get(optionId);
        const selection: ContestSubmission['Selections'][number] = { OptionID: optionId };
        if (contest.IsRanked) {
            selection.Rank = index + 1;
        }
        if (option?.IsWriteIn) {
            selection.WriteInText = (state.WriteIns[optionId] ?? '').trim();
        }
        return selection;
    });
    const submission: ContestSubmission = { ContestID: contest.ContestID, Selections: selections };
    if (ContestTakesComments(contest)) {
        const comments: SubmittedComment[] = [];
        if (state.Comment.trim()) {
            const comment: SubmittedComment = { CommentType: state.CommentType, Comment: state.Comment.trim() };
            if (state.DocumentReference.trim()) {
                comment.DocumentReference = state.DocumentReference.trim();
            }
            if (state.ProposedChange.trim()) {
                comment.ProposedChange = state.ProposedChange.trim();
            }
            comments.push(comment);
        }
        // An (empty) array switches on the comment-required check in the shared validator.
        submission.Comments = comments;
    }
    return submission;
}

export function BuildSubmission(style: VotingBallotStyle, states: ContestState[]): BallotSubmission {
    const byId = new Map(states.map((s) => [s.ContestID, s]));
    return {
        Contests: style.Contests.map((contest) => {
            const state = byId.get(contest.ContestID) ?? NewContestState(contest);
            return BuildContestSubmission(contest, state);
        }),
    };
}

/** Validation issues keyed by contest ID (issues with no contest are filed under ''). */
export function ValidateBallot(style: VotingBallotStyle, submission: BallotSubmission): Map<string, ValidationIssue[]> {
    const issues = ValidateSubmission(style as BallotStyle, submission);
    const grouped = new Map<string, ValidationIssue[]>();
    for (const issue of issues) {
        const key = issue.ContestID ?? '';
        const list = grouped.get(key) ?? [];
        list.push(issue);
        grouped.set(key, list);
    }
    return grouped;
}

/** A voter-facing message for a validation issue (the shared validator's messages quote raw IDs). */
export function FriendlyIssueMessage(issue: ValidationIssue, contest: VotingBallotStyleContest | undefined): string {
    const min = contest?.MinSelections ?? 0;
    const max = contest?.MaxSelections ?? 1;
    switch (issue.Code) {
        case 'MissingContest':
        case 'TooFewSelections':
            return min <= 1
                ? 'Choose an option, or abstain if this contest allows it.'
                : `Choose at least ${min} options.`;
        case 'TooManySelections':
            return `Choose no more than ${max} ${max === 1 ? 'option' : 'options'}.`;
        case 'AbstainNotAllowed':
            return 'Abstaining is not allowed in this contest.';
        case 'AbstainWithSelections':
            return 'You cannot abstain and select options at the same time.';
        case 'RankMissing':
        case 'RankInvalid':
            return 'Ranks must run 1, 2, 3 and so on without gaps or repeats.';
        case 'WriteInRequired':
            return 'Type a name for the write-in option you selected.';
        case 'WriteInTooLong':
            return 'The write-in is too long (500 characters at most).';
        case 'CommentRequired':
            return 'A comment is required with the option you selected.';
        case 'CommentInvalid':
            return 'The comment is empty or longer than 10,000 characters.';
        default:
            return issue.Message;
    }
}

/** Number of contests the voter has made a decision in (a selection or an abstention). */
export function CountAnswered(style: VotingBallotStyle, states: ContestState[]): number {
    const byId = new Map(states.map((s) => [s.ContestID, s]));
    return style.Contests.filter((c) => {
        const s = byId.get(c.ContestID);
        return !!s && (s.Abstain || s.Selected.length > 0);
    }).length;
}
