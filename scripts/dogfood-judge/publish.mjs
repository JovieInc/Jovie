// Publish judge verdicts to the production design-judge ledger that the
// waitlist admission gate reads (#23720): ovie_operating_kv key
// `jovie:certification:v1:dogfood-judge`, schema `jovie.dogfood-judge-ledger/v1`.
//
// Only real judged receipts become records. A surface's record is `pass` only
// when its latest receipt passed, carries the nothing-wrong signoff, has a
// verified signature when a signing key is configured, and is not stale
// (surface model bindings, rubric, expiry). Everything else is written as
// `fail`, so a stale or failing surface closes admission instead of lingering.
//
// Transport: POST to /api/internal/ovie/dogfood-judge-evidence with CRON_SECRET
// (CI: DOPPLER_TOKEN_PRD -> doppler run --only-secrets=CRON_SECRET). The secret
// is never typed or printed.

import { createHash } from 'node:crypto';
import { verifyReceiptSignature } from './receipt.mjs';
import { receiptStaleness } from './registry.mjs';
import { COLD_PASS_VERSION, RUBRIC_VERSION } from './rubric.mjs';

export const LEDGER_KEY = 'jovie:certification:v1:dogfood-judge';
export const LEDGER_SCHEMA = 'jovie.dogfood-judge-ledger/v1';
export const EVIDENCE_PATH = '/api/internal/ovie/dogfood-judge-evidence';

/** Judge-level fingerprint: what makes a verdict comparable (rubric, cold pass, judge models). */
export function judgeFingerprint({ rubricVersion, coldPassVersion, tiers }) {
  const body = JSON.stringify({
    rubricVersion,
    coldPassVersion,
    screen: tiers?.screen ?? null,
    confirm: tiers?.confirm ?? null,
  });
  return `judge:${createHash('sha256').update(body).digest('hex').slice(0, 24)}`;
}

export function currentJudgeFingerprint(registry) {
  return judgeFingerprint({
    rubricVersion: RUBRIC_VERSION,
    coldPassVersion: COLD_PASS_VERSION,
    tiers: registry.judge.tiers,
  });
}

/** Admission requires every golden-path surface judged as one run (per-subject walks are the profile leg). */
export function requiredSurfaces(registry) {
  return registry.surfaces
    .filter(s => s.roi?.goldenPath && !s.perSubject)
    .map(s => s.id);
}

/**
 * Build the ledger from the latest receipt per surface.
 * @param {{ registry: any, receipts: Record<string, any>, resolved: Record<string, string|null>, now?: number, signingKey?: string }} input
 */
export function buildLedger({
  registry,
  receipts,
  resolved,
  now = Date.now(),
  signingKey = process.env.DOGFOOD_JUDGE_SIGNING_KEY,
}) {
  const required = requiredSurfaces(registry);
  const surfaces = {};
  for (const surface of registry.surfaces) {
    const receipt = receipts[surface.id];
    if (!receipt) continue; // never judged: absent, which the gate reads as not signed off
    const reasons = receiptStaleness(receipt, surface, resolved, {
      now,
      maxAgeDays: registry.judge?.maxReceiptAgeDays ?? 7,
    });
    if (receipt.verdict !== 'pass') reasons.push('judge-verdict-fail');
    if (!receipt.signoff?.nothingWrong)
      reasons.push('no-nothing-wrong-signoff');
    if (signingKey && !verifyReceiptSignature(receipt, signingKey))
      reasons.push('signature-invalid-or-missing');
    const pass = reasons.length === 0;
    surfaces[surface.id] = {
      verdict: pass ? 'pass' : 'fail',
      sourceSha: receipt.sourceSha ?? null,
      fingerprint: judgeFingerprint(receipt),
      judgedAt: receipt.judgedAt,
      runId: receipt.runId,
      nothingWrong: Boolean(receipt.signoff?.nothingWrong),
      reasons,
      steps: receipt.steps.length,
      failingSteps: receipt.steps
        .filter(step => step.verdict === 'fail')
        .map(step => step.id),
      digest: receipt.digest,
      signature: receipt.signature ?? null,
    };
  }
  return {
    schema: LEDGER_SCHEMA,
    currentFingerprint: currentJudgeFingerprint(registry),
    requiredSurfaces: required,
    surfaces,
    publishedAt: new Date(now).toISOString(),
  };
}

/** Mirror of #23720's evaluateDesignLeg, so the publisher can say what the gate will decide. */
export function designLegDecision(ledger, prodSha) {
  if (!prodSha) return { ok: false, reason: 'Production SHA unknown.' };
  if (!ledger || ledger.requiredSurfaces.length === 0)
    return { ok: false, reason: 'No design judge sign-off yet.' };
  const notSigned = ledger.requiredSurfaces.filter(id => {
    const record = ledger.surfaces[id];
    return (
      !record ||
      record.verdict !== 'pass' ||
      record.sourceSha !== prodSha ||
      record.fingerprint !== ledger.currentFingerprint
    );
  });
  return notSigned.length === 0
    ? { ok: true, reason: 'Judge signed off every screen on this deploy.' }
    : {
        ok: false,
        reason: `No current judge sign-off: ${notSigned.join(', ')}.`,
      };
}

/** POST the ledger to production. Fails loudly; never prints the secret. */
export async function postLedger(
  ledger,
  {
    origin = 'https://jov.ie',
    secret = process.env.CRON_SECRET,
    fetchImpl = fetch,
  } = {}
) {
  if (!secret)
    throw new Error(
      'CRON_SECRET is not set; run under doppler run --only-secrets=CRON_SECRET'
    );
  const response = await fetchImpl(new URL(EVIDENCE_PATH, origin), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ledger }),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `ledger POST HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  return JSON.parse(text);
}
