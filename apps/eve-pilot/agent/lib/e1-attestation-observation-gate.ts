/**
 * E1 observation gate: prove two ≤600s runner-source attestations using the
 * same Summer evaluator + governed-dispatch predicates that arm Symphony.
 *
 * This does not install on Gem. It is the post-install proof command and the
 * local self-check that Summer's close-path is ready when observations exist.
 */
import {
  evaluateRunnerSourceAttestation,
  RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
} from './summer-gem-dark-recovery';
import { dispatchSummerGovernedRequest } from './summer-governed-dispatch';
import type { DecisionJob } from './governor-route';

export const E1_OBSERVATION_GATE_SCHEMA =
  'jovie.summer.e1-attestation-observations/v1' as const;

export type E1ObservationVerdict =
  | {
      readonly ok: true;
      readonly observedAt: string;
      readonly sourceRevision: string;
      readonly ageMs: number;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly probeStatus?: string;
      readonly probeReason?: string;
    };

export type E1ObservationGateResult =
  | {
      readonly status: 'pass';
      readonly schema: typeof E1_OBSERVATION_GATE_SCHEMA;
      readonly maxAgeMs: typeof RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS;
      readonly observations: readonly [
        E1ObservationVerdict & { readonly ok: true },
        E1ObservationVerdict & { readonly ok: true },
      ];
      readonly governedDispatchOutcome: 'symphony-route';
      readonly weakened600sGate: false;
      readonly remainingHumanDecision: null;
    }
  | {
      readonly status: 'fail';
      readonly schema: typeof E1_OBSERVATION_GATE_SCHEMA;
      readonly maxAgeMs: typeof RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS;
      readonly observations: readonly E1ObservationVerdict[];
      readonly governedDispatchOutcome?: string;
      readonly weakened600sGate: false;
      readonly remainingHumanDecision: string;
      readonly reason: string;
    };

function e1DecisionJob(): DecisionJob {
  return {
    kind: 'decision',
    id: 'e1-observation-gate',
    jobClass: 'ambiguous-product-reasoning',
    riskTier: 'medium',
    objective:
      'E1 close-path: confirm fresh runner-source attestation restores Symphony authority',
    requiredCapabilities: ['reasoning', 'product'],
    certificationPredicate: 'source-bound-signed-rate-limited',
    authority: 'automation',
    evidenceRefs: ['e1-attestation-observations', 'jov-6163'],
  };
}

export function verdictForObservation(
  receipt: unknown,
  nowMs: number = Date.now()
): E1ObservationVerdict {
  const probe = evaluateRunnerSourceAttestation(receipt, nowMs);
  if (probe.status !== 'fresh') {
    return {
      ok: false,
      reason: 'attestation-not-fresh',
      probeStatus: probe.status,
      probeReason: probe.reason,
    };
  }
  const ageMs = nowMs - Date.parse(probe.observedAt);
  if (ageMs < 0 || ageMs > RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS) {
    return {
      ok: false,
      reason: 'age-outside-600s-window',
      probeStatus: probe.status,
    };
  }
  return {
    ok: true,
    observedAt: probe.observedAt,
    sourceRevision: probe.sourceRevision,
    ageMs,
  };
}

/**
 * Require two independent fresh observations and confirm governed dispatch
 * selects Symphony (not Cursor recovery, not hold) for the fresher receipt.
 */
export function evaluateE1AttestationObservations(input: {
  readonly observationA: unknown;
  readonly observationB: unknown;
  readonly nowMs?: number;
}): E1ObservationGateResult {
  const nowMs = input.nowMs ?? Date.now();
  const a = verdictForObservation(input.observationA, nowMs);
  const b = verdictForObservation(input.observationB, nowMs);
  const observations = [a, b] as const;

  if (!a.ok || !b.ok) {
    return {
      status: 'fail',
      schema: E1_OBSERVATION_GATE_SCHEMA,
      maxAgeMs: RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
      observations,
      weakened600sGate: false,
      reason: 'one-or-both-observations-not-fresh-within-600s',
      remainingHumanDecision:
        'Install/repair Gem attestation publisher (PR #17725) and collect two ≤600s observations',
    };
  }

  if (a.observedAt === b.observedAt && a.sourceRevision === b.sourceRevision) {
    return {
      status: 'fail',
      schema: E1_OBSERVATION_GATE_SCHEMA,
      maxAgeMs: RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
      observations,
      weakened600sGate: false,
      reason: 'observations-not-independent',
      remainingHumanDecision:
        'Collect a second independent observation (wait >0s, ≤600s) before closing E1',
    };
  }

  // Prefer the fresher observation for dispatch authority check
  const fresher = a.ageMs <= b.ageMs ? input.observationA : input.observationB;
  const dispatch = dispatchSummerGovernedRequest({
    decisionJob: e1DecisionJob(),
    attestationReceipt: fresher,
    nowMs,
  });

  if (dispatch.outcome !== 'symphony-route') {
    return {
      status: 'fail',
      schema: E1_OBSERVATION_GATE_SCHEMA,
      maxAgeMs: RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
      observations,
      governedDispatchOutcome: dispatch.outcome,
      weakened600sGate: false,
      reason: 'governed-dispatch-did-not-select-symphony',
      remainingHumanDecision:
        'Fresh observations did not restore Symphony authority — inspect Summer probe wiring',
    };
  }

  return {
    status: 'pass',
    schema: E1_OBSERVATION_GATE_SCHEMA,
    maxAgeMs: RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
    observations: [a, b],
    governedDispatchOutcome: 'symphony-route',
    weakened600sGate: false,
    remainingHumanDecision: null,
  };
}

/** Fixture receipt matching publisher + Summer evaluator schema. */
export function e1PublisherShapedReceipt(input: {
  readonly nowMs: number;
  readonly ageMs: number;
  readonly sourceRevision?: string;
}): Record<string, unknown> {
  return {
    schema: 'gem-service-attestation/v1',
    sourceRevision: input.sourceRevision ?? 'c'.repeat(40),
    observedAt: new Date(input.nowMs - input.ageMs).toISOString(),
    active: true,
    healthy: true,
    listener: { port: 4041, boundToService: true },
  };
}
