#!/usr/bin/env node
/**
 * Raises a loud P1 when a release alias gate cannot read the Ovie golden-path
 * certification ledger. An unreadable ledger makes every alias route
 * "uncertified", which silently turns the blocking perf gate into warnings and
 * means Summer's golden-path reader is blind too. The release still proceeds
 * (launch gates never stall launch), but this must never be quiet.
 *
 * Routed like the doctor's release-gate alerts: one fingerprinted Linear
 * issue (Urgent) that reopens while the condition repeats.
 *
 * Usage: node scripts/alias-ledger-unreadable-intake.mjs --lane <name>
 *   --state <unavailable|missing> --source <url> --detail <text> --run-url <url> --sha <sha>
 * Never fails the caller.
 */
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

export const FINGERPRINT = 'production-deploy:certification-ledger-unreadable';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : (process.argv[index + 1] ?? '');
}

export function buildLedgerUnreadableIssue({
  lane,
  state,
  source,
  detail,
  runUrl,
  sha,
}) {
  return {
    fingerprint: FINGERPRINT,
    title: `Golden-path certification ledger unreadable in release alias gate (${FINGERPRINT})`,
    description: [
      `Lane: ${lane || 'unknown'}`,
      `Ledger state: ${state || 'unknown'} (source ${source || 'unknown'})`,
      `Read detail: ${detail || 'none'}`,
      `Commit: ${sha || 'unknown'}`,
      `Run: ${runUrl || 'unknown'}`,
      "Effect: every public-profile alias route was treated as uncertified, so perf budgets only warned. Summer's golden-path reader uses the same endpoint (/api/internal/ovie/golden-path-evidence).",
      'Fix the read (CRON_SECRET, endpoint deploy, Redis ledger key jovie:certification:v1:prod-golden-path) so certified routes block again.',
      `Fingerprint: \`${FINGERPRINT}\``,
    ].join('\n'),
    priority: 1,
    reopenTerminal: true,
  };
}

async function main() {
  const issue = buildLedgerUnreadableIssue({
    lane: argument('--lane'),
    state: argument('--state'),
    source: argument('--source'),
    detail: argument('--detail'),
    runUrl: argument('--run-url'),
    sha: argument('--sha'),
  });
  const result = await upsertLinearIssueByTitleFingerprint(issue);
  if (!result.ok) {
    console.log(
      `::warning::Certification-ledger P1 not filed (${result.reason}); the ledger is still unreadable.`
    );
    return;
  }
  console.log(JSON.stringify({ ok: true, fingerprint: FINGERPRINT }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.log(
      `::warning::Certification-ledger P1 not filed: ${error instanceof Error ? error.message : error}`
    );
  });
}
