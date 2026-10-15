import type {
  ExpectedExposure,
  ExposureEvidence,
  ObservedExposure,
} from '../dogfood-exposure.js';

const EXPOSURE_SCHEMA = 'jovie.dogfood-exposure/v1' as const;

export const START = '2026-10-15T08:00:00.000Z';
export const END = '2026-10-15T08:00:01.000Z';
export function expectedExposure(
  product: 'jov' | 'lyb' = 'jov'
): ExpectedExposure {
  return {
    schema: EXPOSURE_SCHEMA,
    identity: {
      product,
      missionId: 'profile-chat-claim',
      actorRef: 'synthetic-one',
      accountRef: 'account-one',
      sessionRef: 'session-one',
      deviceRef: 'device-one',
      mode: 'early_access',
    },
    artifact: {
      buildId: '120',
      sourceSha: 'a'.repeat(40),
      backendId: 'production-api-v1',
      environment: 'production',
    },
    generation: 'config-10',
    maxAgeMs: 60_000,
    releaseOwner: 'existing-product-owner',
    features: [
      { key: 'scoped-capability', value: 'approved', witness: 'rendered' },
    ],
  };
}

export function observedExposure(
  expected = expectedExposure(),
  observedAt = START
): ObservedExposure {
  return {
    identity: { ...expected.identity },
    artifact: { ...expected.artifact },
    observedAt,
    membership: { eligible: true, bindingRef: 'roster-session-binding' },
    configuration: {
      generation: expected.generation,
      evaluatedAt: START,
      source: 'authoritative',
      online: true,
    },
    boundaries: {
      auth: true,
      consent: true,
      entitlement: true,
      dataIsolation: true,
      spending: true,
      killSwitchClear: true,
    },
    staffOverride: false,
    fixtureOverride: false,
    syntheticMetricsQuarantined: true,
    features: expected.features.map(feature => ({
      key: feature.key,
      value: feature.value,
      witness: {
        kind: feature.witness,
        visible: true,
        executed: true,
        evidenceRef: `sha256:${'d'.repeat(64)}`,
      },
    })),
  };
}

export function exposureEvidence(
  expected = expectedExposure()
): ExposureEvidence {
  return {
    schema: EXPOSURE_SCHEMA,
    expected,
    observations: [observedExposure(expected), observedExposure(expected, END)],
    invalidated: false,
  };
}
