/**
 * Durable recovery for stale machine-agent leases.
 *
 * This guard is deliberately narrower than ordinary backlog admission. It only
 * releases an unassigned In Progress issue when the latest machine-agent
 * evidence is terminal, the lease is stale but still within a bounded window,
 * and there is no evidence of an open PR or human protection.
 */

export const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
export const STALE_LEASE_RECOVERY_COMMENT =
  '<!-- stale-lease-recovery {"version":1,"action":"release-to-todo","reason":"terminal-machine-agent-evidence"} -->';

export const DEFAULT_PROTECTED_LABELS = new Set([
  'needs-human',
  'no-auto',
  'human-review-required',
  'founder-fast-track',
  'blocked',
  'incident',
  'risk:high',
  'tim-approved',
  'codex-blocked',
]);

const MACHINE_AGENT_PATTERN =
  /jovie agent|codex issue shipper|machine-agent|machine agent/i;
const TERMINAL_PATTERN =
  /released|stopped|completed|finished|terminal|exited\s+(?:0|without|with)/i;
const NEGATED_OPEN_PR_PATTERN =
  /no\s+(?:open|active)\s+(?:github\s+)?pr|without\s+(?:an?\s+)?open\s+pr/i;
const PR_URL_PATTERN = /https?:\/\/github\.com\/[^\s)]+\/pull\/\d+/i;

function labelsOf(issue) {
  const labels = issue?.labels?.nodes ?? issue?.labels ?? [];
  return labels
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase());
}

function commentsOf(issue) {
  return (issue?.comments?.nodes ?? issue?.comments ?? [])
    .filter(comment => comment && typeof comment.body === 'string')
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );
}

function latestMachineAgentEvidence(issue) {
  return commentsOf(issue).find(comment => {
    const author = `${comment.author?.name || ''} ${comment.author?.email || ''}`;
    return (
      comment.machineAgent === true ||
      comment.source === 'machine-agent' ||
      MACHINE_AGENT_PATTERN.test(`${author} ${comment.body}`)
    );
  });
}

function hasOpenPullRequest(issue) {
  const directReferences = [
    issue?.pullRequestUrl,
    issue?.githubPrUrl,
    issue?.activePullRequestUrl,
  ];
  if (
    directReferences.some(value => typeof value === 'string' && value.trim())
  ) {
    return true;
  }

  const pullRequest = issue?.pullRequest || issue?.githubPullRequest;
  if (pullRequest && typeof pullRequest === 'object') {
    if (String(pullRequest.state || '').toUpperCase() === 'OPEN') return true;
    if (pullRequest.isOpen === true) return true;
  }

  const latestEvidence = latestMachineAgentEvidence(issue)?.body || '';
  return (
    PR_URL_PATTERN.test(latestEvidence) &&
    !NEGATED_OPEN_PR_PATTERN.test(latestEvidence)
  );
}

function ageHours(issue, now) {
  const updatedAt = new Date(issue?.updatedAt || 0).getTime();
  const current = new Date(now).getTime();
  if (!Number.isFinite(updatedAt) || !Number.isFinite(current)) return null;
  return (current - updatedAt) / 3_600_000;
}

function recoveryCommentCount(issue) {
  return commentsOf(issue).filter(
    comment => comment.body.trim() === STALE_LEASE_RECOVERY_COMMENT
  ).length;
}

export function isTerminalMachineAgentEvidence(issue) {
  const latest = latestMachineAgentEvidence(issue);
  if (!latest) return false;
  const evidence = [latest.body, latest.event, latest.status, latest.type]
    .filter(Boolean)
    .join(' ');
  return TERMINAL_PATTERN.test(evidence);
}

export function classifyStaleLease(
  issue,
  {
    now = new Date().toISOString(),
    minLeaseAgeHours = 24,
    maxLeaseAgeHours = 24 * 30,
    protectedLabels = DEFAULT_PROTECTED_LABELS,
  } = {}
) {
  if (issue?.state?.name !== 'In Progress') {
    return { eligible: false, reason: 'not-in-progress' };
  }
  if (issue.assignee) {
    return { eligible: false, reason: 'assigned' };
  }
  if (labelsOf(issue).some(label => protectedLabels.has(label))) {
    return { eligible: false, reason: 'protected-label' };
  }
  if (hasOpenPullRequest(issue)) {
    return { eligible: false, reason: 'active-pr' };
  }
  const age = ageHours(issue, now);
  if (age === null) return { eligible: false, reason: 'invalid-lease-age' };
  if (age < minLeaseAgeHours) {
    return { eligible: false, reason: 'lease-too-fresh', ageHours: age };
  }
  if (age > maxLeaseAgeHours) {
    return { eligible: false, reason: 'lease-too-old', ageHours: age };
  }
  if (!isTerminalMachineAgentEvidence(issue)) {
    return { eligible: false, reason: 'latest-agent-evidence-not-terminal' };
  }
  const commentCount = recoveryCommentCount(issue);
  if (commentCount > 1) {
    return { eligible: false, reason: 'duplicate-recovery-comments' };
  }
  return {
    eligible: true,
    ageHours: age,
    hasRecoveryComment: commentCount === 1,
  };
}

function mutationSucceeded(result) {
  if (result === undefined || result === true) return true;
  if (result === false || result?.success === false) return false;
  const nestedSuccess = [
    result?.commentCreate?.success,
    result?.issueUpdate?.success,
  ].filter(value => value !== undefined);
  return nestedSuccess.length === 0 || nestedSuccess.every(Boolean);
}

/**
 * Sweep and safely release stale leases. Every mutation is followed by an
 * authoritative fetchIssue reread; an unproven mutation is reported failed.
 */
export async function sweepStaleLeases({
  issues,
  client,
  now = new Date().toISOString(),
  todoStateId = TODO_STATE_ID,
  ...policy
}) {
  const result = { recovered: [], skipped: [], failed: [] };

  for (const snapshot of issues) {
    let issue = snapshot;
    try {
      issue = (await client.fetchIssue(snapshot.identifier)) || snapshot;
    } catch (error) {
      result.failed.push({
        identifier: snapshot.identifier,
        reason: 'reread-failed',
        error: error.message,
      });
      continue;
    }

    const decision = classifyStaleLease(issue, { now, ...policy });
    if (!decision.eligible) {
      result.skipped.push({
        identifier: issue.identifier,
        reason: decision.reason,
      });
      continue;
    }

    try {
      if (!decision.hasRecoveryComment) {
        const commentResult = await client.addComment(
          issue.id,
          STALE_LEASE_RECOVERY_COMMENT
        );
        if (!mutationSucceeded(commentResult)) {
          throw new Error('comment mutation returned success=false');
        }
        const afterComment = await client.fetchIssue(issue.identifier);
        const afterCommentCount = recoveryCommentCount(afterComment);
        if (
          afterComment?.state?.name !== 'In Progress' ||
          afterCommentCount !== 1
        ) {
          result.failed.push({
            identifier: issue.identifier,
            reason: 'comment-verification-failed',
          });
          continue;
        }
        issue = afterComment;
      }

      const transitionResult = await client.transitionIssue(
        issue.id,
        todoStateId
      );
      if (!mutationSucceeded(transitionResult)) {
        throw new Error('transition mutation returned success=false');
      }
      const afterTransition = await client.fetchIssue(issue.identifier);
      if (
        afterTransition?.state?.name !== 'Todo' ||
        recoveryCommentCount(afterTransition) !== 1
      ) {
        result.failed.push({
          identifier: issue.identifier,
          reason: 'transition-verification-failed',
        });
        continue;
      }
      result.recovered.push({
        identifier: issue.identifier,
        ageHours: decision.ageHours,
      });
    } catch (error) {
      result.failed.push({
        identifier: issue.identifier,
        reason: 'mutation-failed',
        error: error.message,
      });
    }
  }

  return result;
}
