#!/usr/bin/env node
/** One signed Linear delivery -> one current JOV Triage assessment. No admission writer. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyDeterministic } from './classifier.mjs';
import { classifyIntakeReadiness } from './intake-readiness.mjs';
import * as linear from './linear-client.mjs';
import { reconcileIssues } from './reconcile.mjs';
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
  summer = requestSummerAssessment
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
    observedAt: new Date().toISOString(),
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const eventPath = process.argv
    .find(arg => arg.startsWith('--event-file='))
    ?.slice('--event-file='.length);
  if (!eventPath && !process.argv.includes('--sweep'))
    throw new Error('missing-event-file');
  const receipt = process.argv.includes('--sweep')
    ? await assessTriageSweep()
    : await assessTriageEvent(JSON.parse(readFileSync(eventPath, 'utf8')));
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
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
