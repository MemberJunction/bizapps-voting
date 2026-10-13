/**
 * Pure assembly of the standards ballot comment list: each ballot comment with its item and its resolution (if any).
 * Kept free of Angular and MJ so it is tested on its own.
 */

export interface CommentRowSource {
  ID: string;
  ContestID: string;
  Sequence: number;
  CommentType: string;
  DocumentReference: string | null;
  Comment: string;
  ProposedChange: string | null;
}

export interface ResolutionRowSource {
  BallotCommentID: string;
  Disposition: string;
  Response: string | null;
  CommenterResponse: string | null;
}

export interface ContestRowSource {
  ID: string;
  Name: string;
  Sequence: number;
}

export interface CommentRow {
  CommentID: string;
  ContestName: string;
  CommentType: string;
  DocumentReference: string | null;
  Comment: string;
  ProposedChange: string | null;
  /** Null while the comment is unresolved. */
  Disposition: string | null;
  Response: string | null;
  CommenterResponse: string | null;
}

export interface CommentSummary {
  Total: number;
  Resolved: number;
  Unresolved: number;
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Comments ordered by item then by their order within it, each joined to its item name and resolution. */
export function BuildCommentRows(
  comments: readonly CommentRowSource[],
  resolutions: readonly ResolutionRowSource[],
  contests: readonly ContestRowSource[],
): CommentRow[] {
  const contestOrder = new Map(contests.map((c) => [c.ID.toLowerCase(), c] as const));
  return [...comments]
    .sort((a, b) => {
      const ca = contestOrder.get(a.ContestID.toLowerCase())?.Sequence ?? Number.MAX_SAFE_INTEGER;
      const cb = contestOrder.get(b.ContestID.toLowerCase())?.Sequence ?? Number.MAX_SAFE_INTEGER;
      return ca !== cb ? ca - cb : a.Sequence - b.Sequence;
    })
    .map((c) => {
      const resolution = resolutions.find((r) => same(r.BallotCommentID, c.ID));
      return {
        CommentID: c.ID,
        ContestName: contestOrder.get(c.ContestID.toLowerCase())?.Name ?? 'Item',
        CommentType: c.CommentType,
        DocumentReference: c.DocumentReference,
        Comment: c.Comment,
        ProposedChange: c.ProposedChange,
        Disposition: resolution?.Disposition ?? null,
        Response: resolution?.Response ?? null,
        CommenterResponse: resolution?.CommenterResponse ?? null,
      };
    });
}

export function SummarizeComments(rows: readonly CommentRow[]): CommentSummary {
  const resolved = rows.filter((r) => r.Disposition !== null).length;
  return { Total: rows.length, Resolved: resolved, Unresolved: rows.length - resolved };
}

/** A SQL id list literal for a RunView filter; ids are stripped to hex and dashes. */
export function IdListFilter(column: string, ids: readonly string[]): string {
  const list = ids.map((id) => `'${id.replace(/[^0-9a-fA-F-]/g, '')}'`).join(',');
  return `${column} IN (${list})`;
}
