/**
 * The one Golden Path bottleneck the fleet works first (Tim, 2026-11-07:
 * "summer should throw agents at the top most bottleneck to certification
 * til its certified").
 *
 * The binding bottleneck is the first surface that is not green, in paid-path
 * order (homepage, request access, claim, checkout), then launch order. Within it, the bottleneck is the
 * first failed check, or the first blocked check when none failed. One owned
 * Linear issue carries it as Urgent, `agent-ready` and `dispatch-next`, which
 * the lane runner admits ahead of every other Urgent issue
 * (scripts/lanes/lane_runner.py admission tier). Each certification run
 * rewrites the issue for the current bottleneck, so it moves on as each one
 * clears, and it closes itself once every surface passes.
 *
 * The per-surface and overall issues keep the full detail; this one only
 * says where the agents go next.
 */
import {
  closeLinearIssueByFingerprint,
  findLinearLabelId,
  upsertLinearIssueByTitleFingerprint,
} from './linear-issue-intake.mjs';

export const BOTTLENECK_FINGERPRINT = 'prod-cert-bottleneck';
export const DISPATCH_LABELS = Object.freeze(['agent-ready', 'dispatch-next']);

/**
 * The paid path (Tim, 2026-11-08): first paid signup, where each artist is
 * sent their own profile with a claim banner. Worked first, in this order;
 * the general editorial homepage and the rest follow in launch order.
 */
export const PAID_PATH = Object.freeze([
  'public-profile',
  'claim',
  'signup-signin',
  'checkout',
]);

/** @param {readonly string[]} surfaceOrder launch order (SURFACE_IDS) */
export function paidPathOrder(surfaceOrder) {
  const first = PAID_PATH.filter(s => surfaceOrder.includes(s));
  return [...first, ...surfaceOrder.filter(s => !first.includes(s))];
}

/**
 * @param {{ surface: string, status: string, checks?: { id: string, status: string, summary?: string }[] }[]} receipts
 * @param {readonly string[]} surfaceOrder launch order (SURFACE_IDS)
 */
export function topBottleneck(receipts, surfaceOrder) {
  const bySurface = new Map(receipts.map(r => [r.surface, r]));
  const notGreen = surfaceOrder.filter(
    s => bySurface.get(s)?.status !== 'passed'
  );
  if (notGreen.length === 0) return null;
  const [surface, ...behind] = notGreen;
  const checks = bySurface.get(surface)?.checks ?? [];
  const check = checks.find(c => c.status === 'failed') ??
    checks.find(c => c.status === 'blocked') ?? {
      id: 'no-evidence',
      status: 'blocked',
      summary: bySurface.has(surface)
        ? 'the receipt records no checks'
        : 'no receipt was written for this surface',
    };
  return {
    surface,
    check: { id: check.id, status: check.status, summary: check.summary ?? '' },
    behind,
  };
}

/**
 * @param {NonNullable<ReturnType<typeof topBottleneck>>} bottleneck
 * @param {{ servedSha: string, runUrl?: string | null }} context
 */
export function bottleneckIssue(bottleneck, { servedSha, runUrl = null }) {
  const { surface, check, behind } = bottleneck;
  return {
    title: `Golden path bottleneck: fix this first (${BOTTLENECK_FINGERPRINT})`,
    description: `## The bottleneck
\`${surface}\` is the first Golden Path surface a stranger reaches that is not certified. Its first ${check.status} check is \`${check.id}\`: ${check.summary || 'no summary recorded'}.

Served build \`${servedSha}\`. This issue is rewritten by every production certification run, so it always names the current bottleneck.

## Why it goes first
Nothing after \`${surface}\` can certify while a stranger stops here. Tim, 2026-11-07: put the agents on the topmost bottleneck to certification until it is certified. Tim, 2026-11-08: the main goal is a first paid signup from an artist sent their own profile with a claim banner, so the paid path (${PAID_PATH.join(', ')}) is worked before the rest.

## Behind it (fix after this one)
${behind.length ? behind.map(s => `- \`${s}\``).join('\n') : '- nothing: this is the last surface left'}

## How to reproduce
\`node scripts/prod-cert.mjs --origin https://jov.ie\` prints every surface's checks. The check ids are defined in \`scripts/lib/prod-cert*.mjs\`. The per-surface issue \`prod-cert-${surface}\` lists every failed check on this surface.

## Acceptance criteria
- [ ] A production certification run passes \`${check.id}\` on \`${surface}\`.
- [ ] This issue then names the next bottleneck, and closes itself when all surfaces pass.

Run: ${runUrl ?? 'n/a'}`,
  };
}

/**
 * File, rewrite or close the bottleneck issue for one certification run.
 * @param {any[]} receipts
 * @param {{ servedSha: string, surfaceOrder: readonly string[], runUrl?: string | null, deps?: { upsert?: Function, close?: Function, findLabel?: Function } }} options
 */
export async function fileBottleneckIssue(
  receipts,
  { servedSha, surfaceOrder, runUrl = null, deps = {} }
) {
  const upsert = deps.upsert ?? upsertLinearIssueByTitleFingerprint;
  const close = deps.close ?? closeLinearIssueByFingerprint;
  const findLabel =
    deps.findLabel ??
    (name =>
      findLinearLabelId({
        name,
        apiKey: process.env.LINEAR_API_KEY,
        fetchImpl: fetch,
      }));
  const bottleneck = topBottleneck(receipts, surfaceOrder);
  if (!bottleneck) {
    return close({
      fingerprint: BOTTLENECK_FINGERPRINT,
      labelKey: BOTTLENECK_FINGERPRINT,
      comment: `Every Golden Path surface passed on production ${servedSha.slice(0, 8)}: no bottleneck left.`,
      runId: process.env.GITHUB_RUN_ID,
    });
  }
  // A missing label must not drop the bottleneck itself.
  const labels = await Promise.all(
    DISPATCH_LABELS.map(name => findLabel(name))
  );
  const keepLabelIds = labels.filter(l => l?.ok && l.id).map(l => l.id);
  const { title, description } = bottleneckIssue(bottleneck, {
    servedSha,
    runUrl,
  });
  const result = await upsert({
    fingerprint: BOTTLENECK_FINGERPRINT,
    labelKey: BOTTLENECK_FINGERPRINT,
    title,
    description,
    priority: 1,
    createStateName: 'Todo',
    keepLabelIds,
    reopenTerminal: true,
  });
  return {
    ...result,
    bottleneck: `${bottleneck.surface}/${bottleneck.check.id}`,
  };
}
