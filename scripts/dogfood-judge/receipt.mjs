// Judge receipts, the gate, and remediation events.
//
// Receipt: jovie.dogfood-judge-receipt/v1, one per judged run, written to the
// local ledger and projected into the certification kernel as a
// `visual_proof` receipt whose id/ref start with `dogfood-judge:`. Gates call
// `gateDecision` (CLI: `cli.mjs gate`) and fail closed on no receipt, a fail
// verdict, or a stale model/rubric fingerprint.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fingerprint, receiptStaleness, surfaceBindings } from './registry.mjs';
import { CRITERIA } from './rubric.mjs';

export const RECEIPT_SCHEMA = 'jovie.dogfood-judge-receipt/v1';
export const VISUAL_PROOF_PREFIX = 'dogfood-judge:';
export const REMEDIATION_SCHEMA = 'jovie.dogfood-judge-remediation/v1';
export const DEFAULT_LEDGER = '.context/dogfood-judge/ledger';

/** @returns {Record<string, any>} */
export function buildReceipt({
  surface,
  result,
  manifest,
  resolved,
  sourceSha = null,
  judgedAt = new Date().toISOString(),
  runId,
}) {
  const bindings = surfaceBindings(surface, resolved);
  /** @type {Record<string, any>} */
  const body = {
    schema: RECEIPT_SCHEMA,
    runId,
    surface: surface.id,
    judgedAt,
    sourceSha,
    rubricVersion: result.rubricVersion,
    coldPassVersion: result.coldPassVersion ?? null,
    bindings,
    fingerprint: fingerprint(bindings),
    tiers: result.tiers,
    verdict: result.verdict,
    costUsd: Number(result.costUsd.toFixed(4)),
    calls: result.calls,
    videos: manifest.videos,
    unjudgeable: result.unjudgeable,
    steps: result.steps.map(step => ({
      id: step.id,
      title: step.title,
      url: step.url,
      verdict: step.verdict,
      rubricVerdict: step.rubricVerdict ?? step.verdict,
      coldVerdict: step.coldVerdict ?? 'not-run',
      tier: step.tier,
      screenVerdict: step.screenVerdict ?? null,
      recorderVerdict: step.recorderVerdict,
      penGap: step.penGap,
      penSummary: step.penSummary,
      timQuote: step.timQuote,
      images: step.images.map(({ name, path, t, source }) => ({
        name,
        path,
        t,
        source,
      })),
      findings: step.findings,
    })),
  };
  const credible = body.steps.reduce((n, step) => n + step.findings.length, 0);
  const nothingWrong =
    body.verdict === 'pass' &&
    credible === 0 &&
    body.unjudgeable.length === 0 &&
    body.coldPassVersion !== null &&
    body.steps.every(step => step.coldVerdict === 'pass');
  body.signoff = {
    nothingWrong,
    statement: nothingWrong
      ? `Watched every step of ${body.surface} (${body.steps.length} steps): rubric and cold screenshot test found nothing wrong.`
      : `Not signed off: ${credible} finding(s), ${body.unjudgeable.length} unrecorded step(s).`,
  };
  return {
    ...body,
    digest: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  };
}

/** Projection into the jovie.certification/v1 kernel's visual_proof tier. */
export function visualProofReceipt(receipt) {
  const blockers = receipt.steps
    .flatMap(s => s.findings)
    .filter(f => f.severity === 'blocker').length;
  const failing =
    receipt.steps.filter(s => s.verdict === 'fail').length +
    receipt.unjudgeable.length;
  return {
    id: `${VISUAL_PROOF_PREFIX}${receipt.surface}`,
    tier: 'visual_proof',
    status: receipt.verdict === 'pass' ? 'passed' : 'failed',
    sourceSha: receipt.sourceSha,
    ref: `${VISUAL_PROOF_PREFIX}${receipt.surface}@${receipt.fingerprint}`,
    digest: receipt.digest,
    summary:
      `${receipt.rubricVersion}: ${receipt.verdict}, ${failing} failing step(s), ${blockers} blocker finding(s); judged ${receipt.judgedAt}`.slice(
        0,
        2000
      ),
  };
}

export function writeReceipt(receipt, ledgerDir) {
  const dir = join(ledgerDir, receipt.surface);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${receipt.judgedAt.replace(/[:.]/gu, '-')}.json`);
  writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(
    join(dir, 'latest.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  return file;
}

export function readLatestReceipts(ledgerDir) {
  const out = {};
  if (!existsSync(ledgerDir)) return out;
  for (const surface of readdirSync(ledgerDir)) {
    const latest = join(ledgerDir, surface, 'latest.json');
    if (existsSync(latest))
      out[surface] = JSON.parse(readFileSync(latest, 'utf8'));
  }
  return out;
}

/**
 * The single gate every consumer uses (certification, waitlist auto-accept,
 * outreach, screenshots to Tim, PR UI evidence). Fails closed.
 */
export function gateDecision({
  receipt,
  surface,
  resolved,
  now = Date.now(),
  maxAgeDays = 7,
  sourceSha = null,
  requireSignature = true,
  signingKey = process.env.DOGFOOD_JUDGE_SIGNING_KEY,
}) {
  if (!surface) return { allow: false, reasons: ['unknown-surface'] };
  const reasons = receiptStaleness(receipt, surface, resolved, {
    now,
    maxAgeDays,
  });
  if (receipt && receipt.verdict !== 'pass') reasons.push('judge-verdict-fail');
  if (receipt && !receipt.signoff?.nothingWrong)
    reasons.push('no-nothing-wrong-signoff');
  if (
    receipt &&
    requireSignature &&
    !verifyReceiptSignature(receipt, signingKey)
  )
    reasons.push('signature-invalid-or-missing');
  if (
    receipt &&
    sourceSha &&
    receipt.sourceSha &&
    receipt.sourceSha !== sourceSha
  ) {
    reasons.push(`source-sha-mismatch:${receipt.sourceSha}->${sourceSha}`);
  }
  return { allow: reasons.length === 0, reasons };
}

const SEVERITY_PRIORITY = { blocker: 'P0', major: 'P1', minor: 'P2' };

/**
 * Every finding becomes a remediation event. Blockers fast-track; all events
 * carry the re-judge trigger so the loop closes on the next deploy.
 * Output also matches the qa-swarm `findings.json` shape for the propose CLI.
 */
export function remediationEvents(receipt) {
  const criteria = new Map(CRITERIA.map(c => [c.id, c]));
  return receipt.steps.flatMap(step =>
    step.findings.map(finding => {
      const criterion = criteria.get(finding.criterion);
      return {
        schema: REMEDIATION_SCHEMA,
        eventId: `${receipt.runId}:${finding.id}`,
        dedupeKey:
          `${receipt.surface}:${step.id}:${finding.criterion}:${(finding.criterion === 'COLD' ? finding.detail : finding.evidence) ?? ''}`
            .toLowerCase()
            .replace(/\W+/gu, ' ')
            .trim()
            .slice(0, 120),
        surface: receipt.surface,
        stepId: step.id,
        criterion: finding.criterion,
        criterionTitle: criterion?.title ?? finding.criterion,
        asr: criterion?.asr ?? [],
        severity: finding.severity,
        priority: SEVERITY_PRIORITY[finding.severity],
        fastTrack: finding.severity === 'blocker',
        title: `${step.title}: ${finding.detail}`.slice(0, 120),
        evidence: finding.evidence,
        fix: finding.fix,
        at: {
          video: finding.video,
          t: finding.t,
          image: finding.imagePath,
          crop: finding.crop,
          bbox: finding.bbox,
        },
        closeLoop: {
          on: 'deploy',
          rerecord: receipt.surface,
          rejudge: `node scripts/dogfood-judge/cli.mjs judge --surface ${receipt.surface}`,
          passWhen: `no ${finding.criterion} finding on step ${step.id} at or above ${finding.severity}`,
        },
        // qa-swarm propose shape
        kind: 'taste',
        recipe: 'dogfood-judge',
        evidencePaths: [finding.crop, finding.imagePath].filter(Boolean),
      };
    })
  );
}

/**
 * Remediation events in the qa-swarm propose shape (recipe vision-critique):
 * `node scripts/qa-swarm/cli.mjs propose --recipe vision-critique --input <file>`
 * files one Linear issue + gbrain page per finding and writes a coder
 * remediation manifest for every P0 (blocker), deduped by dedupeKey.
 */
export function qaSwarmFindings(receipt, events = remediationEvents(receipt)) {
  // One proposed issue per failing step: the fix and the re-judge are per step,
  // and per-finding issues would bury the queue. Per-finding detail stays in
  // remediation.jsonl for machines.
  const order = { blocker: 0, major: 1, minor: 2 };
  const byStep = new Map();
  const seen = new Set();
  for (const event of events) {
    if (seen.has(event.dedupeKey)) continue;
    seen.add(event.dedupeKey);
    if (!byStep.has(event.stepId)) byStep.set(event.stepId, []);
    byStep.get(event.stepId).push(event);
  }
  return {
    findings: [...byStep.entries()].map(([stepId, list]) => {
      list.sort((a, b) => order[a.severity] - order[b.severity]);
      const step = receipt.steps.find(s => s.id === stepId);
      const blockers = list.filter(e => e.severity === 'blocker').length;
      const top = list
        .slice(0, 8)
        .map(
          e =>
            `- [${e.severity}] ${e.criterion} ${e.criterionTitle}: ${e.title.replace(/^[^:]+: /u, '')}${e.at.t == null ? '' : ` (@${e.at.t.toFixed(1)}s)`}. Fix: ${e.fix}`
        )
        .join('\n');
      return {
        id: `${receipt.runId}:${stepId}`,
        recipeId: 'vision-critique',
        title:
          `${receipt.surface} ${stepId} ${step?.title ?? ''}: ${list.length} judge finding(s), ${blockers} blocker(s)`.slice(
            0,
            120
          ),
        summary: `Dogfood judge (${receipt.rubricVersion}) failed step ${stepId}. ${step?.timQuote ?? ''}\n${top}${list.length > 8 ? `\n- and ${list.length - 8} more in remediation.jsonl` : ''}\nCloses when the re-recorded run passes this step after deploy: ${list[0].closeLoop.rejudge}`,
        priority: blockers ? 'P0' : 'P1',
        kind: blockers ? 'objective' : 'taste',
        evidencePaths: list.flatMap(e => e.evidencePaths).slice(0, 10),
        reproduction: list[0].closeLoop.rejudge,
        surface: receipt.surface,
      };
    }),
  };
}

/**
 * Sign a receipt (HMAC-SHA256 over its digest) so server gates can trust it.
 * Key: DOGFOOD_JUDGE_SIGNING_KEY (Doppler), id: DOGFOOD_JUDGE_SIGNING_KEY_ID.
 * Unsigned receipts never admit anyone.
 */
export function signReceipt(
  receipt,
  key = process.env.DOGFOOD_JUDGE_SIGNING_KEY,
  keyId = process.env.DOGFOOD_JUDGE_SIGNING_KEY_ID ?? 'default'
) {
  if (!key) return { ...receipt, signature: null };
  const value = createHmac('sha256', key).update(receipt.digest).digest('hex');
  return { ...receipt, signature: { alg: 'hmac-sha256', keyId, value } };
}

export function verifyReceiptSignature(
  receipt,
  key = process.env.DOGFOOD_JUDGE_SIGNING_KEY
) {
  if (
    !key ||
    !receipt?.signature?.value ||
    receipt.signature.alg !== 'hmac-sha256'
  )
    return false;
  const { signature, digest, ...body } = receipt;
  const recomputed = createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
  if (recomputed !== digest) return false;
  const expected = Buffer.from(
    createHmac('sha256', key).update(digest).digest('hex')
  );
  const actual = Buffer.from(String(signature.value));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Admission record for the waitlist gate and certification ledger
 * (jovie.dogfood-judge-admission/v1), stored in ovie_operating_kv under
 * jovie:certification:v1:dogfood-judge next to the other certification
 * receipts. Admission requires: signature valid, signoff.nothingWrong,
 * prodSha equal to the SHA being admitted, judgedAt within maxAgeDays.
 */
export function admissionRecord(receipt) {
  return {
    schema: 'jovie.dogfood-judge-admission/v1',
    subject: receipt.surface,
    runId: receipt.runId,
    prodSha: receipt.sourceSha,
    judgedAt: receipt.judgedAt,
    rubricVersion: receipt.rubricVersion,
    coldPassVersion: receipt.coldPassVersion,
    fingerprint: receipt.fingerprint,
    verdict: receipt.verdict,
    signoff: receipt.signoff,
    videos: receipt.videos.map(video => ({
      file: video.file,
      durationSec: video.durationSec,
    })),
    steps: receipt.steps.map(step => ({
      id: step.id,
      verdict: step.verdict,
      rubricVerdict: step.rubricVerdict,
      coldVerdict: step.coldVerdict,
      findings: step.findings.length,
    })),
    unjudgeable: receipt.unjudgeable.map(step => step.id),
    visualProof: visualProofReceipt(receipt),
    digest: receipt.digest,
    signature: receipt.signature ?? null,
  };
}
