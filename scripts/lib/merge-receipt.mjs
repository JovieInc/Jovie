#!/usr/bin/env node
/**
 * Merge receipt helpers for the Linear validation lifecycle writer
 * (JOV-13063). Once the native GitHub -> Linear sync is disabled, this
 * writer is the replacement hop that proves a merged pull request reached
 * its issue: a `merge-sync-receipt/v1` comment carrying the pull request
 * number and the 40-character merge SHA, idempotent across replays.
 *
 * Also hosts the deferral reporters moved here so the writer stays inside
 * its size-500 ceiling; they are re-exported from linear-sync-on-merge.mjs.
 */

import { appendFileSync, readFileSync } from 'node:fs';

export const MERGE_RECEIPT_MARKER = 'merge-sync-receipt/v1';

/**
 * The receipt comment. The HTML marker carries pr + sha so a replayed merge
 * event can recognize its own earlier comment and write nothing.
 * @param {number} number
 * @param {string} sha
 * @returns {string}
 */
export function mergeReceiptBody(number, sha) {
  return [
    `<!-- ${MERGE_RECEIPT_MARKER} pr=${number} sha=${sha} -->`,
    `Merged #${number} into main at ${sha}. Lifecycle state and validation receipts are tracked by the comments below.`,
  ].join('\n');
}

/**
 * True when this exact merge (pr + sha) already has its receipt comment.
 * @param {readonly (string | { readonly body?: string })[]} comments
 * @param {number} number
 * @param {string} sha
 * @returns {boolean}
 */
export function hasMergeReceipt(comments, number, sha) {
  const needle = `${MERGE_RECEIPT_MARKER} pr=${number} sha=${sha}`;
  return (comments ?? []).some(comment =>
    typeof comment === 'string'
      ? comment.includes(needle)
      : String(comment?.body ?? '').includes(needle)
  );
}

/**
 * Read the closed-pull-request event payload without a workflow change: the
 * title and merge SHA ride in GITHUB_EVENT_PATH, which the runtime provides
 * to every run. Returns null for anything unusable (dispatch replays,
 * missing or malformed payloads), and never throws.
 * @param {string | undefined} path
 * @param {(path: string) => string} [read]
 * @returns {{ number: number, title: string, sha: string } | null}
 */
export function readMergeEventPayload(path, read = readEventFile) {
  if (!path) return null;
  let payload = null;
  try {
    payload = JSON.parse(read(path));
  } catch {
    return null;
  }
  const pull =
    payload && typeof payload === 'object'
      ? /** @type {{ pull_request?: unknown, number?: unknown }} */ (payload)
      : {};
  const record =
    pull.pull_request && typeof pull.pull_request === 'object'
      ? /** @type {{ title?: unknown, number?: unknown, merge_commit_sha?: unknown }} */ (
          pull.pull_request
        )
      : {};
  const number = Number(record.number ?? pull.number ?? 0);
  if (!Number.isInteger(number) || number <= 0) return null;
  const sha =
    typeof record.merge_commit_sha === 'string' &&
    /^[0-9a-f]{40}$/.test(record.merge_commit_sha)
      ? record.merge_commit_sha
      : '';
  const title = typeof record.title === 'string' ? record.title : '';
  return { number, title, sha };
}

/**
 * @param {string} path
 * @returns {string}
 */
function readEventFile(path) {
  return readFileSync(path, 'utf8');
}

/**
 * Write the merge receipt for a closed-PR event unless this exact merge
 * (pr + sha) already has one. A failed write throws so the merge event is
 * retried visibly instead of being dropped silently; replays converge.
 *
 * @param {{ addComment: (issueId: string, body: string) => Promise<boolean> }} linear
 * @param {{ id: string, commentRecords?: readonly { body?: string }[] }} issue
 * @param {{ number: number, sha: string } | undefined} eventMerge
 * @param {boolean | undefined} dryRun
 * @returns {Promise<void>}
 */
export async function ensureMergeReceipt(linear, issue, eventMerge, dryRun) {
  if (!eventMerge || dryRun) return;
  if (
    hasMergeReceipt(
      issue.commentRecords ?? [],
      eventMerge.number,
      eventMerge.sha
    )
  )
    return;
  await linear.addComment(
    issue.id,
    mergeReceiptBody(eventMerge.number, eventMerge.sha)
  );
}

/**
 * Make a quota deferral visible: step output for the workflow's hold-and-retry
 * and a summary line. Exit stays 0 (the 403 is not a verdict on any issue).
 * @param {{ softFailed: boolean }} disposition
 * @param {NodeJS.ProcessEnv} [env]
 */
export function reportQuotaDeferral(disposition, env = process.env) {
  if (!disposition?.softFailed) return false;
  try {
    if (env.GITHUB_OUTPUT)
      appendFileSync(env.GITHUB_OUTPUT, 'quota_deferred=true\n');
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        '- Linear sync DEFERRED: GitHub installation quota 403; no lifecycle evaluation completed.\n'
      );
  } catch {
    // Visibility must never turn a deferral into a crash.
  }
  return true;
}

/**
 * A resolved deferral must set quota_deferred (exit stays 0). Without the
 * flag the hold skipped and the run went green unfinished (41157880216).
 * deferral_kind=linear skips that GitHub hold (43041615689).
 *
 * @param {{ action?: string, deferred?: number, deferralKind?: string } | null | undefined} result
 * @param {NodeJS.ProcessEnv} [env]
 */
export function reportSweepDeferral(result, env = process.env) {
  if (!result) return false;
  if (result.action !== 'deferred') return false;
  const detail =
    result.deferred && result.deferred > 0
      ? `${result.deferred} issue(s) deferred to the next sweep by the rate limit; the retry resumes from the cursor`
      : 'the rate limit stopped the sweep before any lifecycle evaluation';
  try {
    if (env.GITHUB_OUTPUT) {
      const kind = result.deferralKind
        ? `deferral_kind=${result.deferralKind}\n`
        : '';
      appendFileSync(env.GITHUB_OUTPUT, `quota_deferred=true\n${kind}`);
    }
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `- Linear sync DEFERRED: ${detail}.\n`
      );
  } catch {
    // Visibility must never turn a deferral into a crash.
  }
  return true;
}
