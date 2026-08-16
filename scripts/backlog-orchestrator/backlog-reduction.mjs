export const BACKLOG_REDUCTION_SCHEMA = 'backlog-reduction/v1';

const PROTECTED_LABELS = new Set([
  'incident',
  'security',
  'needs-human',
  'human-review-required',
  'risk:high',
  'tim-owned',
  'no-auto',
  'blocked',
]);
const ACTIVE_STATES = new Set(['In Progress', 'In Review']);

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase());
}

function hasOpenPullRequest(issue) {
  if (issue?.pullRequestUrl || issue?.githubPrUrl) return true;
  return (issue?.comments?.nodes || issue?.comments || []).some(comment =>
    /github\.com\/[^\s)]+\/pull\/\d+/i.test(
      String(typeof comment === 'string' ? comment : comment?.body || '')
    )
  );
}

/**
 * This classifier intentionally auto-closes only an explicit duplicate
 * relation. Similar titles, priority, or broad "superseded" heuristics remain
 * review packets because they do not prove invalidation.
 */
export function classifyBacklogReduction(issue) {
  const labels = labelsOf(issue);
  if (!issue?.id || !issue?.identifier)
    return { disposition: 'no-op', reason: 'missing-identity' };
  if (
    ACTIVE_STATES.has(issue?.state?.name) ||
    issue.assignee ||
    hasOpenPullRequest(issue)
  )
    return { disposition: 'no-op', reason: 'actively-owned' };
  if (labels.some(label => PROTECTED_LABELS.has(label)))
    return { disposition: 'no-op', reason: 'protected-policy' };
  if (
    /customer|security|incident/i.test(
      `${issue.title || ''}\n${issue.description || ''}`
    )
  )
    return { disposition: 'no-op', reason: 'sensitive-domain' };
  const duplicate = (issue?.relations?.nodes || issue?.relations || []).find(
    relation =>
      ['duplicate', 'duplicate_of'].includes(
        String(relation?.type || '').toLowerCase()
      ) && relation?.relatedIssue?.identifier
  );
  if (duplicate) {
    return {
      disposition: 'high-confidence-duplicate',
      reason: 'explicit-duplicate-relation',
      relatedIssue: duplicate.relatedIssue.identifier,
      rationale: `Duplicate of ${duplicate.relatedIssue.identifier} by explicit Linear relation.`,
    };
  }
  return {
    disposition: 'review-required',
    reason: 'no-durable-closure-evidence',
  };
}

export function buildBacklogReductionReceipt(
  issues,
  { now = new Date().toISOString() } = {}
) {
  const decisions = issues.map(issue => ({
    issue: issue.identifier,
    ...classifyBacklogReduction(issue),
  }));
  const counts = Object.fromEntries(
    [...new Set(decisions.map(decision => decision.disposition))]
      .sort()
      .map(disposition => [
        disposition,
        decisions.filter(decision => decision.disposition === disposition)
          .length,
      ])
  );
  return {
    schema: BACKLOG_REDUCTION_SCHEMA,
    mode: 'dry-run',
    observedAt: now,
    scanned: issues.length,
    expectedReduction: counts['high-confidence-duplicate'] || 0,
    uncertaintyBuckets: {
      reviewRequired: counts['review-required'] || 0,
      protectedOrActive: counts['no-op'] || 0,
    },
    counts,
    decisions,
    mutations: 0,
  };
}
