#!/usr/bin/env node
/**
 * Attach the JOV-INV-022 writer-proof receipt
 *
 * api-budget: github-app-core 27/hr - at most three attestation attempts (two PR reads and one body write each), with GET retries owned by the shared client to the daily-changelog release PR.
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
 * the head or evidence changed. Transient PATCH failures get at most three
 * attempts, each beginning with readback; GET retries and write spacing remain
 * owned by the shared API client. Exhaustion still leaves the draft for the
 * existing stale-publication reconciliation; this is not cross-run recovery.
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
  actualHeadSha = '',
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
  // The receipt binds the head the caller claims; refuse a PR whose real head
  // already moved (a receipt bound to a stale head is useless and misleading).
  if (
    actualHeadSha &&
    String(actualHeadSha).toLowerCase() !== String(headSha).toLowerCase()
  ) {
    return { eligible: false, reason: 'head-mismatch' };
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
// client's quota deferral: fail closed without starting another retry loop.
const API_CLIENT_CLI = 'packages/api-client/cli.ts';

/**
 * @param {string[]} args
 * @param {(command: string, args: string[], options: { encoding: 'utf8', maxBuffer: number }) => { error?: Error, status: number | null, stdout: string, stderr: string }} [run]
 */
export function gh(args, run = spawnSync) {
  const result = run(
    process.execPath,
    [API_CLIENT_CLI, 'gh', '--priority', 'default', '--', ...args],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.error) throw result.error;
  if (result.status === 75)
    throw new Error('GitHub quota deferred by the shared api-client ledger');
  if (result.status !== 0) {
    // The shared client already retries GETs and defers quota/rate failures.
    // PATCH is non-idempotent there: retry it only after a fresh PR readback.
    const retryable =
      args.includes('PATCH') &&
      /HTTP 50[0234]|timed? ?out|unexpected EOF|connection reset|stream error|couldn't respond|ECONNRESET|ETIMEDOUT|EAI_AGAIN|Bad Gateway|Service Unavailable/i.test(
        result.stderr
      ) &&
      !/rate.?limit|quota|HTTP (?:401|403|429)/i.test(result.stderr);
    throw Object.assign(
      new Error(
        `gh ${args[0]} failed (exit ${result.status}): ${result.stderr.slice(-400)}`
      ),
      { retryable }
    );
  }
  return result.stdout;
}

function attachOnce(
  argv,
  {
    github = gh,
    repository = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie',
  } = {}
) {
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
  const pr = JSON.parse(
    github(['api', `repos/${repository}/pulls/${prNumber}`])
  );
  // Never attest the supplied commit if the release branch advanced. Check
  // before even accepting an existing receipt for that earlier commit.
  if (String(pr.head?.sha ?? '').toLowerCase() !== headSha) {
    console.error(
      `Refusing to attach a changelog writer proof to #${prNumber}: head-mismatch`
    );
    return 1;
  }
  const authorLogin = pr.user?.login ?? '';
  const body = pr.body ?? '';
  const branch = pr.head?.ref ?? '';
  const context = {
    prNumber,
    headSha,
    authorLogin,
    branch,
    body,
    actualHeadSha: pr.head?.sha,
  };

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
  const fresh = JSON.parse(
    github(['api', `repos/${repository}/pulls/${prNumber}`])
  );
  if (
    String(fresh.head?.sha ?? '').toLowerCase() !== headSha ||
    fresh.head?.ref !== branch ||
    fresh.user?.login !== authorLogin
  ) {
    console.error(
      `Refusing to attach a changelog writer proof to #${prNumber}: pr-changed-before-write`
    );
    return 1;
  }
  if ((fresh.body ?? '') !== body) {
    throw Object.assign(
      new Error('Release PR body changed before writer proof write'),
      { retryable: true }
    );
  }
  // GitHub documents conditional GETs, but no compare-and-swap for PR bodies.
  // This fresh read narrows the final GET -> PATCH race; it cannot eliminate it.
  // https://docs.github.com/en/rest/pulls/pulls#update-a-pull-request
  github([
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

/** Bounded recovery within this verified publisher attempt, never another PR. */
export function main(argv, options = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return attachOnce(argv, options);
    } catch (error) {
      if (!error.retryable || attempt === 3) throw error;
      console.warn(
        `Retrying changelog writer proof after readback (${attempt}/3): ${error.message}`
      );
    }
  }
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
