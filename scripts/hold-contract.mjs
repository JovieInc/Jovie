#!/usr/bin/env node
// Hold contract (jovie-hold/v1).
//
// Stop labels pause admission. None is human-owned: `tim-hold`, `tim:hold`,
// `hold:tim` and `do-not-merge` are retired (EVENT 2026-10-28, Tim: nothing in
// the shipping machinery waits on a human; taste ships behind a flag and Tim's
// feedback arrives as an Ovie card). Every stop label
// (scripts/lib/admission-hold-labels.mjs) uses a receipt
// naming an owner and a machine-checkable release:
//
//   <!-- jovie-hold/v1 {"owner":"agent:<task>","until":"2026-10-12T18:00:00Z","reason":"..."} -->
//   <!-- jovie-hold/v1 {"owner":"gem-lanes","head":"<40-hex sha>","reason":"waiting for a fix push"} -->
//
// `owner` is required. A receipt also needs a machine-checkable release:
// `until` (an expiry) and/or `head` (released once the PR head moves off that
// SHA). No receipt may keep a hold past MAX_HOLD_MS from its own creation.
// A hold with no valid receipt is ownerless and is released after
// OWNERLESS_GRACE_MS. Release removes the label and leaves one comment; the
// Jovie Bot unlabel event wakes Merge Queue Green Enroll, whose required
// checks remain the only merge gate.
import { STOP_HOLD_LABELS } from './lib/admission-hold-labels.mjs';
import { EX_TEMPFAIL, runWithGitHubRetry } from './lib/github-rate-limit.mjs';
import { extractReceiptFromComment } from './lib/queue-deferral-receipt.mjs';

export const HOLD_LABEL = 'hold';
export const CONTRACT_LABELS = STOP_HOLD_LABELS;
export const HOLD_RECEIPT_SCHEMA = 'jovie-hold/v1';
export const OWNERLESS_GRACE_MS = 24 * 3600 * 1000;
export const MAX_HOLD_MS = 7 * 24 * 3600 * 1000;
// A receipt may be posted shortly before the label is applied.
export const RECEIPT_SKEW_MS = 3600 * 1000;

const SHA = /^[0-9a-f]{40}$/;
const RECEIPT = /<!--\s*jovie-hold\/v1\s+(\{[\s\S]*?\})\s*-->/g;

// The sweep draws on the shared Jovie Bot installation GraphQL/REST budget
// every workflow uses. 2026-10-29 12:52-12:58 PT (runs 40944019979,
// 40944172375, 40944333276, 40944845412): the open-PR list died with
// 'GraphQL: API rate limit already exceeded for installation ID 112037986'
// and exited 1. Every call now retries quota/transient failures within this
// budget and defers (exit 75, `github-quota-deferred`) past it; a deferred
// sweep releases nothing and is re-run by the next enroll wake. Real errors
// still exit 1.
const HOLD_SWEEP_MAX_WAIT_MS = 90_000;

/** @returns {{ owner: string, until: number | null, head: string | null, reason: string } | null} */
export function parseHoldReceipt(body) {
  if (typeof body !== 'string') return null;
  let latest = null;
  for (const match of body.matchAll(RECEIPT)) {
    let raw;
    try {
      raw = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const owner = typeof raw.owner === 'string' ? raw.owner.trim() : '';
    const until =
      typeof raw.until === 'string' && Number.isFinite(Date.parse(raw.until))
        ? Date.parse(raw.until)
        : null;
    const head =
      typeof raw.head === 'string' && SHA.test(raw.head.toLowerCase())
        ? raw.head.toLowerCase()
        : null;
    if (!owner || (until === null && head === null)) continue;
    latest = {
      owner,
      until,
      head,
      reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 200) : '',
    };
  }
  if (latest) return latest;
  // A valid exact-head `jovie-queue-deferral/v1` receipt (drain and controller
  // deferrals) names its source and releases when the head moves.
  const deferral = extractReceiptFromComment(body);
  return deferral && !deferral.invalid
    ? {
        owner: deferral.source,
        until: null,
        head: deferral.head,
        reason: deferral.reason.slice(0, 200),
      }
    : null;
}

/**
 * @param {{ labeledAt: string, now: number, headSha: string,
 *   comments: { body: string, createdAt: string }[] }} input
 * @returns {{ action: 'keep' | 'release', reason: string, owner?: string }}
 */
export function evaluateHold({ labeledAt, now, headSha, comments = [] }) {
  const labeled = Date.parse(labeledAt);
  if (!Number.isFinite(labeled) || !Number.isFinite(now)) {
    return { action: 'keep', reason: 'incomplete-evidence' };
  }
  let receipt = null;
  let receiptAt = 0;
  for (const comment of comments) {
    const createdAt = Date.parse(comment?.createdAt);
    if (!Number.isFinite(createdAt) || createdAt < labeled - RECEIPT_SKEW_MS)
      continue;
    const parsed = parseHoldReceipt(comment.body);
    if (parsed && createdAt >= receiptAt) {
      receipt = parsed;
      receiptAt = createdAt;
    }
  }
  if (!receipt) {
    return now - labeled >= OWNERLESS_GRACE_MS
      ? { action: 'release', reason: 'ownerless' }
      : { action: 'keep', reason: 'ownerless-grace' };
  }
  const { owner } = receipt;
  const cap = receiptAt + MAX_HOLD_MS;
  const expiry = receipt.until === null ? cap : Math.min(receipt.until, cap);
  if (now >= expiry) return { action: 'release', reason: 'expired', owner };
  const head = String(headSha ?? '').toLowerCase();
  if (receipt.head && SHA.test(head) && head !== receipt.head) {
    return { action: 'release', reason: 'head-changed', owner };
  }
  return { action: 'keep', reason: 'receipt-valid', owner };
}

/** @param {{ reason: string, owner?: string, label?: string }} verdict */
export function releaseComment({ reason, owner, label = HOLD_LABEL }) {
  const why = {
    ownerless: `it has no \`${HOLD_RECEIPT_SCHEMA}\` receipt naming an owner and a release condition, and the ${OWNERLESS_GRACE_MS / 3600000}h grace period has passed`,
    expired: `its \`${HOLD_RECEIPT_SCHEMA}\` receipt (owner \`${owner}\`) expired`,
    'head-changed': `its \`${HOLD_RECEIPT_SCHEMA}\` receipt (owner \`${owner}\`) released on a head change, and the head has moved`,
  }[reason];
  return [
    `Hold contract: removed \`${label}\` because ${why}.`,
    'Required checks still gate the merge queue. To hold again, re-apply the label and post a receipt:',
    `\`<!-- ${HOLD_RECEIPT_SCHEMA} {"owner":"<who>","until":"<ISO time>","reason":"<why>"} -->\``,
    `(or \`"head":"<sha>"\` to release when the head moves; no receipt lasts past ${MAX_HOLD_MS / 86400000} days).`,
  ].join('\n');
}

const QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){state headRefOid labels(first:100){nodes{name}} timelineItems(last:100,itemTypes:[LABELED_EVENT]){nodes{... on LabeledEvent{createdAt label{name}}}} comments(last:100){nodes{body createdAt}}}}}`;

function gh(args) {
  return runWithGitHubRetry(['gh', ...args], {
    attempts: 4,
    maxWaitMs: HOLD_SWEEP_MAX_WAIT_MS,
  });
}

/**
 * Throw the outcome as an error carrying a deferred marker, so the sweep can
 * report an infrastructure deferral (exit 75) without turning it into a
 * verdict on any hold.
 */
function ghError(outcome) {
  const message = `${outcome.stderr}\n${outcome.stdout}`.trim();
  const error = new Error(
    outcome.deferred
      ? `GitHub quota deferral: ${message || 'hold sweep deferred'}`
      : message || `gh exited ${outcome.code}`
  );
  error.deferred = Boolean(outcome.deferred);
  error.exitCode = error.deferred ? EX_TEMPFAIL : outcome.code || 1;
  return error;
}

async function ghOrThrow(args) {
  const outcome = await gh(args);
  if (outcome.deferred || outcome.code !== 0) throw ghError(outcome);
  return outcome.stdout;
}

export async function sweepHolds({ now, dryRun, io }) {
  /** @type {Array<ReturnType<typeof evaluateHold> & { number: number, label: string }>} */
  const results = [];
  for (const number of await io.listHeld()) {
    const pr = await io.read(number);
    if (pr?.state !== 'OPEN') continue;
    const present = new Set((pr.labels?.nodes ?? []).map(l => l?.name));
    // Each stop label is its own hold with its own labeled time; one receipt
    // on the PR covers every label applied within its window.
    for (const label of CONTRACT_LABELS) {
      if (!present.has(label)) continue;
      const labeledAt = (pr.timelineItems?.nodes ?? [])
        .filter(event => event?.label?.name === label)
        .map(event => event.createdAt)
        .sort()
        .pop();
      if (!labeledAt) continue;
      const verdict = evaluateHold({
        labeledAt,
        now,
        headSha: pr.headRefOid,
        comments: pr.comments?.nodes ?? [],
      });
      results.push({ number, label, ...verdict });
      if (verdict.action !== 'release' || dryRun) continue;
      await io.comment(number, releaseComment({ ...verdict, label }));
      await io.unlabel(number, label);
    }
  }
  for (const result of results) {
    console.log(
      `${result.action} #${result.number} ${result.label}: ${result.reason}${result.owner ? ` (owner ${result.owner})` : ''}${dryRun && result.action === 'release' ? ' [dry run]' : ''}`
    );
  }
  return results;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  const [owner, name] = repository.split('/');
  try {
    await sweepHolds({
      now: Date.now(),
      dryRun: process.env.DRY_RUN === 'true',
      io: {
        // One open-PR read; a pr list with repeated --label flags ANDs them.
        listHeld: async () =>
          JSON.parse(
            await ghOrThrow([
              'pr',
              'list',
              '--repo',
              repository,
              '--state',
              'open',
              '--limit',
              '1000',
              '--json',
              'number,labels',
            ])
          )
            .filter(pr =>
              (pr.labels ?? []).some(l => CONTRACT_LABELS.includes(l?.name))
            )
            .map(pr => pr.number),
        read: async number =>
          JSON.parse(
            await ghOrThrow([
              'api',
              'graphql',
              '-f',
              `query=${QUERY}`,
              '-F',
              `owner=${owner}`,
              '-F',
              `name=${name}`,
              '-F',
              `number=${number}`,
            ])
          ).data.repository.pullRequest,
        comment: async (number, body) =>
          ghOrThrow([
            'api',
            `repos/${repository}/issues/${number}/comments`,
            '-f',
            `body=${body}`,
          ]),
        unlabel: async (number, label) =>
          ghOrThrow([
            'api',
            '--method',
            'DELETE',
            `repos/${repository}/issues/${number}/labels/${encodeURIComponent(label)}`,
          ]),
      },
    });
  } catch (error) {
    if (error?.deferred) {
      console.warn(
        `Hold contract sweep deferred (${error.message}); the remaining holds were not judged and stay applied. It re-runs on the next enroll wake.`
      );
      process.exitCode = error.exitCode ?? EX_TEMPFAIL;
      return;
    }
    throw error;
  }
}

if (process.argv[1]?.endsWith('hold-contract.mjs')) await main();
