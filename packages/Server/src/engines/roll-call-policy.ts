/**
 * Pure rules and assembly for named roll-call reads (Open-secrecy elections only).
 * No MJ runtime imports so every rule unit-tests without a database.
 */

import {
    ContestAppliesToVoter,
    type BallotSubmission,
    type ParticipationChannel,
    type VotingRollCallContest,
    type VotingRollCallEntry,
    type VotingRollCallSelection,
} from '@mj-biz-apps/voting-entities';

/** Why a roll-call read is refused, or null when it may proceed. */
export interface RollCallRefusalReason {
    Code: 'NotOpenBallot' | 'RollNotFrozen' | 'TierNotSupported' | 'ResultsNotVisible';
    Message: string;
}

/**
 * Named roll calls are permitted ONLY for Open-secrecy, Standard-assurance elections whose roll has been frozen.
 * Confidential and Secret elections are unconditionally refused so attributed ballots can never leak through this path.
 *
 * Before the election is Tallied or Certified, live reads honor ResultsTiming: only Live and AdministratorsOnly allow
 * pre-tally roll-call access (AfterClose and AfterVoting are refused until Tallied or Certified).
 */
export function RollCallRefusal(
    secrecyMode: string,
    status: string,
    rollFrozenAt: Date | string | null,
    assuranceTier: string,
    resultsTiming: string
): RollCallRefusalReason | null {
    if (secrecyMode !== 'Open') {
        return { Code: 'NotOpenBallot', Message: 'Named roll-call votes are available only for Open elections.' };
    }
    if (!rollFrozenAt) {
        return { Code: 'RollNotFrozen', Message: `The voter roll has not been frozen yet (election is ${status}).` };
    }
    if (assuranceTier !== 'Standard') {
        return { Code: 'TierNotSupported', Message: 'Named roll-call reads are available only for Standard assurance elections.' };
    }
    if (!UsesMaterializedSelections(status) && resultsTiming !== 'Live' && resultsTiming !== 'AdministratorsOnly') {
        return {
            Code: 'ResultsNotVisible',
            Message: 'Named roll-call votes cannot be read before the election is tallied unless results timing is Live or AdministratorsOnly.',
        };
    }
    return null;
}

/** Whether a roll-call read should use materialized Ballot Selections (after tally) vs decrypting Cast Ballots. */
export function UsesMaterializedSelections(status: string): boolean {
    return status === 'Tallied' || status === 'Certified';
}

export interface ContestVoteRecord {
    Abstain: boolean;
    Selections: VotingRollCallSelection[];
}

export interface DecryptedAttributedBallot {
    CastBallotID: string;
    Submission: BallotSubmission;
}

export interface StoredSelectionRow {
    CastBallotID: string;
    ContestID: string;
    ContestOptionID: string | null;
    Rank: number | null;
    WriteInText: string | null;
    IsAbstain: boolean;
}

/** Indexes decrypted ballots (used while Open or Closed) by lowercased CastBallotID -> lowercased ContestID. */
export function VotesFromSubmissions(
    ballots: ReadonlyArray<DecryptedAttributedBallot>
): Map<string, Map<string, ContestVoteRecord>> {
    const byBallot = new Map<string, Map<string, ContestVoteRecord>>();
    for (const ballot of ballots) {
        const byContest = new Map<string, ContestVoteRecord>();
        for (const c of ballot.Submission.Contests) {
            const selections: VotingRollCallSelection[] = c.Abstain
                ? []
                : c.Selections.map((s) => {
                      const entry: VotingRollCallSelection = { OptionID: s.OptionID };
                      if (s.Rank !== undefined) entry.Rank = s.Rank;
                      if (s.WriteInText !== undefined) entry.WriteInText = s.WriteInText;
                      return entry;
                  });
            byContest.set(c.ContestID.toLowerCase(), {
                Abstain: c.Abstain === true,
                Selections: selections,
            });
        }
        byBallot.set(ballot.CastBallotID.toLowerCase(), byContest);
    }
    return byBallot;
}

/** Indexes materialized Ballot Selection rows (used after Tallied or Certified) by CastBallotID -> ContestID. */
export function VotesFromSelectionRows(
    rows: ReadonlyArray<StoredSelectionRow>
): Map<string, Map<string, ContestVoteRecord>> {
    const byBallot = new Map<string, Map<string, ContestVoteRecord>>();
    for (const row of rows) {
        const bKey = row.CastBallotID.toLowerCase();
        const cKey = row.ContestID.toLowerCase();
        let byContest = byBallot.get(bKey);
        if (!byContest) {
            byContest = new Map<string, ContestVoteRecord>();
            byBallot.set(bKey, byContest);
        }
        let vote = byContest.get(cKey);
        if (!vote) {
            vote = { Abstain: false, Selections: [] };
            byContest.set(cKey, vote);
        }
        if (row.IsAbstain) {
            vote.Abstain = true;
            vote.Selections = [];
        } else if (row.ContestOptionID) {
            const sel: VotingRollCallSelection = { OptionID: row.ContestOptionID };
            if (row.Rank !== null && row.Rank !== undefined) sel.Rank = Number(row.Rank);
            if (row.WriteInText !== null && row.WriteInText !== undefined) sel.WriteInText = row.WriteInText;
            vote.Selections.push(sel);
        }
    }
    return byBallot;
}

export interface RollCallContestSpec {
    ID: string;
    Name: string;
    VotingClassFilter: string | null;
}

export interface RollCallVoterRow {
    ID: string;
    PersonID: string;
    SourceKey: string | null;
    VotingClass: string | null;
    Weight: number;
    /** Roll status. Defaults to 'Eligible' when omitted by callers that already filtered. */
    Status?: string;
}

export interface RollCallParticipationRow {
    ID: string;
    EligibleVoterID: string;
    Channel: ParticipationChannel;
    EnteredByUserID: string | null;
    CastAt: Date | string;
}

export interface RollCallAttributionRow {
    ParticipationID: string;
    CastBallotID: string;
}

export interface AssembleRollCallInput {
    Contests: ReadonlyArray<RollCallContestSpec>;
    Voters: ReadonlyArray<RollCallVoterRow>;
    Participations: ReadonlyArray<RollCallParticipationRow>;
    Attributions: ReadonlyArray<RollCallAttributionRow>;
    /** Lowercased IDs of CastBallot rows with Status = 'Counted'. Superseded/Void ballots are excluded. */
    CountedBallotIDs: ReadonlySet<string>;
    VotesByBallotID: ReadonlyMap<string, ReadonlyMap<string, ContestVoteRecord>>;
}

/**
 * Joins the eligible roll, poll book, current counted ballot attribution, and per-ballot selections into one
 * per-contest list of named entries. Only counted ballots are joined, so revotes always report the current ballot.
 */
export function AssembleRollCall(input: AssembleRollCallInput): VotingRollCallContest[] {
    const partByVoter = new Map<string, RollCallParticipationRow>();
    for (const p of input.Participations) {
        partByVoter.set(p.EligibleVoterID.toLowerCase(), p);
    }

    const countedBallotByPart = new Map<string, string>();
    for (const attr of input.Attributions) {
        const ballotID = attr.CastBallotID.toLowerCase();
        if (input.CountedBallotIDs.has(ballotID)) {
            countedBallotByPart.set(attr.ParticipationID.toLowerCase(), ballotID);
        }
    }

    const contests: VotingRollCallContest[] = [];
    for (const contest of input.Contests) {
        const cKey = contest.ID.toLowerCase();
        const entries: VotingRollCallEntry[] = [];
        for (const voter of input.Voters) {
            if (!ContestAppliesToVoter(contest.VotingClassFilter, voter.VotingClass)) continue;
            const part = partByVoter.get(voter.ID.toLowerCase());
            const ballotID = part ? countedBallotByPart.get(part.ID.toLowerCase()) : undefined;
            const isEligible = (voter.Status ?? 'Eligible') === 'Eligible';
            // Include every Eligible roll entry, PLUS any voter whose status changed (e.g. Challenged) after casting a
            // ballot that is still Counted so the roll call never disagrees with the tally.
            if (!isEligible && !(part && ballotID)) continue;
            if (part && ballotID) {
                const vote = input.VotesByBallotID.get(ballotID)?.get(cKey);
                entries.push({
                    EligibleVoterID: voter.ID,
                    PersonID: voter.PersonID,
                    SourceKey: voter.SourceKey,
                    VotingClass: voter.VotingClass,
                    Weight: Number(voter.Weight),
                    HasVoted: true,
                    Abstain: vote?.Abstain ?? false,
                    Selections: vote?.Selections ?? [],
                    Channel: part.Channel,
                    EnteredByUserID: part.EnteredByUserID,
                    CastAt: new Date(part.CastAt).toISOString(),
                });
            } else {
                entries.push({
                    EligibleVoterID: voter.ID,
                    PersonID: voter.PersonID,
                    SourceKey: voter.SourceKey,
                    VotingClass: voter.VotingClass,
                    Weight: Number(voter.Weight),
                    HasVoted: false,
                    Abstain: false,
                    Selections: [],
                });
            }
        }
        contests.push({ ContestID: contest.ID, ContestName: contest.Name, Entries: entries });
    }
    return contests;
}
