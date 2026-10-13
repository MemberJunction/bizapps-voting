/**
 * Ballot submission validation against a ballot style.
 * Complete and deterministic validation with stable error codes.
 */

import type {
  BallotStyle,
  BallotSubmission,
  ValidationIssue,
  ContestSubmission,
  OptionSelection,
} from './types.js';

/**
 * Validates a ballot submission against the ballot style.
 * Checks are performed in a deterministic order and report all issues found.
 *
 * @param style - The ballot style defining valid contests and options
 * @param submission - The voter's submission
 * @returns Array of validation issues (empty if valid)
 */
export function ValidateSubmission(style: BallotStyle, submission: BallotSubmission): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build a map of valid contests from the ballot style
  const validContests = new Map(style.Contests.map(c => [c.ContestID, c]));

  // Check submitted contests
  const submittedContestIDs = new Set<string>();

  for (const contestSubmission of submission.Contests) {
    const contestID = contestSubmission.ContestID;

    // Unknown contest
    if (!validContests.has(contestID)) {
      issues.push({
        ContestID: contestID,
        Code: 'UnknownContest',
        Message: `Contest "${contestID}" is not on this ballot.`,
      });
      continue;
    }

    // Duplicate contest in submission
    if (submittedContestIDs.has(contestID)) {
      issues.push({
        ContestID: contestID,
        Code: 'DuplicateContest',
        Message: `Contest "${contestID}" appears multiple times in the submission.`,
      });
      continue;
    }
    submittedContestIDs.add(contestID);

    // Validate this contest's submission
    const contestIssues = validateContestSubmission(contestSubmission, validContests.get(contestID)!);
    issues.push(...contestIssues);
  }

  // Check for missing contests (only allowed if MinSelections is 0)
  for (const styleContest of style.Contests) {
    if (!submittedContestIDs.has(styleContest.ContestID)) {
      // A missing contest is treated as blank (Abstain=true, no selections)
      if (styleContest.MinSelections > 0) {
        issues.push({
          ContestID: styleContest.ContestID,
          Code: 'MissingContest',
          Message: `Contest "${styleContest.ContestID}" is required (MinSelections: ${styleContest.MinSelections}).`,
        });
      }
    }
  }

  return issues;
}

/**
 * Validates a single contest submission.
 * @internal
 */
function validateContestSubmission(contestSubmission: ContestSubmission, styleContest: BallotStyle['Contests'][0]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const contestID = contestSubmission.ContestID;

  const { Abstain = false, Selections = [], Comments = [] } = contestSubmission;

  // Build a map of valid options
  const validOptions = new Map(styleContest.Options.map(o => [o.OptionID, o]));

  // ---- Abstain validation ----
  if (Abstain && !styleContest.AllowAbstain) {
    issues.push({
      ContestID: contestID,
      Code: 'AbstainNotAllowed',
      Message: `Abstaining is not allowed in contest "${contestID}".`,
    });
  }

  if (Abstain && Selections.length > 0) {
    issues.push({
      ContestID: contestID,
      Code: 'AbstainWithSelections',
      Message: `Cannot abstain and select options in contest "${contestID}" simultaneously.`,
    });
  }

  // ---- Selection validation ----
  const submittedOptionIDs = new Set<string>();
  let hasInvalidOption = false;

  for (const selection of Selections) {
    const optionID = selection.OptionID;

    // Unknown option
    if (!validOptions.has(optionID)) {
      if (!hasInvalidOption) {
        issues.push({
          ContestID: contestID,
          Code: 'UnknownOption',
          Message: `Option "${optionID}" is not valid in contest "${contestID}".`,
        });
        hasInvalidOption = true;
      }
      continue;
    }

    // Duplicate option in submission
    if (submittedOptionIDs.has(optionID)) {
      issues.push({
        ContestID: contestID,
        Code: 'DuplicateOption',
        Message: `Option "${optionID}" appears multiple times in contest "${contestID}".`,
      });
      continue;
    }
    submittedOptionIDs.add(optionID);
  }

  // Validate selection counts (unless we found invalid options)
  if (!hasInvalidOption) {
    // Too few selections
    if (Selections.length < styleContest.MinSelections) {
      issues.push({
        ContestID: contestID,
        Code: 'TooFewSelections',
        Message: `Contest "${contestID}" requires at least ${styleContest.MinSelections} selection(s); ${Selections.length} provided.`,
      });
    }

    // Too many selections
    if (Selections.length > styleContest.MaxSelections) {
      issues.push({
        ContestID: contestID,
        Code: 'TooManySelections',
        Message: `Contest "${contestID}" allows at most ${styleContest.MaxSelections} selection(s); ${Selections.length} provided.`,
      });
    }
  }

  // ---- Ranked contest validation ----
  if (styleContest.IsRanked) {
    const ranks = new Set<number>();
    let hasInvalidRank = false;

    for (const selection of Selections) {
      const optionID = selection.OptionID;
      const rank = selection.Rank;

      // Rank must be present for ranked contests
      if (rank === undefined) {
        if (!hasInvalidRank) {
          issues.push({
            ContestID: contestID,
            Code: 'RankMissing',
            Message: `All selections in ranked contest "${contestID}" must have a rank.`,
          });
          hasInvalidRank = true;
        }
        continue;
      }

      // Rank must be a valid integer >= 1
      if (!Number.isInteger(rank) || rank < 1) {
        if (!hasInvalidRank) {
          issues.push({
            ContestID: contestID,
            Code: 'RankInvalid',
            Message: `Ranks in contest "${contestID}" must be positive integers.`,
          });
          hasInvalidRank = true;
        }
        continue;
      }

      // Rank must be ≤ number of selections (contiguous)
      if (rank > Selections.length) {
        if (!hasInvalidRank) {
          issues.push({
            ContestID: contestID,
            Code: 'RankInvalid',
            Message: `Ranks in contest "${contestID}" must be contiguous (1..${Selections.length}).`,
          });
          hasInvalidRank = true;
        }
        continue;
      }

      // Rank must be unique
      if (ranks.has(rank)) {
        if (!hasInvalidRank) {
          issues.push({
            ContestID: contestID,
            Code: 'RankInvalid',
            Message: `Duplicate rank in contest "${contestID}": rank ${rank} appears more than once.`,
          });
          hasInvalidRank = true;
        }
      }

      ranks.add(rank);
    }

    // All ranks from 1 to n must be present (contiguous check)
    if (!hasInvalidRank && Selections.length > 0) {
      for (let i = 1; i <= Selections.length; i++) {
        if (!ranks.has(i)) {
          issues.push({
            ContestID: contestID,
            Code: 'RankMissing',
            Message: `Ranks in contest "${contestID}" must be contiguous (1..${Selections.length}); missing rank ${i}.`,
          });
          break;
        }
      }
    }
  } else {
    // Non-ranked contests must not carry ranks
    for (const selection of Selections) {
      if (selection.Rank !== undefined) {
        issues.push({
          ContestID: contestID,
          Code: 'RankNotAllowed',
          Message: `Contest "${contestID}" does not allow ranking.`,
        });
        break;
      }
    }
  }

  // ---- Write-in validation ----
  const writeInOptionIDs = new Set(styleContest.Options.filter(o => o.IsWriteIn).map(o => o.OptionID));

  for (const selection of Selections) {
    const { OptionID: optionID, WriteInText: writeInText } = selection;

    if (!validOptions.has(optionID)) continue; // Already reported as unknown

    const isWriteInOption = writeInOptionIDs.has(optionID);
    const hasWriteInText = writeInText !== undefined && writeInText !== null;

    // Write-in text only on write-in options
    if (hasWriteInText && !isWriteInOption) {
      issues.push({
        ContestID: contestID,
        Code: 'WriteInNotAllowed',
        Message: `Write-in text provided for non-write-in option "${optionID}" in contest "${contestID}".`,
      });
      continue;
    }

    // Write-in text required on write-in options
    if (isWriteInOption && !hasWriteInText) {
      issues.push({
        ContestID: contestID,
        Code: 'WriteInRequired',
        Message: `Write-in option "${optionID}" in contest "${contestID}" requires text.`,
      });
      continue;
    }

    // Write-in text length: non-empty and ≤ 500 chars
    if (isWriteInOption && hasWriteInText) {
      const trimmed = writeInText.trim();
      if (trimmed.length === 0) {
        issues.push({
          ContestID: contestID,
          Code: 'WriteInRequired',
          Message: `Write-in text for option "${optionID}" in contest "${contestID}" cannot be empty or whitespace-only.`,
        });
      } else if (trimmed.length > 500) {
        issues.push({
          ContestID: contestID,
          Code: 'WriteInTooLong',
          Message: `Write-in text for option "${optionID}" in contest "${contestID}" exceeds 500 characters (${trimmed.length} provided).`,
        });
      }
    }
  }

  // ---- Comment validation ----
  if (contestSubmission.Comments) {
    const requireCommentOnIDs = new Set(styleContest.RequireCommentOnOptionIDs || []);

    // Check which options require a comment
    for (const optionID of requireCommentOnIDs) {
      const selected = Selections.some(s => s.OptionID === optionID);
      if (selected) {
        const hasComment = Comments && Comments.some(c => c.Comment && c.Comment.trim().length > 0);
        if (!hasComment) {
          issues.push({
            ContestID: contestID,
            Code: 'CommentRequired',
            Message: `Option "${optionID}" in contest "${contestID}" requires a comment.`,
          });
        }
      }
    }

    // Validate comment content
    for (const comment of Comments) {
      const text = comment.Comment || '';
      const trimmed = text.trim();

      if (trimmed.length === 0) {
        issues.push({
          ContestID: contestID,
          Code: 'CommentInvalid',
          Message: `Comment in contest "${contestID}" cannot be empty or whitespace-only.`,
        });
        continue;
      }

      if (trimmed.length > 10000) {
        issues.push({
          ContestID: contestID,
          Code: 'CommentInvalid',
          Message: `Comment in contest "${contestID}" exceeds 10,000 characters (${trimmed.length} provided).`,
        });
      }
    }
  }

  return issues;
}
