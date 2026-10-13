/**
 * The voter roll vocabulary shared by eligibility sources and the roll engine.
 */

/** One person (optionally voting on behalf of an organization) a source says may vote. */
export interface RollEntry {
    PersonID: string;
    RepresentingOrganizationID: string | null;
    VotingClass: string | null;
    /** Always greater than zero. */
    Weight: number;
    /** The voter's ID in the source system; used to match host assertions and second factors. */
    SourceKey: string | null;
}

/** A source row that could not become a roll entry. Carries a row number and a reason, never personal data. */
export interface UnmatchedRow {
    Row: number;
    Reason: string;
}

/** What a source built: the entries plus the rows it had to leave out. */
export interface RollBuildReport {
    Entries: RollEntry[];
    Unmatched: UnmatchedRow[];
}
