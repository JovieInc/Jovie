#!/usr/bin/env node
/** One signed Linear delivery -> one current JOV intake assessment. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchBacklogSweepCandidates } from './backlog-current-linear.mjs';
import { admitBacklogEvent } from './backlog-event-admission.mjs';
import { worldObservationSummary } from './backlog-observation-summary.mjs';
import { classifyDeterministic } from './classifier.mjs';
import { classifyIntakeReadiness } from './intake-readiness.mjs';
import * as linear from './linear-client.mjs';
import { reconcileIssues } from './reconcile.mjs';
import * as runtimeState from './runtime-state.mjs';
import {
  requestSummerAssessment,
  validJevTriageAssessment,
} from './summer-triage-assessment-client.mjs';
import { routeTriageIssue, triageOwnershipDecision } from './triage-router.mjs';

function triageSnapshot(issue) {
  return JSON.stringify([
    issue.id,
    issue.identifier,
    issue.title,
    issue.description,
    issue.state,
    issue.priority,
    issue.assignee,
    issue.labels,
    issue.children,
    issue.relations,
    issue.parent,
  ]);
}

/**
 * One Summer-attested provider-blocked escalation on the assessment receipt
 * (an upstream lane refusing its model capacity/cost binding, e.g. the Gem
 * reason lane's `reason-lane-model-capacity-cost-binding-unverified`).
 * Summer has carried the escalation at more than one depth — top-level on
 * the receipt, inside the Jev assessment, and as a list — so every known
 * location is scanned with the same strict shape check (status exactly
 * 'provider-block', code matching ^[a-z0-9-]{4,128}$). The sweep still names
 * and counts these rows, but a row that Summer already escalated to a
 * blocked provider does not need this workflow's red to stay visible — the
 * escalation itself is the tracked signal. Returns null when the receipt
 * carries no such escalation anywhere.
 */
export function escalationBlockOf(summerReceipt) {
  const candidates = [];
  const receipt = /** @type {Record<string, any>} */ (summerReceipt ?? {});
  candidates.push(receipt.escalation);
  if (Array.isArray(receipt.escalations))
    candidates.push(...receipt.escalations);
  const assessment = /** @type {Record<string, any>} */ (
    receipt.assessment ?? {}
  );
  candidates.push(assessment.escalation);
  if (Array.isArray(assessment.escalations))
    candidates.push(...assessment.escalations);
  for (const candidate of candidates) {
    const escalation = /** @type {Record<string, any>} */ (candidate ?? {});
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      String(escalation.status) !== 'provider-block'
    ) {
      continue;
    }
    const code = String(escalation.code ?? 'provider-block-unspecified');
    if (!/^[a-z0-9-]{4,128}$/.test(code)) continue;
    return {
      status: 'provider-block',
      code,
      owner: typeof escalation.owner === 'string' ? escalation.owner : null,
      requestedModel:
        typeof escalation.requestedModel === 'string'
          ? escalation.requestedModel
          : null,
    };
  }
  return null;
}

/** Consume only a bounded recommendation; the existing picker still owns admission. */
async function applyJevAssessment(issue, assessment, client) {
  if (!validJevTriageAssessment(assessment))
    throw new Error('invalid-jev-triage-assessment');
  const ownership = triageOwnershipDecision(issue);
  if (!ownership.allowed)
    return {
      disposition: 'owned-active',
      reason: ownership.reason,
      mutations: 0,
      wakeSymphony: false,
    };
  if (assessment.status === 'unavailable')
    // The model provider is down, not the issue. Name the row as a
    // provider-blocked escalation so the sweep stays green (2026-10-10:
    // Fleet Gate Refresh went red on every main push for 26 such rows).
    return {
      disposition: assessment.status,
      reason: assessment.reason,
      mutations: 0,
      wakeSymphony: false,
      requiresImmediateInvestigation: false,
      escalation: {
        status: 'provider-block',
        code: assessment.reason || 'provider-unavailable',
        owner: null,
        requestedModel: assessment.model ?? null,
      },
    };
  if (assessment.status !== 'decided')
    return {
      disposition: assessment.status,
      reason: assessment.reason,
      mutations: 0,
      wakeSymphony: false,
      requiresImmediateInvestigation: true,
    };
  const route = routeTriageIssue(issue, classifyDeterministic(issue, [issue]), {
    todoStateId: TODO_STATE_ID,
    backlogStateId: BACKLOG_STATE_ID,
  });
  // Deterministic blocked/dependency/follow-up dispositions outrank a model recommendation.
  if (route.reason !== 'genuine-intake') return null;
  if (issue.priority === 1 && assessment.priority !== 1)
    return {
      disposition: 'ambiguous',
      reason: 'urgent-priority-downgrade',
      mutations: 0,
      wakeSymphony: false,
      requiresImmediateInvestigation: true,
    };
  const readiness = classifyIntakeReadiness(issue);
  const labels = issue.labels?.nodes ?? [];
  const ready =
    assessment.destination === 'Todo' &&
    readiness.disposition === 'mechanical-ready';
  const label = ready
    ? await client.fetchTeamLabel(
        'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
        'agent-ready'
      )
    : null;
  if (ready && !label?.id) throw new Error('agent-ready-label-unavailable');
  const unchanged = async () => {
    const current = await client.fetchIssue(issue.identifier);
    if (
      !current ||
      triageSnapshot(current) !== triageSnapshot(issue) ||
      !triageOwnershipDecision(current).allowed
    )
      throw new Error('jev-triage-ownership-changed');
    return current;
  };
  await unchanged();
  const marker = `<!-- jev-triage-disposition:v1 ${JSON.stringify(assessment)} -->`;
  if (!(issue.comments?.nodes ?? []).some(comment => comment.body === marker)) {
    const comment = await client.addComment(issue.id, marker);
    if (
      comment === false ||
      comment?.success === false ||
      comment?.commentCreate?.success === false
    )
      throw new Error('jev-triage-comment-failed');
  }
  await unchanged();
  const input = {
    stateId:
      assessment.destination === 'Todo' ? TODO_STATE_ID : BACKLOG_STATE_ID,
    priority: assessment.priority,
    ...(ready
      ? { labelIds: [...new Set([...labels.map(label => label.id), label.id])] }
      : {}),
  };
  const mutation = await client.updateIssue(issue.id, input);
  if (
    mutation === false ||
    mutation?.success === false ||
    mutation?.issueUpdate?.success === false
  )
    throw new Error('jev-triage-mutation-failed');
  const persisted = await client.fetchIssue(issue.identifier);
  if (
    persisted?.id !== issue.id ||
    persisted?.state?.id !== input.stateId ||
    persisted?.priority !== input.priority ||
    !(persisted.comments?.nodes ?? []).some(
      comment => comment.body === marker
    ) ||
    (ready && !(persisted.labels?.nodes ?? []).some(row => row.id === label.id))
  )
    throw new Error('jev-triage-readback-failed');
  return {
    disposition: assessment.destination,
    reason: ready
      ? assessment.reason
      : `${assessment.reason}; ${readiness.reason}`,
    category: assessment.category,
    priority: persisted.priority,
    mutations: 1,
    wakeSymphony: ready,
    verified: {
      state: persisted.state.name,
      updatedAt: persisted.updatedAt,
      assessmentKey: assessment.assessmentKey,
    },
  };
}

const TRIAGE_STATE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8';
const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
const BACKLOG_STATE_ID = '1551ed21-7743-4573-82d8-8949410d3b8d';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LINEAR_UPDATED_AT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const BACKLOG_READ_OPTIONS = Object.freeze({
  timeoutMs: 4_000,
  maxAttempts: 1,
  rateLimitMaxAttempts: 1,
  rateLimitMaxTotalWaitMs: 0,
});

function validLinearPriority(priority) {
  return Number.isInteger(priority) && priority >= 0 && priority <= 4;
}

/** One transient 5xx retry; never escalate to a different provider or writer. */
async function requestBoundedAssessment(delivery, summer) {
  try {
    return await summer(delivery);
  } catch (error) {
    if (!/^summer-triage-assessment-http-5\d\d$/.test(String(error?.message)))
      throw error;
    return summer(delivery);
  }
}

function backlogHold(base, reason, details = {}) {
  return {
    ...base,
    state: 'Backlog',
    disposition: 'held',
    reason,
    holds: [reason],
    ...details,
    authorizesTransition: false,
    authorizesDispatch: false,
    mutations: 0,
    wakeSymphony: false,
    requiresImmediateInvestigation: false,
  };
}

/** Backlog output is metadata only. Private current preimages and raw World
 * records stay inside the maintained signed/guarded admission path. */
function backlogAssessmentSummary(receipt) {
  const pick = (value, keys) =>
    Object.fromEntries(
      keys
        .filter(key => Object.hasOwn(value ?? {}, key))
        .map(key => [key, value[key]])
    );
  const result = pick(receipt, [
    'schema',
    'issueIdentifier',
    'issueId',
    'deliveryId',
    'linearUpdatedAt',
    'state',
    'priority',
    'decision',
    'acceptedInvestigation',
    'authorizesDispatch',
  ]);
  result.backlogIntake = pick(receipt.backlogIntake, [
    'schema',
    'status',
    'policy',
    'authorizesTransition',
  ]);
  result.admissionDelegation = pick(receipt.admissionDelegation, [
    'contract',
    'writer',
    'status',
    'authorizesTransition',
  ]);
  const fence = receipt.legacyGovernorFence;
  result.legacyGovernorFence = pick(fence, [
    'status',
    'contract',
    'issueIdentifier',
    'issueId',
    'idempotencyKey',
    'dispatchPath',
    'authorizesTransition',
    'fenceSetContract',
  ]);
  if (Array.isArray(fence?.families))
    result.legacyGovernorFence.families = fence.families.map(family =>
      pick(family, [
        'family',
        'status',
        'idempotencyKey',
        'dispatchPath',
        'authorizesTransition',
      ])
    );
  if (receipt.workflowDrainObservation)
    result.workflowDrainObservation = worldObservationSummary(
      receipt.workflowDrainObservation,
      receipt.workflowDrainObservation.identity ?? {}
    );
  return result;
}

/**
 * Observe the maintained Summer delegation and fixed-key negative fence only.
 * Neither proves old generic-writer drain nor native admission eligibility.
 * Backlog never enters the Triage Jev/reconcile mutation path below.
 */
async function observeBacklogEvent(
  delivery,
  issue,
  base,
  client,
  summer,
  admit
) {
  if (
    issue?.id !== delivery.issueId ||
    issue?.identifier !== delivery.identifier
  )
    return backlogHold(base, 'backlog-event-identity-mismatch');
  if (
    issue.state?.id !== BACKLOG_STATE_ID ||
    issue.state?.name !== 'Backlog' ||
    issue.state?.type !== 'backlog'
  )
    return backlogHold(base, 'backlog-event-state-changed');
  if (issue.updatedAt !== delivery.expectedLinearUpdatedAt)
    return backlogHold(base, 'backlog-event-version-changed');
  if (!validLinearPriority(issue.priority))
    return backlogHold(base, 'backlog-priority-invalid');

  const snapshot = JSON.stringify([triageSnapshot(issue), issue.comments]);
  const priority = issue.priority;
  let summerReceipt;
  try {
    // The signed transport validates the exact delegation contract and fence
    // key/path. The fence request is mandatory even for replayed deliveries.
    summerReceipt = await requestBoundedAssessment(delivery, summer);
  } catch (error) {
    return backlogHold(
      base,
      error?.message === 'summer-triage-assessment-http-409'
        ? 'summer-backlog-observation-conflict'
        : 'summer-backlog-observation-unavailable'
    );
  }
  let current;
  try {
    current = await client.fetchIssue(
      delivery.identifier,
      BACKLOG_READ_OPTIONS
    );
  } catch {
    return backlogHold(base, 'backlog-current-read-unavailable');
  }
  if (
    current?.id !== delivery.issueId ||
    current?.identifier !== delivery.identifier ||
    current?.state?.id !== BACKLOG_STATE_ID ||
    current?.state?.name !== 'Backlog' ||
    current?.state?.type !== 'backlog' ||
    current?.updatedAt !== delivery.expectedLinearUpdatedAt ||
    JSON.stringify([triageSnapshot(current), current.comments]) !== snapshot
  )
    return backlogHold(base, 'backlog-changed-after-summer-observation');
  if (
    !summerReceipt ||
    summerReceipt.state !== 'Backlog' ||
    summerReceipt.linearUpdatedAt !== current.updatedAt ||
    !validLinearPriority(summerReceipt.priority) ||
    summerReceipt.priority !== priority ||
    summerReceipt.authorizesDispatch !== false ||
    summerReceipt.acceptedInvestigation !== false ||
    summerReceipt.backlogIntake?.authorizesTransition !== false ||
    summerReceipt.admissionDelegation?.authorizesTransition !== false ||
    summerReceipt.legacyGovernorFence?.authorizesTransition !== false ||
    ['assessment', 'assessmentCost', 'escalation', 'escalations'].some(key =>
      Reflect.has(summerReceipt, key)
    )
  )
    return backlogHold(base, 'summer-backlog-observation-invalid');
  if (summerReceipt.workflowDrainObservation) {
    const result = await admit(
      delivery,
      current,
      summerReceipt,
      client,
      summer
    );
    return {
      ...base,
      state: result.disposition === 'Todo' ? 'Todo' : 'Backlog',
      priority,
      linearUpdatedAt: current.updatedAt,
      summerAssessment: backlogAssessmentSummary(summerReceipt),
      ...result,
    };
  }
  return backlogHold(base, 'backlog-native-admission-unverified', {
    priority,
    linearUpdatedAt: current.updatedAt,
    summerAssessment: backlogAssessmentSummary(summerReceipt),
    holds: [
      'generic-writer-drain-unverified',
      'native-backlog-admission-unverified',
    ],
  });
}

// Sweep throttle (2026-10-10): the fleet-gate-refresh workflow invokes
// `--sweep` under `if: always()` on every 5-minute tick AND every main push
// (~300/day) on the shared Linear credential, which was the main consumer
// behind the remediator deferring RATE_LIMITED. The sweep is a catch-up
// backstop, not the primary signal (signed deliveries drive the real-time
// path), so a 30-minute floor prunes the redundant runs. The last
// successful sweep timestamp persists in the same out-of-tree cache the
// remediator uses (runtime-state.resolveCacheFile) so the throttle survives
// across workflow runs.
const SWEEP_MIN_INTERVAL_MS = 30 * 60 * 1000;
const SWEEP_THROTTLE_KEY = 'lastTriageSweepOkAt';

function readSweepCache(cacheFile) {
  try {
    const parsed = JSON.parse(readFileSync(cacheFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSweepCache(cacheFile, cache) {
  runtimeState.ensureParentDir(cacheFile);
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

/** Recover missed Backlog events on the existing Fleet cadence. Discovery is
 * metadata only; every attempted admission still joins the private native
 * predecessor/custody/resource proof. A cursor prevents held old rows from
 * starving later candidates; current priority/readiness changes reset it. */
export async function assessBacklogSweep(
  client = linear,
  summer = requestSummerAssessment,
  {
    cacheFile = undefined,
    maxIssues = 3,
    timeBudgetMs = 185_000,
    now = Date.now,
    discover = fetchBacklogSweepCandidates,
    assess = assessTriageEvent,
  } = {}
) {
  const started = now(),
    results = [];
  let all;
  try {
    all = await discover(client, BACKLOG_READ_OPTIONS);
  } catch {
    return {
      schema: 'linear-backlog-catch-up/v1',
      observedAt: new Date(now()).toISOString(),
      issueCount: 0,
      inventoryUnknown: true,
      assessed: 0,
      deferred: 0,
      failed: 1,
      wakeSymphony: false,
      results: [
        {
          disposition: 'assessment-failed',
          reason: 'backlog-catch-up-census-unavailable',
          owner: 'JOV-8022 Fleet admission owner',
          mutations: 0,
          wakeSymphony: false,
        },
      ],
    };
  }
  const issues = all.filter(
    row =>
      row.state.name === 'Backlog' &&
      row.archivedAt === null &&
      row.labels.some(label => label.name === 'agent-ready')
  );
  issues.sort(
    (a, b) =>
      (a.priority === 1 ? 0 : 1) - (b.priority === 1 ? 0 : 1) ||
      (a.priority || 5) - (b.priority || 5) ||
      Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
      a.id.localeCompare(b.id)
  );
  const digest = createHash('sha256')
    .update(
      JSON.stringify(
        issues.map(row => [row.id, row.priority, row.updatedAt, row.labels])
      )
    )
    .digest('hex');
  const cache = cacheFile ? readSweepCache(cacheFile) : {};
  let cursor =
    cache.backlogSweepQueueDigest === digest &&
    Number.isSafeInteger(cache.backlogSweepCursor)
      ? Math.max(0, cache.backlogSweepCursor) % Math.max(1, issues.length)
      : 0;
  for (let count = 0; count < Math.min(3, maxIssues, issues.length); count++) {
    // Reserve the existing complete bounded operation rather than killing a
    // mutation when only a few seconds remain in a catch-up cycle.
    if (now() - started > timeBudgetMs - 180_000) break;
    const issue = issues[cursor];
    cursor = (cursor + 1) % issues.length;
    try {
      const result = await assess(
        {
          action: 'linear_triage_assess',
          client_payload: {
            team_key: 'JOV',
            state_name: 'Backlog',
            action: 'update',
            issue_id: issue.id,
            issue_identifier: issue.identifier,
            issue_updated_at: issue.updatedAt,
            delivery_id: `backlog-catch-up:${issue.id}:${issue.updatedAt}`,
          },
        },
        client,
        summer
      );
      results.push(result);
      if (
        [
          'summer-old-world-writers-unverified',
          'summer-old-http-window-pending',
          'summer-provider-latest-mapping-unverified',
          'summer-production-origin-unverified',
        ].includes(result.reason)
      )
        break;
    } catch {
      results.push({
        issue: issue.identifier,
        disposition: 'assessment-failed',
        reason: 'backlog-catch-up-observation-unavailable',
        mutations: 0,
        wakeSymphony: false,
        owner: 'JOV-8022 Fleet admission owner',
      });
    }
  }
  if (cacheFile)
    writeSweepCache(cacheFile, {
      ...readSweepCache(cacheFile),
      backlogSweepQueueDigest: digest,
      backlogSweepCursor: cursor,
    });
  return {
    schema: 'linear-backlog-catch-up/v1',
    observedAt: new Date(now()).toISOString(),
    issueCount: issues.length,
    assessed: results.length,
    deferred: issues.length - results.length,
    failed: results.filter(row => row.disposition === 'assessment-failed')
      .length,
    wakeSymphony: results.some(row => row.wakeSymphony),
    results,
  };
}

/**
 * Decide whether the catch-up sweep should run. Returns `{ skip, reason }` —
 * skip=true when the last successful sweep is fresher than the 30-minute
 * floor. A missing/unparseable timestamp never skips (fail open to running:
 * the sweep is the backstop for missed webhooks, so doubt means run).
 */
export function triageSweepThrottle({ lastOkAt, nowMs }) {
  const parsed = Date.parse(String(lastOkAt ?? ''));
  if (!Number.isFinite(parsed)) return { skip: false, reason: 'no-prior-ok' };
  const ageMs = nowMs - parsed;
  if (ageMs < 0) return { skip: false, reason: 'clock-skew' };
  if (ageMs < SWEEP_MIN_INTERVAL_MS) {
    return {
      skip: true,
      reason: `swept-${Math.round(ageMs / 60000)}m-ago`,
    };
  }
  return { skip: false, reason: 'interval-elapsed' };
}

/** Recover missed/ambiguous webhook deliveries through the same exact-issue writer. */
export async function assessTriageSweep(
  client = linear,
  summer = requestSummerAssessment,
  { maxIssues = 25, timeBudgetMs = 60_000, now = Date.now } = {}
) {
  const started = now();
  const issues = await client.fetchTeamTriageIssues(
    'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
    1000,
    ['Triage']
  );
  issues.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  const results = [];
  for (const issue of issues) {
    if (results.length >= maxIssues || now() - started >= timeBudgetMs) break;
    try {
      results.push(
        await assessTriageEvent(
          {
            action: 'linear_triage_assess',
            client_payload: {
              team_key: 'JOV',
              state_name: 'Triage',
              action: 'update',
              issue_id: issue.id,
              issue_identifier: issue.identifier,
              issue_updated_at: issue.updatedAt,
              delivery_id: `catch-up:${issue.id}:${issue.updatedAt}`,
            },
          },
          client,
          summer
        )
      );
    } catch (error) {
      results.push({
        issue: issue.identifier,
        disposition: 'assessment-failed',
        error: error.message,
        mutations: 0,
        wakeSymphony: false,
      });
    }
  }
  return {
    schema: 'linear-triage-catch-up/v1',
    observedAt: new Date(now()).toISOString(),
    issueCount: issues.length,
    assessed: results.length,
    deferred: issues.length - results.length,
    failed: results.filter(result => result.disposition === 'assessment-failed')
      .length,
    blocked: results.filter(
      result =>
        'requiresImmediateInvestigation' in result &&
        result.requiresImmediateInvestigation
    ).length,
    providerBlocked: results.filter(
      result => 'escalation' in result && result.escalation
    ).length,
    wakeSymphony: results.some(result => result.wakeSymphony),
    results,
  };
}

export function parseTriageEvent(event) {
  const payload = event?.client_payload;
  if (
    event?.action !== 'linear_triage_assess' ||
    payload?.team_key !== 'JOV' ||
    !['Triage', 'Backlog'].includes(payload?.state_name) ||
    !['create', 'update'].includes(payload?.action) ||
    !UUID.test(payload?.issue_id ?? '') ||
    !/^JOV-\d+$/.test(payload?.issue_identifier ?? '') ||
    (payload?.state_name === 'Backlog' &&
      (typeof payload.issue_updated_at !== 'string' ||
        !LINEAR_UPDATED_AT.test(payload.issue_updated_at) ||
        !Number.isFinite(Date.parse(payload.issue_updated_at))))
  ) {
    throw new Error('invalid-linear-triage-event');
  }
  return {
    issueId: payload.issue_id,
    identifier: payload.issue_identifier,
    deliveryId: createHash('sha256')
      .update(
        String(
          payload.delivery_id ||
            `${payload.issue_id}:${payload.issue_updated_at || ''}`
        )
      )
      .digest('hex'),
    ...(payload.state_name === 'Backlog'
      ? {
          expectedState: 'Backlog',
          expectedLinearUpdatedAt: payload.issue_updated_at,
          fenceLegacyGovernor: true,
          observeLegacyWorkflowDrain: true,
        }
      : {}),
  };
}

export async function assessTriageEvent(
  event,
  client = linear,
  summer = requestSummerAssessment,
  { admit = admitBacklogEvent } = {}
) {
  const delivery = parseTriageEvent(event);
  const base = {
    schema: 'linear-triage-assessment/v1',
    deliveryId: delivery.deliveryId,
    issue: delivery.identifier,
    observedAt: new Date().toISOString(),
  };
  let issue;
  try {
    issue = await client.fetchIssue(
      delivery.identifier,
      delivery.expectedState === 'Backlog' ? BACKLOG_READ_OPTIONS : undefined
    );
  } catch (error) {
    // Transport errors can carry private response bodies and nested causes.
    // The event CLI must return only a named safe Backlog observation hold.
    if (delivery.expectedState === 'Backlog')
      return backlogHold(base, 'backlog-current-read-unavailable');
    throw error;
  }
  if (delivery.expectedState === 'Backlog')
    return observeBacklogEvent(delivery, issue, base, client, summer, admit);
  if (!issue || issue.id !== delivery.issueId) {
    throw new Error('linear-triage-identity-mismatch');
  }
  if (issue.state?.id !== TRIAGE_STATE_ID || issue.state?.name !== 'Triage') {
    return {
      ...base,
      disposition: 'stale-event',
      mutations: 0,
      wakeSymphony: false,
    };
  }

  // One bounded retry on a transient Summer 5xx: a 503 between attempts
  // must not fail a row the next call answers. Only 5xx responses retry
  // (once); 4xx, timeouts, and network errors fail the row immediately.
  const summerReceipt = await requestBoundedAssessment(delivery, summer);
  // A provider-blocked escalation is exempt from the sweep's exit no matter
  // which Summer decision branch carries it (urgent-investigation-required
  // without an assessment, or existing-intake-reconcile with an ambiguous
  // Jev assessment) — the row is provider-blocked either way, and the
  // escalation itself is the tracked signal.
  const providerBlockedEscalation = escalationBlockOf(summerReceipt);
  if (
    summerReceipt.decision !== 'existing-intake-reconcile' &&
    !summerReceipt.assessment
  ) {
    return {
      ...base,
      disposition: summerReceipt.decision,
      summerAssessment: summerReceipt,
      mutations: 0,
      wakeSymphony: false,
      requiresImmediateInvestigation:
        summerReceipt.decision === 'urgent-investigation-required' &&
        !providerBlockedEscalation,
      ...(providerBlockedEscalation
        ? { escalation: providerBlockedEscalation }
        : {}),
    };
  }
  if (providerBlockedEscalation) {
    return {
      ...base,
      disposition: summerReceipt.decision,
      reason: 'provider-blocked-escalation',
      summerAssessment: summerReceipt,
      mutations: 0,
      wakeSymphony: false,
      escalation: providerBlockedEscalation,
      requiresImmediateInvestigation: false,
    };
  }
  if (summerReceipt.decision === 'existing-intake-reconcile') {
    const escalation = escalationBlockOf(summerReceipt);
    if (escalation) {
      return {
        ...base,
        disposition: summerReceipt.decision,
        summerAssessment: summerReceipt,
        mutations: 0,
        wakeSymphony: false,
        escalation,
      };
    }
  }

  const current = await client.fetchIssue(delivery.identifier);
  if (
    current?.id !== delivery.issueId ||
    current?.state?.id !== TRIAGE_STATE_ID ||
    current?.updatedAt !== summerReceipt.linearUpdatedAt
  ) {
    throw new Error('linear-triage-changed-after-summer-assessment');
  }
  const readiness = classifyIntakeReadiness(current);
  if (summerReceipt.assessment) {
    const applied = await applyJevAssessment(
      current,
      summerReceipt.assessment,
      client
    );
    if (applied)
      return { ...base, summerAssessment: summerReceipt, ...applied };
  }
  const reconciliation = await reconcileIssues({
    issues: [current],
    client,
    backlogStateId: BACKLOG_STATE_ID,
    todoStateId: TODO_STATE_ID,
  });
  if (reconciliation.failed > 0) {
    throw new Error('linear-triage-reconciliation-failed');
  }
  const result = reconciliation.results[0];
  return {
    ...base,
    disposition: readiness.disposition,
    summerAssessment: summerReceipt,
    reason: readiness.reason,
    priority: current.priority,
    assignee: current.assignee?.name ?? null,
    reconciliation: {
      action: result.action,
      category: result.category,
      route: result.route,
      mutated: result.mutated,
      wouldMove: result.wouldMove,
    },
    mutations: reconciliation.mutations,
    wakeSymphony:
      result.route === 'agent-ready-lane' && result.wouldMove && result.mutated,
    requiresImmediateInvestigation: current.priority === 1 && !result.wouldMove,
  };
}

export async function runCli() {
  const eventPath = process.argv
    .find(arg => arg.startsWith('--event-file='))
    ?.slice('--event-file='.length);
  if (!eventPath && !process.argv.includes('--sweep'))
    throw new Error('missing-event-file');
  const isSweep = process.argv.includes('--sweep');
  // Throttle the catch-up sweep (2026-10-10): the workflow invokes `--sweep`
  // under `if: always()` on every 5-minute tick + every main push on the
  // shared Linear credential, which was the main consumer behind the
  // remediator deferring RATE_LIMITED. Skip when the last successful sweep
  // is fresher than the 30-minute floor; log the skip so the receipt trail
  // shows the throttle, and persist the timestamp only after a clean run.
  let sweepCacheFile = null;
  if (isSweep) {
    sweepCacheFile = runtimeState.assertsOutsideGitTree(
      runtimeState.resolveCacheFile({})
    );
    const throttle = triageSweepThrottle({
      lastOkAt: readSweepCache(sweepCacheFile)[SWEEP_THROTTLE_KEY],
      nowMs: Date.now(),
    });
    if (throttle.skip) {
      console.log(`triage-sweep skipped reason=${throttle.reason}`);
      process.exitCode = 0;
      return;
    }
  }
  let receipt = isSweep
    ? await assessTriageSweep()
    : await assessTriageEvent(JSON.parse(readFileSync(eventPath, 'utf8')));
  if (isSweep) {
    const backlog = await assessBacklogSweep(linear, requestSummerAssessment, {
      cacheFile: sweepCacheFile,
    });
    receipt = {
      ...receipt,
      backlog,
      assessed: receipt.assessed + backlog.assessed,
      issueCount: receipt.issueCount + backlog.issueCount,
      deferred: receipt.deferred + backlog.deferred,
      failed: receipt.failed + backlog.failed,
      wakeSymphony: receipt.wakeSymphony || backlog.wakeSymphony,
      results: [...receipt.results, ...backlog.results],
    };
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (
    isSweep &&
    sweepCacheFile &&
    'failed' in receipt &&
    Number(receipt.failed ?? 0) === 0
  ) {
    const cache = readSweepCache(sweepCacheFile);
    cache[SWEEP_THROTTLE_KEY] = new Date().toISOString();
    writeSweepCache(sweepCacheFile, cache);
  }
  if ('failed' in receipt) {
    // Named rows, never an anonymous exit. The exit rule keeps its full
    // strength for every failure the sweep itself owns: failed > 0 exits 1,
    // and a blocked row with no provider-blocked escalation still exits 1.
    // A blocked row whose Summer receipt already carries a provider-blocked
    // escalation (e.g. the reason lane's model capacity/cost binding being
    // unverified upstream) is named, counted as providerBlocked, and does
    // not redden this workflow — the escalation is the tracked signal, and
    // Ops/owner act on the named rows, not on this job's color.
    // Row access stays property-safe across the sweep's heterogeneous
    // result shapes (an assessment-failed row carries `error`; other rows
    // carry `reason` or neither).
    for (const result of receipt.results ?? []) {
      const row = /** @type {Record<string, any>} */ (result ?? {});
      const identifier = String(row.issue ?? 'unknown-issue');
      if (row.disposition === 'assessment-failed')
        console.error(
          `::error title=Triage assessment failed::${identifier}: ${row.error ?? row.reason ?? 'assessment failed'}`
        );
      else if (row.escalation)
        console.error(
          `::warning title=Triage escalation provider-blocked::${identifier}: ${row.escalation.code}${row.escalation.requestedModel ? ` (requested ${row.escalation.requestedModel})` : ''}`
        );
      else if (row.requiresImmediateInvestigation)
        console.error(
          `::warning title=Urgent Triage investigation required::${identifier}: ${row.reason ?? row.disposition ?? 'urgent investigation required'}`
        );
    }
    const blockedWithoutEscalation =
      Number(receipt.blocked ?? 0) - Number(receipt.providerBlocked ?? 0);
    if (Number(receipt.failed ?? 0) > 0 || blockedWithoutEscalation > 0)
      process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCli();
}
