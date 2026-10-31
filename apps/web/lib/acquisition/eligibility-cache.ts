import { z } from 'zod';
import {
  COMMERCE_DECISION_PROJECTION_CONTRACT,
  type CommerceEvidenceKind,
  projectCommerceDecisions,
} from './commerce-decision';
import {
  ACQUISITION_ELIGIBILITY_CONTRACT,
  type ConeEvidence,
  type ConeRequirementId,
  evaluateAcquisitionEligibility,
  REVENUE_CONE_REQUIREMENTS,
} from './eligibility';
import type { AcquisitionEligibilityReport } from './eligibility.server';

const evidenceSchema = z
  .object({
    requirement: z.string(),
    source: z.string().min(1),
    status: z.enum(['green', 'red', 'unknown']),
    observedAt: z.string().datetime({ offset: true }).nullable(),
    maxAgeMs: z.number().finite().nonnegative(),
    ref: z.string().nullable(),
    detail: z.string(),
  })
  .refine(item => item.status !== 'green' || item.maxAgeMs > 0);

const reportSchema = z.object({
  contract: z.literal(ACQUISITION_ELIGIBILITY_CONTRACT),
  evaluatedAt: z.string().datetime({ offset: true }),
  eligible: z.boolean(),
  verdict: z.enum(['ELIGIBLE', 'BLOCKED', 'UNKNOWN']),
  requirements: z.array(
    z.object({
      id: z.string(),
      evidence: z.array(evidenceSchema),
    })
  ),
  funnel: z
    .object({
      definitionVersion: z.string(),
      timeRange: z.string(),
      biggestDropOffKey: z.string().nullable(),
      stages: z.array(
        z.object({
          key: z.string(),
          count: z.number().finite().nonnegative(),
          conversionRate: z.number().finite().nullable(),
          dropOff: z.number().finite().nullable(),
        })
      ),
      errors: z.array(z.string()),
    })
    .nullable(),
  commerce: z.object({
    contract: z.literal(COMMERCE_DECISION_PROJECTION_CONTRACT),
    matrixRevision: z.string(),
    matrix: z.array(
      z.object({
        offer: z.string(),
        channel: z.string(),
        rail: z.string().nullable(),
        accessState: z.string(),
        merchantOfRecord: z.string(),
        decisionRevision: z.string(),
        nextReevaluationTrigger: z.string(),
        evidence: z.array(
          z.object({
            kind: z.string(),
            status: z.string(),
            observedAt: z.string().nullable(),
            freshnessBudgetMs: z.number(),
          })
        ),
        canary: z.object({
          result: z.enum(['passed', 'failed', 'not-run', 'stale']),
          observedAt: z.string().nullable(),
          freshnessBudgetMs: z.number(),
        }),
        invalidations: z.array(z.unknown()).default([]),
      })
    ),
  }),
});

// These are the existing producer budgets, shared with the live composer.
export const LIVE_MAX_AGE_MS = 15 * 60_000;
export const DAILY_CANARY_MAX_AGE_MS = 30 * 60 * 60_000;
export const DAILY_WORKFLOW_MAX_AGE_MS = 48 * 60 * 60_000;

const requiredSources: Partial<
  Record<ConeRequirementId, Readonly<Record<string, number>>>
> = {
  entry: { 'm2-revenue-path:live#signed_out': LIVE_MAX_AGE_MS },
  claim: { 'm2-revenue-path:live#claim': LIVE_MAX_AGE_MS },
  offer_checkout: { 'm2-revenue-path:live#pro_checkout_199': LIVE_MAX_AGE_MS },
  activation: { 'm2-revenue-path:live#activation': LIVE_MAX_AGE_MS },
  auth_signup: { 'canary:auth-signup-onboarding': DAILY_CANARY_MAX_AGE_MS },
  profile_truth: {
    'canary:public-profile': DAILY_CANARY_MAX_AGE_MS,
    'github:m2-revenue-path-canary.yml@main': DAILY_WORKFLOW_MAX_AGE_MS,
  },
  payment_entitlement: {
    'github:ci.yml#Golden Path (manual)@main': DAILY_WORKFLOW_MAX_AGE_MS,
  },
  instrumentation: { 'founder-funnel:30d': LIVE_MAX_AGE_MS },
};

const commerceKeys = {
  'selected-rail': 'selectedRail',
  'jov-6258-preflight': 'jov6258Preflight',
  'handoff-correlation': 'handoffCorrelation',
  'payment-journey': 'paymentJourney',
  reversal: 'reversal',
} as const satisfies Record<CommerceEvidenceKind, string>;

/** Re-evaluate stored receipts, never the stored eligible/effectiveStatus flags. */
export function revalidateAcquisitionEligibilityReport(
  value: unknown,
  now: Date
): AcquisitionEligibilityReport | null {
  const parsed = reportSchema.safeParse(value);
  if (!parsed.success || !Number.isFinite(now.getTime())) return null;
  const report = parsed.data;
  if (Date.parse(report.evaluatedAt) > now.getTime() + 5 * 60_000) return null;
  if (report.eligible !== (report.verdict === 'ELIGIBLE')) return null;
  const ids = report.requirements.map(item => item.id);
  if (
    ids.length !== REVENUE_CONE_REQUIREMENTS.length ||
    new Set(ids).size !== ids.length ||
    REVENUE_CONE_REQUIREMENTS.some(item => !ids.includes(item.id))
  )
    return null;
  if (
    report.requirements.some(
      row =>
        row.evidence.length === 0 ||
        row.evidence.some(item => item.requirement !== row.id)
    )
  )
    return null;

  if (
    report.commerce.matrix.some(decision => {
      const kinds = decision.evidence.map(item => item.kind);
      return (
        kinds.length !== Object.keys(commerceKeys).length ||
        new Set(kinds).size !== kinds.length ||
        Object.keys(commerceKeys).some(kind => !kinds.includes(kind))
      );
    })
  )
    return null;

  // Reuse the commerce owner's schema, redaction and freshness policy. A stale
  // canary remains stale; reconstruction must never give it a newer timestamp.
  const commerce = projectCommerceDecisions(
    {
      matrixRevision: report.commerce.matrixRevision,
      decisions: report.commerce.matrix.map(decision => ({
        ...decision,
        evidence: Object.fromEntries(
          Object.entries(commerceKeys).map(([kind, key]) => {
            const item = decision.evidence.find(
              receipt => receipt.kind === kind
            );
            return [
              key,
              item && {
                status: item.status,
                observedAt: item.observedAt,
                maxAgeMs: item.freshnessBudgetMs,
              },
            ];
          })
        ),
        canary: {
          result:
            decision.canary.result === 'stale'
              ? 'passed'
              : decision.canary.result,
          observedAt:
            decision.canary.result === 'stale'
              ? null
              : decision.canary.observedAt,
          maxAgeMs: decision.canary.freshnessBudgetMs,
          decisionRevision: decision.decisionRevision,
        },
      })),
      reconciliations: [
        {
          schema: 'jovie.capability-backlog-reconciliation/v1',
          status: 'ready',
          commerceInvalidations: report.commerce.matrix.flatMap(
            item => item.invalidations
          ),
        },
      ],
    },
    now
  );
  const evidence = report.requirements.flatMap(row => {
    const expected = requiredSources[row.id as ConeRequirementId] ?? {};
    const missing: ConeEvidence[] = Object.keys(expected)
      .filter(source => !row.evidence.some(item => item.source === source))
      .map(source => ({
        requirement: row.id as ConeRequirementId,
        source,
        status: 'unknown',
        observedAt: null,
        maxAgeMs: expected[source],
        ref: null,
        detail: 'A required evidence source is missing from the stored report.',
      }));
    return [
      ...row.evidence.map(item => ({
        ...item,
        requirement: row.id as ConeRequirementId,
        maxAgeMs: Math.min(
          item.maxAgeMs,
          expected[item.source] ?? item.maxAgeMs
        ),
      })),
      ...missing,
    ];
  });
  const eligibility = evaluateAcquisitionEligibility({ evidence, now });
  // A cached read may revoke eligibility but cannot promote a previously held
  // report or override a contradictory commerce decision without a new probe.
  if (eligibility.eligible && (!report.eligible || !commerce.eligible))
    return null;
  return { ...eligibility, funnel: report.funnel, commerce };
}
