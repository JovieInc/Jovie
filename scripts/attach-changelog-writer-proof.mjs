#!/usr/bin/env node
/**
 * Attach the JOV-INV-022 writer-proof receipt
 *
 * api-budget: github-app-core 6/hr - one release-PR read and at most one body write per publish attempt (a few Production Controller runs per day) to the daily-changelog release PR.
 *
 * The `publish-customer-changelog` job opens the release PR as a draft, and
 * Auto-Ready green-source undrafts a draft only when its body carries a
 * complete `jovie-writer-pr-proof/v1` receipt bound to the exact head and the
 * PR author (scripts/lib/auto-ready-provenance.mjs — "branch names and trusted
 * automation authors never manufacture missing proof"). The publisher never
 * attached that receipt, so the release PR could only be undrafted by a manual
 * click; an unclicked draft sat until the stuck-publication guard closed it and
 * the cycle restarted, freezing the customer changelog (2026-10-25..29, and
 * again 2026-10-29..11-01 — JOV-10216).
 *
 * The Production Controller IS the writer of the release PR: its verified
 * publication plan (approved copy binding, customer-path evidence, deployment
 * ancestry, public readback identity) is the receipt's evidence. This attaches
 * that proof right after the release PR is created, inside the same step, so Auto-Ready
 * can complete the documented draft -> ready -> Merge Queue Green Enroll path.
 * It grants nothing new: every source check, the undraft conditions and queue
 * admission still apply unchanged.
 *
 * Usage (from the publish step, right after the release PR is created):
 *   node scripts/attach-changelog-writer-proof.mjs --pr <number> --head <sha>
 *
 * Fail-closed: exits non-zero when the PR is not the publisher's own release
 * PR shape, when the built receipt is incomplete, or when the GitHub update
 * fails. Re-runs are idempotent — an existing receipt is replaced only when
 * the head or evidence changed.
 */

import { spawnSync } from 'node:child_process';
import { isTrustedBotAuthor } from './lib/auto-ready-provenance.mjs';
import {
  attachWriterProofReceipt,
  buildWriterProofReceipt,
  extractLatestWriterProofReceipt,
  validateWriterProofReceipt,
} from './lib/writer-owned-pr-promotion.mjs';

/** Only the publisher's own release branches may receive the receipt. */
export const CHANGELOG_RELEASE_BRANCH_RE = /^release\/daily-changelog-/;

/** The hidden source-metadata marker the publisher writes into the PR body. */
export const CHANGELOG_PR_BODY_MARKER = 'customer-changelog/v1';

/** The customer-changelog publication system issue the receipt cites. */
export const CHANGELOG_PROOF_ISSUE_ID = 'JOV-7447';

/**
 * The writer evidence the publisher actually holds when it opens the release
 * PR. Evidence statuses must satisfy the receipt gates in
 * scripts/lib/writer-owned-pr-promotion.mjs (`passed` / `attached` + a
 * non-empty summary that is not itself a pending/skipped marker).
 */
export const RELEASE_PR_WRITER_EVIDENCE = Object.freeze({
  requiredTests:
    'passed: publish-daily-changelog plan validation (approved copy binding, customer-path evidence, deployment ancestry, public readback identity) at the verified production generation; the release PR still undrafts only after its own exact-head source CI is green',
  reviewSweep:
    'attached: daily publication plan audit (plan.audit) — missing copy, failed public paths and conflicting claims fail closed before the release PR is opened',
  ticketEvidence:
    'attached: JOV-7447 verified daily publication receipt, retained with the Production Controller run artifacts',
  prEvidence:
    'attached: CHANGELOG.md-only release diff on release/daily-changelog-* bound to the exact verified head and deployment',
});

export function buildChangelogWriterProofReceipt({
  prNumber,
  headSha,
  writerLogin,
}) {
  return buildWriterProofReceipt({
    issueId: CHANGELOG_PROOF_ISSUE_ID,
    prNumber,
    headSha,
    writerLogin,
    promotionPath: 'writer-owned-pr-promote',
    ...RELEASE_PR_WRITER_EVIDENCE,
  });
}

/**
 * Whether this PR is the publisher's own release PR shape. Only then may the
 * script manufacture the writer receipt — never for any other PR.
 */
export function releasePrEligibleForWriterProof({
  branch,
  authorLogin,
  body,
  headSha,
  prNumber,
}) {
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    return { eligible: false, reason: 'pr-unavailable' };
  }
  if (!/^[0-9a-f]{40}$/.test(String(headSha ?? '').toLowerCase())) {
    return { eligible: false, reason: 'head-unavailable' };
  }
  if (!CHANGELOG_RELEASE_BRANCH_RE.test(String(branch ?? ''))) {
    return { eligible: false, reason: 'not-release-branch' };
  }
  if (!isTrustedBotAuthor(authorLogin)) {
    return { eligible: false, reason: 'author-untrusted' };
  }
  if (!String(body ?? '').includes(CHANGELOG_PR_BODY_MARKER)) {
    return { eligible: false, reason: 'missing-body-marker' };
  }
  return { eligible: true, reason: 'release-pr-shape' };
}

/** Attach the receipt to the publisher's PR body (pure). */
export function attachReceiptToReleaseBody({
  body,
  prNumber,
  headSha,
  writerLogin,
}) {
  const receipt = buildChangelogWriterProofReceipt({
    prNumber,
    headSha,
    writerLogin,
  });
  return {
    body: attachWriterProofReceipt(String(body ?? ''), receipt),
    receipt,
  };
}

// GitHub reads/writes go through the shared budgeted client
// (packages/api-client/cli.ts gh) per .claude/rules/external-apis.md and the
// external-api-guard ratchet — never a bare `gh` subprocess. Exit 75 is the
// client's quota deferral: fail closed so the next controller run retries.
const API_CLIENT_CLI = 'packages/api-client/cli.ts';

function gh(args) {
  const result = spawnSync(
    process.execPath,
    [API_CLIENT_CLI, 'gh', '--priority', 'default', '--', ...args],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status === 75)
    throw new Error('GitHub quota deferred by the shared api-client ledger');
  if (result.status !== 0)
    throw new Error(
      `gh ${args[0]} failed (exit ${result.status}): ${result.stderr.slice(-400)}`
    );
  return result.stdout;
}

function main(argv) {
  const flags = {};
  for (let index = 2; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const next = argv[index + 1];
    flags[argv[index].slice(2)] =
      next === undefined || next.startsWith('--') ? true : next;
    if (next !== undefined && !next.startsWith('--')) index += 1;
  }
  const prNumber = Number.parseInt(String(flags.pr ?? ''), 10);
  const headSha = String(flags.head ?? '').toLowerCase();
  const repository = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';

  const pr = JSON.parse(gh(['api', `repos/${repository}/pulls/${prNumber}`]));
  const authorLogin = pr.user?.login ?? '';
  const body = pr.body ?? '';
  const branch = pr.head?.ref ?? '';
  const context = { prNumber, headSha, writerLogin: authorLogin, branch, body };

  const eligibility = releasePrEligibleForWriterProof(context);
  if (!eligibility.eligible) {
    console.error(
      `Refusing to attach a changelog writer proof to #${prNumber}: ${eligibility.reason}`
    );
    return 1;
  }

  // Idempotent re-run: a receipt that already validates at this exact head,
  // PR number and writer needs no rewrite (its issuedAt must not churn).
  const existing = extractLatestWriterProofReceipt(body);
  if (
    existing &&
    validateWriterProofReceipt(existing, {
      expectedHeadSha: headSha,
      writerLogin: authorLogin,
      prNumber,
    }).ok
  ) {
    console.log(
      `Receipt already attached for #${prNumber} at ${headSha.slice(0, 12)}`
    );
    return 0;
  }

  const { body: nextBody, receipt } = attachReceiptToReleaseBody({
    body,
    prNumber,
    headSha,
    writerLogin: authorLogin,
  });
  const validation = validateWriterProofReceipt(receipt, {
    expectedHeadSha: headSha,
    writerLogin: authorLogin,
    prNumber,
  });
  if (!validation.ok || receipt.proofComplete !== true) {
    console.error(
      `Built changelog writer proof is incomplete for #${prNumber}: ${
        validation.reason || receipt.blockedBy.join(',')
      }`
    );
    return 1;
  }
  if (nextBody === body) {
    console.log(
      `Receipt already attached for #${prNumber} at ${headSha.slice(0, 12)}`
    );
    return 0;
  }
  gh([
    'api',
    '-X',
    'PATCH',
    `repos/${repository}/pulls/${prNumber}`,
    '-f',
    `body=${nextBody}`,
  ]);
  console.log(
    `Attached ${receipt.schema} to #${prNumber} at ${headSha.slice(0, 12)}`
  );
  return 0;
}

let directExecution = false;
if (process.argv[1]) {
  try {
    const { realpathSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    directExecution =
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1]);
  } catch {
    // An import with an unavailable argv path must not execute the CLI.
  }
}
if (directExecution) {
  process.exitCode = main(process.argv);
}
