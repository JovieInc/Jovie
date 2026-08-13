/**
 * Deterministic pre-lease research boundary (symphony-research/v1).
 *
 * Before model routing and lease, every issue is classified deterministically:
 * - `not-required` with an explicit rationale for purely local, mechanical
 *   work, or
 * - `required` with bounded primary-source queries, dated citations, and
 *   findings.
 *
 * The classification and evidence are bound to one stable receipt comment.
 * Receipts are reconstructed semantically from the current issue and a
 * freshness window; stale citations, forged classifications, and mismatched
 * evidence are rejected.
 */

import { createHash } from 'node:crypto';
import { issueContentHash } from './context-gate.mjs';

export const RESEARCH_GATE_SCHEMA = 'symphony-research/v1';
export const RESEARCH_GATE_PREFIX = '<!-- symphony-research/v1 -->';
export const RESEARCH_GATE_SUFFIX = '<!--/symphony-research-->';
export const RESEARCH_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CITATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_RESEARCH_QUERIES = 3;

/**
 * Primary-source kinds accepted as research citations. Secondary commentary
 * (blogs, forums, social posts) is not authoritative grounding for model
 * routing.
 */
export const CITATION_SOURCE_KINDS = Object.freeze([
  'official-documentation',
  'api-reference',
  'changelog',
  'release-notes',
  'migration-guide',
  'upgrade-guide',
  'vendor-policy',
  'rfc',
]);

/**
 * External/primary-source signals. Matching any of these means the issue
 * depends on facts outside the repository, so model routing must be grounded
 * in dated primary-source citations rather than stale memory.
 */
const RESEARCH_REQUIRED_PATTERN =
  /https?:\/\/|dependenc|npm\s|pnpm\s|package version|third[- ]party|vendor|\bsdk\b|external api|api deprecat|breaking change|upgrade guide|migration guide|changelog|release notes|app store|play store|store review|legal|compliance|pricing|rate limit/i;

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sorted(value[key])])
    );
  }
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyList(value) {
  return (
    Array.isArray(value) && value.length > 0 && value.every(nonEmptyString)
  );
}

function commentsOf(issue) {
  return issue?.comments?.nodes || issue?.comments || [];
}

function commentBody(comment) {
  return typeof comment === 'string' ? comment : comment?.body || '';
}

function isFreshTimestamp(value, nowMs, maxAgeMs) {
  const observedMs = Date.parse(value || '');
  return (
    Number.isFinite(observedMs) &&
    observedMs <= nowMs + 60_000 &&
    nowMs - observedMs <= maxAgeMs
  );
}

function significantTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
  );
}

/** Deterministic research classifier. No model calls. */
export function classifyResearchNeed(issue) {
  const text = `${issue?.title || ''}\n${issue?.description || ''}`;
  const match = RESEARCH_REQUIRED_PATTERN.exec(text);
  if (match) {
    return {
      decision: 'required',
      rationale: `external or primary-source signal detected ("${match[0]}"); bounded primary-source research with dated citations is required before model routing and lease`,
    };
  }
  return {
    decision: 'not-required',
    rationale:
      'purely local, mechanical work inside this repository; no external dependency, vendor API, policy, or store surface is involved',
  };
}

function keyTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 6)
    .join(' ');
}

/** Bounded primary-source queries for research-required issues. */
export function buildResearchQueries(issue) {
  const terms = keyTerms(issue?.title) || String(issue?.identifier || '');
  return [
    `${terms} official documentation`,
    `${terms} changelog or release notes`,
  ].slice(0, MAX_RESEARCH_QUERIES);
}

/**
 * Semantically revalidate research evidence against the current issue, the
 * deterministic classification, and the freshness windows. Returns a stable
 * reason string, or null when the evidence is valid.
 */
export function validateResearchEvidence(
  issue,
  evidence,
  {
    now = new Date().toISOString(),
    maxAgeMs = RESEARCH_RECEIPT_MAX_AGE_MS,
    citationMaxAgeMs = CITATION_MAX_AGE_MS,
  } = {}
) {
  if (!evidence || typeof evidence !== 'object') return 'research-malformed';
  if (evidence.issue !== issue?.identifier) return 'research-issue-mismatch';
  if (evidence.issueHash !== issueContentHash(issue))
    return 'research-issue-mismatch';

  const expected = classifyResearchNeed(issue);
  if (evidence.classification !== expected.decision)
    return 'research-classification-mismatch';
  if (!nonEmptyString(evidence.rationale)) return 'research-rationale-missing';

  const nowMs = Date.parse(now);
  if (!isFreshTimestamp(evidence.observedAt, nowMs, maxAgeMs))
    return 'research-stale';

  if (expected.decision === 'not-required') return null;

  // classification === 'required'
  if (
    !nonEmptyList(evidence.queries) ||
    evidence.queries.length > MAX_RESEARCH_QUERIES
  )
    return 'research-queries-missing';
  if (!Array.isArray(evidence.citations) || evidence.citations.length === 0)
    return 'research-citation-missing';
  // Citations must be dated, primary-source, and semantically bound to the
  // issue: an arbitrary fresh URL is not research evidence.
  const bindingTokens = significantTokens(
    [issue?.title || '', ...buildResearchQueries(issue)].join(' ')
  );
  for (const citation of evidence.citations) {
    if (!nonEmptyString(citation?.url) || !citation.url.startsWith('https://'))
      return 'research-citation-invalid';
    if (
      !nonEmptyString(citation?.title) ||
      !CITATION_SOURCE_KINDS.includes(citation?.sourceKind)
    )
      return 'research-citation-invalid';
    if (!isFreshTimestamp(citation?.accessedAt, nowMs, citationMaxAgeMs))
      return 'research-citation-stale';
    const citationTokens = significantTokens(
      `${citation.url} ${citation.title}`
    );
    if (![...citationTokens].some(token => bindingTokens.has(token)))
      return 'research-citation-unbound';
  }
  if (!nonEmptyList(evidence.findings)) return 'research-findings-missing';
  return null;
}

function normalizedEvidence(evidence) {
  return sorted({
    issue: evidence.issue.trim(),
    issueHash: evidence.issueHash.trim(),
    classification: evidence.classification.trim(),
    rationale: evidence.rationale.trim(),
    queries: (evidence.queries || []).map(query => query.trim()),
    citations: (evidence.citations || []).map(citation => ({
      url: citation.url.trim(),
      title: nonEmptyString(citation.title) ? citation.title.trim() : '',
      sourceKind: nonEmptyString(citation.sourceKind)
        ? citation.sourceKind.trim()
        : '',
      accessedAt: citation.accessedAt.trim(),
    })),
    findings: (evidence.findings || []).map(finding => finding.trim()),
    observedAt: evidence.observedAt.trim(),
  });
}

export function researchGateFingerprint(issue, evidence) {
  const canonical = JSON.stringify(
    sorted({ issue: issue.identifier, evidence: normalizedEvidence(evidence) })
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function buildResearchGateReceipt(issue, evidence) {
  const payload = {
    schema: RESEARCH_GATE_SCHEMA,
    issue: issue.identifier,
    fingerprint: researchGateFingerprint(issue, evidence),
    evidence: normalizedEvidence(evidence),
  };
  return `${RESEARCH_GATE_PREFIX}\n${JSON.stringify(payload)}\n${RESEARCH_GATE_SUFFIX}`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment => commentBody(comment) === receipt);
}

/**
 * Reconstruct the research receipt from the issue's comments and revalidate it
 * semantically. Returns null for missing, stale, forged, or mismatched
 * receipts.
 */
export function researchGateReceipt(issue, options = {}) {
  const body = commentsOf(issue)
    .map(commentBody)
    .find(
      value =>
        value.startsWith(`${RESEARCH_GATE_PREFIX}\n`) &&
        value.endsWith(`\n${RESEARCH_GATE_SUFFIX}`)
    );
  if (!body) return null;
  try {
    const payload = JSON.parse(
      body.slice(
        `${RESEARCH_GATE_PREFIX}\n`.length,
        -`\n${RESEARCH_GATE_SUFFIX}`.length
      )
    );
    if (
      payload?.schema !== RESEARCH_GATE_SCHEMA ||
      payload?.issue !== issue?.identifier ||
      !payload?.fingerprint ||
      !payload?.evidence ||
      validateResearchEvidence(issue, payload.evidence, options) ||
      researchGateFingerprint(issue, payload.evidence) !== payload.fingerprint
    )
      return null;
    return { body, payload };
  } catch {
    return null;
  }
}

function mutationSucceeded(result) {
  return (
    result?.success === true ||
    result?.commentCreate?.success === true ||
    result?.issueUpdate?.success === true
  );
}

/**
 * Write exactly one research receipt, or return a typed rejection. Every
 * mutation is verified by an authoritative reread.
 */
export async function approveResearch({
  issue,
  evidence,
  client,
  now = new Date().toISOString(),
}) {
  const invalid = validateResearchEvidence(issue, evidence, { now });
  if (invalid) return { status: 'rejected', reason: invalid };

  const receipt = buildResearchGateReceipt(issue, evidence);
  if (hasReceipt(issue, receipt)) {
    return {
      status: 'already-approved',
      identifier: issue.identifier,
      fingerprint: researchGateFingerprint(issue, evidence),
      receipt,
    };
  }

  const result = await client.addComment(issue.id, receipt);
  if (!mutationSucceeded(result))
    throw new Error('research-gate-receipt-mutation-failed');
  const reread = await client.fetchIssue(issue.identifier);
  if (!reread || !hasReceipt(reread, receipt))
    throw new Error('research-gate-receipt-verification-failed');

  return {
    status: 'approved',
    identifier: reread.identifier,
    fingerprint: researchGateFingerprint(issue, evidence),
    receipt,
  };
}
