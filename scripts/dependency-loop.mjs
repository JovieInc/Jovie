#!/usr/bin/env node
// Dependency-update loop: act on open Dependabot PRs per event and publish
// dwell/lag metrics. Policy is pure (scripts/lib/dependency-loop.mjs).
//
//   node scripts/dependency-loop.mjs run [--dry-run] [--metrics-out file]
//
// Env: GH_TOKEN (needs pull-requests: write to comment; the Jovie Bot token),
// LINEAR_API_KEY, GITHUB_REPOSITORY.

import { writeFileSync } from 'node:fs';
import { runGh } from '../packages/api-client/gh.ts';
import { resolveLabelId } from './deprecation-intake.mjs';
import {
  decide,
  dependencyMetrics,
  migrationIssue,
  REBASE_MARKER,
} from './lib/dependency-loop.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const dryRun = process.argv.includes('--dry-run');
const outIndex = process.argv.indexOf('--metrics-out');
const metricsOut = outIndex === -1 ? null : process.argv[outIndex + 1];

async function gh(args) {
  const r = await runGh(args, { env: process.env, priority: 'repair' });
  if (r.code !== 0)
    throw Object.assign(new Error(`gh ${args[0]} exit ${r.code}`), {
      exitCode: r.code,
    });
  return r.stdout;
}

async function main() {
  const open = JSON.parse(
    await gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--author',
      'app/dependabot',
      '--state',
      'open',
      '--limit',
      '60',
      '--json',
      'number,title,url,headRefName,createdAt,mergeStateStatus,labels,comments',
    ])
  );
  const since = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const merged = JSON.parse(
    await gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--author',
      'app/dependabot',
      '--state',
      'merged',
      '--limit',
      '200',
      '--search',
      `merged:>=${since}`,
      '--json',
      'number,createdAt,mergedAt',
    ])
  );
  const actions = [];
  const agentReady =
    dryRun || !process.env.LINEAR_API_KEY
      ? null
      : await resolveLabelId('agent-ready', process.env.LINEAR_API_KEY);
  for (const pr of open) {
    const d = decide(pr);
    if (d.action === 'none') continue;
    actions.push({
      pr: pr.number,
      action: d.action,
      reason: d.reason,
      kind: d.class.kind,
    });
    if (dryRun) continue;
    if (d.action === 'recreate') {
      await gh([
        'pr',
        'comment',
        String(pr.number),
        '--repo',
        repo,
        '--body',
        `@dependabot recreate\n\n${REBASE_MARKER}\nThe head conflicts with main (usually the lockfile). Requested by the dependency loop.`,
      ]);
    } else if (d.action === 'migrate') {
      const issue = migrationIssue(pr, d.class);
      const r = await upsertLinearIssueByTitleFingerprint({
        ...issue,
        priority: 3,
        createStateName: 'Todo',
        createLabelIds: agentReady ? [agentReady] : [],
        reopenTerminal: false,
      });
      actions.at(-1).ok = r.ok;
    }
  }
  const metrics = {
    schema: 'jovie.dependency-loop/v1',
    observedAt: new Date().toISOString(),
    ...dependencyMetrics({ open, merged }),
    actions,
  };
  if (metricsOut) writeFileSync(metricsOut, JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify({ ...metrics, actions: actions.length }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = error.exitCode ?? 1;
});
