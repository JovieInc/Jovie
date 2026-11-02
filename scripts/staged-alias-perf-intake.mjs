#!/usr/bin/env node
/**
 * Files (or refreshes) one Linear perf ticket when the exact staged-build
 * public-profile alias lane misses budgets on routes whose golden-path surface
 * is not certified. Those routes warn instead of blocking (Tim 2026-10-31:
 * perf gates block certified pages only; launch gates never stall launch), so
 * this ticket is what keeps the miss tracked.
 *
 * Usage: node scripts/staged-alias-perf-intake.mjs --routes "<ids>" --run-url <url> --sha <sha>
 * Never fails the caller: a missing key or Linear outage prints a warning.
 */
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

export const FINGERPRINT = 'remediation:staged-alias-perf';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : (process.argv[index + 1] ?? '');
}

export function buildStagedAliasPerfIssue({ routes, runUrl, sha }) {
  return {
    fingerprint: FINGERPRINT,
    title: `Staged-build public-profile alias budgets missed on uncertified routes (${FINGERPRINT})`,
    description: [
      'Lane: `public_profile_budget_lane` in .github/workflows/production-release.yml (exact staged build).',
      `Routes over budget (warning only, not certified): ${routes || 'unknown'}`,
      `Commit: ${sha || 'unknown'}`,
      `Run: ${runUrl || 'unknown'}`,
      'Budgets: usable-alias-result median <=1000ms, nearest-rank p95 of 20 samples <=1500ms. Per-sample phases are in the run log.',
      'These routes block again as soon as their golden-path surface certifies (scripts/lib/alias-gate-certified-routes.mjs).',
      `Fingerprint: \`${FINGERPRINT}\``,
    ].join('\n'),
    priority: 3,
    createStateName: 'Todo',
    reopenTerminal: true,
  };
}

async function main() {
  const issue = buildStagedAliasPerfIssue({
    routes: argument('--routes'),
    runUrl: argument('--run-url'),
    sha: argument('--sha'),
  });
  const result = await upsertLinearIssueByTitleFingerprint(issue);
  if (!result.ok) {
    console.log(
      `::warning::Staged alias perf ticket not filed: ${result.reason}`
    );
    return;
  }
  console.log(JSON.stringify({ ok: true, fingerprint: FINGERPRINT }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.log(
      `::warning::Staged alias perf ticket not filed: ${error instanceof Error ? error.message : error}`
    );
  });
}
