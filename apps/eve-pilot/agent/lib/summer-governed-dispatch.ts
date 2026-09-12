/**
 * Summer governed dispatch: request outcome → router launches.
 *
 * When runner-source attestation is fresh, decision work routes through the
 * normal Symphony candidate set. When attestation is unavailable / Gem is dark,
 * Summer does not route to Gem — it requests an isolated Cursor recovery
 * outcome through the governor (durable outbox is the launch surface).
 */

import {
  CURSOR_CLOUD_RECOVERY_ROUTE,
  createIsolatedRecoveryJob,
  routeIsolatedRecoveryJob,
  type RecoveryAdmissionContext,
} from './cursor-recovery';
import {
  routeByExpectedCost,
  routeSummerSymphonyDecisionJob,
  type DecisionJob,
  type RouteReceipt,
} from './governor-route';
import {
  resolveGemDarkTrigger,
  type GemDarkTriggerDecision,
} from './summer-gem-dark-recovery';

export type SummerGovernedDispatchResult =
  | {
      readonly outcome: 'symphony-route';
      readonly trigger: GemDarkTriggerDecision;
      readonly route: RouteReceipt;
    }
  | {
      readonly outcome: 'cursor-recovery-request';
      readonly trigger: GemDarkTriggerDecision;
      readonly route: RouteReceipt;
      readonly recoveryJobId: string;
    }
  | {
      readonly outcome: 'hold';
      readonly trigger: GemDarkTriggerDecision;
      readonly remainingHumanDecision: string;
    };

/**
 * Resolve a Summer request into a governor route launch.
 *
 * - Fresh attestation → Symphony decision route (Gem may be selected).
 * - Attestation unavailable / explicit Gem-dark → Cursor isolated-recovery route
 *   (never Gem/Symphony for the recovery lane).
 * - Unknown (no probe) → hold; do not spend Cursor accidentally.
 */
export function dispatchSummerGovernedRequest(input: {
  readonly decisionJob: DecisionJob;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly attestationReceipt?: unknown;
  readonly nowMs?: number;
  readonly recoveryAdmission?: Partial<RecoveryAdmissionContext>;
}): SummerGovernedDispatchResult {
  const trigger = resolveGemDarkTrigger({
    environment: input.environment,
    attestationReceipt: input.attestationReceipt,
    nowMs: input.nowMs,
  });

  if (!trigger.dark) {
    if (trigger.reason === 'unknown-fail-closed') {
      return {
        outcome: 'hold',
        trigger,
        remainingHumanDecision:
          'Configure SUMMER_RUNNER_SOURCE_ATTESTATION_PATH/JSON or set SUMMER_GEM_DARK; Summer will not auto-spend Cursor without a probe',
      };
    }
    return {
      outcome: 'symphony-route',
      trigger,
      route: routeSummerSymphonyDecisionJob(input.decisionJob),
    };
  }

  const recoveryJob = createIsolatedRecoveryJob({
    id: `cursor-recovery:${input.decisionJob.id}`,
    objective: input.decisionJob.objective,
    evidenceRefs: [
      ...input.decisionJob.evidenceRefs,
      `gem-dark-trigger:${trigger.reason}`,
      ...(trigger.attestation?.status === 'unavailable'
        ? [
            'runner-source-attestation-unavailable',
            `attestation-reason:${trigger.attestation.reason}`,
          ]
        : []),
    ],
  });

  const admission: RecoveryAdmissionContext = {
    gemDark: true,
    preauthorizedRecovery: false,
    liveOwnershipResolved: false,
    requestsLiveMutationOrTakeover: false,
    ...input.recoveryAdmission,
  };

  const route = routeIsolatedRecoveryJob(recoveryJob, admission);
  // After provider narrows to cursor-cloud, a separate `=== 'gem'` check is
  // unreachable for TypeScript (and wrong). Pin the recovery route id instead.
  if (route.selectedRoute.tuple.provider !== 'cursor-cloud') {
    throw new Error('gem-dark governed dispatch must select cursor-cloud');
  }
  if (route.selectedRoute.id !== CURSOR_CLOUD_RECOVERY_ROUTE.id) {
    throw new Error(
      'gem-dark governed dispatch must select the Cursor Cloud recovery route'
    );
  }

  return {
    outcome: 'cursor-recovery-request',
    trigger,
    route,
    recoveryJobId: recoveryJob.id,
  };
}

/** Test/helper: expected-cost route using only the Cursor recovery candidate. */
export function routeCursorRecoveryOnly(job: DecisionJob): RouteReceipt {
  const recoveryJob = createIsolatedRecoveryJob({
    id: job.id,
    objective: job.objective,
    evidenceRefs: job.evidenceRefs,
  });
  return routeByExpectedCost(
    recoveryJob,
    [CURSOR_CLOUD_RECOVERY_ROUTE],
    'summer-cursor-recovery-only'
  );
}
