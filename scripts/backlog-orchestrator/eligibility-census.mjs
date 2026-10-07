import { routeTriageIssue, triageOwnershipDecision } from './triage-router.mjs';

export function completeAuditInventory(results, teams) {
  const incomplete = results.flatMap((result, index) =>
    result.status !== 'fulfilled' || !Array.isArray(result.value)
      ? [teams[index].key]
      : []
  );
  if (incomplete.length)
    throw new Error(`audit inventory incomplete: ${incomplete.join(', ')}`);
  return results.flatMap(result => result.value);
}

/** Read-only intake evidence for every observed issue; never an execution grant. */
export function buildEligibilityCensus(issues, classifications) {
  const byIdentifier = new Map(
    classifications.map(row => [row.identifier, row])
  );
  const entries = issues.map(issue => {
    const classification = byIdentifier.get(issue.identifier);
    const ownership = triageOwnershipDecision(issue);
    const route = routeTriageIssue(
      issue,
      classification ?? { category: 'triageable' }
    );
    const terminalClassification = [
      'duplicate',
      'obsolete',
      'superseded',
    ].includes(classification?.category);
    const dependencies = (issue.relations?.nodes ?? [])
      .filter(row => ['blocked_by', 'blockedBy'].includes(row.type))
      .map(row => row.relatedIssue?.identifier)
      .filter(Boolean);
    const candidate =
      !terminalClassification &&
      ownership.allowed &&
      route.agentReady &&
      ['agent-ready', 'incident'].includes(route.category) &&
      dependencies.length === 0;
    return {
      identifier: issue.identifier,
      state: issue.state?.name ?? 'unknown',
      owner: issue.assignee?.id ?? null,
      candidateForAdmission: candidate,
      executionEligible: null,
      reason: !ownership.allowed
        ? ownership.reason
        : terminalClassification
          ? 'terminal-intake-classification'
          : dependencies.length
            ? 'blocked-by-relation'
            : candidate
              ? 'candidate-needs-capacity-and-final-gates'
              : route.reason,
      dependencies,
      nextAction: !ownership.allowed
        ? 'reconcile-with-current-owner'
        : terminalClassification
          ? 'intake-owner-decision'
          : dependencies.length
            ? 'repair-or-reconcile-dependencies'
            : candidate
              ? 'verify-current-capacity-and-admission'
              : 'intake-owner-decision',
    };
  });
  const counts = new Map();
  for (const entry of entries) {
    for (const identifier of new Set(entry.dependencies)) {
      counts.set(identifier, (counts.get(identifier) ?? 0) + 1);
    }
  }
  return {
    schema: 'jovie-issue-eligibility-census/v1',
    scope: 'observed-backlog-intake',
    executionGrant: false,
    issueCount: entries.length,
    entries,
    dependencyRepairs: [...counts]
      .map(([identifier, affectedIssues]) => ({ identifier, affectedIssues }))
      .sort(
        (a, b) =>
          b.affectedIssues - a.affectedIssues ||
          a.identifier.localeCompare(b.identifier)
      ),
  };
}
