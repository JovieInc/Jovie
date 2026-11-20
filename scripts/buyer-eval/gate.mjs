#!/usr/bin/env node
// "Ready to send to this user" gate. Pure decision plus a CLI over the
// private receipt store. Fails closed on anything missing, stale or unclear.
// It never sends anything: `ready` means "ask Tim", not "send".
//
// Ready requires ALL of:
//   1. golden-path certification allows this SHA: the dogfood-judge
//      gateDecision() output ({allow, reasons}) from the certification agent;
//   2. calibration holds: >= MIN_HOLDOUTS known-bad holdouts judged with the
//      current rubric, every one no_pay, AND at least one positive canary
//      (--holdout --expect pay) that comes out pay;
//   3. the user's OWN walk (walk subject == subject) on the same SHA has a
//      strong-tier `pay` verdict that clears the ready hysteresis;
//   4. the ICP controls still come out no_pay on that SHA (a judge that says
//      pay to the off-ICP control is sycophantic, so its yes means nothing);
//   5. every REQUIRED_PERSONAS buyer says pay on that SHA, ratcheted: a
//      persona is report-only (an advisory) until it has passed RATCHET_PASSES
//      times in a row, then it enforces for good.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { holdoutHolds, RUBRIC_VERSION, readyFlag } from './rubric.mjs';

export const MIN_HOLDOUTS = 3;
export const REQUIRED_PERSONAS = Object.freeze(['heritage-rock-manager']);
export const RATCHET_PASSES = 3;

/**
 * Report-only until `RATCHET_PASSES` consecutive pay verdicts on the current
 * rubric (oldest first), then enforcing forever: a later fail does not
 * demote it.
 */
export function personaRatchet(receipts, personaId) {
  const rows = receipts.filter(
    row =>
      row.rubric === RUBRIC_VERSION &&
      !row.holdout &&
      row.persona?.id === personaId
  );
  let streak = 0;
  for (const row of rows) {
    streak = row.verdict === 'pay' ? streak + 1 : 0;
    if (streak >= RATCHET_PASSES) return 'enforce';
  }
  return 'report';
}
export const MAX_AGE_DAYS = 3;

export function readReceipts(stateDir) {
  const dir = join(stateDir, 'receipts');
  let names = [];
  try {
    names = readdirSync(dir).filter(name => name.endsWith('.json'));
  } catch {
    return [];
  }
  return names
    .map(name => {
      try {
        return JSON.parse(readFileSync(join(dir, name), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * @param {{ subject: string, sha: string, receipts: any[], cert: { allow: boolean, reasons?: string[] } | null, wasReady?: boolean, now?: number }} input
 */
export function buyerReady({
  subject,
  sha,
  receipts,
  cert,
  wasReady = false,
  now = Date.now(),
}) {
  const reasons = [];
  if (!sha) reasons.push('no-sha');
  if (!cert) reasons.push('golden-path-cert-missing');
  else if (!cert.allow) {
    reasons.push(
      `golden-path-cert-blocked:${(cert.reasons ?? []).join('|') || 'unknown'}`
    );
  }

  const current = receipts.filter(row => row.rubric === RUBRIC_VERSION);
  const holdouts = current.filter(
    row => row.holdout && row.persona?.tier === 'A' && row.expect !== 'pay'
  );
  // Without a positive canary a judge that always says no is indistinguishable
  // from a product nobody would buy (adversarial review #2/#3); never open.
  const positives = current.filter(row => row.holdout && row.expect === 'pay');
  if (positives.length === 0) reasons.push('calibration-no-positive-canary');
  for (const row of positives) {
    if (!row.holdoutHolds)
      reasons.push(`calibration-positive-missed:${row.subject}`);
  }
  if (holdouts.length < MIN_HOLDOUTS) {
    reasons.push(
      `calibration-insufficient:${holdouts.length}/${MIN_HOLDOUTS} holdouts on ${RUBRIC_VERSION}`
    );
  }
  for (const row of holdouts) {
    const held = row.holdoutHolds ?? holdoutHolds(row);
    if (!held) reasons.push(`calibration-failed:${row.subject}`);
  }

  const onSha = current.filter(row => row.sha === sha && !row.holdout);
  const controls = onSha.filter(row => row.persona?.control);
  if (controls.length === 0) reasons.push('control-not-run-on-sha');
  if (controls.some(row => row.verdict === 'pay'))
    reasons.push('control-said-pay:judge-untrusted');

  const advisories = [];
  for (const personaId of REQUIRED_PERSONAS) {
    const row = onSha.filter(r => r.persona?.id === personaId).at(-1);
    const miss = !row
      ? `persona-not-run-on-sha:${personaId}`
      : row.verdict !== 'pay'
        ? `persona-verdict:${personaId}:${row.verdict}(p=${row.pPay})`
        : null;
    if (!miss) continue;
    if (personaRatchet(receipts, personaId) === 'enforce') reasons.push(miss);
    else advisories.push(`report-only:${miss}`);
  }

  const own = onSha
    .filter(row => row.subject === subject && row.walkSubject === subject)
    .at(-1);
  if (!own) {
    reasons.push('no-own-walk-receipt-on-sha');
  } else {
    const ageDays = (now - Date.parse(own.at)) / 86_400_000;
    if (ageDays > MAX_AGE_DAYS)
      reasons.push(`receipt-stale:${ageDays.toFixed(1)}d`);
    if (!own.strong) reasons.push('strong-tier-not-run');
    if (own.verdict !== 'pay')
      reasons.push(`buyer-verdict:${own.verdict}(p=${own.pPay})`);
    else if (!readyFlag({ verdict: own.verdict, pPay: own.pPay }, wasReady)) {
      reasons.push(`below-ready-hysteresis(p=${own.pPay})`);
    }
  }
  return {
    ready: reasons.length === 0,
    next: reasons.length === 0 ? 'ask-tim' : 'keep-cooking',
    reasons,
    advisories,
    receipt: own?.id ?? null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [subject, sha, certPath] = process.argv.slice(2);
  const { STATE } = await import('./run.mjs');
  let cert = null;
  try {
    cert = certPath ? JSON.parse(readFileSync(certPath, 'utf8')) : null;
  } catch {
    cert = null;
  }
  const decision = buyerReady({
    subject,
    sha,
    receipts: readReceipts(STATE),
    cert,
  });
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  process.exit(decision.ready ? 0 : 1);
}
