#!/usr/bin/env node
// Hold contract (jovie-hold/v1).
//
// A stop label (`hold`, `gated`, `incident`, `do-not-merge`, `queue-deferred`,
// or a `tim-hold` variant; scripts/lib/admission-hold-labels.mjs) pauses admission. It may not
// pause it forever on prose alone. Whoever applies one posts a receipt comment
// on the PR:
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
import { execFileSync } from 'node:child_process';
import { STOP_HOLD_LABELS } from './lib/admission-hold-labels.mjs';
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
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function sweepHolds({ now, dryRun, io }) {
  const results = [];
  for (const number of io.listHeld()) {
    const pr = io.read(number);
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
      io.comment(number, releaseComment({ ...verdict, label }));
      io.unlabel(number, label);
    }
  }
  for (const result of results) {
    console.log(
      `${result.action} #${result.number} ${result.label}: ${result.reason}${result.owner ? ` (owner ${result.owner})` : ''}${dryRun && result.action === 'release' ? ' [dry run]' : ''}`
    );
  }
  return results;
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  const [owner, name] = repository.split('/');
  sweepHolds({
    now: Date.now(),
    dryRun: process.env.DRY_RUN === 'true',
    io: {
      // One open-PR read; `gh pr list --label` ANDs repeated labels.
      listHeld: () =>
        JSON.parse(
          gh([
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
      read: number =>
        JSON.parse(
          gh([
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
      comment: (number, body) =>
        gh([
          'api',
          `repos/${repository}/issues/${number}/comments`,
          '-f',
          `body=${body}`,
        ]),
      unlabel: (number, label) =>
        gh([
          'api',
          '--method',
          'DELETE',
          `repos/${repository}/issues/${number}/labels/${encodeURIComponent(label)}`,
        ]),
    },
  });
}

if (process.argv[1]?.endsWith('hold-contract.mjs')) main();
