import { afterEach, describe, expect, it } from 'vitest';
import { OPERATIONAL_TRUTH_STATES } from '@/lib/ovie/program';
import {
  type AuthorityRead,
  publishShippingState,
  resetShippingStatePublisher,
  SHIPPING_SOURCE_SCHEMAS,
  type ShippingSourceId,
  snapshotReaders,
} from '@/lib/ovie/shipping-state';
import {
  applyShippingStateRead,
  bindShippingStateSourceForTests,
  countViewFromMeasurement,
  createShippingMachine,
  expireShippingStateIfNeeded,
  matchesShippingIdentity,
  parseShippingStateProjection,
  readShippingStateSource,
  resetShippingStateSource,
  SHIPPING_STATE_FRESHNESS_BUDGET_MS,
  SHIPPING_STATE_SCHEMA,
  shippingStateReadFromHttp,
  summarizeFreshnessSamples,
} from '@/lib/ovie/shipping-state-client';

const T0 = Date.parse('2026-08-22T12:00:00.000Z');
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function measured(value: number) {
  return value === 0
    ? { state: 'measured-zero' as const, value: 0 }
    : { state: 'measured-nonzero' as const, value };
}

function meaning(value: boolean) {
  return { state: 'measured' as const, value };
}

function projection(overrides: Record<string, unknown> = {}) {
  return {
    schema: SHIPPING_STATE_SCHEMA,
    projectionId: 'proj-1',
    eventId: 'proj-1',
    sequence: 4,
    producerId: 'ubuntu-operational-truth',
    producerVersion: '1',
    sourceId: 'fleet-receipt',
    entityId: 'ovie.shipping-state',
    cursor: '4',
    sourceRevision: 'rev-4',
    sourceTimestamp: null,
    observationTimestamp: '2026-08-22T12:00:00.000Z',
    emissionTimestamp: '2026-08-22T12:00:00.000Z',
    freshnessDeadline: '2026-08-22T12:00:08.000Z',
    correlation: {
      workId: 'corr-4',
      leaseId: null,
      prNumber: null,
      ciRunId: null,
      deploymentId: null,
      buildId: null,
      sha: null,
    },
    lastSuccess: {
      at: '2026-08-22T12:00:00.000Z',
      sequence: 4,
      eventId: 'proj-1',
    },
    lastError: null,
    state: 'fresh',
    publishing: true,
    latencyMs: 12,
    withinM1Budget: true,
    sources: {
      'symphony-runtime': {
        counts: { running: measured(1) },
      },
      'github-native-merge-queue': {
        counts: { queued: measured(2) },
      },
    },
    meanings: {
      merged: meaning(false),
      queued: meaning(true),
      ciGreen: meaning(true),
      productionVerified: meaning(true),
      exactLiveBuild: meaning(true),
    },
    ...overrides,
  };
}

function ok(
  sourceId: ShippingSourceId,
  payload: Record<string, unknown>,
  extra: Partial<AuthorityRead> = {}
): AuthorityRead {
  return {
    sourceId,
    status: 'ok',
    schema: extra.schema ?? SHIPPING_SOURCE_SCHEMAS[sourceId],
    payload,
    truncated: extra.truncated ?? false,
    sourceTimestamp: extra.sourceTimestamp ?? '2026-08-22T12:00:00.000Z',
    sourceRevision: extra.sourceRevision ?? 'rev-4',
    sequence: extra.sequence ?? 4,
    eventId: extra.eventId ?? `${sourceId}-4`,
    correlation: extra.correlation,
    measuredMeanings: extra.measuredMeanings,
  };
}

describe('ovie.shipping-state.v1 client', () => {
  afterEach(() => {
    resetShippingStateSource();
    resetShippingStatePublisher();
  });

  it('covers truth enums, zeros, sequence, clock, match, budget, and HTTP reads', async () => {
    const parsed = parseShippingStateProjection(projection());
    expect(parsed.ok).toBe(true);
    expect(countViewFromMeasurement(0, 'not_measured').value).toBeNull();
    expect(countViewFromMeasurement(0, 'measured')).toEqual({
      value: 0,
      measurement: 'measured',
      zero: 'measured-zero',
    });
    const apply = (
      read: Parameters<typeof applyShippingStateRead>[1],
      prev = createShippingMachine()
    ) => applyShippingStateRead(prev, read, T0);
    const healthy = apply({ kind: 'projection', payload: projection() });
    const disconnected = apply({ kind: 'disconnected' }, healthy);
    const unknownReadKind = {
      kind: 'future-read-kind',
      reason: 'future-read-kind',
    } as unknown as Parameters<typeof applyShippingStateRead>[1];
    expect({
      fresh: healthy.view.truth,
      stale: apply({
        kind: 'projection',
        payload: projection({
          freshnessDeadline: '2026-08-22T11:59:00.000Z',
        }),
      }).view.truth,
      disconnected: disconnected.view.truth,
      unavailable: apply({ kind: 'unavailable', reason: 'u' }).view.truth,
      unauthorized: apply({ kind: 'unauthorized' }, healthy).view.truth,
      degraded: apply({
        kind: 'projection',
        payload: projection({ state: 'partial' }),
      }).view.truth,
      unknown: apply(
        { kind: 'projection', payload: { schema: 'nope' } },
        healthy
      ).view.truth,
      failure: apply({ kind: 'error', reason: 'x' }, healthy).view.truth,
      recovery: apply(
        {
          kind: 'projection',
          payload: projection({
            sequence: 5,
            projectionId: 'p5',
            eventId: 'p5',
          }),
        },
        disconnected
      ).view.truth,
    }).toEqual(
      Object.fromEntries(OPERATIONAL_TRUTH_STATES.map(state => [state, state]))
    );
    expect(apply(unknownReadKind, healthy).view.truth).toBe('unknown');
    expect(
      parseShippingStateProjection(projection({ state: 'not-measured' }))
    ).toMatchObject({
      ok: true,
      projection: { truth: 'unknown' },
    });
    expect(disconnected.view.queued.value).toBe(2);
    expect(disconnected.view.inFlight.value).toBe(1);
    expect(healthy.view.productionVerified.value).toBe(true);
    expect(
      apply(
        { kind: 'projection', payload: projection({ sequence: 3 }) },
        healthy
      ).view.flags.has('replay')
    ).toBe(true);
    expect(
      apply(
        { kind: 'projection', payload: projection() },
        healthy
      ).view.flags.has('duplicate')
    ).toBe(true);
    expect(
      apply(
        {
          kind: 'projection',
          payload: projection({
            sequence: 6,
            projectionId: 'p6',
            eventId: 'p6',
          }),
        },
        healthy
      ).view.flags.has('sequenceGap')
    ).toBe(true);
    const expired = expireShippingStateIfNeeded(healthy, T0 + 20_000);
    expect(expired.view.sourceTime).toBe('2026-08-22T12:00:00.000Z');
    expect(expired.view.truth).toBe('stale');
    expect(expired.view.queued.value).toBe(2);
    expect(
      matchesShippingIdentity(healthy.view, {
        correlationId: 'corr-4',
        entityId: 'ovie.shipping-state',
        revision: 'rev-4',
      })
    ).toBe(true);
    expect(
      summarizeFreshnessSamples([1200, 4000, 8800]).p95
    ).toBeLessThanOrEqual(SHIPPING_STATE_FRESHNESS_BUDGET_MS);
    bindShippingStateSourceForTests({
      identity: 'test-ubuntu',
      read: async () => ({ kind: 'disconnected' }),
    });
    expect((await readShippingStateSource()).kind).toBe('disconnected');
    expect(shippingStateReadFromHttp(401, { state: 'unauthorized' }).kind).toBe(
      'unauthorized'
    );
    expect(shippingStateReadFromHttp(400, { state: 'error' }).kind).toBe(
      'error'
    );
    expect(shippingStateReadFromHttp(404, projection()).kind).toBe(
      'unavailable'
    );
    expect(shippingStateReadFromHttp(429, projection()).kind).toBe(
      'unavailable'
    );
    expect(shippingStateReadFromHttp(500, { error: 'Unavailable' }).kind).toBe(
      'unavailable'
    );
    expect(shippingStateReadFromHttp(200, projection()).kind).toBe(
      'projection'
    );
  });

  it('preserves the last fresh projection across degraded fallback states', () => {
    const fresh = applyShippingStateRead(
      createShippingMachine(),
      { kind: 'projection', payload: projection() },
      T0
    );
    const degraded = applyShippingStateRead(
      fresh,
      {
        kind: 'projection',
        payload: projection({
          projectionId: 'proj-5',
          eventId: 'proj-5',
          sequence: 5,
          sourceRevision: 'rev-5',
          state: 'partial',
        }),
      },
      T0 + 1000
    );

    expect(degraded.view.truth).toBe('degraded');
    expect(degraded.view.revision).toBe('rev-5');
    expect(degraded.view.lastSuccess?.revision).toBe('rev-4');

    const disconnected = applyShippingStateRead(
      degraded,
      { kind: 'disconnected' },
      T0 + 2000
    );

    expect(disconnected.view.truth).toBe('disconnected');
    expect(disconnected.view.revision).toBe('rev-4');
  });

  it('parses a publisher projection without turning missing sources into zero', async () => {
    const published = await publishShippingState({
      readers: snapshotReaders({
        'symphony-runtime': ok('symphony-runtime', {
          running: [],
          retrying: [],
          blocked: [],
        }),
        'exact-sha-ci': ok(
          'exact-sha-ci',
          { conclusion: 'success' },
          {
            correlation: { ciRunId: '1', sha: SHA },
            measuredMeanings: { ciGreen: true },
          }
        ),
      }),
    });
    const parsed = parseShippingStateProjection(published);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.projection.schema).toBe(SHIPPING_STATE_SCHEMA);
    expect(parsed.projection.queued.measurement).toBe('not_measured');
    expect(parsed.projection.queued.value).toBeNull();
    expect(parsed.projection.queued.zero).not.toBe('measured-zero');
  });
});
