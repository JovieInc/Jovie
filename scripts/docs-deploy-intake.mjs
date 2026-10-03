#!/usr/bin/env node

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

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  if (!token) {
    console.log(
      JSON.stringify({ ok: true, action: 'skip', reason: 'missing_token' })
    );
    return;
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };
  const list = await fetch(
    `https://api.github.com/repos/${repo}/deployments?environment=${encodeURIComponent(DOCS_ENVIRONMENT)}&per_page=5`,
    { headers }
  );
  if (!list.ok) {
    throw new Error(`docs deployment list failed: ${list.status}`);
  }
  const deployments = await list.json();
  const deployment = Array.isArray(deployments) ? deployments[0] : null;
  if (!deployment?.sha) {
    console.log(
      JSON.stringify({ ok: true, action: 'skip', reason: 'no_deployment' })
    );
    return;
  }
  const compare = await fetch(
    `https://api.github.com/repos/${repo}/compare/${deployment.sha}...main`,
    { headers }
  );
  const compareBody = /** @type {{ status?: string } | null} */ (
    compare.ok ? await compare.json() : null
  );
  const onMain = docsShaOnMain(compareBody?.status);
  const statuses = await fetch(
    `https://api.github.com/repos/${repo}/deployments/${deployment.id}/statuses?per_page=5`,
    { headers }
  );
  const statusRows = statuses.ok ? await statuses.json() : [];
  const status = Array.isArray(statusRows) ? statusRows[0]?.state : null;
  const plan = planDocsDeploy({ status, onMain });
  const result = await applyDocsDeployPlan(plan, {
    runId: process.env.GITHUB_RUN_ID,
    deploymentUrl: docsDeploymentUrl(
      deployment,
      Array.isArray(statusRows) ? statusRows[0] : null
    ),
  });
  if (!result.ok)
    throw new Error(`docs deploy intake failed: ${result.reason}`);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
