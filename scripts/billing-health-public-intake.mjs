#!/usr/bin/env node

import { lstatSync, readFileSync } from 'node:fs';

import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { withLinearRateLimitRetry } from './lib/linear-rate-limit-retry.mjs';

export const BILLING_HEALTH_PUBLIC_KEY = 'billing-health-public';

/** @param {string | undefined} path */
export function readBillingHealthResponse(path) {
  if (!path) return undefined;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 32768) return undefined;
    return /** @type {unknown} */ (JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return undefined;
  }
}

/** @param {number} status @param {unknown} [response] */
export function planBillingHealthPublic(status, response) {
  const code = Number(status);
  const body =
    response && typeof response === 'object' && !Array.isArray(response)
      ? /** @type {Record<string, unknown>} */ (response)
      : undefined;
  // A successful public liveness response is intentional. Only actual detailed
  // billing state proves exposure; unavailable/malformed evidence cannot close it.
  if (body && ('checks' in body || 'metrics' in body)) {
    return { action: 'upsert', key: BILLING_HEALTH_PUBLIC_KEY };
  }
  if (code === 401 || code === 403) {
    return { action: 'resolve', key: BILLING_HEALTH_PUBLIC_KEY };
  }
  if (
    code === 200 &&
    body &&
    Object.keys(body).length === 2 &&
    typeof body.healthy === 'boolean' &&
    typeof body.timestamp === 'string' &&
    Number.isFinite(Date.parse(body.timestamp))
  ) {
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
      comment: 'Anonymous billing health exposes no detailed billing state.',
      runId,
      fetchImpl,
    });
  }
  return upsertLinearIssueByTitleFingerprint({
    fingerprint: plan.key,
    labelKey: plan.key,
    title: `P0: billing health exposes anonymous detail (${plan.key})`,
    description:
      'GET https://jov.ie/api/billing/health exposed checks or metrics without credentials. Anonymous callers may receive only process liveness; detailed billing state requires authorization.',
    priority: 1,
    reopenTerminal: true,
    fetchImpl,
  });
}

/**
 * Linear rate limits defer the signal (visible warning + job summary) instead
 * of failing the probe verdict; every other failure still throws.
 * @param {{ env?: typeof process.env, fetchImpl?: typeof fetch }} [options]
 */
export async function runBillingHealthPublicIntake({
  env = process.env,
  fetchImpl,
} = {}) {
  const status = Number.parseInt(env.BILLING_HEALTH_STATUS || '', 10);
  const plan = planBillingHealthPublic(
    status,
    readBillingHealthResponse(env.BILLING_HEALTH_RESPONSE_FILE)
  );
  const result = await withLinearRateLimitRetry(
    () =>
      applyBillingHealthPublicPlan(plan, {
        runId: env.GITHUB_RUN_ID,
        fetchImpl,
      }),
    { label: 'billing health public probe' }
  );
  if (!result.ok) {
    throw new Error(`Billing health public intake failed: ${result.reason}`);
  }
  return result;
}

async function main() {
  console.log(JSON.stringify(await runBillingHealthPublicIntake()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
