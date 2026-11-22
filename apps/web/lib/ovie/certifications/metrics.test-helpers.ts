import {
  buildDogfoodReceipt,
  type DogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import {
  type CertificationMetricsInput,
  computeCertificationMetrics,
  type MetricsSubject,
} from './metrics';

export const METRICS_TEST_NOW = '2026-09-29T12:00:00.000Z';
export const METRICS_TEST_WINDOW_START = '2026-09-01T12:00:00.000Z';
export const METRICS_TEST_SHA = 'a'.repeat(40);
export const METRICS_TEST_DEPLOY = {
  commitSha: METRICS_TEST_SHA,
  deploymentId: 'dep-1',
};

export function metricsTestSubject(
  overrides: Partial<MetricsSubject> = {}
): MetricsSubject {
  return {
    id: 'sub-1',
    product: 'jov',
    riskClass: 'product',
    requiredMissions: [],
    deploy: null,
    confidenceTier: null,
    machineCertifiedAt: null,
    fullyRolledOutAt: null,
    promotedSilently: false,
    killedAfterPromotion: false,
    founderFlaggedAfterPromotion: false,
    founderBlocking: [],
    killSwitches: [],
    escalationRungResolved: null,
    hasCanary: false,
    ...overrides,
  };
}

export function metricsTestReceipt(
  overrides: Partial<DogfoodReceipt> = {}
): DogfoodReceipt {
  const input = {
    subjectId: 'sub-1',
    product: 'jov',
    kind: 'ui_agent',
    driver: 'playwright',
    missionId: 'm-1',
    actor: 'summer',
    environment: 'production',
    deploymentId: METRICS_TEST_DEPLOY.deploymentId,
    commitSha: METRICS_TEST_DEPLOY.commitSha,
    flagCohort: 'dogfood',
    startedAt: '2026-09-28T10:00:00.000Z',
    completedAt: '2026-09-28T10:05:00.000Z',
    outcome: 'passed',
    ...overrides,
  } as const;
  return buildDogfoodReceipt({
    ...input,
    evidenceRefs: ['artifact:result-state'],
    missionObservation: {
      purpose: 'capability',
      method: 'goal_driven',
      missionRevision: 1,
      goalCompletion: 'completed',
      correctness: 'correct',
      resultingState: 'The intended result persists after a fresh read.',
      checks: [
        {
          criterion: 'saved result',
          status: 'passed',
          evidenceRefs: ['artifact:result-state'],
        },
      ],
      friction: { assessment: 'acceptable', details: [] },
      recovery: { retries: 0, details: [] },
      durationMs: Date.parse(input.completedAt) - Date.parse(input.startedAt),
      resources: {
        status: 'not_applicable',
        reason: 'No metered service used.',
      },
    },
    ...('missionObservation' in overrides
      ? { missionObservation: overrides.missionObservation }
      : {}),
  });
}

export function metricsTestInput(
  overrides: Partial<CertificationMetricsInput> = {}
) {
  return computeCertificationMetrics({
    generatedAt: METRICS_TEST_NOW,
    windowStart: METRICS_TEST_WINDOW_START,
    subjects: [],
    defects: [],
    founderCards: [],
    judgeReceipts: [],
    decisions: [],
    signalReports: [],
    roster: [],
    receipts: [],
    knownGoodDeploymentIds: [],
    qualityReceipts: null,
    ...overrides,
  });
}
