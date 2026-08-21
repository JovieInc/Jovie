import { createHash } from 'node:crypto';
export const CONTEXT_GATE_SCHEMA = 'symphony-context/v1';
export const CONTEXT_GATE_PREFIX = '<!-- symphony-context/v1 -->';
export const CONTEXT_GATE_SUFFIX = '<!--/symphony-context-->';
export const ORG_CHART_SLUG = 'agent-org-chart';
export const AGENT_JOB_LEDGER_SLUG = 'coordination/agent-job-ledger';
export const CONTEXT_RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_CONTEXT_PAGES_PER_QUERY = 1;
export const CONTEXT_LOOKUP_BUDGET_MS = 10_000;

export const IMPLEMENTATION_OWNER = 'Symphony';
export const VERIFICATION_OWNER = 'Gem';
export const EXPECTED_OWNERSHIP = Object.freeze({
  implementation: IMPLEMENTATION_OWNER,
  verification: VERIFICATION_OWNER,
});

export const CONTEXT_BLOCKER = Object.freeze({
  GBRAIN_UNAVAILABLE: 'gbrain-unavailable',
  ORG_CHART_MISSING: 'org-chart-missing',
  OWNERSHIP_CONFLICT: 'ownership-conflict',
  NO_RESULTS: 'context-no-results',
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

export function issueContentHash(issue) {
  const canonical = [
    issue?.identifier || '',
    (issue?.title || '').trim(),
    (issue?.description || '').trim(),
  ].join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

const CONTEXT_TERM_NOISE = new Set([
  'build',
  'canonize',
  'create',
  'first',
  'implement',
  'repair',
  'update',
]);

function keyTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\b([a-z0-9]+)-first\b/g, '$1 ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !CONTEXT_TERM_NOISE.has(word))
    .slice(-5)
    .join(' ');
}

function receiptKeyTerms(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 8)
    .join(' ');
}

export function buildContextSearchTerms(issue) {
  return keyTerms(issue?.title) || String(issue?.identifier || '');
}

export function buildContextQueries(issue) {
  // Preserve the original v1 query labels so existing signed receipts remain
  // valid. The actual lookup uses buildContextSearchTerms(issue).
  const terms =
    receiptKeyTerms(issue?.title) || String(issue?.identifier || '');
  return [
    `ownership and current priorities for ${terms}`,
    `existing agent work and prior decisions related to ${terms}`,
  ];
}

function remainingLookupMs(
  startedAt,
  clock = Date.now,
  budgetMs = CONTEXT_LOOKUP_BUDGET_MS
) {
  return Math.max(0, budgetMs - (clock() - startedAt));
}

function lookupErrorCode(error) {
  const errors =
    error instanceof AggregateError && Array.isArray(error.errors)
      ? error.errors
      : [error];
  const missing = errors.find(candidate => candidate?.code === 'ENOENT');
  if (missing) return 'ENOENT';
  const timedOut = errors.find(
    candidate =>
      candidate?.code === 'ETIMEDOUT' ||
      candidate?.killed === true ||
      candidate?.signal === 'SIGTERM'
  );
  if (timedOut) return 'ETIMEDOUT';
  return String(
    errors.find(candidate => candidate?.code)?.code || error?.name || 'Error'
  );
}

function lookupFailure(
  operation,
  target,
  error,
  lookupStartedAt,
  clock = Date.now,
  budgetMs = CONTEXT_LOOKUP_BUDGET_MS
) {
  return Object.assign(new Error('gbrain-context-lookup-failed'), {
    detail: [
      `operation=${operation}`,
      'source=gbrain',
      `target=${target}`,
      `error=${lookupErrorCode(error)}`,
      `elapsed_ms=${Math.max(0, clock() - lookupStartedAt)}`,
      `remaining_ms=${remainingLookupMs(lookupStartedAt, clock, budgetMs)}`,
    ].join(';'),
  });
}

/** @param {unknown} error */
function lookupErrorDetail(error) {
  if (!error || typeof error !== 'object' || !('detail' in error)) return null;
  return typeof error.detail === 'string' ? error.detail : null;
}

async function getPageEvidence(gbrain, slug, timeoutMs, clock = Date.now) {
  const startedAt = clock();
  if (typeof gbrain.getPageWithEvidence === 'function') {
    return gbrain.getPageWithEvidence(slug, { timeoutMs });
  }
  return {
    page: await gbrain.getPage(slug, { timeoutMs }),
    source: 'get',
    ms: Math.max(0, clock() - startedAt),
  };
}

async function searchPageEvidence(gbrain, query, timeoutMs, clock = Date.now) {
  const startedAt = clock();
  if (typeof gbrain.searchPagesWithEvidence === 'function') {
    return gbrain.searchPagesWithEvidence(query, MAX_CONTEXT_PAGES_PER_QUERY, {
      timeoutMs,
    });
  }
  return {
    pages: await gbrain.searchPages(query, MAX_CONTEXT_PAGES_PER_QUERY, {
      timeoutMs,
    }),
    source: 'legacy',
    ms: Math.max(0, clock() - startedAt),
  };
}

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

function declaredOwner(orgChart, role) {
  const truth = `${orgChart?.compiledTruth || ''} ${orgChart?.compiled_truth || ''} ${orgChart?.body || ''}`;
  const match = new RegExp(
    `${role}\\s+owner\\s*[:=]\\s*([A-Za-z][A-Za-z-]*)`,
    'i'
  ).exec(truth);
  return match ? match[1] : null;
}

export async function collectContextEvidence({
  issue,
  gbrain,
  now = new Date().toISOString(),
  clock = Date.now,
  lookupBudgetMs = CONTEXT_LOOKUP_BUDGET_MS,
}) {
  const lookupStartedAt = clock();
  let orgChartLookup;
  let ledgerLookup;
  try {
    [orgChartLookup, ledgerLookup] = await Promise.all([
      getPageEvidence(
        gbrain,
        ORG_CHART_SLUG,
        remainingLookupMs(lookupStartedAt, clock, lookupBudgetMs),
        clock
      ).catch(error => {
        throw lookupFailure(
          'get',
          ORG_CHART_SLUG,
          error,
          lookupStartedAt,
          clock,
          lookupBudgetMs
        );
      }),
      getPageEvidence(
        gbrain,
        AGENT_JOB_LEDGER_SLUG,
        remainingLookupMs(lookupStartedAt, clock, lookupBudgetMs),
        clock
      ).catch(error => {
        throw lookupFailure(
          'get',
          AGENT_JOB_LEDGER_SLUG,
          error,
          lookupStartedAt,
          clock,
          lookupBudgetMs
        );
      }),
    ]);
  } catch (error) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE,
      detail:
        lookupErrorDetail(error) ||
        lookupFailure(
          'get',
          'required-context-pages',
          error,
          lookupStartedAt,
          clock,
          lookupBudgetMs
        ).detail,
    };
  }
  const orgChart = orgChartLookup?.page;
  const boundOrgChart = boundPage(orgChart);
  if (!boundOrgChart)
    return { evidence: null, reason: CONTEXT_BLOCKER.ORG_CHART_MISSING };
  const boundLedger = boundPage(ledgerLookup?.page);
  if (!boundLedger || boundLedger.slug !== AGENT_JOB_LEDGER_SLUG) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.NO_RESULTS,
      detail: `required coordination page returned no bindable page: ${AGENT_JOB_LEDGER_SLUG}`,
    };
  }

  const implementationOwner = declaredOwner(orgChart, 'implementation');
  const verificationOwner = declaredOwner(orgChart, 'verification');
  if (
    implementationOwner?.toLowerCase() !== IMPLEMENTATION_OWNER.toLowerCase() ||
    verificationOwner?.toLowerCase() !== VERIFICATION_OWNER.toLowerCase()
  ) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.OWNERSHIP_CONFLICT,
      detail: `org chart owners are implementation=${implementationOwner || 'none'}, verification=${verificationOwner || 'none'}; expected ${IMPLEMENTATION_OWNER}/${VERIFICATION_OWNER}`,
    };
  }

  const [ownershipQuery, priorDecisionQuery] = buildContextQueries(issue);
  const searchTerms = buildContextSearchTerms(issue);
  const remainingMs = remainingLookupMs(lookupStartedAt, clock, lookupBudgetMs);
  if (remainingMs <= 0) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE,
      detail: lookupFailure(
        'search',
        searchTerms,
        { code: 'ETIMEDOUT' },
        lookupStartedAt,
        clock,
        lookupBudgetMs
      ).detail,
    };
  }
  let priorDecisionLookup;
  try {
    priorDecisionLookup = await searchPageEvidence(
      gbrain,
      searchTerms,
      remainingMs,
      clock
    );
  } catch (error) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE,
      detail: lookupFailure(
        'search',
        searchTerms,
        error,
        lookupStartedAt,
        clock,
        lookupBudgetMs
      ).detail,
    };
  }
  if (!Array.isArray(priorDecisionLookup?.pages)) {
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.GBRAIN_UNAVAILABLE,
      detail: lookupFailure(
        'search',
        searchTerms,
        { code: 'INVALID_RESPONSE' },
        lookupStartedAt,
        clock,
        lookupBudgetMs
      ).detail,
    };
  }
  const boundPriorDecisions = priorDecisionLookup.pages
    .map(boundPage)
    .filter(Boolean);
  if (boundPriorDecisions.length === 0)
    return {
      evidence: null,
      reason: CONTEXT_BLOCKER.NO_RESULTS,
      detail: `targeted context query returned no bindable pages: ${priorDecisionQuery}`,
    };

  const queries = [
    {
      query: ownershipQuery,
      pages: [boundLedger],
      lookup: {
        source: 'ledger',
        ms: Math.max(0, Number(ledgerLookup?.ms) || 0),
      },
    },
    {
      query: priorDecisionQuery,
      pages: boundPriorDecisions,
      lookup: {
        source: priorDecisionLookup.source || 'legacy',
        terms: searchTerms,
        ms: Math.max(0, Number(priorDecisionLookup.ms) || 0),
      },
    },
  ];

  return {
    evidence: {
      issue: issue.identifier,
      issueHash: issueContentHash(issue),
      ownership: { ...EXPECTED_OWNERSHIP },
      orgChart: boundOrgChart,
      orgChartLookup: {
        source: orgChartLookup.source || 'get',
        ms: Math.max(0, Number(orgChartLookup.ms) || 0),
      },
      ledger: boundLedger,
      queries,
      observedAt: now,
    },
    reason: null,
  };
}

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

  const hasLookupEvidence = Array.isArray(evidence.queries)
    ? evidence.queries.some(entry => entry?.lookup)
    : false;
  const ledger = evidence.ledger ? boundPage(evidence.ledger) : null;
  if (
    (evidence.ledger && !ledger) ||
    (ledger && ledger.slug !== AGENT_JOB_LEDGER_SLUG)
  )
    return 'context-malformed';
  if (hasLookupEvidence && !ledger) return CONTEXT_BLOCKER.NO_RESULTS;
  if (
    evidence.orgChartLookup &&
    (!nonEmptyString(evidence.orgChartLookup.source) ||
      !Number.isFinite(evidence.orgChartLookup.ms) ||
      evidence.orgChartLookup.ms < 0)
  )
    return 'context-malformed';

  const expectedQueries = buildContextQueries(issue);
  const actualQueries = Array.isArray(evidence.queries)
    ? evidence.queries.map(entry => entry?.query)
    : [];
  if (JSON.stringify(actualQueries) !== JSON.stringify(expectedQueries))
    return 'context-query-mismatch';
  for (const entry of evidence.queries) {
    if (!Array.isArray(entry?.pages)) return 'context-malformed';
    if (entry.pages.length === 0) return CONTEXT_BLOCKER.NO_RESULTS;
    if (entry.pages.some(page => !boundPage(page))) return 'context-malformed';
    if (entry.lookup) {
      if (
        !nonEmptyString(entry.lookup.source) ||
        !Number.isFinite(entry.lookup.ms) ||
        entry.lookup.ms < 0
      )
        return 'context-malformed';
    }
  }
  if (hasLookupEvidence) {
    const [ownershipEntry, priorDecisionEntry] = evidence.queries;
    if (
      ownershipEntry?.lookup?.source !== 'ledger' ||
      !ownershipEntry.pages.some(page => page?.slug === AGENT_JOB_LEDGER_SLUG)
    )
      return 'context-malformed';
    if (
      priorDecisionEntry?.lookup?.terms !== buildContextSearchTerms(issue) ||
      !['keyword', 'semantic', 'legacy'].includes(
        priorDecisionEntry?.lookup?.source
      )
    )
      return 'context-query-mismatch';
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
    ...(evidence.orgChartLookup
      ? {
          orgChartLookup: {
            source: evidence.orgChartLookup.source.trim(),
            ms: evidence.orgChartLookup.ms,
          },
        }
      : {}),
    ...(evidence.ledger
      ? {
          ledger: {
            slug: evidence.ledger.slug.trim(),
            id: String(evidence.ledger.id).trim(),
            revision: String(evidence.ledger.revision).trim(),
          },
        }
      : {}),
    queries: evidence.queries.map(entry => ({
      query: entry.query.trim(),
      pages: entry.pages.map(page => ({
        slug: page.slug.trim(),
        id: String(page.id).trim(),
        revision: String(page.revision).trim(),
      })),
      ...(entry.lookup
        ? {
            lookup: {
              source: entry.lookup.source.trim(),
              ...(entry.lookup.terms
                ? { terms: entry.lookup.terms.trim() }
                : {}),
              ms: entry.lookup.ms,
            },
          }
        : {}),
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

export function contextGateReceipt(issue, options = {}) {
  const body = commentsOf(issue)
    .map(commentBody)
    .findLast(
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
