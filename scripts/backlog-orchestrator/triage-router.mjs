const AGENT_READY_LABELS = new Set(['agent-ready', 'ready-for-intake']);
const BLOCKED_RELATIONS = new Set(['blocked_by', 'blockedBy']);
const FOLLOWUP_PARENT_PATTERNS = [
  /current issue:\s*([A-Z][A-Z0-9]*-\d+)/i,
  /parent(?: issue)?:\s*([A-Z][A-Z0-9]*-\d+)/i,
];

function labelNames(issue) {
  return new Set(
    (issue.labels?.nodes || []).map(label => String(label.name).toLowerCase())
  );
}

function hasBlockedBy(issue) {
  return (issue.relations?.nodes || []).some(relation =>
    BLOCKED_RELATIONS.has(relation.type)
  );
}

export function extractFollowupParentIdentifier(issue) {
  if (issue.parent?.identifier) return issue.parent.identifier;
  const text = `${issue.title || ''}\n${issue.description || ''}`;
  for (const pattern of FOLLOWUP_PARENT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

export function routeTriageIssue(
  issue,
  classification,
  { backlogStateId = null, todoStateId = null } = {}
) {
  const labels = labelNames(issue);
  const title = issue.title || '';
  const description = issue.description || '';
  const isAgentReady = [...AGENT_READY_LABELS].some(label => labels.has(label));
  const isIncident =
    labels.has('incident') ||
    /^\[production controller\]\s*manual recovery/i.test(title);
  const parentIdentifier = extractFollowupParentIdentifier(issue);
  const isFollowup = Boolean(
    issue.parent ||
      parentIdentifier ||
      /follow[- ]?up/i.test(title) ||
      /^##\s*follow[- ]?up/im.test(description)
  );
  const isEpic = labels.has('type:epic');

  if (isIncident) {
    return {
      category: 'incident',
      desiredStateId: todoStateId,
      parentIdentifier,
      reason: 'incident-lane',
      agentReady: isAgentReady,
    };
  }
  if (isFollowup) {
    return {
      category: 'followup',
      desiredStateId: backlogStateId,
      parentIdentifier,
      reason: 'followup-backlog-parent',
      agentReady: isAgentReady,
    };
  }
  if (
    classification.category === 'duplicate' ||
    classification.category === 'obsolete'
  ) {
    return {
      category: classification.category,
      desiredStateId: backlogStateId,
      parentIdentifier,
      reason: 'terminal-intake-classification',
      agentReady: isAgentReady,
    };
  }
  if (isAgentReady && (hasBlockedBy(issue) || isEpic)) {
    return {
      category: 'blocked-ready',
      desiredStateId: backlogStateId,
      parentIdentifier,
      reason: hasBlockedBy(issue)
        ? 'blocked-by-relation'
        : 'epic-not-leaseable',
      agentReady: true,
    };
  }
  if (isAgentReady) {
    return {
      category: 'agent-ready',
      desiredStateId: todoStateId,
      parentIdentifier,
      reason: 'agent-ready-lane',
      agentReady: true,
    };
  }
  return {
    category: classification.category,
    desiredStateId: null,
    parentIdentifier,
    reason: 'genuine-intake',
    agentReady: false,
  };
}

export function buildAgentReadyTriageWatchdog(
  issues,
  { now = new Date(), staleAfterMs = 5 * 60 * 1000 } = {}
) {
  const observedAt = now.toISOString();
  const violations = issues
    .filter(issue => issue.state?.name === 'Triage')
    .filter(issue =>
      [...AGENT_READY_LABELS].some(label => labelNames(issue).has(label))
    )
    .map(issue => ({
      identifier: issue.identifier,
      ageMs: Math.max(0, now.getTime() - new Date(issue.updatedAt).getTime()),
      updatedAt: issue.updatedAt,
    }))
    .filter(issue => issue.ageMs >= staleAfterMs)
    .sort((a, b) => a.identifier.localeCompare(b.identifier));

  return {
    schema: 'backlog-orchestrator/triage-watchdog/v1',
    observedAt,
    staleAfterMs,
    status: violations.length === 0 ? 'healthy' : 'blocked',
    violations,
  };
}
