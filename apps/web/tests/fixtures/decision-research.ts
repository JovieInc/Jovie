import type { DecisionResearchRequest } from '@/lib/ovie/decision-research';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;

/**
 * Frozen source-tier JOV-6468 case. It proves the adapter contract only; the
 * compiler must keep commissioning pending until an authenticated runtime
 * producer supplies current source calls and the persisted packet is read back.
 */
export function decisionResearchRequestFixture(): DecisionResearchRequest {
  return {
    schema: 'jovie.decision-research/request/v1',
    trackingKey:
      'SUMMER-DECISION-QUALITY-2026-10-03/research-tool-commissioning',
    requestedAt: '2026-10-14T08:00:00.000Z',
    tenantId: 'company-jovie',
    proofTier: 'source',
    effectiveStrategy: {
      ref: 'linear:JOV-6471/effective-strategy',
      statement:
        'Improve first useful value without broadening customer exposure or displacing approved work.',
    },
    decision: {
      id: 'JOV-6468/next-bounded-allocation',
      issueRef: 'linear:JOV-6468',
      title: 'Activation pilot next allocation',
      status: 'pending',
      alternatives: [
        { id: 'change', label: 'Change the next bounded allocation' },
        { id: 'hold', label: 'Hold for a mature observation' },
        { id: 'retain', label: 'Retain the incumbent allocation' },
      ],
      incumbentActionId: 'retain',
      reversibility: 'moderate',
      consequence: 'medium',
      materialUnknown:
        'Whether observed activation friction reflects the product path or cohort mix.',
      findingThatChangesAction:
        'Independent first-party behavior plus a contradictory source establishes one actionable mechanism.',
      sourceScope: [
        'authorized activation aggregate',
        'aggregated support objections',
        'public original sources',
      ],
      authorityRef: 'linear:JOV-6468/approved-eligibility',
      owner: 'activation-owner',
      reconsiderationEvent:
        'A mature authorized cohort receipt or a material source contradiction is recorded.',
      cheapReversibleAction: null,
    },
    evidence: [
      {
        id: 'activation-aggregate',
        sourceType: 'first-party-product',
        authority: 'first-party',
        sourceRef: 'activation-pilot/features/eligible-cohort',
        url: 'https://github.com/JovieInc/Jovie/blob/80e449ddc3fb5d6baa932b1cd8722410aa7d5b01/apps/web/lib/activation/pilot-receipts.ts',
        canonicalSourceId: 'activation-pilot/eligible-cohort',
        copiedFromEvidenceId: null,
        operation: 'read-only',
        queryVersion: 'activation-aggregate/v1',
        observedAt: '2026-10-14T07:30:00.000Z',
        retrievedAt: '2026-10-14T07:31:00.000Z',
        freshnessTtlHours: 24,
        contentDigest: SHA_A,
        summary:
          'Eligible non-dogfood cohort has an observed activation aggregate with a declared denominator.',
        read: {
          state: 'available',
          succeeded: true,
          value: 0.31,
          eligiblePopulation: 100,
          denominator: 100,
          missingness: null,
        },
        dogfood: 'excluded',
        dataClass: 'company-confidential',
      },
      {
        id: 'support-objections',
        sourceType: 'support',
        authority: 'first-party',
        sourceRef: 'support/activation-objections/aggregate-v1',
        url: 'https://linear.app/jovie/issue/JOV-6468',
        canonicalSourceId: 'support/activation-objections',
        copiedFromEvidenceId: null,
        operation: 'read-only',
        queryVersion: 'support-objections/v1',
        observedAt: '2026-10-14T07:20:00.000Z',
        retrievedAt: '2026-10-14T07:32:00.000Z',
        freshnessTtlHours: 24,
        contentDigest: SHA_B,
        summary:
          'Aggregated objections suggest the first-value step is unclear; no raw customer text is included.',
        read: {
          state: 'available',
          succeeded: true,
          value: 3,
          eligiblePopulation: 12,
          denominator: 12,
          missingness: 'Small eligible population.',
        },
        dogfood: 'excluded',
        dataClass: 'customer-sensitive',
      },
      {
        id: 'official-contradiction',
        sourceType: 'public-web',
        authority: 'authoritative',
        sourceRef: 'linear:JOV-6474/matched-case-policy',
        url: 'https://linear.app/jovie/issue/JOV-6474',
        canonicalSourceId: 'jov-6474/matched-case-policy',
        copiedFromEvidenceId: null,
        operation: 'read-only',
        queryVersion: 'linear-issue-read/v1',
        observedAt: '2026-10-14T07:00:00.000Z',
        retrievedAt: '2026-10-14T07:33:00.000Z',
        freshnessTtlHours: 168,
        contentDigest: SHA_C,
        summary:
          'Independent evaluation still gates consequential routing promotion.',
        read: {
          state: 'available',
          succeeded: true,
          value: null,
          eligiblePopulation: null,
          denominator: null,
          missingness: null,
        },
        dogfood: 'not-applicable',
        dataClass: 'public',
      },
    ],
    claims: [
      {
        id: 'observed-friction',
        category: 'internal-observation',
        inferenceLabel: 'observed',
        statement: 'Eligible activation behavior includes measurable friction.',
        material: true,
        supportingEvidenceIds: ['activation-aggregate'],
        contradictingEvidenceIds: [],
      },
      {
        id: 'mechanism-hypothesis',
        category: 'causal-hypothesis',
        inferenceLabel: 'inferred',
        statement:
          'Value comprehension may contribute to the observed friction.',
        material: true,
        supportingEvidenceIds: ['support-objections'],
        contradictingEvidenceIds: ['official-contradiction'],
      },
      {
        id: 'bounded-action',
        category: 'action-selection',
        inferenceLabel: 'recommended',
        statement:
          'Hold until the bounded research stop or mature cohort event.',
        material: true,
        supportingEvidenceIds: ['activation-aggregate', 'support-objections'],
        contradictingEvidenceIds: ['official-contradiction'],
      },
    ],
    traces: [
      {
        schema: 'jovie.decision-research/tool-trace/v1',
        routeRole: 'incumbent',
        routeId: 'authorized-web-search',
        provider: 'incumbent-authorized-route',
        tool: 'bounded-public-source-search',
        access: 'authorized',
        capabilityVerifiedAt: '2026-10-14T07:00:00.000Z',
        costVerifiedAt: '2026-10-14T07:00:00.000Z',
        privacyRetentionVerifiedAt: '2026-10-14T07:00:00.000Z',
        result: 'complete',
        observedAt: '2026-10-14T07:33:00.000Z',
        queryCount: 1,
        sourceCount: 1,
        retryCount: 0,
        latencyMs: 700,
        costUsd: 0.01,
        inputEvidenceIds: ['official-contradiction'],
        terminalReason: 'Source and decision evidence limits reached.',
        resumeCondition: null,
      },
      {
        schema: 'jovie.decision-research/tool-trace/v1',
        routeRole: 'candidate',
        routeId: 'candidate-exa',
        provider: 'Exa',
        tool: 'search',
        access: 'missing-access',
        capabilityVerifiedAt: null,
        costVerifiedAt: null,
        privacyRetentionVerifiedAt: null,
        result: 'not-evaluated',
        observedAt: '2026-10-14T07:34:00.000Z',
        queryCount: 0,
        sourceCount: 0,
        retryCount: 0,
        latencyMs: 0,
        costUsd: 0,
        inputEvidenceIds: [],
        terminalReason: 'No callable authorized candidate access.',
        resumeCondition:
          'JOV-6474 receives an authorized callable route with current cost and privacy verification.',
      },
    ],
    budget: {
      searchUsd: { lower: 0, upper: 0.05 },
      inferenceUsd: { lower: 0, upper: 0.05 },
      delayMinutes: { lower: 5, upper: 30 },
      founderAttentionMinutes: { lower: 0, upper: 5 },
      displacedEligibleWork: 'One bounded activation analysis slot.',
      maxQueries: 2,
      maxSources: 4,
      maxRetries: 1,
      maxLatencyMs: 30_000,
      maxTotalUsd: 0.05,
    },
    valueOfInformation: {
      expectedDecisionImprovement: 'material',
      canChangeAction: true,
      canCertifyNecessaryUncertainty: true,
      evidenceThatCouldReverse:
        'An original source showing the suspected mechanism is inapplicable to this cohort.',
      evidenceThatCouldStrengthen:
        'Independent evidence connecting the objection to the eligible path.',
      boundsRationale:
        'Only qualitative improvement is claimed; no outcome-calibrated ROI exists.',
      existingEvidenceSufficient: false,
    },
    privacy: { externalExport: 'public-only', authorizationRef: null },
    proposal: {
      recommendation: 'hold',
      selectedActionId: 'hold',
      bestAlternativeActionId: 'retain',
      strongestContradictionEvidenceId: 'official-contradiction',
      unknowns: ['Causal contribution remains unmeasured.'],
      stopRules: [
        'Stop at the source, query, retry, latency, or spend cap.',
        'Stop when evidence is sufficient to select an action.',
      ],
      continueRules: [
        'Continue only while an original source could change or certify the action.',
      ],
      nextOwner: 'activation-owner',
      forecast: {
        target: 'first useful value within 72 hours',
        units: 'binary',
        expected: 'unknown until the authorized cohort matures',
        horizonEndsAt: '2026-10-28T08:00:00.000Z',
        confidence: 'low',
      },
    },
  };
}
