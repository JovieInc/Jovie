#!/usr/bin/env node

import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const BILLING_SYNC_STALE_KEY = 'billing-sync-stale';
const STALE_MS = 26 * 60 * 60 * 1000;
const STUCK_MS = 60 * 60 * 1000;

export function planBillingSyncIntake({
  lastReconciliationAt = null,
  oldestUnprocessedAt = null,
  unprocessedWebhooks = 0,
  now = Date.now(),
} = {}) {
  const last = lastReconciliationAt ? Date.parse(lastReconciliationAt) : NaN;
  const oldest = oldestUnprocessedAt ? Date.parse(oldestUnprocessedAt) : NaN;
  const reconciliationStale = !Number.isFinite(last) || now - last > STALE_MS;
  const webhooksStuck =
    Number(unprocessedWebhooks) > 0 &&
    Number.isFinite(oldest) &&
    now - oldest > STUCK_MS;
  if (reconciliationStale || webhooksStuck) {
    return {
      action: 'upsert',
      key: BILLING_SYNC_STALE_KEY,
      reconciliationStale,
      webhooksStuck,
      unprocessedWebhooks: Number(unprocessedWebhooks) || 0,
    };
  }
  return {
    action: 'resolve',
    key: BILLING_SYNC_STALE_KEY,
    reconciliationStale: false,
    webhooksStuck: false,
    unprocessedWebhooks: Number(unprocessedWebhooks) || 0,
  };
}

export async function applyBillingSyncPlan(plan, { runId, fetchImpl } = {}) {
  if (!remediationTriggersEnabled()) {
    return logRemediationDryRun({
      action: plan.action === 'resolve' ? 'resolve' : 'upsert',
      key: plan.key,
      fingerprint: plan.key,
      reconciliationStale: plan.reconciliationStale,
      webhooksStuck: plan.webhooksStuck,
      unprocessedWebhooks: plan.unprocessedWebhooks,
    });
  }
  if (plan.action === 'resolve') {
    return closeLinearIssueByFingerprint({
      fingerprint: plan.key,
      labelKey: plan.key,
      comment:
        'Billing reconciliation is fresh and stuck webhooks are under an hour.',
      runId,
      fetchImpl,
    });
  }
  return upsertLinearIssueByTitleFingerprint({
    fingerprint: plan.key,
    labelKey: plan.key,
    title: `P1: billing sync is stale (${plan.key})`,
    description: [
      'Billing reconciliation heartbeat is older than 26 hours, or unprocessed webhooks have been waiting more than an hour.',
      '',
      `- reconciliation stale: ${plan.reconciliationStale}`,
      `- webhooks stuck: ${plan.webhooksStuck}`,
      `- unprocessed webhooks: ${plan.unprocessedWebhooks}`,
    ].join('\n'),
    priority: 2,
    reopenTerminal: true,
    fetchImpl,
  });
}

async function main() {
  const raw = process.env.BILLING_HEALTH_JSON || '{}';
  const health = JSON.parse(raw);
  const metrics = health.metrics ?? health;
  const plan = planBillingSyncIntake({
    lastReconciliationAt: metrics.lastReconciliationAt ?? null,
    oldestUnprocessedAt: metrics.oldestUnprocessedWebhookAt ?? null,
    unprocessedWebhooks: metrics.unprocessedWebhookCount ?? 0,
  });
  const result = await applyBillingSyncPlan(plan, {
    runId: process.env.GITHUB_RUN_ID,
  });
  if (!result.ok) {
    throw new Error(`Billing sync intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
