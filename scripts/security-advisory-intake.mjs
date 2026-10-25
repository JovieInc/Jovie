#!/usr/bin/env node
// Security-advisory loop: Dependabot alert -> owned Linear issue (devin lane)
// with a severity SLA -> closed only when the alert is fixed on main AND a
// Production deploy landed after the fix. `--check` is the ratchet: a critical,
// high or medium advisory past its SLA with no active exception fails the run.
//
//   node scripts/security-advisory-intake.mjs [--check] [--dry-run]
//
// Env: GH_TOKEN (deployments), ALERTS_TOKEN (Dependabot alerts read; falls back
// to GH_TOKEN), LINEAR_API_KEY, GITHUB_REPOSITORY, RECEIPT_PATH.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLabelId } from './deprecation-intake.mjs';
import {
  closeLinearIssueByFingerprint,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  issueDescription,
  issueTitle,
  LINEAR_PRIORITY,
  planAdvisories,
} from './lib/security-advisory-policy.mjs';

export const MAX_UPSERTS_PER_RUN = 60;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gh(args, token, { paginate = true } = {}) {
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env;
  const out = JSON.parse(
    execFileSync(
      'gh',
      ['api', ...(paginate ? ['--paginate', '--slurp'] : []), ...args],
      {
        encoding: 'utf8',
        env,
        maxBuffer: 64 * 1024 * 1024,
      }
    )
  );
  return paginate ? out.flat() : out;
}

export function latestProductionDeploy(repo, token) {
  const deployments = gh([`repos/${repo}/deployments?per_page=40`], token, {
    paginate: false,
  });
  for (const d of deployments
    .filter(x => /^production/i.test(x.environment))
    .slice(0, 12)) {
    const [status] = gh(
      [`repos/${repo}/deployments/${d.id}/statuses?per_page=1`],
      token,
      { paginate: false }
    );
    if (status?.state === 'success') return d.created_at;
  }
  return null;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

/** p50/p95 detect->fixed and fixed->deployed hours, from the alert history itself. */
export function stageMetrics(alerts, deployedAt) {
  const detectToFix = [];
  for (const a of alerts) {
    if (a.state === 'fixed' && a.fixed_at)
      detectToFix.push(
        (Date.parse(a.fixed_at) - Date.parse(a.created_at)) / 3_600_000
      );
  }
  return {
    detectToFixedHours: {
      n: detectToFix.length,
      p50: percentile(detectToFix, 50),
      p95: percentile(detectToFix, 95),
    },
    latestProductionDeployAt: deployedAt,
  };
}

async function main() {
  const argv = new Set(process.argv.slice(2));
  const check = argv.has('--check');
  const dryRun = argv.has('--dry-run');
  const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const alertsToken = process.env.ALERTS_TOKEN || process.env.GH_TOKEN;
  const now = new Date();
  const alerts = [
    ...gh(
      [`repos/${repo}/dependabot/alerts?state=open&per_page=100`],
      alertsToken
    ),
    ...gh(
      [`repos/${repo}/dependabot/alerts?state=fixed&per_page=100`],
      alertsToken
    ),
  ];
  const deployedAt = latestProductionDeploy(repo, process.env.GH_TOKEN);
  const exceptions = JSON.parse(
    readFileSync(
      path.join(ROOT, 'config/security/advisory-exceptions.json'),
      'utf8'
    )
  ).exceptions;
  const plan = planAdvisories({ alerts, exceptions, deployedAt, now });
  const receipt = {
    schema: 'jovie.security-advisory-receipt/v1',
    observedAt: now.toISOString(),
    repo,
    open: plan.upserts.length,
    openBySeverity: plan.upserts.reduce(
      (m, g) => ({ ...m, [g.severity]: (m[g.severity] ?? 0) + 1 }),
      {}
    ),
    awaitingDeploy: plan.awaitingDeploy.map(g => g.fingerprint),
    breaches: plan.breaches.map(g => ({
      fingerprint: g.fingerprint,
      severity: g.severity,
      dueAt: g.dueAt,
    })),
    expiredExceptions: plan.expiredExceptions.map(e => e.ghsa),
    stages: stageMetrics(alerts, deployedAt),
    actions: [],
  };

  if (!check && !dryRun) {
    if (!process.env.LINEAR_API_KEY)
      throw new Error('LINEAR_API_KEY is required');
    const devin = await resolveLabelId('devin', process.env.LINEAR_API_KEY);
    if (!devin) throw new Error('Linear label "devin" not found');
    for (const g of plan.upserts.slice(0, MAX_UPSERTS_PER_RUN)) {
      const r = await upsertLinearIssueByTitleFingerprint({
        fingerprint: g.fingerprint,
        title: issueTitle(g),
        description: issueDescription(g),
        priority: LINEAR_PRIORITY[g.severity],
        createStateName: 'Todo',
        reopenTerminal: true,
        createLabelIds: [devin],
      });
      receipt.actions.push({
        fingerprint: g.fingerprint,
        op: 'upsert',
        ok: r.ok,
        action: r.action,
        id: r.identifier,
      });
      if (!r.ok) process.exitCode = 1;
    }
    for (const g of plan.closes) {
      const r = await closeLinearIssueByFingerprint({
        fingerprint: g.fingerprint,
        comment: `Fixed on main at ${g.fixedAt} and deployed: Production deployment at ${g.deployedAt} postdates the fix.`,
      });
      receipt.actions.push({
        fingerprint: g.fingerprint,
        op: 'close',
        ok: r.ok,
        action: r.action,
      });
      if (!r.ok && r.reason !== 'not_found') process.exitCode = 1;
    }
  }

  writeFileSync(
    process.env.RECEIPT_PATH || 'security-advisory-receipt.json',
    JSON.stringify(receipt, null, 2)
  );
  console.log(JSON.stringify({ ...receipt, actions: receipt.actions.length }));
  if (
    check &&
    (plan.breaches.length > 0 || plan.expiredExceptions.length > 0)
  ) {
    for (const b of plan.breaches)
      console.error(
        `SLA breach: ${b.severity} ${b.package} (${b.ghsa}) due ${b.dueAt}`
      );
    for (const e of plan.expiredExceptions)
      console.error(
        `Expired exception: ${e.ghsa} ${e.package} expired ${e.expires}`
      );
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
