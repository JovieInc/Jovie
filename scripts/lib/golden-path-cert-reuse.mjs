/**
 * Certify each served production build once (JOV-12639).
 *
 * Golden Path certification ran about 2.4 times per served SHA: every
 * superseded Production Controller completion and every 12 h clock tick
 * re-certified a build that already had a passing receipt. This module holds
 * the pure rule for when a prior receipt stands in for a new run:
 *
 * - only a fully certified receipt (every surface passed) counts;
 * - only for the exact 40-hex SHA production serves now;
 * - only when the same certification producer wrote it (producer digest);
 * - only while its oldest surface receipt is younger than REUSE_MAX_AGE_MS;
 * - never a receipt that was itself reused, and never when forced.
 *
 * REUSE_MAX_AGE_MS keeps the 12 h clock honest: consumers need every surface
 * green within 24 h (certificationVerdict), so a receipt reused at age 11 h is
 * at most ~23 h old when the next tick re-certifies it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { certificationVerdict, SURFACE_IDS } from './prod-cert.mjs';

export const CERT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CLOCK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CLOCK_MARGIN_MS = 60 * 60 * 1000;
export const REUSE_MAX_AGE_MS =
  CERT_MAX_AGE_MS - CLOCK_INTERVAL_MS - CLOCK_MARGIN_MS;
// A receipt timestamped ahead of the runner clock by more than this is bogus.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const STAMP_SCHEMA = 'jovie.prod-cert-certified/v1';
export const REUSE_SCHEMA = 'jovie.prod-cert-reuse/v1';
export const WORKFLOW_PATH = '.github/workflows/postdeploy-probes.yml';
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;

/** Exact-name artifact namespace: one per served SHA, many runs. */
export function certifiedArtifactName(servedSha) {
  if (!SHA.test(String(servedSha)))
    throw new Error('served SHA must be 40 lowercase hex');
  return `prod-cert-certified-${servedSha}`;
}

// Entry points whose relative-import closure decides a certification.
export const PRODUCER_ENTRIES = Object.freeze([
  'scripts/prod-cert.mjs',
  'scripts/golden-path-cert-reuse.mjs',
  'scripts/invariants/pen-golden-path.mjs',
  'scripts/invariants/pen-still-diff.mjs',
  'scripts/lib/golden-path-cert-reuse.mjs',
]);
// Data and policy files the closure reads rather than imports.
export const PRODUCER_DATA = Object.freeze([
  'docs/pen-stills/golden-path/manifest.json',
  WORKFLOW_PATH,
]);
const RELATIVE_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/gu;

/**
 * Sorted repo-relative files of the certification producer: the entries, every
 * module they reach by relative import, and the data files.
 * @param {string} root
 * @returns {string[]}
 */
export function producerFiles(root) {
  const seen = new Set();
  const visit = (/** @type {string} */ file) => {
    if (seen.has(file) || !existsSync(join(root, file))) return;
    seen.add(file);
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(RELATIVE_IMPORT)) {
      const next = normalize(
        relative(root, join(root, dirname(file), match[1]))
      );
      if (/\.(?:mjs|js|cjs|json)$/u.test(next) && !next.startsWith('..'))
        visit(next);
    }
  };
  for (const entry of PRODUCER_ENTRIES) visit(entry);
  for (const file of PRODUCER_DATA)
    if (existsSync(join(root, file))) seen.add(file);
  return [...seen].sort();
}

/**
 * One digest over the producer files' paths and contents. A receipt written
 * by other certification code never stands in for this code's verdict.
 * @param {string} root
 */
export function producerDigest(root) {
  const hash = createHash('sha256');
  for (const file of producerFiles(root)) {
    const body = createHash('sha256')
      .update(readFileSync(join(root, file)))
      .digest('hex');
    hash.update(`${file}\0${body}\n`);
  }
  return hash.digest('hex');
}

/**
 * @typedef {{ schema?: string, servedSha?: string, runId?: number, producerDigest?: string }} CertStamp
 * @typedef {{ servedSha?: string, receipts?: any[], reuse?: unknown }} ReceiptDocument
 * @typedef {{ path?: string, head_branch?: string, head_repository?: { full_name?: string } }} RunRecord
 * @typedef {{ runId: number, runUrl?: string, artifactId: number, run?: RunRecord, stamp?: CertStamp, document?: ReceiptDocument }} ReuseCandidate
 * @typedef {{ reuse: boolean, reason: string, source?: ReuseCandidate & { certifiedAt: string, ageMs: number }, rejected: { runId: number, why: string }[] }} ReuseDecision
 */

/**
 * Why a candidate cannot stand in for a new certification, or null.
 * @param {ReuseCandidate} candidate
 * @param {{ servedSha: string, repository: string, producerDigest: string, nowMs: number, maxAgeMs: number }} expected
 * @returns {{ why: string } | { certifiedAt: string, ageMs: number }}
 */
export function judgeCandidate(candidate, expected) {
  const { run, stamp, document } = candidate;
  if (
    run?.path !== WORKFLOW_PATH ||
    run?.head_branch !== 'main' ||
    run?.head_repository?.full_name !== expected.repository
  )
    return { why: 'not a main post-deploy probes run' };
  if (stamp?.schema !== STAMP_SCHEMA || stamp.runId !== candidate.runId)
    return { why: 'no certified stamp from that run' };
  if (stamp.servedSha !== expected.servedSha)
    return { why: 'stamp is for another SHA' };
  if (stamp.producerDigest !== expected.producerDigest)
    return { why: 'certified by other certification code' };
  if (!document || document.reuse !== undefined)
    return { why: 'receipt was itself reused' };
  if (document.servedSha !== expected.servedSha)
    return { why: 'receipt is for another SHA' };
  const receipts = Array.isArray(document.receipts) ? document.receipts : [];
  const surfaces = receipts.map(r => r?.surface);
  if (
    receipts.length !== SURFACE_IDS.length ||
    new Set(surfaces).size !== SURFACE_IDS.length ||
    !SURFACE_IDS.every(id => surfaces.includes(id))
  )
    return { why: 'receipt does not cover every surface exactly once' };
  if (receipts.some(r => r.status !== 'passed' || r.sha !== expected.servedSha))
    return { why: 'not every surface passed on this SHA' };
  const ended = receipts.map(r => Date.parse(r.endedAt));
  if (
    ended.some(
      ms => !Number.isFinite(ms) || ms > expected.nowMs + CLOCK_SKEW_MS
    )
  )
    return { why: 'receipt time is missing or in the future' };
  const oldest = Math.min(...ended);
  const ageMs = expected.nowMs - oldest;
  if (ageMs > expected.maxAgeMs) return { why: 'receipt is stale' };
  // The verdict is release-bound (JOV-14402); the age check above is reuse's own.
  const verdict = certificationVerdict(receipts, {
    servedSha: expected.servedSha,
  });
  if (!verdict.certified) return { why: 'certification verdict is not green' };
  return { certifiedAt: new Date(oldest).toISOString(), ageMs };
}

/**
 * Reuse the newest candidate that passes every rule; otherwise certify.
 * @param {{ servedSha: string, repository: string, producerDigest: string, force?: boolean, nowMs?: number, maxAgeMs?: number, candidates?: ReuseCandidate[] }} input
 * @returns {ReuseDecision}
 */
export function decideCertReuse({
  servedSha,
  repository,
  producerDigest,
  force = false,
  nowMs = Date.now(),
  maxAgeMs = REUSE_MAX_AGE_MS,
  candidates = [],
}) {
  if (force) return { reuse: false, reason: 'forced', rejected: [] };
  if (!SHA.test(String(servedSha)))
    return { reuse: false, reason: 'no exact served SHA', rejected: [] };
  if (!DIGEST.test(String(producerDigest)))
    return { reuse: false, reason: 'no producer digest', rejected: [] };
  const rejected = [];
  const ordered = [...candidates].sort((a, b) => b.runId - a.runId);
  for (const candidate of ordered) {
    const judged = judgeCandidate(candidate, {
      servedSha,
      repository,
      producerDigest,
      nowMs,
      maxAgeMs,
    });
    if ('why' in judged) {
      rejected.push({ runId: candidate.runId, why: judged.why });
      continue;
    }
    return {
      reuse: true,
      reason: 'fresh certified receipt for the served SHA',
      source: { ...candidate, ...judged },
      rejected,
    };
  }
  return {
    reuse: false,
    reason: 'no fresh certified receipt for the served SHA',
    rejected,
  };
}

/**
 * The receipts file a reusing run uploads: the source receipts unchanged
 * (each keeps its own runUrl and times) plus a reuse block naming the run.
 * @param {ReuseDecision} decision
 * @param {{ runId: number, runUrl?: string | null, nowMs?: number, maxAgeMs?: number }} by
 */
export function reusedReceiptDocument(
  decision,
  { runId, runUrl = null, nowMs = Date.now(), maxAgeMs = REUSE_MAX_AGE_MS }
) {
  const source = decision.source;
  if (!decision.reuse || !source?.document)
    throw new Error('only a reuse decision has a reused receipt');
  return {
    ...source.document,
    reuse: {
      schema: REUSE_SCHEMA,
      reused: true,
      fromRunId: source.runId,
      fromRunUrl: source.runUrl ?? null,
      fromArtifactId: source.artifactId,
      certifiedAt: source.certifiedAt,
      ageMs: source.ageMs,
      maxAgeMs,
      decidedAt: new Date(nowMs).toISOString(),
      decidedByRunId: runId,
      decidedByRunUrl: runUrl,
      note: 'No new certification ran. These receipts are the source run’s, unchanged, and were not posted to the ledger again.',
    },
  };
}

/**
 * The stamp a certifying run uploads beside its receipts, only when every
 * surface passed on the expected SHA. Returns null otherwise.
 * @param {ReceiptDocument} document
 * @param {{ expectedSha: string, runId: number, producerDigest: string, nowMs?: number }} input
 */
export function certifiedStamp(
  document,
  { expectedSha, runId, producerDigest, nowMs = Date.now() }
) {
  if (
    !SHA.test(String(expectedSha)) ||
    !DIGEST.test(String(producerDigest)) ||
    document?.servedSha !== expectedSha ||
    document.reuse !== undefined
  )
    return null;
  const verdict = certificationVerdict(document.receipts ?? [], {
    servedSha: expectedSha,
  });
  if (!verdict.certified) return null;
  return {
    schema: STAMP_SCHEMA,
    servedSha: expectedSha,
    runId,
    producerDigest,
    stampedAt: new Date(nowMs).toISOString(),
  };
}
