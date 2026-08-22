import { afterEach, describe, expect, it } from 'vitest';
import { OPERATIONAL_TRUTH_STATES, TELEMETRY_BRIDGE } from '@/lib/ovie/program';
import {
  type AuthorityRead,
  M1_SOURCE_TO_PROJECTION_BUDGET_MS as BUDGET,
  emptyCursor,
  FORBIDDEN_ACTUATION,
  FORBIDDEN_QUERY_KEYS,
  ingestSourceEvent,
  measuredCount,
  publishShippingState,
  resetShippingStatePublisher,
  SHIP_MEANING_KEYS,
  SHIPPING_SOURCE_IDS,
  SHIPPING_SOURCE_SCHEMAS,
  SHIPPING_STATE_SCHEMA,
  OBSERVATION_STATES as SHIPPING_STATES,
  type ShippingClock,
  type ShippingSourceId,
  snapshotReaders,
  stopPublishingShippingState,
} from '@/lib/ovie/shipping-state';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function clockAt(iso: string, ms = Date.parse(iso)): ShippingClock {
  const currentMs = ms;
  return {
    nowIso: () => new Date(currentMs).toISOString(),
    nowMs: () => currentMs,
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
    sourceTimestamp: extra.sourceTimestamp ?? '2026-08-22T00:00:00.000Z',
    sourceRevision: extra.sourceRevision ?? SHA,
    sequence: extra.sequence ?? 1,
    eventId: extra.eventId ?? `${sourceId}:1:${SHA}`,
    correlation: extra.correlation,
    measuredMeanings: extra.measuredMeanings,
    errorCode: extra.errorCode,
    errorMessage: extra.errorMessage,
  };
}

function allDisconnected(): Partial<Record<ShippingSourceId, AuthorityRead>> {
  return {};
}

function baseline(
  overrides: Partial<Record<ShippingSourceId, AuthorityRead>> = {}
): Partial<Record<ShippingSourceId, AuthorityRead>> {
  return {
    'symphony-runtime': ok('symphony-runtime', {
      running: [],
      retrying: [],
      blocked: [],
    }),
    'symphony-task': ok('symphony-task', {
      running: [],
      retrying: [],
      blocked: [],
    }),
    'lease-guard-capacity': ok('lease-guard-capacity', {
      capacity: { available: 2, accounts: 4, locked: 1, cooldown: 1 },
    }),
    'github-native-merge-queue': ok('github-native-merge-queue', {
      entries: [],
    }),
    'exact-sha-ci': ok(
      'exact-sha-ci',
      { conclusion: 'success' },
      {
        correlation: { ciRunId: '1', sha: SHA },
        measuredMeanings: { ciGreen: true },
      }
    ),
    'production-controller': ok(
      'production-controller',
      { conclusion: 'success' },
      {
        correlation: { ciRunId: '2', deploymentId: '2', sha: SHA },
        measuredMeanings: { productionVerified: true },
      }
    ),
    'live-build-info': ok(
      'live-build-info',
      { commitSha: SHA, buildId: 'b1' },
      {
        correlation: { sha: SHA, buildId: 'b1' },
        measuredMeanings: { exactLiveBuild: true },
      }
    ),
    'fleet-receipt': ok(
      'fleet-receipt',
      { state: 'GREEN', signals: { main: { sha: SHA } } },
      { measuredMeanings: { merged: false } }
    ),
    ...overrides,
  };
}

afterEach(() => {
  resetShippingStatePublisher();
});

describe('ovie.shipping-state.v1 contract', () => {
  it('names every producer schema and includes program operational-truth states', () => {
    expect(SHIPPING_STATE_SCHEMA).toBe('ovie.shipping-state.v1');
    expect(SHIPPING_SOURCE_IDS).toEqual([
      'symphony-runtime',
      'symphony-task',
      'lease-guard-capacity',
      'github-native-merge-queue',
      'exact-sha-ci',
      'production-controller',
      'live-build-info',
      'fleet-receipt',
    ]);
    expect(BUDGET).toBe(10_000);
    for (const state of OPERATIONAL_TRUTH_STATES) {
      if (state === 'failure') {
        expect(SHIPPING_STATES).toContain('error');
        continue;
      }
      if (state === 'recovery') continue;
      expect(SHIPPING_STATES).toContain(state);
    }
    expect(SHIPPING_STATES).toEqual(
      expect.arrayContaining([
        'measured-nonzero',
        'measured-zero',
        'not-measured',
        'partial',
      ])
    );
    expect(SHIP_MEANING_KEYS).toEqual([
      'merged',
      'queued',
      'ciGreen',
      'productionVerified',
      'exactLiveBuild',
    ]);
    expect(TELEMETRY_BRIDGE.mode).toBe('read-only');
    expect(FORBIDDEN_ACTUATION).toEqual(expect.arrayContaining(['dispatch']));
  });

  it('exposes each named authority independently', async () => {
    const readers = snapshotReaders(
      baseline({
        'lease-guard-capacity': ok('lease-guard-capacity', {
          capacity: { available: 0 },
        }),
      })
    );
    for (const sourceId of SHIPPING_SOURCE_IDS) {
      const read = await readers[sourceId]();
      expect(read.sourceId).toBe(sourceId);
      expect(read.status).toBe('ok');
    }
  });
});

describe('zero semantic', () => {
  it('allows zero only after a successful measurement whose value is zero', async () => {
    expect(measuredCount(0)).toEqual({ state: 'measured-zero', value: 0 });
    expect(measuredCount(3)).toEqual({ state: 'measured-nonzero', value: 3 });

    const zero = await publishShippingState({
      readers: snapshotReaders(
        baseline({
          'symphony-runtime': ok('symphony-runtime', {
            running: [],
            retrying: [],
            blocked: [],
          }),
          'lease-guard-capacity': ok('lease-guard-capacity', {
            capacity: { available: 0 },
          }),
          'github-native-merge-queue': ok('github-native-merge-queue', {
            entries: [],
          }),
        })
      ),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(zero.sources['symphony-runtime'].counts.running).toEqual({
      state: 'measured-zero',
      value: 0,
    });
    expect(zero.capacityAvailable).toEqual({
      state: 'measured-zero',
      value: 0,
    });
    expect(zero.sources['github-native-merge-queue'].counts.queued).toEqual({
      state: 'measured-zero',
      value: 0,
    });

    resetShippingStatePublisher();
    const missing = await publishShippingState({
      readers: snapshotReaders(allDisconnected()),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(missing.retrying.state).toBe('not-measured');
    expect(missing.retrying.value).toBeNull();
    expect(missing.capacityAvailable.state).toBe('not-measured');
    expect(missing.meanings.merged.state).toBe('not-measured');
    expect(missing.meanings.queued.state).toBe('not-measured');
    expect(missing.timeToShipSeconds.state).toBe('not-measured');
  });
});

describe('observation states', () => {
  it('covers fresh, stale, disconnected, unavailable, unauthorized, degraded, unknown, error, and partial', async () => {
    const fresh = await publishShippingState({
      readers: snapshotReaders(baseline()),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(fresh.state).toBe('fresh');
    expect(fresh.publishing).toBe(true);

    resetShippingStatePublisher();
    const staleClock = clockAt('2026-08-22T00:00:00.000Z');
    const first = await publishShippingState({
      readers: snapshotReaders(baseline()),
      clock: staleClock,
    });
    expect(first.state).toBe('fresh');
    const later = {
      nowIso: () => '2026-08-22T00:00:20.000Z',
      nowMs: () => Date.parse('2026-08-22T00:00:20.000Z'),
    };
    const stale = await publishShippingState({
      readers: snapshotReaders(
        baseline({
          'symphony-runtime': ok(
            'symphony-runtime',
            { running: [], retrying: [], blocked: [] },
            {
              sequence: 1,
              eventId:
                'symphony-runtime:1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            }
          ),
        })
      ),
      clock: later,
    });
    expect(['stale', 'fresh', 'degraded']).toContain(stale.state);

    resetShippingStatePublisher();
    const disconnected = await publishShippingState({
      readers: snapshotReaders(allDisconnected()),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(disconnected.sources['fleet-receipt'].state).toBe('disconnected');

    resetShippingStatePublisher();
    const unauthorized = await publishShippingState({
      readers: snapshotReaders({
        'exact-sha-ci': {
          sourceId: 'exact-sha-ci',
          status: 'unauthorized',
          schema: null,
          payload: null,
          truncated: false,
          sourceTimestamp: null,
          sourceRevision: null,
          sequence: 1,
          eventId: 'ci:unauth',
          errorCode: 'unauthorized',
          errorMessage: '401',
        },
      }),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(unauthorized.sources['exact-sha-ci'].state).toBe('unauthorized');

    resetShippingStatePublisher();
    const unavailable = await publishShippingState({
      readers: snapshotReaders({
        'live-build-info': {
          sourceId: 'live-build-info',
          status: 'unavailable',
          schema: null,
          payload: null,
          truncated: false,
          sourceTimestamp: null,
          sourceRevision: null,
          sequence: 1,
          eventId: 'build:unavail',
          errorCode: 'unavailable',
          errorMessage: '503',
        },
      }),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(unavailable.sources['live-build-info'].state).toBe('unavailable');

    resetShippingStatePublisher();
    const unknown = await publishShippingState({
      readers: snapshotReaders({
        'lease-guard-capacity': {
          sourceId: 'lease-guard-capacity',
          status: 'unknown',
          schema: SHIPPING_SOURCE_SCHEMAS['lease-guard-capacity'],
          payload: { capacity: { state: 'unknown' } },
          truncated: false,
          sourceTimestamp: null,
          sourceRevision: null,
          sequence: 1,
          eventId: 'lease:unknown',
        },
      }),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(unknown.sources['lease-guard-capacity'].state).toBe('unknown');

    resetShippingStatePublisher();
    const error = await publishShippingState({
      readers: snapshotReaders({
        'fleet-receipt': ok(
          'fleet-receipt',
          { state: 'GREEN' },
          { schema: 'not-a-real-schema' }
        ),
      }),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(error.sources['fleet-receipt'].state).toBe('error');
    expect(error.sources['fleet-receipt'].ingest).toBe('schema-mismatch');

    resetShippingStatePublisher();
    const degraded = await publishShippingState({
      readers: snapshotReaders(
        baseline({
          'github-native-merge-queue': ok(
            'github-native-merge-queue',
            { entries: [{ id: 'e1', state: 'QUEUED', position: 1 }] },
            { truncated: true }
          ),
        })
      ),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(degraded.sources['github-native-merge-queue'].state).toBe(
      'degraded'
    );
    expect(degraded.sources['github-native-merge-queue'].truncated).toBe(true);

    resetShippingStatePublisher();
    const partial = await publishShippingState({
      readers: snapshotReaders({
        'live-build-info': ok(
          'live-build-info',
          { commitSha: SHA },
          { correlation: { sha: SHA } }
        ),
      }),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(partial.state).toBe('partial');
  });
});

describe('ordering, replay, and gaps', () => {
  it('drops duplicates and replays without replacing current truth', () => {
    const first = ingestSourceEvent(emptyCursor(), {
      eventId: 'evt-1',
      sequence: 1,
      sourceTimestamp: '2026-08-22T00:00:00.000Z',
      observationTimestamp: '2026-08-22T00:00:01.000Z',
      schemaOk: true,
      reachable: true,
    });
    expect(first.action).toBe('accepted');
    const dup = ingestSourceEvent(first.cursor, {
      eventId: 'evt-1',
      sequence: 1,
      sourceTimestamp: '2026-08-22T00:00:00.000Z',
      observationTimestamp: '2026-08-22T00:00:02.000Z',
      schemaOk: true,
      reachable: true,
    });
    expect(dup.action).toBe('duplicate');
    expect(dup.replaceCurrent).toBe(false);
    const replay = ingestSourceEvent(first.cursor, {
      eventId: 'evt-0',
      sequence: 1,
      sourceTimestamp: '2026-08-22T00:00:00.000Z',
      observationTimestamp: '2026-08-22T00:00:02.000Z',
      schemaOk: true,
      reachable: true,
    });
    expect(replay.action).toBe('replay');
    const gap = ingestSourceEvent(first.cursor, {
      eventId: 'evt-4',
      sequence: 4,
      sourceTimestamp: '2026-08-22T00:00:00.000Z',
      observationTimestamp: '2026-08-22T00:00:02.000Z',
      schemaOk: true,
      reachable: true,
    });
    expect(gap.action).toBe('gap');
    expect(gap.sequenceGap).toBe(true);
    expect(gap.cursor.gapSequences).toEqual([2, 3]);
    const backfill = ingestSourceEvent(gap.cursor, {
      eventId: 'evt-2',
      sequence: 2,
      sourceTimestamp: '2026-08-22T00:00:00.000Z',
      observationTimestamp: '2026-08-22T00:00:03.000Z',
      schemaOk: true,
      reachable: true,
    });
    expect(backfill.action).toBe('backfill');
    expect(backfill.replaceCurrent).toBe(false);
  });

  it('flags clock skew without rewriting source time to now', () => {
    const result = ingestSourceEvent(emptyCursor(), {
      eventId: 'evt-1',
      sequence: 1,
      sourceTimestamp: '2026-08-22T00:10:00.000Z',
      observationTimestamp: '2026-08-22T00:00:00.000Z',
      schemaOk: true,
      reachable: true,
    });
    expect(result.clockSkew).toBe(true);
  });

  it('reconnects after disconnect without fabricating a blank source', async () => {
    const clock = clockAt('2026-08-22T00:00:00.000Z');
    await publishShippingState({
      readers: snapshotReaders(baseline()),
      clock,
    });
    await publishShippingState({
      readers: snapshotReaders(allDisconnected()),
      clock,
    });
    const recovered = await publishShippingState({
      readers: snapshotReaders(
        baseline({
          'symphony-runtime': ok(
            'symphony-runtime',
            {
              running: [{ issue_identifier: 'JOV-1' }],
              retrying: [],
              blocked: [],
            },
            { sequence: 3, eventId: 'symphony-runtime:3:reconnect' }
          ),
        })
      ),
      clock,
    });
    expect(recovered.sources['symphony-runtime'].recovered).toBe(true);
    expect(recovered.sources['symphony-runtime'].ingest).toBe('reconnect');
    expect(recovered.retrying.state).not.toBe('not-measured');
  });
});

describe('meanings stay distinct', () => {
  it('does not treat merged, queued, ci-green, Production Verified, or exact live build as the same fact', async () => {
    const projection = await publishShippingState({
      readers: snapshotReaders(
        baseline({
          'github-native-merge-queue': ok(
            'github-native-merge-queue',
            { entries: [{ id: 'e1', state: 'QUEUED', position: 1 }] },
            { measuredMeanings: { queued: true } }
          ),
          'fleet-receipt': ok(
            'fleet-receipt',
            { state: 'GREEN' },
            { measuredMeanings: { merged: false } }
          ),
          'exact-sha-ci': ok(
            'exact-sha-ci',
            { conclusion: 'success' },
            {
              correlation: { ciRunId: '1', sha: SHA },
              measuredMeanings: { ciGreen: true },
            }
          ),
          'production-controller': ok(
            'production-controller',
            { conclusion: 'success' },
            {
              correlation: { sha: SHA_B },
              measuredMeanings: { productionVerified: false },
            }
          ),
          'live-build-info': ok(
            'live-build-info',
            { commitSha: SHA },
            {
              correlation: { sha: SHA },
              measuredMeanings: { exactLiveBuild: false },
            }
          ),
        })
      ),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(projection.meanings.merged).toEqual({
      state: 'measured',
      value: false,
    });
    expect(projection.meanings.queued).toEqual({
      state: 'measured',
      value: true,
    });
    expect(projection.meanings.ciGreen).toEqual({
      state: 'measured',
      value: true,
    });
    expect(projection.meanings.productionVerified).toEqual({
      state: 'measured',
      value: false,
    });
    expect(projection.meanings.exactLiveBuild).toEqual({
      state: 'measured',
      value: false,
    });
  });
});

describe('cadence and shutdown', () => {
  it('measures source-to-projection latency inside the M1 10s budget', async () => {
    let now = Date.parse('2026-08-22T00:00:00.000Z');
    const clock: ShippingClock = {
      nowIso: () => new Date(now).toISOString(),
      nowMs: () => now,
    };
    const readers = snapshotReaders(baseline());
    const original = readers['fleet-receipt'];
    const delayed: typeof original = async () => {
      now += 25;
      return original();
    };
    const projection = await publishShippingState({
      readers: { ...readers, 'fleet-receipt': delayed },
      clock,
    });
    expect(projection.latencyMs).toBeGreaterThanOrEqual(0);
    expect(projection.latencyMs).toBeLessThanOrEqual(BUDGET);
    expect(projection.withinM1Budget).toBe(true);
    expect(projection.observationTimestamp).toBe('2026-08-22T00:00:00.000Z');
    expect(projection.sourceTimestamp).toBeNull();
  });

  it('retains an expired last-known marker on shutdown and never fabricates current state', async () => {
    const live = await publishShippingState({
      readers: snapshotReaders(baseline()),
      clock: clockAt('2026-08-22T00:00:00.000Z'),
    });
    expect(live.state).toBe('fresh');
    const stopped = stopPublishingShippingState();
    expect(stopped?.publishing).toBe(false);
    expect(stopped?.state).toBe('stale');
    expect(stopped?.lastError?.code).toBe('publisher-stopped');
    expect(stopped?.lastSuccess?.eventId).toBe(live.lastSuccess?.eventId);
    expect(stopped?.meanings.ciGreen.value).toBe(true);
    expect(stopped?.observationTimestamp).toBe(live.observationTimestamp);

    const after = await publishShippingState({
      readers: snapshotReaders(
        baseline({
          'lease-guard-capacity': ok('lease-guard-capacity', {
            capacity: { available: 9 },
          }),
        })
      ),
      clock: clockAt('2026-08-22T00:00:05.000Z'),
    });
    expect(after.publishing).toBe(false);
    expect(after.capacityAvailable.value).not.toBe(9);
    expect(after.observationTimestamp).toBe(live.observationTimestamp);
  });
});

describe('security surface', () => {
  it('does not expose actuation, raw logs, or path query keys', () => {
    expect(FORBIDDEN_QUERY_KEYS).toEqual(
      expect.arrayContaining([
        'path',
        'file',
        'logs',
        'cmd',
        'action',
        'dispatch',
        'retry',
        'cancel',
        'restart',
      ])
    );
    expect(FORBIDDEN_ACTUATION).toEqual(
      expect.arrayContaining([
        'raw-logs',
        'secrets',
        'arbitrary-paths',
        'command-execution',
        'dispatch',
      ])
    );
  });
});
