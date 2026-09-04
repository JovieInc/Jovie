import { describe, expect, it } from 'vitest';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

function projectionFixture() {
  return unknownProjection({
    sequence: 1,
    observationTimestamp: '2026-08-22T00:00:00.000Z',
    emissionTimestamp: '2026-08-22T00:00:00.000Z',
    latencyMs: 0,
    publishing: true,
    lastError: null,
  });
}

describe('shipping cockpit client parser', () => {
  it('normalizes new v1 measurements when an older v1 producer omits them', () => {
    const legacy = JSON.parse(JSON.stringify(projectionFixture())) as {
      sources: Record<
        string,
        { counts: Record<string, unknown>; durations?: unknown }
      >;
    };
    for (const source of Object.values(legacy.sources)) {
      delete source.counts.openPullRequests;
      delete source.durations;
    }

    const parsed = parseShippingCockpitProjection(legacy);

    expect(parsed).not.toBeNull();
    expect(
      parsed?.sources['github-native-merge-queue'].counts.openPullRequests
    ).toEqual({ state: 'not-measured', value: null });
    expect(parsed?.sources['exact-sha-ci'].durations).toEqual({
      queueWaitMs: { state: 'not-measured', value: null },
      runDurationMs: { state: 'not-measured', value: null },
    });
  });

  it('rejects structurally incomplete source observations', () => {
    expect(
      parseShippingCockpitProjection({
        schema: 'ovie.shipping-state.v1',
        sources: { 'github-native-merge-queue': {} },
      })
    ).toBeNull();
  });
});
