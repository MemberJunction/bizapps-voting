/** The validity rules of the standards ballot details step, kept free of Angular so they are tested on their own. */

export interface StandardsDetailsValues {
  DocumentTitle: string;
  DocumentVersion: string;
  RecirculationRound: number;
  /** Empty string when none. */
  PriorElectionID: string;
}

export interface PriorBallotOption {
  ID: string;
  DocumentTitle: string;
  Label: string;
}

/** What must be fixed before the step is complete. The server driver enforces the same rules authoritatively. */
export function StandardsDetailsIssues(values: StandardsDetailsValues, priors: readonly PriorBallotOption[]): string[] {
  const issues: string[] = [];
  if (!values.DocumentTitle.trim()) issues.push('Enter the document title.');
  if (values.PriorElectionID) {
    if (values.RecirculationRound < 1) issues.push('A ballot that follows another is a recirculation: set the round to 1 or more.');
    const prior = priors.find((p) => p.ID.toLowerCase() === values.PriorElectionID.toLowerCase());
    if (!prior) issues.push('Choose a certified ballot to follow.');
    else if (prior.DocumentTitle.trim().toLowerCase() !== values.DocumentTitle.trim().toLowerCase()) issues.push('The ballot to follow must be on the same document.');
  } else if (values.RecirculationRound > 0) {
    issues.push('A recirculation must say which ballot it follows.');
  }
  return issues;
}
