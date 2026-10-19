#!/usr/bin/env node

import {
  installationQuotaLog,
  isInstallationQuota403,
} from './lib/github-installation-quota.mjs';
import {
  closeLinearIssueByFingerprint,
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const DOCS_DEPLOY_KEY = 'vercel-deploy-failed-jovie-docs';
export const DOCS_ENVIRONMENT = 'Production – jovie-docs';

export function planDocsDeploy({ status, onMain }) {
  if (!onMain) return { action: 'skip', key: DOCS_DEPLOY_KEY };
  if (status === 'failure' || status === 'error') {
    return { action: 'upsert', key: DOCS_DEPLOY_KEY };
  }
  if (status === 'success') return { action: 'resolve', key: DOCS_DEPLOY_KEY };
  return { action: 'skip', key: DOCS_DEPLOY_KEY };
}

export function docsShaOnMain(compareStatus) {
  return compareStatus === 'ahead' || compareStatus === 'identical';
}

/** @param {unknown} deployment @param {unknown} status */
export function docsDeploymentUrl(deployment, status) {
  const details = /** @type {{ payload?: { web_url?: unknown } } | null} */ (
    deployment
  );
  const latest = /** @type {{ environment_url?: unknown } | null} */ (status);
  for (const candidate of [
    latest?.environment_url,
    details?.payload?.web_url,
  ]) {
    if (typeof candidate !== 'string') continue;
    try {
      const url = new URL(candidate);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.hostname !== 'api.github.com'
      )
        return url.href;
    } catch {
      // Missing or malformed provider links are not operator-facing URLs.
    }
  }
  return undefined;
}

/**
 * @param {{ action: string, key: string }} plan
 * @param {{ runId?: string, deploymentUrl?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function applyDocsDeployPlan(
  plan,
  { runId, deploymentUrl, fetchImpl } = {}
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
      comment: 'jovie-docs production deployment succeeded.',
      runId,
      fetchImpl,
    });
  }
  return upsertLinearIssueByTitleFingerprint({
    fingerprint: plan.key,
    labelKey: plan.key,
    title: `P1: jovie-docs production deploy failed (${plan.key})`,
    description: `The latest Production – jovie-docs deployment whose SHA is on main failed.\n\n${deploymentUrl ?? 'Deployment URL unavailable in provider metadata.'}`,
    priority: 2,
    reopenTerminal: true,
    fetchImpl,
  });
}

/**
 * Installation-quota 403s defer the signal. A permission 403 and every other
 * list failure still throw. Defer never resolves a Linear issue and never
 * reports the docs deploy as healthy.
 * @param {Response} response
 * @param {string} label
 */
async function classifyDocsResponse(response, label) {
  if (response.ok) return { kind: 'ok' };
  const text = await response.text();
  if (isInstallationQuota403(text, response.status)) {
    console.warn(installationQuotaLog(label));
    console.warn(
      `::warning::${label} deferred on an installation 403. The docs deployment was not confirmed healthy and no Linear issue was resolved.`
    );
    return {
      kind: 'defer',
      result: {
        ok: true,
        action: 'defer',
        reason: 'installation_rate_limit',
      },
    };
  }
  return { kind: 'fail', status: response.status };
}

/**
 * @param {{
 *   token?: string,
 *   repo?: string,
 *   fetchImpl?: typeof fetch,
 *   runId?: string,
 *   apply?: typeof applyDocsDeployPlan,
 * }} [options]
 */
export async function intakeDocsDeploy({
  token = process.env.GITHUB_TOKEN,
  repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie',
  fetchImpl = fetch,
  runId = process.env.GITHUB_RUN_ID,
  apply = applyDocsDeployPlan,
} = {}) {
  if (!token) return { ok: true, action: 'skip', reason: 'missing_token' };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
  const signal = 'jovie-docs deploy signal';
  const list = await fetchImpl(
    `https://api.github.com/repos/${repo}/deployments?environment=${encodeURIComponent(DOCS_ENVIRONMENT)}&per_page=5`,
    { headers }
  );
  const listed = await classifyDocsResponse(list, signal);
  if (listed.kind === 'defer') return listed.result;
  if (listed.kind === 'fail') {
    throw new Error(`docs deployment list failed: ${listed.status}`);
  }
  const deployments = await list.json();
  const deployment = Array.isArray(deployments) ? deployments[0] : null;
  if (!deployment?.sha) {
    return { ok: true, action: 'skip', reason: 'no_deployment' };
  }
  const compare = await fetchImpl(
    `https://api.github.com/repos/${repo}/compare/${deployment.sha}...main`,
    { headers }
  );
  const compared = await classifyDocsResponse(compare, signal);
  if (compared.kind === 'defer') return compared.result;
  if (compared.kind === 'fail' && compared.status === 403) {
    throw new Error(`docs deployment compare failed: ${compared.status}`);
  }
  const compareBody = /** @type {{ status?: string } | null} */ (
    compared.kind === 'ok' ? await compare.json() : null
  );
  const onMain = docsShaOnMain(compareBody?.status);
  const statuses = await fetchImpl(
    `https://api.github.com/repos/${repo}/deployments/${deployment.id}/statuses?per_page=5`,
    { headers }
  );
  const statusResult = await classifyDocsResponse(statuses, signal);
  if (statusResult.kind === 'defer') return statusResult.result;
  if (statusResult.kind === 'fail' && statusResult.status === 403) {
    throw new Error(`docs deployment statuses failed: ${statusResult.status}`);
  }
  const statusRows = statusResult.kind === 'ok' ? await statuses.json() : [];
  const status = Array.isArray(statusRows) ? statusRows[0]?.state : null;
  const plan = planDocsDeploy({ status, onMain });
  const result = await apply(plan, {
    runId,
    deploymentUrl: docsDeploymentUrl(
      deployment,
      Array.isArray(statusRows) ? statusRows[0] : null
    ),
    fetchImpl,
  });
  if (!result.ok) {
    throw new Error(`docs deploy intake failed: ${result.reason}`);
  }
  return result;
}

async function main() {
  console.log(JSON.stringify(await intakeDocsDeploy()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
