#!/usr/bin/env node
/** One signed Linear delivery -> one current JOV Triage assessment. No admission writer. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyDeterministic } from './classifier.mjs';
import { classifyIntakeReadiness } from './intake-readiness.mjs';
import * as linear from './linear-client.mjs';
import { reconcileIssues } from './reconcile.mjs';
import * as runtimeState from './runtime-state.mjs';
import {
  requestSummerAssessment,
  validJevTriageAssessment,
} from './summer-triage-assessment-client.mjs';
import {
  applyGovernorDisposition,
  buildTodoBufferSnapshot,
  buildTriageHealth,
  governorReceiptMarker,
  parseGovernorCapacity,
  persistGovernorReceipt,
  promoteTodoBuffer,
} from './triage-governor.mjs';
import { routeTriageIssue, triageOwnershipDecision } from './triage-router.mjs';

const TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8';

function defaultGovernorContext(capacity = parseGovernorCapacity()) {
  return {
    capacity,
    target: capacity.target,
    qualifiedTodoCount: 0,
  };
}

function reserveTodoSlot(governor) {
  if (
    governor.capacity.status !== 'healthy' ||
    governor.qualifiedTodoCount >= governor.target
  ) {
    return false;
  }
  governor.qualifiedTodoCount += 1;
  return true;
}

async function agentReadyLabel(client) {
  const label = await client.fetchTeamLabel(TEAM_ID, 'agent-ready');
  if (!label?.id) throw new Error('agent-ready-label-unavailable');
  return label;
}

function dispositionState(destination) {
  return destination === 'Todo'
    ? { id: TODO_STATE_ID, name: 'Todo' }
    : { id: BACKLOG_STATE_ID, name: 'Backlog' };
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

/** Consume a bounded recommendation; official Symphony still owns execution pickup. */
async function applyJevAssessment(
  issue,
  assessment,
  client,
  inventory,
  governor,
  now = new Date()
) {
  if (!validJevTriageAssessment(assessment))
    throw new Error('invalid-jev-triage-assessment');
  const ownership = triageOwnershipDecision(issue);
  if (!ownership.allowed)
    return {
      disposition: 'owned-active',
      reason: ownership.reason,
      mutations: 0,
      wakeSymphony: false,
      requiresImmediateInvestigation: true,
    };
  const route = routeTriageIssue(issue, classifyDeterministic(issue, inventory), {
    todoStateId: TODO_STATE_ID,
    backlogStateId: BACKLOG_STATE_ID,
  });
  // Deterministic blocked/dependency/follow-up dispositions outrank a model recommendation.
  if (route.reason !== 'genuine-intake') return null;

  const readiness = classifyIntakeReadiness(issue);
  const labels = issue.labels?.nodes ?? [];
  const qualified =
    assessment.status === 'decided' &&
    assessment.destination === 'Todo' &&
    readiness.disposition === 'mechanical-ready';
  const label = qualified ? await agentReadyLabel(client) : null;
  const todoReserved = qualified && reserveTodoSlot(governor);
  const destination = todoReserved ? 'Todo' : 'Backlog';
  const urgentDowngrade =
    issue.priority === 1 &&
    assessment.status === 'decided' &&
    assessment.priority !== 1;
  const providerUnavailable = assessment.status === 'unavailable';
  const requiresImmediateInvestigation =
    providerUnavailable || assessment.status === 'ambiguous' || urgentDowngrade;
  const reason = urgentDowngrade
    ? 'urgent-priority-downgrade'
    : qualified && !todoReserved
      ? `${assessment.reason}; todo-buffer-full-or-unavailable`
      : assessment.reason;
  const priority = urgentDowngrade
    ? issue.priority
    : (assessment.priority ?? issue.priority);
  const result = await applyGovernorDisposition({
    issue,
    client,
    decision:
      assessment.status === 'decided'
        ? destination === 'Todo'
          ? 'qualified-todo'
          : qualified
            ? 'qualified-backlog-buffered'
            : 'explicit-backlog-lane'
        : assessment.status,
    category:
      assessment.status === 'decided'
        ? assessment.category
        : providerUnavailable
          ? 'provider-blocked'
          : 'founder-decision',
    reason,
    newState: dispositionState(destination),
    priority,
    ...(label
      ? { labelIds: [...new Set([...labels.map(row => row.id), label.id])] }
      : {}),
    now,
  });
  return {
    disposition: destination,
    reason:
      qualified || assessment.status !== 'decided'
        ? reason
        : `${reason}; ${readiness.reason}`,
    category: assessment.category,
    priority: result.persisted.priority,
    mutations: 1,
    wakeSymphony: todoReserved,
    requiresImmediateInvestigation,
    ...(providerUnavailable
      ? {
          escalation: {
            status: 'provider-block',
            code: assessment.reason || 'provider-unavailable',
            owner: null,
            requestedModel: assessment.model ?? null,
          },
        }
      : {}),
    verified: {
      state: result.persisted.state.name,
      updatedAt: result.persisted.updatedAt,
      assessmentKey: assessment.assessmentKey,
      decisionKey: result.receipt.decisionKey,
    },
  };
}

const TRIAGE_STATE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8';
const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
const BACKLOG_STATE_ID = '1551ed21-7743-4573-82d8-8949410d3b8d';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  {
    maxIssues = 25,
    timeBudgetMs = 60_000,
    now = Date.now,
    capacity = parseGovernorCapacity(),
  } = {}
) {
  const started = now();
  const issues = await client.fetchTeamTriageIssues(
    TEAM_ID,
    1000,
    ['Triage']
  );
  const inventory = client.fetchTeamActiveIssues
    ? await client.fetchTeamActiveIssues(TEAM_ID)
    : issues;
  const bufferBefore = buildTodoBufferSnapshot(inventory, capacity);
  const governor = {
    capacity,
    target: bufferBefore.target,
    qualifiedTodoCount: bufferBefore.qualifiedTodoCount,
  };
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
          summer,
          { inventory, governor, now: () => new Date(now()) }
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
  const inventoryAfter = client.fetchTeamActiveIssues
    ? await client.fetchTeamActiveIssues(TEAM_ID)
    : inventory;
  const todoBuffer = await promoteTodoBuffer({
    issues: inventoryAfter,
    client,
    capacity,
    todoState: { id: TODO_STATE_ID, name: 'Todo' },
    now: new Date(now()),
  });
  const remainingTriage = await client.fetchTeamTriageIssues(
    TEAM_ID,
    1000,
    ['Triage']
  );
  const health = buildTriageHealth(remainingTriage, {
    now: new Date(now()),
  });
  const failed =
    results.filter(result => result.disposition === 'assessment-failed')
      .length + todoBuffer.failures.length;
  const blocked = results.filter(
    result =>
      'requiresImmediateInvestigation' in result &&
      result.requiresImmediateInvestigation
  ).length;
  const providerBlocked = results.filter(
    result => 'escalation' in result && result.escalation
  ).length;
  const status =
    failed === 0 &&
    blocked === 0 &&
    providerBlocked === 0 &&
    health.status === 'healthy' &&
    capacity.status === 'healthy'
      ? 'healthy'
      : 'p0';
  return {
    schema: 'linear-triage-catch-up/v1',
    observedAt: new Date(now()).toISOString(),
    governorVersion: '2026-10-12',
    status,
    issueCount: issues.length,
    assessed: results.length,
    deferred: issues.length - results.length,
    failed,
    blocked,
    providerBlocked,
    wakeSymphony:
      results.some(result => result.wakeSymphony) ||
      todoBuffer.promotions.length > 0,
    health,
    todoBuffer,
    results,
  };
}

export function parseTriageEvent(event) {
  const payload = event?.client_payload;
  if (
    event?.action !== 'linear_triage_assess' ||
    payload?.team_key !== 'JOV' ||
    payload?.state_name !== 'Triage' ||
    !['create', 'update'].includes(payload?.action) ||
    !UUID.test(payload?.issue_id ?? '') ||
    !/^JOV-\d+$/.test(payload?.issue_identifier ?? '')
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
  };
}

export async function assessTriageEvent(
  event,
  client = linear,
  summer = requestSummerAssessment,
  {
    inventory = null,
    governor = defaultGovernorContext(),
    now = () => new Date(),
  } = {}
) {
  const delivery = parseTriageEvent(event);
  const issue = await client.fetchIssue(delivery.identifier);
  if (!issue || issue.id !== delivery.issueId) {
    throw new Error('linear-triage-identity-mismatch');
  }
  const base = {
    schema: 'linear-triage-assessment/v1',
    deliveryId: delivery.deliveryId,
    issue: delivery.identifier,
    observedAt: now().toISOString(),
    governorVersion: '2026-10-12',
  };
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
  let summerReceipt;
  try {
    summerReceipt = await summer(delivery);
  } catch (error) {
    if (!/^summer-triage-assessment-http-5\d\d$/.test(String(error?.message)))
      throw error;
    summerReceipt = await summer(delivery);
  }
  const current = await client.fetchIssue(delivery.identifier);
  if (
    current?.id !== delivery.issueId ||
    current?.state?.id !== TRIAGE_STATE_ID ||
    current?.updatedAt !== summerReceipt.linearUpdatedAt
  ) {
    throw new Error('linear-triage-changed-after-summer-assessment');
  }
  const classificationInventory = inventory ?? [current];
  const providerBlockedEscalation = escalationBlockOf(summerReceipt);
  if (
    summerReceipt.decision !== 'existing-intake-reconcile' &&
    !summerReceipt.assessment
  ) {
    const reason =
      providerBlockedEscalation?.code ??
      summerReceipt.reason ??
      summerReceipt.decision;
    const result = await applyGovernorDisposition({
      issue: current,
      client,
      decision: summerReceipt.decision,
      category: providerBlockedEscalation
        ? 'provider-blocked'
        : 'founder-decision',
      reason,
      newState: dispositionState('Backlog'),
      now: now(),
    });
    return {
      ...base,
      disposition: 'Backlog',
      reason,
      summerAssessment: summerReceipt,
      mutations: 1,
      wakeSymphony: false,
      requiresImmediateInvestigation: true,
      verified: {
        state: result.persisted.state.name,
        updatedAt: result.persisted.updatedAt,
        decisionKey: result.receipt.decisionKey,
      },
      ...(providerBlockedEscalation
        ? { escalation: providerBlockedEscalation }
        : {}),
    };
  }
  if (providerBlockedEscalation) {
    const result = await applyGovernorDisposition({
      issue: current,
      client,
      decision: 'provider-blocked',
      category: 'provider-blocked',
      reason: providerBlockedEscalation.code,
      newState: dispositionState('Backlog'),
      now: now(),
    });
    return {
      ...base,
      disposition: 'Backlog',
      reason: providerBlockedEscalation.code,
      summerAssessment: summerReceipt,
      mutations: 1,
      wakeSymphony: false,
      escalation: providerBlockedEscalation,
      requiresImmediateInvestigation: true,
      verified: {
        state: result.persisted.state.name,
        updatedAt: result.persisted.updatedAt,
        decisionKey: result.receipt.decisionKey,
      },
    };
  }
  const readiness = classifyIntakeReadiness(current);
  if (summerReceipt.assessment) {
    const applied = await applyJevAssessment(
      current,
      summerReceipt.assessment,
      client,
      classificationInventory,
      governor,
      now()
    );
    if (applied)
      return { ...base, summerAssessment: summerReceipt, ...applied };
  }
  const classification = classifyDeterministic(
    current,
    classificationInventory
  );
  const route = routeTriageIssue(current, classification, {
    backlogStateId: BACKLOG_STATE_ID,
    todoStateId: TODO_STATE_ID,
  });
  if (route.reason === 'genuine-intake') {
    const qualified = readiness.disposition === 'mechanical-ready';
    const label = qualified ? await agentReadyLabel(client) : null;
    const todoReserved = qualified && reserveTodoSlot(governor);
    const destination = todoReserved ? 'Todo' : 'Backlog';
    const reason = qualified
      ? todoReserved
        ? readiness.reason
        : `${readiness.reason}; todo-buffer-full-or-unavailable`
      : readiness.reason;
    const result = await applyGovernorDisposition({
      issue: current,
      client,
      decision: qualified
        ? todoReserved
          ? 'qualified-todo'
          : 'qualified-backlog-buffered'
        : readiness.disposition,
      category: qualified ? 'qualified-code' : readiness.disposition,
      reason,
      newState: dispositionState(destination),
      ...(label
        ? {
            labelIds: [
              ...new Set([
                ...(current.labels?.nodes ?? []).map(row => row.id),
                label.id,
              ]),
            ],
          }
        : {}),
      now: now(),
    });
    return {
      ...base,
      disposition: destination,
      summerAssessment: summerReceipt,
      reason,
      priority: result.persisted.priority,
      assignee: result.persisted.assignee?.name ?? null,
      mutations: 1,
      wakeSymphony: todoReserved,
      requiresImmediateInvestigation:
        qualified && governor.capacity.status !== 'healthy',
      verified: {
        state: result.persisted.state.name,
        updatedAt: result.persisted.updatedAt,
        decisionKey: result.receipt.decisionKey,
      },
    };
  }
  const desiredState = route.desiredStateId
    ? dispositionState(
        route.desiredStateId === TODO_STATE_ID ? 'Todo' : 'Backlog'
      )
    : {
        id: current.state?.id ?? null,
        name: current.state?.name ?? 'Triage',
      };
  const governorReceipt = await persistGovernorReceipt({
    issue: current,
    client,
    decision: route.reason,
    category: route.category,
    reason: route.reason,
    newState: desiredState,
    now: now(),
  });
  const reconciliation = await reconcileIssues({
    issues: [current],
    classificationIssues: classificationInventory,
    client,
    backlogStateId: BACKLOG_STATE_ID,
    todoStateId: TODO_STATE_ID,
  });
  if (reconciliation.failed > 0) {
    throw new Error('linear-triage-reconciliation-failed');
  }
  const result = reconciliation.results[0];
  const persisted = await client.fetchIssue(current.identifier);
  if (
    result.wouldMove &&
    (persisted?.state?.id !== desiredState.id ||
      !(persisted?.comments?.nodes ?? []).some(
        comment => comment.body === governorReceiptMarker(governorReceipt)
      ))
  ) {
    throw new Error('summer-governor-disposition-readback-failed');
  }
  return {
    ...base,
    disposition: persisted?.state?.name ?? current.state?.name,
    summerAssessment: summerReceipt,
    reason: route.reason,
    category: route.category,
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
    requiresImmediateInvestigation:
      !route.desiredStateId || (current.priority === 1 && !result.wouldMove),
    verified: {
      state: persisted?.state?.name ?? current.state?.name,
      updatedAt: persisted?.updatedAt ?? current.updatedAt,
      decisionKey: governorReceipt.decisionKey,
    },
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
  // remediator deferring RATE_LIMITED. Skip when the last healthy sweep is
  // fresher than the 30-minute floor; unhealthy sweeps never arm the throttle.
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
      process.stdout.write(
        `${JSON.stringify({
          schema: 'linear-triage-catch-up/v1',
          observedAt: new Date().toISOString(),
          status: 'healthy',
          skipped: true,
          reason: throttle.reason,
        })}\n`
      );
      process.exitCode = 0;
      return;
    }
  }
  const capacity = parseGovernorCapacity();
  let receipt;
  if (isSweep) {
    receipt = await assessTriageSweep(linear, requestSummerAssessment, {
      capacity,
    });
  } else {
    const inventory = await linear.fetchTeamActiveIssues(TEAM_ID);
    const buffer = buildTodoBufferSnapshot(inventory, capacity);
    receipt = await assessTriageEvent(
      JSON.parse(readFileSync(eventPath, 'utf8')),
      linear,
      requestSummerAssessment,
      {
        inventory,
        governor: {
          capacity,
          target: buffer.target,
          qualifiedTodoCount: buffer.qualifiedTodoCount,
        },
      }
    );
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (
    isSweep &&
    sweepCacheFile &&
    receipt.status === 'healthy'
  ) {
    const cache = readSweepCache(sweepCacheFile);
    cache[SWEEP_THROTTLE_KEY] = new Date().toISOString();
    writeSweepCache(sweepCacheFile, cache);
  }
  if ('failed' in receipt) {
    // Named rows, never an anonymous exit. Provider/safe-mode failures are
    // P0s too: a growing Triage queue must never be the first visible signal.
    for (const result of receipt.results ?? []) {
      const row = /** @type {Record<string, any>} */ (result ?? {});
      const identifier = String(row.issue ?? 'unknown-issue');
      if (row.disposition === 'assessment-failed')
        console.error(
          `::error title=Triage assessment failed::${identifier}: ${row.error ?? row.reason ?? 'assessment failed'}`
        );
      else if (row.escalation)
        console.error(
          `::error title=Triage escalation provider-blocked::${identifier}: ${row.escalation.code}${row.escalation.requestedModel ? ` (requested ${row.escalation.requestedModel})` : ''}`
        );
      else if (row.requiresImmediateInvestigation)
        console.error(
          `::error title=Urgent Triage investigation required::${identifier}: ${row.reason ?? row.disposition ?? 'urgent investigation required'}`
        );
    }
    if (receipt.health?.status === 'p0')
      console.error(
        `::error title=Linear Triage health breach::count=${receipt.health.count} oldest=${receipt.health.oldestIssue ?? 'none'} ageMs=${receipt.health.oldestAgeMs}`
      );
    if (receipt.todoBuffer?.capacity?.status !== 'healthy')
      console.error(
        `::error title=Summer governor safe mode::${receipt.todoBuffer?.capacity?.reason ?? 'official Symphony capacity unavailable'}`
      );
    for (const failure of receipt.todoBuffer?.failures ?? [])
      console.error(
        `::error title=Todo buffer promotion failed::${failure.issue}: ${failure.error}`
      );
    if (receipt.status !== 'healthy') process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCli();
}
