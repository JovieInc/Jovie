/**
 * Verified pre-lease GBrain context boundary (symphony-context/v1).
 *
 * Before plan or admission approval, the orchestrator must query the canonical
 * agent org chart plus targeted ownership/current-priorities context and bind
 * the consulted GBrain page IDs and revisions to one stable receipt comment.
 * An unreachable GBrain is a typed system-blocker before lease — never a
 * silent skip. Receipts are reconstructed semantically from the current issue,
 * the expected ownership roles, and a freshness window; stale, forged, or
 * mismatched receipts are rejected.
 *
 * Ownership roles are explicit and consistent everywhere:
 * - Symphony owns implementation through draft PR / In Review.
 * - Gem + GitHub own verification, queue, merge, deploy, and production
 *   receipts.
 */

import { createHash } from 'node:crypto';

export const CONTEXT_GATE_SCHEMA = 'symphony-context/v1';
export const CONTEXT_GATE_PREFIX = '<!-- symphony-context/v1 -->';
export const CONTEXT_GATE_SUFFIX = '<!--/symphony-context-->';
export const ORG_CHART_SLUG = 'agent-org-chart';
export const CONTEXT_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_CONTEXT_PAGES_PER_QUERY = 3;

export const IMPLEMENTATION_OWNER = 'Symphony';
export const VERIFICATION_OWNER = 'Gem';
export const EXPECTED_OWNERSHIP = Object.freeze({
  implementation: IMPLEMENTATION_OWNER,
  verification: VERIFICATION_OWNER,
});

/** Typed pre-lease system-blocker codes. */
export const CONTEXT_BLOCKER = Object.freeze({
  GBRAIN_UNAVAILABLE: 'gbrain-unavailable',
  ORG_CHART_MISSING: 'org-chart-missing',
  OWNERSHIP_CONFLICT: 'ownership-conflict',
});

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

/**
 * Content binding for the current issue prose. Deliberately excludes labels
 * and comments: gate mutations add both, and must not invalidate a receipt
 * that was correctly bound to the issue statement.
 */
export function issueContentHash(issue) {
  const canonical = [
    issue?.identifier || '',
    (issue?.title || '').trim(),
    (issue?.description || '').trim(),
  ].join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

function keyTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 8)
    .join(' ');
}

/** The bounded, deterministic pre-lease context queries for an issue. */
export function buildContextQueries(issue) {
  const terms = keyTerms(issue?.title) || String(issue?.identifier || '');
  return [
    `ownership and current priorities for ${terms}`,
    `existing agent work and prior decisions related to ${terms}`,
  ];
}

/**
 * Normalize a GBrain page into a bindable reference. A page without a slug,
 * canonical ID, and revision cannot be bound and returns null.
 */
export function boundPage(page) {
  if (!page || typeof page !== 'object') return null;
  const revision =
    page.revision ||
    page.contentHash ||
    page.content_hash ||
    page.version ||
    page.updatedAt ||
    page.updated_at;
  if (!nonEmptyString(page.slug) || page.id === undefined || page.id === null)
    return null;
  if (!nonEmptyString(String(revision))) return null;
  return { slug: page.slug, id: String(page.id), revision: String(revision) };
}

/**
 * Deterministic ownership-conflict check: when the org chart explicitly
 * declares an implementation owner other than Symphony, the context evidence
 * contradicts the fleet ownership contract and must block the lease.
 */
function declaredImplementationOwner(orgChart) {
  const truth = `${orgChart?.compiledTruth || ''} ${orgChart?.compiled_truth || ''} ${orgChart?.body || ''}`;
  const match = /implementation\s+owner\s*[:=]\s*([A-Za-z][A-Za-z-]*)/i.exec(
    truth
  );
  return match ? match[1] : null;
}

/**
 * Collect and bind the pre-lease context evidence. `gbrain` is an injected
 * client with `getPage(slug)` and `searchPages(query, limit)` so this boundary
 * stays unit-testable. Any transport failure is a typed system-blocker.
 */
export async function collectContextEvidence({
  issue,
  gbrain,
  now = new Date().toISOString(),
}) {
  let orgChart;
  try {
    orgChart = await gbrain.getPage(ORG_CHART_SLUG);
  } catch {
    return { evidence: null, reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE };
  }
  const boundOrgChart = boundPage(orgChart);
  if (!boundOrgChart)
    return { evidence: null, reason: CONTEXT_BLOCKER.ORG_CHART_MISSING };

  const declaredOwner = declaredImplementationOwner(orgChart);
  if (
    declaredOwner &&
    declaredOwner.toLowerCase() !== IMPLEMENTATION_OWNER.toLowerCase()
  ) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.OWNERSHIP_CONFLICT,
      detail: `org chart declares implementation owner ${declaredOwner}; expected ${IMPLEMENTATION_OWNER}`,
    };
  }

  const queries = [];
  for (const query of buildContextQueries(issue)) {
    let pages;
    try {
      pages = await gbrain.searchPages(query, MAX_CONTEXT_PAGES_PER_QUERY);
    } catch {
      return { evidence: null, reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE };
    }
    if (!Array.isArray(pages))
      return { evidence: null, reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE };
    queries.push({
      query,
      pages: pages.map(boundPage).filter(Boolean),
    });
  }

  return {
    evidence: {
      issue: issue.identifier,
      issueHash: issueContentHash(issue),
      ownership: { ...EXPECTED_OWNERSHIP },
      orgChart: boundOrgChart,
      queries,
      observedAt: now,
    },
    reason: null,
  };
}

/**
 * Semantically revalidate context evidence against the current issue, the
 * expected ownership roles, and the freshness window. Returns a stable reason
 * string, or null when the evidence is valid.
 */
export function validateContextEvidence(
  issue,
  evidence,
  { now = new Date().toISOString(), maxAgeMs = CONTEXT_RECEIPT_MAX_AGE_MS } = {}
) {
  if (!evidence || typeof evidence !== 'object') return 'context-malformed';
  if (evidence.issue !== issue?.identifier) return 'context-issue-mismatch';
  if (evidence.issueHash !== issueContentHash(issue))
    return 'context-issue-mismatch';
  if (
    evidence.ownership?.implementation !== EXPECTED_OWNERSHIP.implementation ||
    evidence.ownership?.verification !== EXPECTED_OWNERSHIP.verification
  )
    return CONTEXT_BLOCKER.OWNERSHIP_CONFLICT;

  const orgChart = boundPage(evidence.orgChart);
  if (!orgChart || orgChart.slug !== ORG_CHART_SLUG)
    return CONTEXT_BLOCKER.ORG_CHART_MISSING;

  const expectedQueries = buildContextQueries(issue);
  const actualQueries = Array.isArray(evidence.queries)
    ? evidence.queries.map(entry => entry?.query)
    : [];
  if (JSON.stringify(actualQueries) !== JSON.stringify(expectedQueries))
    return 'context-query-mismatch';
  for (const entry of evidence.queries) {
    if (!Array.isArray(entry?.pages)) return 'context-malformed';
    if (entry.pages.some(page => !boundPage(page))) return 'context-malformed';
  }

  const nowMs = Date.parse(now);
  if (!isFreshTimestamp(evidence.observedAt, nowMs, maxAgeMs))
    return 'context-stale';
  return null;
}

function normalizedEvidence(evidence) {
  return sorted({
    issue: evidence.issue.trim(),
    issueHash: evidence.issueHash.trim(),
    ownership: {
      implementation: evidence.ownership.implementation.trim(),
      verification: evidence.ownership.verification.trim(),
    },
    orgChart: {
      slug: evidence.orgChart.slug.trim(),
      id: String(evidence.orgChart.id).trim(),
      revision: String(evidence.orgChart.revision).trim(),
    },
    queries: evidence.queries.map(entry => ({
      query: entry.query.trim(),
      pages: entry.pages.map(page => ({
        slug: page.slug.trim(),
        id: String(page.id).trim(),
        revision: String(page.revision).trim(),
      })),
    })),
    observedAt: evidence.observedAt.trim(),
  });
}

export function contextGateFingerprint(issue, evidence) {
  const canonical = JSON.stringify(
    sorted({ issue: issue.identifier, evidence: normalizedEvidence(evidence) })
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function buildContextGateReceipt(issue, evidence) {
  const payload = {
    schema: CONTEXT_GATE_SCHEMA,
    issue: issue.identifier,
    fingerprint: contextGateFingerprint(issue, evidence),
    evidence: normalizedEvidence(evidence),
  };
  return `${CONTEXT_GATE_PREFIX}\n${JSON.stringify(payload)}\n${CONTEXT_GATE_SUFFIX}`;
}

function hasReceipt(issue, receipt) {
  return commentsOf(issue).some(comment => commentBody(comment) === receipt);
}

/**
 * Reconstruct the context receipt from the issue's comments and revalidate it
 * semantically. Returns null for missing, stale, forged, or mismatched
 * receipts.
 */
export function contextGateReceipt(issue, options = {}) {
  const body = commentsOf(issue)
    .map(commentBody)
    .find(
      value =>
        value.startsWith(`${CONTEXT_GATE_PREFIX}\n`) &&
        value.endsWith(`\n${CONTEXT_GATE_SUFFIX}`)
    );
  if (!body) return null;
  try {
    const payload = JSON.parse(
      body.slice(
        `${CONTEXT_GATE_PREFIX}\n`.length,
        -`\n${CONTEXT_GATE_SUFFIX}`.length
      )
    );
    if (
      payload?.schema !== CONTEXT_GATE_SCHEMA ||
      payload?.issue !== issue?.identifier ||
      !payload?.fingerprint ||
      !payload?.evidence ||
      validateContextEvidence(issue, payload.evidence, options) ||
      contextGateFingerprint(issue, payload.evidence) !== payload.fingerprint
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
 * Query GBrain and write exactly one context receipt, or return a typed
 * system-blocker. Every mutation is verified by an authoritative reread.
 */
export async function approveContext({
  issue,
  gbrain,
  client,
  now = new Date().toISOString(),
}) {
  const { evidence, reason, detail } = await collectContextEvidence({
    issue,
    gbrain,
    now,
  });
  if (reason) return { status: 'rejected', reason, detail: detail || null };

  const invalid = validateContextEvidence(issue, evidence, { now });
  if (invalid) return { status: 'rejected', reason: invalid };

  const receipt = buildContextGateReceipt(issue, evidence);
  if (hasReceipt(issue, receipt)) {
    return {
      status: 'already-approved',
      identifier: issue.identifier,
      fingerprint: contextGateFingerprint(issue, evidence),
      receipt,
    };
  }

  const result = await client.addComment(issue.id, receipt);
  if (!mutationSucceeded(result))
    throw new Error('context-gate-receipt-mutation-failed');
  const reread = await client.fetchIssue(issue.identifier);
  if (!reread || !hasReceipt(reread, receipt))
    throw new Error('context-gate-receipt-verification-failed');

  return {
    status: 'approved',
    identifier: reread.identifier,
    fingerprint: contextGateFingerprint(issue, evidence),
    receipt,
  };
}
