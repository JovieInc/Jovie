#!/usr/bin/env node

import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const BILLING_HEALTH_PUBLIC_KEY = 'billing-health-public';

export function planBillingHealthPublic(status) {
  const code = Number(status);
  if (code === 200) return { action: 'upsert', key: BILLING_HEALTH_PUBLIC_KEY };
  if (code === 401 || code === 403) {
    return { action: 'resolve', key: BILLING_HEALTH_PUBLIC_KEY };
  }
  return { action: 'skip', key: BILLING_HEALTH_PUBLIC_KEY, status: code };
}

/**
 * @param {{ action: string, key: string }} plan
 * @param {{ runId?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function applyBillingHealthPublicPlan(
  plan,
  { runId, fetchImpl } = {}
) {
  if (plan.action === 'skip') return { ok: true, action: 'skip' };
  if (!remediationTriggersEnabled()) {
    return logRemediationDryRun({
      action: plan.action === 'resolve' ? 'resolve' : 'upsert',
      key: plan.key,
      fingerprint: plan.key,
    });
  }
  if (plan.action === 'resolve') {
    return closeLinearIssueByFingerprint({
      fingerprint: plan.key,
      labelKey: plan.key,
      comment: 'Anonymous billing health now requires auth.',
      runId,
      fetchImpl,
    });
  }
  return upsertLinearIssueByTitleFingerprint({
    fingerprint: plan.key,
    labelKey: plan.key,
    title: `P0: billing health is anonymously reachable (${plan.key})`,
    description:
      'GET https://jov.ie/api/billing/health returned 200 without credentials. The endpoint must answer 401 or 403 to anonymous callers.',
    priority: 1,
    reopenTerminal: true,
    fetchImpl,
  });
}

async function main() {
  const status = Number.parseInt(process.env.BILLING_HEALTH_STATUS || '', 10);
  const plan = planBillingHealthPublic(status);
  const result = await applyBillingHealthPublicPlan(plan, {
    runId: process.env.GITHUB_RUN_ID,
  });
  if (!result.ok) {
    throw new Error(`Billing health public intake failed: ${result.reason}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
