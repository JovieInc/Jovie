#!/usr/bin/env node
/** One signed Linear delivery -> one current JOV Triage assessment. No admission writer. */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { classifyIntakeReadiness } from './intake-readiness.mjs';
import * as linear from './linear-client.mjs';
import { reconcileIssues } from './reconcile.mjs';
import { requestSummerAssessment } from './summer-triage-assessment-client.mjs';

const TRIAGE_STATE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8';
const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c';
const BACKLOG_STATE_ID = '1551ed21-7743-4573-82d8-8949410d3b8d';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const summerReceipt = await summer(delivery);
  if (summerReceipt.decision !== 'existing-intake-reconcile') {
    return {
      ...base,
      disposition: summerReceipt.decision,
      summerAssessment: summerReceipt,
      mutations: 0,
      wakeSymphony: false,
      requiresImmediateInvestigation:
        summerReceipt.decision === 'urgent-investigation-required',
    };
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
  if (!eventPath) throw new Error('missing-event-file');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const receipt = await assessTriageEvent(event);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
