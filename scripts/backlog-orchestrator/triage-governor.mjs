import { createHash } from 'node:crypto';

import { classifyIntakeReadiness } from './intake-readiness.mjs';
import { triageOwnershipDecision } from './triage-router.mjs';

export const TRIAGE_GOVERNOR_SCHEMA =
  'summer.linear-governor-disposition/v2';
export const TRIAGE_GOVERNOR_VERSION = '2026-10-12';
export const TRIAGE_HEALTH_SCHEMA = 'summer.linear-triage-health/v1';
export const TRIAGE_HEALTH_MAX_AGE_MS = 30 * 60 * 1000;
export const TRIAGE_HEALTH_MAX_COUNT = 25;

const AGENT_READY_LABELS = new Set(['agent-ready', 'ready-for-intake']);
const BLOCKED_RELATIONS = new Set(['blocked_by', 'blockedBy']);

function labelsOf(issue) {
  return (issue?.labels?.nodes ?? issue?.labels ?? [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => String(label).toLowerCase());
}

function stateName(issue) {
  return issue?.state?.name ?? String(issue?.state ?? 'Unknown');
}

function hasBlockedBy(issue) {
  return (issue?.relations?.nodes ?? issue?.relations ?? []).some(relation =>
    BLOCKED_RELATIONS.has(relation?.type)
  );
}

function routingSnapshot(issue) {
  return JSON.stringify([
    issue?.id,
    issue?.identifier,
    issue?.title,
    issue?.description,
    issue?.priority,
    issue?.state,
    issue?.assignee,
    issue?.labels,
    issue?.parent,
    issue?.children,
    issue?.relations,
    issue?.project,
  ]);
}

function assertMutation(result, code) {
  if (
    result === false ||
    result?.success === false ||
    result?.commentCreate?.success === false ||
    result?.issueUpdate?.success === false
  ) {
    throw new Error(code);
  }
}

function dispositionKey({ issue, decision, category, reason, newState }) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        issue.id,
        decision,
        category,
        reason,
        issue.state?.id,
        issue.state?.name,
        newState.id,
        newState.name,
      ])
    )
    .digest('hex');
}

function parseGovernorReceipt(body) {
  const prefix = '<!-- summer-linear-governor-disposition:v2 ';
  if (!body?.startsWith(prefix) || !body.endsWith(' -->')) return null;
  try {
    const receipt = JSON.parse(body.slice(prefix.length, -4));
    return receipt?.schema === TRIAGE_GOVERNOR_SCHEMA ? receipt : null;
  } catch {
    return null;
  }
}

export function governorReceiptMarker(receipt) {
  return `<!-- summer-linear-governor-disposition:v2 ${JSON.stringify(receipt)} -->`;
}

export function parseGovernorCapacity(environment = process.env) {
  const raw = environment.SYMPHONY_WORKFLOW_CAPACITY;
  const verified = environment.SYMPHONY_WORKFLOW_CAPACITY_VERIFIED === 'true';
  const observedAt = environment.SYMPHONY_WORKFLOW_CAPACITY_OBSERVED_AT;
  const ageMs = Date.now() - Date.parse(observedAt ?? '');
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 10 * 60 * 1000;
  if (!/^\d+$/.test(raw ?? '')) {
    return {
      source: 'fleet-gate:concurrency.gem.maxConcurrent',
      verified: false,
      value: 0,
      target: 0,
      status: 'blocked',
      reason: 'official-symphony-capacity-missing-or-malformed',
    };
  }
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1000 ||
    !verified ||
    !fresh
  ) {
    return {
      source: 'fleet-gate:concurrency.gem.maxConcurrent',
      verified: false,
      value: 0,
      target: 0,
      status: 'blocked',
      reason: !verified
        ? 'official-symphony-capacity-unverified'
        : !fresh
          ? 'official-symphony-capacity-stale'
          : 'official-symphony-capacity-out-of-bounds',
    };
  }
  return {
    source: 'fleet-gate:concurrency.gem.maxConcurrent',
    verified: true,
    observedAt,
    value,
    target: value * 2,
    status: value > 0 ? 'healthy' : 'blocked',
    reason: value > 0 ? 'live-capacity-verified' : 'official-capacity-zero',
  };
}

export function qualifiesForTodoBuffer(issue) {
  if (!['Backlog', 'Todo'].includes(stateName(issue))) return false;
  if (!triageOwnershipDecision(issue).allowed) return false;
  const labels = labelsOf(issue);
  if (!labels.some(label => AGENT_READY_LABELS.has(label))) return false;
  if (hasBlockedBy(issue)) return false;
  return classifyIntakeReadiness(issue).disposition === 'mechanical-ready';
}

function priorityRank(issue) {
  return Number.isInteger(issue?.priority) && issue.priority > 0
    ? issue.priority
    : 5;
}

export function buildTodoBufferSnapshot(issues, capacity) {
  const qualifiedTodo = issues.filter(
    issue => stateName(issue) === 'Todo' && qualifiesForTodoBuffer(issue)
  );
  const candidates = issues
    .filter(
      issue => stateName(issue) === 'Backlog' && qualifiesForTodoBuffer(issue)
    )
    .sort((left, right) => {
      const priority = priorityRank(left) - priorityRank(right);
      if (priority !== 0) return priority;
      const created =
        Date.parse(left.createdAt ?? '') - Date.parse(right.createdAt ?? '');
      if (Number.isFinite(created) && created !== 0) return created;
      return String(left.identifier).localeCompare(String(right.identifier));
    });
  return {
    schema: 'summer.linear-todo-buffer/v1',
    governorVersion: TRIAGE_GOVERNOR_VERSION,
    capacity,
    target: capacity.target,
    qualifiedTodoCount: qualifiedTodo.length,
    shortage: Math.max(0, capacity.target - qualifiedTodo.length),
    candidates,
  };
}

export function buildTriageHealth(
  issues,
  {
    now = new Date(),
    maxAgeMs = TRIAGE_HEALTH_MAX_AGE_MS,
    maxCount = TRIAGE_HEALTH_MAX_COUNT,
  } = {}
) {
  const triage = issues
    .filter(issue => stateName(issue) === 'Triage')
    .map(issue => ({
      identifier: issue.identifier,
      unresolvedAt: issue.createdAt ?? issue.updatedAt,
    }))
    .sort(
      (left, right) =>
        Date.parse(left.unresolvedAt ?? '') -
        Date.parse(right.unresolvedAt ?? '')
    );
  const oldest = triage[0] ?? null;
  const oldestAgeMs = oldest
    ? Math.max(0, now.getTime() - Date.parse(oldest.unresolvedAt))
    : 0;
  const reasons = [];
  if (triage.length > maxCount) reasons.push('triage-count-breach');
  if (oldest && oldestAgeMs >= maxAgeMs)
    reasons.push('triage-oldest-age-breach');
  return {
    schema: TRIAGE_HEALTH_SCHEMA,
    observedAt: now.toISOString(),
    status: reasons.length === 0 ? 'healthy' : 'p0',
    count: triage.length,
    maxCount,
    oldestIssue: oldest?.identifier ?? null,
    oldestUnresolvedAt: oldest?.unresolvedAt ?? null,
    oldestAgeMs,
    maxAgeMs,
    reasons,
  };
}

export async function persistGovernorReceipt({
  issue,
  client,
  decision,
  category,
  reason,
  newState,
  now = new Date(),
}) {
  const key = dispositionKey({ issue, decision, category, reason, newState });
  const existing = (issue.comments?.nodes ?? [])
    .map(comment => ({ comment, receipt: parseGovernorReceipt(comment.body) }))
    .find(entry => entry.receipt?.decisionKey === key);
  if (existing) return existing.receipt;

  const receipt = {
    schema: TRIAGE_GOVERNOR_SCHEMA,
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    decision,
    category,
    reason,
    priorState: {
      id: issue.state?.id ?? null,
      name: stateName(issue),
    },
    newState,
    governorVersion: TRIAGE_GOVERNOR_VERSION,
    timestamp: now.toISOString(),
    decisionKey: key,
  };
  assertMutation(
    await client.addComment(issue.id, governorReceiptMarker(receipt)),
    'summer-governor-receipt-write-failed'
  );
  return receipt;
}

export async function applyGovernorDisposition({
  issue,
  client,
  decision,
  category,
  reason,
  newState,
  priority = issue.priority,
  labelIds,
  now = new Date(),
}) {
  const current = await client.fetchIssue(issue.identifier);
  if (
    !current ||
    current.id !== issue.id ||
    routingSnapshot(current) !== routingSnapshot(issue) ||
    !triageOwnershipDecision(current).allowed
  ) {
    throw new Error('summer-governor-ownership-changed');
  }
  const receipt = await persistGovernorReceipt({
    issue: current,
    client,
    decision,
    category,
    reason,
    newState,
    now,
  });
  const beforeMutation = await client.fetchIssue(issue.identifier);
  if (
    !beforeMutation ||
    beforeMutation.id !== issue.id ||
    routingSnapshot(beforeMutation) !== routingSnapshot(issue) ||
    !triageOwnershipDecision(beforeMutation).allowed
  ) {
    throw new Error('summer-governor-ownership-changed');
  }
  const input = {
    stateId: newState.id,
    ...(Number.isInteger(priority) ? { priority } : {}),
    ...(labelIds ? { labelIds } : {}),
  };
  assertMutation(
    await client.updateIssue(issue.id, input),
    'summer-governor-state-mutation-failed'
  );
  const persisted = await client.fetchIssue(issue.identifier);
  if (
    persisted?.id !== issue.id ||
    persisted?.state?.id !== newState.id ||
    (Number.isInteger(priority) && persisted?.priority !== priority) ||
    !(persisted?.comments?.nodes ?? []).some(
      comment => parseGovernorReceipt(comment.body)?.decisionKey === receipt.decisionKey
    ) ||
    (labelIds &&
      labelIds.some(
        labelId =>
          !(persisted?.labels?.nodes ?? []).some(label => label.id === labelId)
      ))
  ) {
    throw new Error('summer-governor-disposition-readback-failed');
  }
  return { receipt, persisted };
}

export async function promoteTodoBuffer({
  issues,
  client,
  capacity,
  todoState,
  now = new Date(),
}) {
  const snapshot = buildTodoBufferSnapshot(issues, capacity);
  const promotions = [];
  const failures = [];
  for (const candidate of snapshot.candidates.slice(0, snapshot.shortage)) {
    try {
      const result = await applyGovernorDisposition({
        issue: candidate,
        client,
        decision: 'qualified-todo-buffer-promotion',
        category: 'qualified-todo',
        reason: `todo-buffer-shortage:${snapshot.shortage}`,
        newState: todoState,
        now,
      });
      promotions.push({
        issue: candidate.identifier,
        decisionKey: result.receipt.decisionKey,
      });
    } catch (error) {
      failures.push({
        issue: candidate.identifier,
        error: error.message,
      });
    }
  }
  return {
    ...snapshot,
    promotions,
    failures,
    status:
      capacity.status === 'healthy' && failures.length === 0
        ? 'healthy'
        : 'blocked',
  };
}
