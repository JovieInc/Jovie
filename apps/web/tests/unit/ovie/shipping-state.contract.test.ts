import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_TRUTH_STATES, TELEMETRY_BRIDGE } from '@/lib/ovie/program';
import {
  type AuthorityRead,
  type AuthorityReadStatus,
  M1_SOURCE_TO_PROJECTION_BUDGET_MS as BUDGET,
  emptyCursor,
  FORBIDDEN_ACTUATION,
  FORBIDDEN_QUERY_KEYS,
  getLastKnownShippingState,
  ingestSourceEvent,
  measuredCount,
  publishShippingState,
  resetShippingStatePublisher,
  SHIP_MEANING_KEYS,
  SHIPPING_SOURCE_IDS,
  SHIPPING_SOURCE_READ_TIMEOUT_MS,
  SHIPPING_SOURCE_SCHEMAS,
  SHIPPING_STATE_SCHEMA,
  OBSERVATION_STATES as SHIPPING_STATES,
  type ShippingClock,
  type ShippingSourceId,
  sanitizeOpaqueIdentifier,
  snapshotReaders,
  stopPublishingShippingState,
} from '@/lib/ovie/shipping-state';
import {
  createLiveShippingStateReaders,
  isAllowlistedAuthorityPath,
  NAMED_AUTHORITY_PATHS,
  resolveNamedAuthorityPath,
} from '@/lib/ovie/shipping-state/live';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const T0 = '2026-08-22T00:00:00.000Z';

function clockAt(iso: string): ShippingClock {
  const ms = Date.parse(iso);
  return { nowIso: () => new Date(ms).toISOString(), nowMs: () => ms };
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
    sourceTimestamp: extra.sourceTimestamp ?? T0,
    sourceRevision: extra.sourceRevision ?? SHA,
    sequence: extra.sequence ?? 1,
    eventId: extra.eventId ?? `${sourceId}:1:${SHA}`,
    ...extra,
  };
}

function failed(
  sourceId: ShippingSourceId,
  status: AuthorityReadStatus,
  extra: Partial<AuthorityRead> = {}
): AuthorityRead {
  return {
    sourceId,
    status,
    schema: extra.schema ?? null,
    payload: extra.payload ?? null,
    truncated: false,
    sourceTimestamp: null,
    sourceRevision: null,
    sequence: 1,
    eventId: extra.eventId ?? `${sourceId}:${status}`,
    errorCode: extra.errorCode ?? status,
    errorMessage: extra.errorMessage ?? status,
    ...extra,
  };
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

async function publish(
  snapshots: Partial<Record<ShippingSourceId, AuthorityRead>>,
  clock = clockAt(T0)
) {
  return publishShippingState({
    readers: snapshotReaders(snapshots),
    clock,
  });
}

afterEach(() => {
  vi.useRealTimers();
  resetShippingStatePublisher();
});

describe('ovie.shipping-state.v1 contract', () => {
  it('names every producer schema and program operational-truth states', async () => {
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
    expect(measuredCount(-1)).toEqual({ state: 'not-measured', value: null });
    expect(measuredCount(1.5)).toEqual({ state: 'not-measured', value: null });
    for (const state of OPERATIONAL_TRUTH_STATES) {
      if (state === 'failure') expect(SHIPPING_STATES).toContain('error');
      else if (state !== 'recovery') expect(SHIPPING_STATES).toContain(state);
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

describe('zero, states, ordering, meanings, cadence', () => {
  it('allows zero only after a successful measurement', async () => {
    expect(measuredCount(0)).toEqual({ state: 'measured-zero', value: 0 });
    expect(measuredCount(3)).toEqual({ state: 'measured-nonzero', value: 3 });
    const zero = await publish(
      baseline({
        'lease-guard-capacity': ok('lease-guard-capacity', {
          capacity: { available: 0 },
        }),
      })
    );
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
    const missing = await publish({});
    expect(missing.retrying).toEqual({ state: 'not-measured', value: null });
    expect(missing.capacityAvailable.state).toBe('not-measured');
    expect(missing.meanings.merged.state).toBe('not-measured');
    expect(missing.timeToShipSeconds.state).toBe('not-measured');
  });

  it('measures repository PR inventory, native queue, and completed CI timing', async () => {
    const projection = await publish(
      baseline({
        'github-native-merge-queue': ok('github-native-merge-queue', {
          entries: [{ id: 'mq-1', state: 'QUEUED', position: 1 }],
          openPullRequests: 126,
        }),
        'exact-sha-ci': ok(
          'exact-sha-ci',
          {
            status: 'completed',
            conclusion: 'success',
            created_at: '2026-08-21T23:50:00.000Z',
            run_started_at: '2026-08-21T23:55:47.000Z',
            updated_at: '2026-08-21T23:56:48.000Z',
          },
          {
            correlation: { ciRunId: '1', sha: SHA },
            measuredMeanings: { ciGreen: true },
          }
        ),
      })
    );

    expect(
      projection.sources['github-native-merge-queue'].counts.openPullRequests
    ).toEqual({ state: 'measured-nonzero', value: 126 });
    expect(
      projection.sources['github-native-merge-queue'].counts.queued
    ).toEqual({ state: 'measured-nonzero', value: 1 });
    expect(projection.sources['exact-sha-ci'].durations).toEqual({
      queueWaitMs: { state: 'measured-nonzero', value: 347_000 },
      runDurationMs: { state: 'measured-nonzero', value: 61_000 },
    });
  });

  it.each([
    undefined,
    null,
  ])('does not infer CI timing when run_started_at is %s', async runStartedAt => {
    const projection = await publish(
      baseline({
        'exact-sha-ci': ok('exact-sha-ci', {
          status: 'completed',
          conclusion: 'success',
          created_at: '2026-08-21T23:50:00.000Z',
          run_started_at: runStartedAt,
          updated_at: '2026-08-21T23:56:48.000Z',
        }),
      })
    );

    expect(projection.sources['exact-sha-ci'].durations).toEqual({
      queueWaitMs: { state: 'not-measured', value: null },
      runDurationMs: { state: 'not-measured', value: null },
    });
  });

  it.each([
    { liveSha: null, deployedSha: SHA },
    { liveSha: 'invalid', deployedSha: SHA },
    { liveSha: SHA, deployedSha: null },
    { liveSha: SHA, deployedSha: 'invalid' },
  ])('does not synthesize exact-build false from $liveSha / $deployedSha', async ({
    liveSha,
    deployedSha,
  }) => {
    const projection = await publish(
      baseline({
        'production-controller': ok(
          'production-controller',
          { conclusion: 'success' },
          {
            correlation: { sha: deployedSha },
            measuredMeanings: { productionVerified: true },
          }
        ),
        'live-build-info': ok(
          'live-build-info',
          { commitSha: liveSha },
          {
            correlation: { sha: liveSha },
            measuredMeanings: { exactLiveBuild: false },
          }
        ),
      })
    );

    expect(projection.meanings.exactLiveBuild).toEqual({
      state: 'not-measured',
      value: null,
    });
  });

  it('covers each observation state without synthesizing current truth', async () => {
    expect((await publish(baseline())).state).toBe('fresh');
    resetShippingStatePublisher();
    expect((await publish({})).sources['fleet-receipt'].state).toBe(
      'disconnected'
    );
    const cases: Array<[ShippingSourceId, AuthorityRead, string]> = [
      [
        'exact-sha-ci',
        failed('exact-sha-ci', 'unauthorized', { errorMessage: '401' }),
        'unauthorized',
      ],
      [
        'live-build-info',
        failed('live-build-info', 'unavailable', { errorMessage: '503' }),
        'unavailable',
      ],
      [
        'lease-guard-capacity',
        failed('lease-guard-capacity', 'unknown', {
          schema: SHIPPING_SOURCE_SCHEMAS['lease-guard-capacity'],
          payload: { capacity: { state: 'unknown' } },
        }),
        'unknown',
      ],
    ];
    for (const [sourceId, read, state] of cases) {
      resetShippingStatePublisher();
      expect(
        (await publish({ [sourceId]: read })).sources[sourceId].state
      ).toBe(state);
    }
    resetShippingStatePublisher();
    const mismatch = await publish({
      'fleet-receipt': ok(
        'fleet-receipt',
        { state: 'GREEN' },
        { schema: 'not-a-real-schema' }
      ),
    });
    expect(mismatch.sources['fleet-receipt'].state).toBe('error');
    expect(mismatch.sources['fleet-receipt'].ingest).toBe('schema-mismatch');
    resetShippingStatePublisher();
    const degraded = await publish(
      baseline({
        'github-native-merge-queue': ok(
          'github-native-merge-queue',
          { entries: [{ id: 'e1', state: 'QUEUED', position: 1 }] },
          { truncated: true }
        ),
      })
    );
    expect(degraded.sources['github-native-merge-queue'].state).toBe(
      'degraded'
    );
    expect(degraded.sources['github-native-merge-queue'].truncated).toBe(true);
    resetShippingStatePublisher();
    expect(
      (
        await publish({
          'live-build-info': ok(
            'live-build-info',
            { commitSha: SHA },
            { correlation: { sha: SHA } }
          ),
        })
      ).state
    ).toBe('partial');
  });

  it('separates current observation freshness from durable event age', async () => {
    const fetchedAt = '2026-08-22T01:00:00.000Z';
    const projection = await publish(
      {
        'exact-sha-ci': ok(
          'exact-sha-ci',
          { conclusion: 'success' },
          {
            sourceTimestamp: T0,
            correlation: { ciRunId: '1', sha: SHA },
            measuredMeanings: { ciGreen: true },
          }
        ),
      },
      clockAt(fetchedAt)
    );

    expect(projection.sources['exact-sha-ci']).toMatchObject({
      sourceTimestamp: T0,
      observationTimestamp: fetchedAt,
      freshnessDeadline: '2026-08-22T01:00:10.000Z',
      state: 'fresh',
    });
  });

  it('expires the canonical fleet receipt at its semantic ten-minute TTL', async () => {
    const fetchedAt = '2026-08-22T00:10:00.001Z';
    const projection = await publish(baseline(), clockAt(fetchedAt));

    expect(projection.sources['fleet-receipt']).toMatchObject({
      sourceTimestamp: T0,
      observationTimestamp: fetchedAt,
      freshnessDeadline: '2026-08-22T00:10:10.001Z',
      state: 'stale',
    });
  });

  it('coalesces concurrent publications so completion order cannot regress last-known', async () => {
    let releaseFirst!: (read: AuthorityRead) => void;
    const heldCapacityRead = new Promise<AuthorityRead>(resolve => {
      releaseFirst = resolve;
    });
    const firstReaders = snapshotReaders(baseline());
    const firstCapacityReader = vi.fn(() => heldCapacityRead);
    const readers = {
      ...firstReaders,
      'lease-guard-capacity': firstCapacityReader,
    };

    const first = publishShippingState({
      readers,
      clock: clockAt(T0),
    });
    const second = publishShippingState({
      readers,
      clock: clockAt('2026-08-22T00:00:01.000Z'),
    });

    releaseFirst(
      ok('lease-guard-capacity', {
        capacity: { available: 7, accounts: 4, locked: 1, cooldown: 1 },
      })
    );
    const [firstProjection, secondProjection] = await Promise.all([
      first,
      second,
    ]);

    expect(firstCapacityReader).toHaveBeenCalledTimes(1);
    expect(secondProjection).toBe(firstProjection);
    expect(firstProjection.capacityAvailable).toEqual({
      state: 'measured-nonzero',
      value: 7,
    });
    expect(getLastKnownShippingState()).toBe(firstProjection);
  });

  it('bounds a hung authority reader below the projection latency budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    const readers = snapshotReaders(baseline());
    const hung = new Promise<AuthorityRead>(() => {});
    const publication = publishShippingState({
      readers: { ...readers, 'symphony-runtime': () => hung },
      clock: {
        nowIso: () => new Date(Date.now()).toISOString(),
        nowMs: () => Date.now(),
      },
    });

    await vi.advanceTimersByTimeAsync(SHIPPING_SOURCE_READ_TIMEOUT_MS);
    const projection = await publication;

    expect(projection.latencyMs).toBe(SHIPPING_SOURCE_READ_TIMEOUT_MS);
    expect(projection.withinM1Budget).toBe(true);
    expect(projection.sources['symphony-runtime']).toMatchObject({
      state: 'unavailable',
      lastError: { code: 'reader-timeout' },
    });
  });

  it('serializes concurrent publications with different reader dependencies', async () => {
    let releaseFirst!: (read: AuthorityRead) => void;
    const heldCapacityRead = new Promise<AuthorityRead>(resolve => {
      releaseFirst = resolve;
    });
    const firstBase = snapshotReaders(baseline());
    const secondBase = snapshotReaders(baseline());
    const secondCapacityReader = vi.fn(async () =>
      ok(
        'lease-guard-capacity',
        { capacity: { available: 1 } },
        { sequence: 2, eventId: 'lease-guard-capacity:2:later-request' }
      )
    );
    const first = publishShippingState({
      readers: {
        ...firstBase,
        'lease-guard-capacity': () => heldCapacityRead,
      },
      clock: clockAt(T0),
    });
    const second = publishShippingState({
      readers: {
        ...secondBase,
        'lease-guard-capacity': secondCapacityReader,
      },
      clock: clockAt('2026-08-22T00:00:01.000Z'),
    });

    releaseFirst(ok('lease-guard-capacity', { capacity: { available: 7 } }));
    const [firstProjection, secondProjection] = await Promise.all([
      first,
      second,
    ]);

    expect(firstProjection.capacityAvailable.value).toBe(7);
    expect(secondCapacityReader).toHaveBeenCalledTimes(1);
    expect(secondProjection.capacityAvailable.value).toBe(1);
    expect(getLastKnownShippingState()).toBe(secondProjection);
  });

  it('bounds shared projection caching and rejects backward-clock cache age', async () => {
    const readers = snapshotReaders(baseline());
    const capacityReader = vi.fn(readers['lease-guard-capacity']);
    const configuredReaders = {
      ...readers,
      'lease-guard-capacity': capacityReader,
    };
    const first = await publishShippingState({
      readers: configuredReaders,
      clock: clockAt(T0),
      maxAgeMs: 8_000,
    });
    const exactBoundary = await publishShippingState({
      readers: configuredReaders,
      clock: clockAt('2026-08-22T00:00:08.000Z'),
      maxAgeMs: 8_000,
    });
    expect(exactBoundary).not.toBe(first);
    expect(exactBoundary.projectionId).toBe(first.projectionId);
    expect(capacityReader).toHaveBeenCalledTimes(1);

    const expired = await publishShippingState({
      readers: configuredReaders,
      clock: clockAt('2026-08-22T00:00:08.001Z'),
      maxAgeMs: 8_000,
    });
    expect(expired).not.toBe(first);
    expect(capacityReader).toHaveBeenCalledTimes(2);

    await publishShippingState({
      readers: configuredReaders,
      clock: clockAt('2026-08-21T23:59:59.000Z'),
      maxAgeMs: 8_000,
    });
    expect(capacityReader).toHaveBeenCalledTimes(3);
  });

  it('re-ages cached source truth without rereading its authorities', async () => {
    const readers = snapshotReaders(baseline());
    const capacityReader = vi.fn(readers['lease-guard-capacity']);
    const configuredReaders = {
      ...readers,
      'lease-guard-capacity': capacityReader,
    };
    const first = await publishShippingState({
      readers: configuredReaders,
      clock: clockAt(T0),
      maxAgeMs: 12_000,
    });
    const aged = await publishShippingState({
      readers: configuredReaders,
      clock: clockAt('2026-08-22T00:00:11.000Z'),
      maxAgeMs: 12_000,
    });

    expect(first.state).toBe('fresh');
    expect(aged.state).toBe('stale');
    expect(aged.sources['lease-guard-capacity'].state).toBe('stale');
    expect(aged.projectionId).toBe(first.projectionId);
    expect(capacityReader).toHaveBeenCalledTimes(1);
    expect(getLastKnownShippingState()).toBe(aged);
  });

  it('keeps stop authoritative when a publication is already in flight', async () => {
    let releaseCapacity!: (read: AuthorityRead) => void;
    const heldCapacityRead = new Promise<AuthorityRead>(resolve => {
      releaseCapacity = resolve;
    });
    const readers = snapshotReaders(baseline());
    const publication = publishShippingState({
      readers: {
        ...readers,
        'lease-guard-capacity': () => heldCapacityRead,
      },
      clock: clockAt(T0),
    });

    expect(stopPublishingShippingState()).toBeNull();
    releaseCapacity(ok('lease-guard-capacity', { capacity: { available: 3 } }));
    const stopped = await publication;

    expect(stopped).toMatchObject({ publishing: false, state: 'unknown' });
    expect(stopped.capacityAvailable).toEqual({
      state: 'not-measured',
      value: null,
    });
    expect(getLastKnownShippingState()).toBe(stopped);
  });

  it('keeps a publication from before reset isolated from the new runtime', async () => {
    let releaseOld!: (read: AuthorityRead) => void;
    const heldCapacityRead = new Promise<AuthorityRead>(resolve => {
      releaseOld = resolve;
    });
    const oldReaders = snapshotReaders(baseline());
    const oldPublication = publishShippingState({
      readers: {
        ...oldReaders,
        'lease-guard-capacity': () => heldCapacityRead,
      },
      clock: clockAt(T0),
    });

    resetShippingStatePublisher();
    const replacementReaders = snapshotReaders(
      baseline({
        'lease-guard-capacity': ok('lease-guard-capacity', {
          capacity: { available: 9, accounts: 4, locked: 1, cooldown: 1 },
        }),
      })
    );
    const replacementCapacityReader = vi.fn(
      replacementReaders['lease-guard-capacity']
    );
    const replacementPublication = publishShippingState({
      readers: {
        ...replacementReaders,
        'lease-guard-capacity': replacementCapacityReader,
      },
      clock: clockAt('2026-08-22T00:00:01.000Z'),
    });

    await Promise.resolve();
    expect(replacementCapacityReader).toHaveBeenCalledTimes(1);
    const replacement = await replacementPublication;

    releaseOld(
      ok('lease-guard-capacity', {
        capacity: { available: 1, accounts: 4, locked: 1, cooldown: 1 },
      })
    );
    await oldPublication;

    expect(getLastKnownShippingState()).toBe(replacement);
    expect(getLastKnownShippingState()?.capacityAvailable).toEqual({
      state: 'measured-nonzero',
      value: 9,
    });
  });

  it('drops duplicates, replays, and gaps without replacing truth', () => {
    const ingest = (
      cursor: ReturnType<typeof emptyCursor>,
      eventId: string,
      sequence: number
    ) =>
      ingestSourceEvent(cursor, {
        eventId,
        sequence,
        sourceTimestamp: T0,
        observationTimestamp: '2026-08-22T00:00:01.000Z',
        schemaOk: true,
        reachable: true,
      });
    const first = ingest(emptyCursor(), 'evt-1', 1);
    expect(first.action).toBe('accepted');
    expect(ingest(first.cursor, 'evt-1', 1).action).toBe('duplicate');
    expect(ingest(first.cursor, 'evt-0', 1).action).toBe('replay');
    const gap = ingest(first.cursor, 'evt-4', 4);
    expect(gap).toMatchObject({
      action: 'gap',
      sequenceGap: true,
      cursor: { gapCount: 2, gapRanges: [{ from: 2, to: 3 }] },
    });
    expect(ingest(gap.cursor, 'evt-2', 2).replaceCurrent).toBe(false);
    expect(
      ingestSourceEvent(emptyCursor(), {
        eventId: 'evt-1',
        sequence: 1,
        sourceTimestamp: '2026-08-22T00:10:00.000Z',
        observationTimestamp: T0,
        schemaOk: true,
        reachable: true,
      }).clockSkew
    ).toBe(true);
  });

  it('rejects excessive sequence gaps without enumerating or accepting them', () => {
    const first = ingestSourceEvent(emptyCursor(), {
      eventId: 'evt-1',
      sequence: 1,
      sourceTimestamp: T0,
      observationTimestamp: T0,
      schemaOk: true,
      reachable: true,
    });

    const rejected = ingestSourceEvent(first.cursor, {
      eventId: 'evt-million',
      sequence: 1_000_001,
      sourceTimestamp: T0,
      observationTimestamp: T0,
      schemaOk: true,
      reachable: true,
    });

    expect(rejected).toMatchObject({
      action: 'gap-rejected',
      replaceCurrent: false,
      sequenceGap: true,
      cursor: {
        lastSequence: 1,
        gapCount: 999_999,
        gapRanges: [{ from: 2, to: 1_000_000 }],
      },
    });
  });

  it('reconnects after disconnect and keeps meanings distinct', async () => {
    const clock = clockAt(T0);
    await publish(baseline(), clock);
    await publish({}, clock);
    const recovered = await publish(
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
      }),
      clock
    );
    expect(recovered.sources['symphony-runtime']).toMatchObject({
      recovered: true,
      ingest: 'reconnect',
    });
    expect(recovered.retrying.state).not.toBe('not-measured');
    resetShippingStatePublisher();
    const projection = await publish(
      baseline({
        'github-native-merge-queue': ok(
          'github-native-merge-queue',
          { entries: [{ id: 'e1', state: 'QUEUED', position: 1 }] },
          { measuredMeanings: { queued: true } }
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
    );
    expect(projection.meanings).toEqual({
      merged: { state: 'measured', value: false },
      queued: { state: 'measured', value: true },
      ciGreen: { state: 'measured', value: true },
      productionVerified: { state: 'measured', value: false },
      exactLiveBuild: { state: 'measured', value: false },
    });
  });

  it('measures latency and retains expired last-known on shutdown', async () => {
    let now = Date.parse(T0);
    const clock: ShippingClock = {
      nowIso: () => new Date(now).toISOString(),
      nowMs: () => now,
    };
    const readers = snapshotReaders(baseline());
    const original = readers['fleet-receipt'];
    const projection = await publishShippingState({
      readers: {
        ...readers,
        'fleet-receipt': async () => {
          now += 25;
          return original();
        },
      },
      clock,
    });
    expect(projection.latencyMs).toBeGreaterThanOrEqual(0);
    expect(projection.latencyMs).toBeLessThanOrEqual(BUDGET);
    expect(projection.withinM1Budget).toBe(true);
    expect(projection.sourceTimestamp).toBeNull();
    resetShippingStatePublisher();
    const live = await publish(baseline());
    const stopped = stopPublishingShippingState();
    expect(stopped).toMatchObject({
      publishing: false,
      state: 'stale',
      lastError: { code: 'publisher-stopped' },
      observationTimestamp: live.observationTimestamp,
    });
    expect(stopped?.lastSuccess?.eventId).toBe(live.lastSuccess?.eventId);
    const after = await publish(
      baseline({
        'lease-guard-capacity': ok('lease-guard-capacity', {
          capacity: { available: 9 },
        }),
      }),
      clockAt('2026-08-22T00:00:05.000Z')
    );
    expect(after.publishing).toBe(false);
    expect(after.capacityAvailable.value).not.toBe(9);
    expect(after.observationTimestamp).toBe(live.observationTimestamp);
  });
});

describe('live symphony-task reader', () => {
  it('overrides the shared runtime payload schema so task observations stay fresh', async () => {
    const readers = createLiveShippingStateReaders({
      readFile: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }),
      fetch: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schema: SHIPPING_SOURCE_SCHEMAS['symphony-runtime'],
              running: [],
              retrying: [],
              blocked: [],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      ),
    });
    const read = await readers['symphony-task']();
    expect(read).toMatchObject({
      sourceId: 'symphony-task',
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS['symphony-task'],
    });
    const projection = await publish({ 'symphony-task': read });
    expect(projection.sources['symphony-task'].state).toBe('fresh');
    expect(projection.sources['symphony-task'].lastError).toBeNull();
  });
});

describe('shipping-state security', () => {
  it('refuses arbitrary paths, secrets, and actuation keys', async () => {
    expect(isAllowlistedAuthorityPath('/etc/passwd')).toBe(false);
    expect(isAllowlistedAuthorityPath('/var/log/syslog')).toBe(false);
    expect(NAMED_AUTHORITY_PATHS['fleet-receipt'].startsWith('~/')).toBe(true);
    expect(
      isAllowlistedAuthorityPath(NAMED_AUTHORITY_PATHS['fleet-receipt'])
    ).toBe(true);
    expect(resolveNamedAuthorityPath('exact-sha-ci')).toBeNull();
    const { sanitizeErrorMessage } = await import('@/lib/ovie/shipping-state');
    const githubTokens = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'].map(
      prefix => `${prefix}abcdefghijklmnopqrstuvwxyz012345`
    );
    const sensitiveMessage = `failed ${githubTokens.join(' ')} github_pat_abcdefghijklmnopqrstuvwxyz012345 /home/timwhite/.ssh/id_rsa Bearer abcdef`;
    expect(sanitizeErrorMessage(sensitiveMessage)).not.toMatch(
      /gh[pousr]_|github_pat_|Bearer abcdef|\/home\/timwhite/
    );
    for (const unsafe of [
      ...githubTokens,
      'github_pat_abcdefghijklmnopqrstuvwxyz012345',
      '/Users/timwhite/private.json',
      'contains whitespace',
      'a'.repeat(129),
    ]) {
      expect(sanitizeOpaqueIdentifier(unsafe)).toBeNull();
    }
    expect(sanitizeOpaqueIdentifier('JOV-5248:attempt_2')).toBe(
      'JOV-5248:attempt_2'
    );

    const taintedProjection = await publish(
      baseline({
        'symphony-runtime': ok(
          'symphony-runtime',
          { running: [], retrying: [], blocked: [] },
          {
            schema: githubTokens[0],
            sourceRevision: githubTokens[1],
            eventId: '/Users/timwhite/private.json',
            sequence: -1,
            correlation: {
              workId: githubTokens[2],
              leaseId: '/private/tmp/lease',
              prNumber: -1,
              ciRunId: githubTokens[3],
              deploymentId: githubTokens[4],
              buildId: 'contains whitespace',
              sha: 'not-an-exact-sha',
            },
            errorCode: githubTokens[0],
            errorMessage: sensitiveMessage,
          }
        ),
      })
    );
    const serialized = JSON.stringify(taintedProjection);
    expect(serialized).not.toMatch(
      /gh[pousr]_|github_pat_|Bearer abcdef|timwhite|private\.json/
    );
    expect(taintedProjection.sources['symphony-runtime']).toMatchObject({
      schema: SHIPPING_SOURCE_SCHEMAS['symphony-runtime'],
      sequence: 1,
      sourceRevision: null,
      correlation: {
        workId: null,
        leaseId: null,
        prNumber: null,
        ciRunId: null,
        deploymentId: null,
        buildId: null,
        sha: null,
      },
      lastError: { code: 'source-error' },
    });
    expect(taintedProjection.sources['symphony-runtime'].eventId).not.toContain(
      'timwhite'
    );
    const readFile = vi.fn(async (path: string) => {
      throw Object.assign(new Error(`refused ${path}`), { code: 'ENOENT' });
    });
    const readers = createLiveShippingStateReaders({
      readFile,
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await readers['fleet-receipt']();
    await readers['symphony-runtime']();
    expect(readFile).not.toHaveBeenCalledWith('/etc/passwd');
    for (const [path] of readFile.mock.calls) {
      expect(isAllowlistedAuthorityPath(path)).toBe(true);
    }
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
