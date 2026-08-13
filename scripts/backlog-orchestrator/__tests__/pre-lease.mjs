/**
 * Shared pre-lease receipt helpers for the deterministic gate tests
 * (JOV-5032). Every gate test that exercises plan approval, admission
 * approval, or the lease needs valid `symphony-context/v1` and
 * `symphony-research/v1` receipts bound to the issue under test.
 */

import {
  buildContextGateReceipt,
  buildContextQueries,
  EXPECTED_OWNERSHIP,
  issueContentHash,
  ORG_CHART_SLUG,
} from '../context-gate.mjs';
import {
  buildResearchGateReceipt,
  classifyResearchNeed,
} from '../research-gate.mjs';

export function contextEvidenceFor(issue, { now, ...overrides } = {}) {
  return {
    issue: issue.identifier,
    issueHash: issueContentHash(issue),
    ownership: { ...EXPECTED_OWNERSHIP },
    orgChart: {
      slug: ORG_CHART_SLUG,
      id: 'page-org-chart',
      revision: 'rev-1',
    },
    queries: buildContextQueries(issue).map(query => ({
      query,
      pages: [{ slug: 'notes/example', id: 'page-1', revision: 'rev-1' }],
    })),
    observedAt: now || new Date().toISOString(),
    ...overrides,
  };
}

export function researchEvidenceFor(issue, { now, ...overrides } = {}) {
  const need = classifyResearchNeed(issue);
  return {
    issue: issue.identifier,
    issueHash: issueContentHash(issue),
    classification: need.decision,
    rationale: need.rationale,
    queries: [],
    citations: [],
    findings: [],
    observedAt: now || new Date().toISOString(),
    ...overrides,
  };
}

export function preLeaseComments(issue, options = {}) {
  return [
    {
      body: buildContextGateReceipt(issue, contextEvidenceFor(issue, options)),
    },
    {
      body: buildResearchGateReceipt(
        issue,
        researchEvidenceFor(issue, options)
      ),
    },
  ];
}

/** Return a copy of the issue with valid pre-lease receipts appended. */
export function withPreLeaseReceipts(issue, options = {}) {
  const existing = issue.comments?.nodes || issue.comments || [];
  return {
    ...issue,
    comments: { nodes: [...existing, ...preLeaseComments(issue, options)] },
  };
}
