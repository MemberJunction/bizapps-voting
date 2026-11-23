/**
 * Pure model for staff entry of paper, in-person and proxy ballots. The server rebuilds the voter's real
 * ballot style from the control number and validates the submission against it; this builds the same
 * structural style from the election's configuration so staff see the contests with the same rendering
 * the voter's ballot uses. It mirrors the server's base style (contests in Sequence order that apply to the
 * voter's class, Active options in Sequence order); the server remains authoritative.
 */
import {
    ContestAppliesToVoter,
    type VotingBallotStyle,
    type VotingBallotStyleContest,
    type VotingBallotStyleOption,
    type VotingContestKind,
    type VotingSecrecyMode,
} from '@mj-biz-apps/voting-entities';

export interface PaperElectionRow {
    ID: string;
    Name: string;
    Description: string | null;
    SecrecyMode: VotingSecrecyMode;
    AllowRevote: boolean;
    ClosesAt: string | null;
}

export interface PaperContestRow {
    ID: string;
    Name: string;
    Description: string | null;
    Sequence: number;
    Kind: VotingContestKind;
    Seats: number;
    AllowAbstain: boolean;
    AllowWriteIn: boolean;
    MinSelections: number;
    MaxSelections: number | null;
    VotingClassFilter: string | null;
    /** Code of the contest's tally method. */
    TallyCode: string;
    IsRanked: boolean;
}

export interface PaperOptionRow {
    ID: string;
    ContestID: string;
    Label: string;
    Description: string | null;
    Sequence: number;
    IsWriteIn: boolean;
    Status: string;
}

const MULTI_CHOICE_TALLY_CODES: ReadonlyArray<string> = ['approval'];

/** The ballot style staff are shown for a voter of the given voting class (null/empty: contests with no class filter). */
export function BuildPaperStyle(
    election: PaperElectionRow,
    contests: ReadonlyArray<PaperContestRow>,
    options: ReadonlyArray<PaperOptionRow>,
    votingClass: string | null
): VotingBallotStyle {
    const klass = votingClass && votingClass.trim() ? votingClass.trim() : null;
    const styleContests: VotingBallotStyleContest[] = [];
    for (const contest of [...contests].sort((a, b) => a.Sequence - b.Sequence)) {
        if (!ContestAppliesToVoter(contest.VotingClassFilter, klass)) continue;
        const active = options
            .filter((o) => o.ContestID.toLowerCase() === contest.ID.toLowerCase() && o.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
        const defaultMax = contest.IsRanked || MULTI_CHOICE_TALLY_CODES.includes(contest.TallyCode) ? active.length : Math.max(1, contest.Seats);
        const styleOptions: VotingBallotStyleOption[] = active.map((o) => {
            const so: VotingBallotStyleOption = { OptionID: o.ID, Label: o.Label, IsWriteIn: o.IsWriteIn };
            if (o.Description) so.Description = o.Description;
            return so;
        });
        const sc: VotingBallotStyleContest = {
            ContestID: contest.ID,
            Name: contest.Name,
            Kind: contest.Kind,
            Seats: contest.Seats,
            IsRanked: contest.IsRanked,
            AllowAbstain: contest.AllowAbstain,
            AllowWriteIn: contest.AllowWriteIn,
            MinSelections: contest.MinSelections,
            MaxSelections: contest.MaxSelections ?? defaultMax,
            Options: styleOptions,
        };
        if (contest.Description) sc.Description = contest.Description;
        if (contest.Kind === 'StandardsItem' && active.length >= 2) sc.RequireCommentOnOptionIDs = [active[1].ID];
        styleContests.push(sc);
    }
    const style: VotingBallotStyle = {
        ElectionID: election.ID,
        ElectionName: election.Name,
        SecrecyMode: election.SecrecyMode,
        AllowRevote: election.AllowRevote && election.SecrecyMode !== 'Secret',
        Language: 'en',
        Contests: styleContests,
        Hash: '',
    };
    if (election.Description) style.Description = election.Description;
    if (election.ClosesAt) style.ClosesAt = election.ClosesAt;
    return style;
}

/** Whether a control number looks complete enough to proceed (the server checks it for real). */
export function ControlNumberLooksValid(value: string): boolean {
    return value.trim().length >= 4;
}
