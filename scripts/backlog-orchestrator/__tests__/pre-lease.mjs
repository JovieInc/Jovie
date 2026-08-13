/**
 * Shared pre-lease receipt helpers for the deterministic gate tests
 * (JOV-5032). Every gate test that exercises plan approval, admission
 * approval, or the lease needs valid `symphony-context/v1` and
 * `symphony-research/v1` receipts bound to the issue under test.
 */

import { buildAdmissionGateReceipt } from '../admission-gate.mjs';
import {
  buildContextGateReceipt,
  buildContextQueries,
  EXPECTED_OWNERSHIP,
  issueContentHash,
  ORG_CHART_SLUG,
} from '../context-gate.mjs';
import { buildPlanGateReceipt } from '../plan-gate.mjs';
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

/** Minimal valid plan evidence for a JOV control-plane issue. */
export function planEvidenceFor(overrides = {}) {
  return {
    verified: true,
    concrete: true,
    bounded: true,
    repo: 'JovieInc/Jovie',
    project: 'Jovie',
    owners: { implementation: 'Symphony', verification: 'Gem' },
    scope: 'Bind pre-lease receipts in the deterministic control plane',
    acceptance: ['Receipts revalidate semantically before every lease'],
    test: ["node --test 'scripts/backlog-orchestrator/__tests__/*.test.mjs'"],
    rollback: 'Revert the gate commit and remove the receipt comments',
    ...overrides,
  };
}

/**
 * Return a copy of the issue with the full deterministic receipt chain:
 * context, research, plan, and admission receipts bound in order.
 */
export function withFullGateReceipts(issue, { now, planEvidence } = {}) {
  const withPreLease = withPreLeaseReceipts(issue, { now });
  const planReceipt = buildPlanGateReceipt(
    withPreLease,
    planEvidence || planEvidenceFor(),
    { now }
  );
  const withPlan = {
    ...withPreLease,
    comments: {
      nodes: [...withPreLease.comments.nodes, { body: planReceipt }],
    },
  };
  const admissionReceipt = buildAdmissionGateReceipt(withPlan, { now });
  return {
    ...withPlan,
    comments: {
      nodes: [...withPlan.comments.nodes, { body: admissionReceipt }],
    },
  };
}
