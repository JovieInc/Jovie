#!/usr/bin/env node
/**
 * Production golden-path certification run (JOV-9625).
 *
 *   node scripts/prod-cert.mjs [--origin https://jov.ie] [--steps steps.json]
 *     [--out receipts.json] [--post] [--file-issues]
 *
 * Reads the served build, probes every golden-path surface on production,
 * folds in the browser steps from the post-deploy Playwright run, writes one
 * SHA-bound receipt per surface, posts them to the Ovie certification ledger
 * (CRON_SECRET) and files or closes one owned Linear issue per failing
 * surface (deduped by fingerprint). Exit 1 when any surface failed; blocked
 * surfaces are reported, not failed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  closeLinearIssueByFingerprint,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  certificationVerdict,
  runProductionCertification,
} from './lib/prod-cert.mjs';

export function surfaceFingerprint(surface) {
  return `prod-cert-${surface}`;
}

/**
 * @param {any[]} receipts
 * @param {{ runUrl?: string, deps?: { upsert?: Function, close?: Function } }} [options]
 */
export async function fileSurfaceIssues(receipts, { runUrl, deps = {} } = {}) {
  const upsert = deps.upsert ?? upsertLinearIssueByTitleFingerprint;
  const close = deps.close ?? closeLinearIssueByFingerprint;
  const results = [];
  for (const receipt of receipts) {
    const fingerprint = surfaceFingerprint(receipt.surface);
    if (receipt.status === 'failed') {
      const failed = receipt.checks.filter(c => c.status === 'failed');
      const result = await upsert({
        fingerprint,
        labelKey: fingerprint,
        title: `Golden path broken on production: ${receipt.surface}`,
        description: `## Source
Production golden-path certification (JOV-9625), served build \`${receipt.sha}\`.

## Failed checks
${failed.map(c => `- \`${c.id}\`: ${c.summary}`).join('\n')}

## Why it matters
This surface is on the certified launch path. The receipt is bound to the exact deployed SHA.

## Acceptance criteria or triage question
The next production certification run passes every check for \`${receipt.surface}\`; this issue closes itself then.

Run: ${runUrl ?? 'n/a'}`,
        priority: 1,
        reopenTerminal: true,
      });
      results.push({
        surface: receipt.surface,
        action: 'upsert',
        ok: result.ok,
        reason: result.reason,
      });
    } else if (receipt.status === 'passed') {
      const result = await close({
        fingerprint,
        labelKey: fingerprint,
        comment: `Production golden path passed for ${receipt.surface} on ${receipt.sha.slice(0, 8)}.`,
        runId: process.env.GITHUB_RUN_ID,
      });
      results.push({
        surface: receipt.surface,
        action: 'close',
        ok: result.ok,
        reason: result.reason,
      });
    }
  }
  return results;
}

export const OVERALL_FINGERPRINT = 'prod-cert-overall';

/**
 * One owned Linear issue for the whole golden path (JOV-9822): open while any
 * surface is not green on the served SHA, closed when all eight are. Summer
 * picks it up from the Launch project; per-surface issues carry the detail.
 * @param {ReturnType<typeof certificationVerdict>} verdict
 * @param {{ runUrl?: string | null, deps?: { upsert?: Function, close?: Function } }} [options]
 */
export async function fileOverallIssue(verdict, { runUrl, deps = {} } = {}) {
  const upsert = deps.upsert ?? upsertLinearIssueByTitleFingerprint;
  const close = deps.close ?? closeLinearIssueByFingerprint;
  const sha = verdict.servedSha.slice(0, 8);
  if (verdict.certified) {
    return close({
      fingerprint: OVERALL_FINGERPRINT,
      labelKey: OVERALL_FINGERPRINT,
      comment: `All 8 golden-path surfaces passed on production ${sha}.`,
      runId: process.env.GITHUB_RUN_ID,
    });
  }
  return upsert({
    fingerprint: OVERALL_FINGERPRINT,
    labelKey: OVERALL_FINGERPRINT,
    title: 'Production golden path is not certified',
    description: `## Source
Production golden-path certification (JOV-9822), served build \`${verdict.servedSha}\`.

## Not green
${verdict.notGreen.map(n => `- \`${n.surface}\`: ${n.why}`).join('\n')}

## Why it matters
The recovery email gate, agent-marketplace readiness and launch certification all require every surface to pass on the current production SHA within 24h.

## Acceptance criteria or triage question
A production certification run passes all eight surfaces on the served SHA; this issue closes itself then.

Run: ${runUrl ?? 'n/a'}`,
    priority: 1,
    reopenTerminal: true,
  });
}

// Evidence-only receipt fields (JOV-9625): verdict-neutral extras that a
// ledger predating the field rejects under its strict zod schema. Stripping
// them on a schema-skew repost never changes a surface verdict, and the full
// receipts (readback included) stay in the --out file.
export const EVIDENCE_ONLY_RECEIPT_KEYS = Object.freeze([
  'adminInventoryReadback',
]);

export function stripEvidenceOnlyKeys(
  receipts,
  keys = EVIDENCE_ONLY_RECEIPT_KEYS
) {
  return receipts.map(receipt => {
    const copy = { ...receipt };
    for (const key of keys) delete copy[key];
    return copy;
  });
}

export async function postReceipts(receipts, origin) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is not set; cannot post receipts');
  const send = async body => {
    const response = await fetch(
      new URL('/api/internal/ovie/golden-path-evidence', origin),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ receipts: body }),
      }
    );
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  };
  let result = await send(receipts);
  // Deploy skew (JOV-9822 producer vs a frozen promotion): the served build's
  // ledger schema can predate an evidence-only field, which its strict schema
  // rejects. Repost once without that field — verdict-bearing receipts are
  // byte-identical, and the readback stays in the receipts file for the run
  // log. Anything else still fails loudly with the original body.
  if (
    !result.ok &&
    result.status === 400 &&
    result.text.includes('invalid_receipts') &&
    EVIDENCE_ONLY_RECEIPT_KEYS.some(key => result.text.includes(key))
  ) {
    console.error(
      `ledger on the served build predates evidence-only receipt keys (${EVIDENCE_ONLY_RECEIPT_KEYS.join(', ')}); reposting without them — surface verdicts unchanged, the field stays in the receipts file`
    );
    result = await send(stripEvidenceOnlyKeys(receipts));
  }
  if (!result.ok)
    throw new Error(
      `ledger POST HTTP ${result.status}: ${result.text.slice(0, 300)}`
    );
  return JSON.parse(result.text);
}

async function main() {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string', default: 'https://jov.ie' },
      steps: { type: 'string' },
      out: { type: 'string', default: 'prod-cert-receipts.json' },
      post: { type: 'boolean', default: false },
      'file-issues': { type: 'boolean', default: false },
    },
  });
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
  let steps = [];
  if (values.steps) {
    try {
      steps = JSON.parse(readFileSync(values.steps, 'utf8'));
    } catch {
      steps = [];
    }
  }
  const { served, receipts } = await runProductionCertification({
    origin: values.origin,
    steps,
    authStatus: process.env.AUTH_SMOKE_STATUS || 'unknown',
    expectedSha: process.env.EXPECTED_COMMIT_SHA || null,
    profileHandle: process.env.PROD_CERT_PROFILE_HANDLE || 'tim',
    runUrl,
  });
  writeFileSync(
    values.out,
    `${JSON.stringify({ servedSha: served.sha, receipts }, null, 2)}\n`
  );
  for (const r of receipts) {
    console.log(
      `${r.status.padEnd(7)} ${r.surface.padEnd(15)} ${r.sha.slice(0, 8)}  ${
        r.blocker ??
        r.checks
          .filter(c => c.status === 'failed')
          .map(c => c.id)
          .join(',')
      }`
    );
  }
  const verdict = certificationVerdict(receipts, { servedSha: served.sha });
  console.log(
    verdict.certified
      ? `certified: all surfaces passed on ${served.sha}`
      : `not certified on ${served.sha}: ${verdict.notGreen.map(n => `${n.surface} (${n.why})`).join(', ')}`
  );
  if (values['file-issues'] && remediationTriggersEnabled()) {
    console.log(JSON.stringify(await fileSurfaceIssues(receipts, { runUrl })));
    console.log(JSON.stringify(await fileOverallIssue(verdict, { runUrl })));
  }
  if (values.post)
    console.log(JSON.stringify(await postReceipts(receipts, values.origin)));
  if (receipts.some(r => r.status === 'failed')) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
