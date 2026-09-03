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
  readMergeQueue,
  readWorkflow,
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

  it('projects Linear-canonical Symphony work with stable shared task identity', async () => {
    const projection = await publish(
      baseline({
        'symphony-runtime': ok('symphony-runtime', {
          running: [],
          retrying: [
            {
              issue_identifier: 'jov-5544',
              issue_url:
                'https://linear.app/jovie/issue/JOV-5544/ui-consolidation-library-cards',
              attempt: 19,
              due_at: '2026-08-22T00:05:00.000Z',
            },
          ],
          blocked: [],
        }),
      })
    );

    expect(projection.operationalTasks).toMatchObject({
      canonicalSource: 'linear',
      cacheMode: 'local-reconciled',
      syncState: 'fresh',
      sourceId: 'symphony-runtime',
      tasks: [
        {
          id: 'linear:JOV-5544',
          linearIdentifier: 'JOV-5544',
          title: 'Ui Consolidation Library Cards',
          workflowState: 'retrying',
          attempt: 19,
          retryAt: '2026-08-22T00:05:00.000Z',
        },
      ],
    });
    expect(projection.sources['symphony-runtime'].entities[0]).toMatchObject({
      entityId: 'linear:JOV-5544',
      sourceId: 'symphony-runtime',
    });
  });

  it('emits task state deltas and retains last-known work when sync fails', async () => {
    const first = await publish(
      baseline({
        'symphony-runtime': ok(
          'symphony-runtime',
          {
            running: [
              {
                issue_identifier: 'JOV-5544',
                title: 'Consolidate library cards',
              },
            ],
            retrying: [],
            blocked: [],
          },
          { sequence: 1, eventId: 'symphony-runtime:task:1' }
        ),
      })
    );
    expect(first.operationalTasks.tasks[0]?.workflowState).toBe('running');

    const second = await publish(
      baseline({
        'symphony-runtime': ok(
          'symphony-runtime',
          {
            running: [],
            retrying: [
              {
                issue_identifier: 'JOV-5544',
                title: 'Consolidate library cards',
              },
            ],
            blocked: [],
          },
          {
            sequence: 2,
            eventId: 'symphony-runtime:task:2',
            sourceRevision: SHA_B,
          }
        ),
      })
    );
    expect(second.operationalTasks.deltas).toEqual([
      {
        taskId: 'linear:JOV-5544',
        kind: 'updated',
        fromState: 'running',
        toState: 'retrying',
        sequence: 2,
      },
    ]);

    const stale = await publish(
      baseline({
        'symphony-runtime': failed('symphony-runtime', 'unavailable', {
          sequence: null,
          eventId: null,
        }),
      })
    );
    expect(stale.operationalTasks.syncState).toBe('stale');
    expect(stale.operationalTasks.tasks).toEqual(second.operationalTasks.tasks);
    expect(stale.operationalTasks.deltas).toEqual([]);
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
  it('does not relabel the runtime endpoint as an official task receipt', async () => {
    const fetchMock = vi.fn();
    const readers = createLiveShippingStateReaders({
      readFile: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }),
      fetch: fetchMock,
    });
    const read = await readers['symphony-task']();
    expect(read).toMatchObject({
      sourceId: 'symphony-task',
      status: 'unavailable',
      schema: null,
      errorCode: 'not-configured',
    });
    const projection = await publish({ 'symphony-task': read });
    expect(projection.sources['symphony-task'].state).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('live GitHub shipping reader', () => {
  function mergeQueueResponse(
    options: {
      readonly hasNextPage?: boolean;
      readonly nodes?: unknown;
      readonly totalCount?: unknown;
    } = {}
  ) {
    return new Response(
      JSON.stringify({
        data: {
          repository: {
            pullRequests: { totalCount: options.totalCount ?? 126 },
            mergeQueue: {
              entries: {
                pageInfo: { hasNextPage: options.hasNextPage ?? false },
                nodes: options.nodes ?? [
                  {
                    id: 'mq-1',
                    position: 1,
                    state: 'QUEUED',
                    pullRequest: { number: 16797, headRefOid: SHA },
                  },
                ],
              },
            },
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  it('reads total open PRs separately from native merge-queue membership', async () => {
    const fetchMock = vi.fn(async () => mergeQueueResponse());
    const read = await readMergeQueue({
      readFile: vi.fn(),
      fetch: fetchMock,
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });

    expect(read).toMatchObject({
      status: 'ok',
      payload: {
        openPullRequests: 126,
        entries: [{ id: 'mq-1', position: 1, state: 'QUEUED' }],
      },
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain('pullRequests(states:OPEN,first:1)');
  });

  it.each([
    ['HTTP failure', () => new Response('{}', { status: 502 })],
    [
      'GraphQL failure',
      () =>
        new Response(JSON.stringify({ errors: [{ message: 'denied' }] }), {
          status: 200,
        }),
    ],
    ['malformed payload', () => mergeQueueResponse({ nodes: 'invalid' })],
    [
      'invalid queue entry',
      () =>
        mergeQueueResponse({
          nodes: [
            {
              id: 'mq-1',
              position: 0,
              state: 'QUEUED',
              pullRequest: { number: 16797, headRefOid: SHA },
            },
          ],
        }),
    ],
    ['invalid open PR count', () => mergeQueueResponse({ totalCount: '126' })],
    [
      'empty truncated page',
      () => mergeQueueResponse({ hasNextPage: true, nodes: [] }),
    ],
    ['invalid JSON', () => new Response('{', { status: 200 })],
    [
      'transport rejection',
      () => {
        throw new Error('offline');
      },
    ],
  ])('fails unavailable on %s', async (_label, responseFactory) => {
    const read = await readMergeQueue({
      readFile: vi.fn(),
      fetch: vi.fn(async () => responseFactory()),
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });

    expect(read).toMatchObject({
      sourceId: 'github-native-merge-queue',
      status: 'unavailable',
    });
  });

  it('distinguishes GitHub rate limiting from authorization failure', async () => {
    const read = await readMergeQueue({
      readFile: vi.fn(),
      fetch: vi.fn(
        async () =>
          new Response('{}', {
            status: 403,
            headers: {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': '1788144000',
            },
          })
      ),
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });

    expect(read).toMatchObject({
      status: 'unavailable',
      errorCode: 'rate-limited',
      errorMessage: 'GitHub request rate limited',
    });
  });

  it('backs off repeated GitHub reads on the same configured transport', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const fetchMock = vi.fn(
      async () =>
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': '120' },
        })
    );
    const io = {
      readFile: vi.fn(),
      fetch: fetchMock,
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    };

    const first = await readMergeQueue(io);
    const second = await readMergeQueue(io);

    expect(first.errorCode).toBe('rate-limited');
    expect(second.errorCode).toBe('rate-limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not turn a truncated queue page into an exact count', async () => {
    const read = await readMergeQueue({
      readFile: vi.fn(),
      fetch: vi.fn(async () => mergeQueueResponse({ hasNextPage: true })),
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });
    expect(read).toMatchObject({ status: 'ok', truncated: true });

    const projection = await publish({ 'github-native-merge-queue': read });
    expect(
      projection.sources['github-native-merge-queue'].counts.queued
    ).toEqual({ state: 'not-measured', value: null });
    expect(
      projection.sources['github-native-merge-queue'].counts.openPullRequests
    ).toEqual({ state: 'measured-nonzero', value: 126 });
  });

  it('reads live state only from the official OpenAI Symphony port', async () => {
    const readFile = vi.fn();
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            generated_at: T0,
            running: [{ issue_identifier: 'JOV-1' }],
            retrying: [],
            blocked: [],
          }),
          { status: 200 }
        )
      )
    );
    const readers = createLiveShippingStateReaders({
      readFile,
      fetch: fetchMock,
    });

    const read = await readers['symphony-runtime']();

    expect(read).toMatchObject({
      status: 'ok',
      sourceTimestamp: T0,
      payload: { running: [{ issue_identifier: 'JOV-1' }] },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:4041/api/v1/state'
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it('projects lease capacity from the canonical Gem fleet receipt', async () => {
    const observedAt = '2026-08-22T00:00:03.000Z';
    const readFile = vi.fn(async () =>
      JSON.stringify({
        schema: 'jovie-fleet-gate/v1',
        observedAt,
        signals: {
          main: { sha: SHA },
          lease: {
            observedAt,
            status: 'ok',
            capacity: {
              accounts: 4,
              available: 2,
              locked: 1,
              cooldown: 1,
            },
          },
        },
      })
    );
    const readers = createLiveShippingStateReaders({
      readFile,
      fetch: vi.fn(),
    });

    const read = await readers['lease-guard-capacity']();
    const projection = await publish({ 'lease-guard-capacity': read });

    expect(read).toMatchObject({
      status: 'ok',
      sourceTimestamp: observedAt,
      sourceRevision: SHA,
      payload: { capacity: { available: 2 } },
    });
    expect(projection.capacityAvailable).toEqual({
      state: 'measured-nonzero',
      value: 2,
    });
    expect(readFile).toHaveBeenCalledWith(
      resolveNamedAuthorityPath('fleet-receipt')
    );
  });

  function productionRunResponse(overrides: Record<string, unknown> = {}) {
    return new Response(
      JSON.stringify({
        workflow_runs: [
          {
            id: 77,
            run_attempt: 2,
            run_number: 9,
            name: `Production Controller ${SHA}`,
            status: 'completed',
            conclusion: 'success',
            head_sha: SHA,
            updated_at: T0,
            ...overrides,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  function productionJobsResponse(jobs: unknown, totalCount?: number) {
    return new Response(
      JSON.stringify({
        total_count:
          totalCount ?? (Array.isArray(jobs) ? jobs.length : undefined),
        jobs,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  }

  function currentMainResponse(sha = SHA) {
    return new Response(JSON.stringify({ sha }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  function ciRunsResponse(runs: unknown[]) {
    return new Response(JSON.stringify({ workflow_runs: runs }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('binds exact-SHA CI to the current main push run', async () => {
    const exactRun = {
      id: 91,
      run_number: 10,
      event: 'push',
      head_branch: 'main',
      head_sha: SHA,
      status: 'completed',
      conclusion: 'success',
      created_at: '2026-08-21T23:50:00.000Z',
      run_started_at: '2026-08-21T23:55:47.000Z',
      updated_at: '2026-08-21T23:56:48.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(currentMainResponse())
      .mockResolvedValueOnce(
        ciRunsResponse([
          {
            ...exactRun,
            id: 93,
            event: 'merge_group',
            head_branch: 'gh-readonly-queue/main/pr-1',
          },
          {
            ...exactRun,
            id: 92,
            event: 'pull_request',
            head_branch: 'feature',
          },
          exactRun,
        ])
      );

    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'exact-sha-ci',
      'ci.yml'
    );

    expect(read).toMatchObject({
      status: 'ok',
      eventId: '91',
      correlation: { ciRunId: '91', sha: SHA },
      measuredMeanings: { ciGreen: true },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/commits/main');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('branch=main&event=push');
  });

  it('fails unavailable when current main has no matching push CI run', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(currentMainResponse(SHA_B))
      .mockResolvedValueOnce(
        ciRunsResponse([
          {
            id: 91,
            run_number: 10,
            event: 'push',
            head_branch: 'main',
            head_sha: SHA,
            status: 'completed',
            conclusion: 'success',
            updated_at: T0,
          },
        ])
      );

    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'exact-sha-ci',
      'ci.yml'
    );

    expect(read).toMatchObject({
      status: 'unavailable',
      errorCode: 'current-main-run-missing',
      sourceRevision: SHA_B,
      correlation: { sha: SHA_B },
    });
  });

  it('uses the exact Production Verified job from the latest run attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(productionRunResponse())
      .mockResolvedValueOnce(
        productionJobsResponse([
          {
            id: 88,
            name: 'Production Verified',
            run_id: 77,
            run_attempt: 2,
            head_sha: SHA,
            status: 'completed',
            conclusion: 'success',
            completed_at: T0,
          },
        ])
      );

    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'production-controller',
      'production-controller.yml'
    );

    expect(read).toMatchObject({
      status: 'ok',
      correlation: {
        ciRunId: '77',
        deploymentId: null,
        sha: SHA,
      },
      measuredMeanings: { productionVerified: true },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      '/actions/runs/77/attempts/2/jobs?per_page=100'
    );
  });

  it.each([
    ['missing run id', { id: null }],
    ['invalid run attempt', { run_attempt: 0 }],
    ['invalid run SHA', { head_sha: 'not-an-exact-sha' }],
  ])('rejects malformed Production Controller identity: %s', async (_label, overrides) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(productionRunResponse(overrides));
    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'production-controller',
      'production-controller.yml'
    );

    expect(read).toMatchObject({
      sourceId: 'production-controller',
      status: 'unavailable',
      errorCode: 'malformed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'duplicate verification jobs',
      [
        {
          id: 88,
          name: 'Production Verified',
          run_id: 77,
          run_attempt: 2,
          head_sha: SHA,
        },
        {
          id: 89,
          name: 'Production Verified',
          run_id: 77,
          run_attempt: 2,
          head_sha: SHA,
        },
      ],
    ],
    [
      'mismatched verification job',
      [
        {
          id: 88,
          name: 'Production Verified',
          run_id: 76,
          run_attempt: 2,
          head_sha: SHA,
        },
      ],
    ],
  ])('rejects %s as unavailable production proof', async (_label, jobs) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(productionRunResponse())
      .mockResolvedValueOnce(productionJobsResponse(jobs));
    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'production-controller',
      'production-controller.yml'
    );

    expect(read).toMatchObject({
      sourceId: 'production-controller',
      status: 'unavailable',
    });
  });

  it.each([
    ['missing verification job', []],
    [
      'failed verification job',
      [
        {
          id: 88,
          name: 'Production Verified',
          run_id: 77,
          run_attempt: 2,
          head_sha: SHA,
          status: 'completed',
          conclusion: 'failure',
          completed_at: T0,
        },
      ],
    ],
  ])('measures %s as false without deployment proof', async (_label, jobs) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(productionRunResponse())
      .mockResolvedValueOnce(productionJobsResponse(jobs));
    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'production-controller',
      'production-controller.yml'
    );

    expect(read).toMatchObject({
      sourceId: 'production-controller',
      status: 'ok',
      correlation: { deploymentId: null },
      errorCode: 'production-not-verified',
      measuredMeanings: { productionVerified: false },
    });
  });

  it.each([
    [
      'jobs HTTP failure',
      () => Promise.resolve(new Response('{}', { status: 502 })),
    ],
    [
      'malformed jobs payload',
      () => Promise.resolve(productionJobsResponse('invalid')),
    ],
    [
      'truncated jobs payload',
      () =>
        Promise.resolve(
          productionJobsResponse(
            Array.from({ length: 100 }, (_, id) => ({
              id,
              name: `unrelated-${id}`,
            })),
            101
          )
        ),
    ],
    ['jobs transport failure', () => Promise.reject(new Error('offline'))],
  ])('fails Production Controller unavailable on %s', async (_label, jobsRead) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(productionRunResponse())
      .mockImplementationOnce(jobsRead);

    const read = await readWorkflow(
      {
        readFile: vi.fn(),
        fetch: fetchMock,
        githubToken: 'test-token',
        githubOwner: 'JovieInc',
        githubRepo: 'Jovie',
      },
      'production-controller',
      'production-controller.yml'
    );

    expect(read).toMatchObject({
      sourceId: 'production-controller',
      status: 'unavailable',
    });
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
