import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_TRUTH_STATES, TELEMETRY_BRIDGE } from '@/lib/ovie/program';
import {
  type AuthorityRead,
  type AuthorityReadStatus,
  M1_SOURCE_TO_PROJECTION_BUDGET_MS as BUDGET,
  emptyCursor,
  FORBIDDEN_ACTUATION,
  FORBIDDEN_QUERY_KEYS,
  freshnessDeadline,
  getLastKnownShippingState,
  ingestSourceEvent,
  measuredCount,
  observationFreshness,
  parseTimestamp,
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
  GEM_BRIDGE_RECEIPT_KEYS,
  gemBridgeReceiptUrl,
  NAMED_AUTHORITY_URLS,
  readMergeQueue,
  readWorkflow,
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

function lanes(idle: number, running = 7): Record<string, unknown> {
  return { schema: 'symphony-lanes-status/v1', running, idle };
}

function baseline(
  overrides: Partial<Record<ShippingSourceId, AuthorityRead>> = {}
): Partial<Record<ShippingSourceId, AuthorityRead>> {
  return {
    'lanes-status': ok('lanes-status', {
      schema: 'symphony-lanes-status/v1',
      running: 7,
      idle: 2,
    }),
    'lane-pull-requests': ok('lane-pull-requests', { pullRequests: [] }),
    'github-merges': ok(
      'github-merges',
      { today: 0 },
      { measuredMeanings: { merged: false } }
    ),
    'summer-runtime': ok('summer-runtime', {
      identity: 'summer',
      availability: 'up',
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
      'lanes-status',
      'lane-pull-requests',
      'github-native-merge-queue',
      'github-merges',
      'exact-sha-ci',
      'production-controller',
      'live-build-info',
      'summer-runtime',
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
        'lanes-status': ok('lanes-status', {
          schema: 'symphony-lanes-status/v1',
          running: 0,
          idle: 0,
        }),
      })
    );
    for (const sourceId of SHIPPING_SOURCE_IDS) {
      const read = await readers[sourceId]();
      expect(read.sourceId).toBe(sourceId);
      expect(read.status).toBe('ok');
    }
  });

  it('projects Linear-canonical lane PR work with stable shared task identity', async () => {
    const projection = await publish(
      baseline({
        'lane-pull-requests': ok('lane-pull-requests', {
          pullRequests: [
            {
              number: 18934,
              title: 'fix(share): keep native share-sheet cancellation a no-op',
              headRefName: 'devin/jov-5544-20260927t045528',
              headRefOid: SHA,
              isDraft: true,
              mergeable: 'MERGEABLE',
              reviewDecision: null,
              updatedAt: '2026-08-22T00:01:00.000Z',
              mergeQueuePosition: null,
            },
            {
              number: 18935,
              title: 'test(ios): certify shipped routes',
              headRefName: 'codex/jov-6095-20260927t045114',
              headRefOid: SHA_B,
              isDraft: false,
              mergeable: 'MERGEABLE',
              reviewDecision: null,
              updatedAt: '2026-08-22T00:00:30.000Z',
              mergeQueuePosition: 2,
            },
          ],
        }),
      })
    );

    expect(projection.operationalTasks).toMatchObject({
      canonicalSource: 'linear',
      cacheMode: 'local-reconciled',
      syncState: 'fresh',
      sourceId: 'lane-pull-requests',
      tasks: [
        {
          id: 'linear:JOV-6095',
          linearIdentifier: 'JOV-6095',
          linearUrl: 'https://linear.app/jovie/issue/jov-6095',
          title: 'test(ios): certify shipped routes',
          workflowState: 'merge-queued',
        },
        {
          id: 'linear:JOV-5544',
          title: 'fix(share): keep native share-sheet cancellation a no-op',
          workflowState: 'running',
          attempt: null,
          retryAt: null,
        },
      ],
    });
    expect(projection.sources['lane-pull-requests'].entities[1]).toMatchObject({
      entityId: 'linear:JOV-5544',
      sourceId: 'lane-pull-requests',
      correlation: { prNumber: 18934, workId: 'JOV-5544', sha: SHA },
    });
    expect(projection.sources['lane-pull-requests'].counts.running).toEqual({
      state: 'measured-nonzero',
      value: 2,
    });
  });

  it('emits task state deltas and retains last-known work when sync fails', async () => {
    const lanePr = (overrides: Record<string, unknown>) => ({
      number: 18934,
      title: 'Consolidate library cards',
      headRefName: 'devin/jov-5544-20260927t045528',
      headRefOid: SHA,
      isDraft: true,
      mergeable: 'MERGEABLE',
      reviewDecision: null,
      updatedAt: T0,
      mergeQueuePosition: null,
      ...overrides,
    });
    const first = await publish(
      baseline({
        'lane-pull-requests': ok(
          'lane-pull-requests',
          { pullRequests: [lanePr({})] },
          { sequence: 1, eventId: 'lane-pull-requests:task:1' }
        ),
      })
    );
    expect(first.operationalTasks.tasks[0]?.workflowState).toBe('running');

    const second = await publish(
      baseline({
        'lane-pull-requests': ok(
          'lane-pull-requests',
          { pullRequests: [lanePr({ mergeable: 'CONFLICTING' })] },
          {
            sequence: 2,
            eventId: 'lane-pull-requests:task:2',
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
        toState: 'blocked',
        sequence: 2,
      },
    ]);

    const stale = await publish(
      baseline({
        'lane-pull-requests': failed('lane-pull-requests', 'unavailable', {
          sequence: null,
          eventId: null,
        }),
      })
    );
    expect(stale.operationalTasks.syncState).toBe('stale');
    expect(stale.operationalTasks.tasks).toEqual(second.operationalTasks.tasks);
    expect(stale.operationalTasks.deltas).toEqual([]);
  });

  it('keeps the freshness primitives reused by other projections honest (JOV-5761)', () => {
    expect(parseTimestamp('not-a-date')).toBeNull();
    expect(parseTimestamp(T0)).toBe(T0);
    expect(freshnessDeadline(T0, 10 * 60_000)).toBe('2026-08-22T00:10:00.000Z');
    expect(
      observationFreshness(
        T0,
        '2026-08-22T00:10:00.000Z',
        '2026-08-22T00:10:00.001Z',
        'fresh'
      )
    ).toBe('stale');
    expect(
      observationFreshness(T0, '2026-08-22T00:10:00.000Z', T0, 'fresh')
    ).toBe('fresh');
  });
});

describe('zero, states, ordering, meanings, cadence', () => {
  it('allows zero only after a successful measurement', async () => {
    expect(measuredCount(0)).toEqual({ state: 'measured-zero', value: 0 });
    expect(measuredCount(3)).toEqual({ state: 'measured-nonzero', value: 3 });
    const zero = await publish(
      baseline({
        'lanes-status': ok('lanes-status', lanes(0, 0)),
      })
    );
    expect(zero.sources['lanes-status'].counts.running).toEqual({
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

  it.each([undefined, null])(
    'does not infer CI timing when run_started_at is %s',
    async runStartedAt => {
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
    }
  );

  it.each([
    { liveSha: null, deployedSha: SHA },
    { liveSha: 'invalid', deployedSha: SHA },
    { liveSha: SHA, deployedSha: null },
    { liveSha: SHA, deployedSha: 'invalid' },
  ])(
    'does not synthesize exact-build false from $liveSha / $deployedSha',
    async ({ liveSha, deployedSha }) => {
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
    }
  );

  it('covers each observation state without synthesizing current truth', async () => {
    expect((await publish(baseline())).state).toBe('fresh');
    resetShippingStatePublisher();
    expect((await publish({})).sources['lanes-status'].state).toBe(
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
        'lanes-status',
        failed('lanes-status', 'unknown', {
          schema: SHIPPING_SOURCE_SCHEMAS['lanes-status'],
          payload: { state: 'unknown' },
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
      'lanes-status': ok('lanes-status', lanes(1), {
        schema: 'not-a-real-schema',
      }),
    });
    expect(mismatch.sources['lanes-status'].state).toBe('error');
    expect(mismatch.sources['lanes-status'].ingest).toBe('schema-mismatch');
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

  it('marks the lanes feed stale once its own `at` is ten minutes old', async () => {
    const fetchedAt = '2026-08-22T00:10:00.001Z';
    const projection = await publish(baseline(), clockAt(fetchedAt));

    expect(projection.delivery.lanes.stale).toBe(true);
    expect(projection.sources['lanes-status']).toMatchObject({
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
      'lanes-status': firstCapacityReader,
    };

    const first = publishShippingState({
      readers,
      clock: clockAt(T0),
    });
    const second = publishShippingState({
      readers,
      clock: clockAt('2026-08-22T00:00:01.000Z'),
    });

    releaseFirst(ok('lanes-status', lanes(7)));
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
      readers: { ...readers, 'lanes-status': () => hung },
      clock: {
        nowIso: () => new Date(Date.now()).toISOString(),
        nowMs: () => Date.now(),
      },
    });

    await vi.advanceTimersByTimeAsync(SHIPPING_SOURCE_READ_TIMEOUT_MS);
    const projection = await publication;

    expect(projection.latencyMs).toBe(SHIPPING_SOURCE_READ_TIMEOUT_MS);
    expect(projection.withinM1Budget).toBe(true);
    expect(projection.sources['lanes-status']).toMatchObject({
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
      ok('lanes-status', lanes(1), {
        sequence: 2,
        eventId: 'lanes-status:2:later-request',
      })
    );
    const first = publishShippingState({
      readers: {
        ...firstBase,
        'lanes-status': () => heldCapacityRead,
      },
      clock: clockAt(T0),
    });
    const second = publishShippingState({
      readers: {
        ...secondBase,
        'lanes-status': secondCapacityReader,
      },
      clock: clockAt('2026-08-22T00:00:01.000Z'),
    });

    releaseFirst(ok('lanes-status', lanes(7)));
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
    const capacityReader = vi.fn(readers['lanes-status']);
    const configuredReaders = {
      ...readers,
      'lanes-status': capacityReader,
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
    const capacityReader = vi.fn(readers['lanes-status']);
    const configuredReaders = {
      ...readers,
      'lanes-status': capacityReader,
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
    expect(aged.sources['lanes-status'].state).toBe('stale');
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
        'lanes-status': () => heldCapacityRead,
      },
      clock: clockAt(T0),
    });

    expect(stopPublishingShippingState()).toBeNull();
    releaseCapacity(ok('lanes-status', lanes(3)));
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
        'lanes-status': () => heldCapacityRead,
      },
      clock: clockAt(T0),
    });

    resetShippingStatePublisher();
    const replacementReaders = snapshotReaders(
      baseline({
        'lanes-status': ok('lanes-status', lanes(9)),
      })
    );
    const replacementCapacityReader = vi.fn(replacementReaders['lanes-status']);
    const replacementPublication = publishShippingState({
      readers: {
        ...replacementReaders,
        'lanes-status': replacementCapacityReader,
      },
      clock: clockAt('2026-08-22T00:00:01.000Z'),
    });

    await Promise.resolve();
    expect(replacementCapacityReader).toHaveBeenCalledTimes(1);
    const replacement = await replacementPublication;

    releaseOld(ok('lanes-status', lanes(1)));
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
        'lanes-status': ok('lanes-status', lanes(3), {
          sequence: 3,
          eventId: 'lanes-status:3:reconnect',
        }),
      }),
      clock
    );
    expect(recovered.sources['lanes-status']).toMatchObject({
      recovered: true,
      ingest: 'reconnect',
    });
    expect(recovered.capacityAvailable.state).not.toBe('not-measured');
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
    const original = readers['lanes-status'];
    const projection = await publishShippingState({
      readers: {
        ...readers,
        'lanes-status': async () => {
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
        'lanes-status': ok('lanes-status', lanes(9)),
      }),
      clockAt('2026-08-22T00:00:05.000Z')
    );
    expect(after.publishing).toBe(false);
    expect(after.capacityAvailable.value).not.toBe(9);
    expect(after.observationTimestamp).toBe(live.observationTimestamp);
  });
});

describe('live GitHub shipping reader', () => {
  function mergeQueueResponse(
    options: {
      readonly hasNextPage?: boolean;
      readonly nodes?: unknown;
      readonly totalCount?: unknown;
      readonly queueTotalCount?: unknown;
    } = {}
  ) {
    const nodes = options.nodes ?? [
      {
        id: 'mq-1',
        position: 1,
        state: 'QUEUED',
        pullRequest: { number: 16797, headRefOid: SHA },
      },
    ];
    return new Response(
      JSON.stringify({
        data: {
          repository: {
            pullRequests: { totalCount: options.totalCount ?? 126 },
            mergeQueue: {
              entries: {
                totalCount:
                  options.queueTotalCount ??
                  (Array.isArray(nodes) ? nodes.length : 0),
                pageInfo: { hasNextPage: options.hasNextPage ?? false },
                nodes,
              },
            },
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  it('reads total open PRs separately from native merge-queue membership', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        mergeQueueResponse()
    );
    const read = await readMergeQueue({
      fetch: fetchMock,
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });

    expect(read).toMatchObject({
      status: 'ok',
      payload: {
        openPullRequests: 126,
        totalCount: 1,
        entries: [{ id: 'mq-1', position: 1, state: 'QUEUED' }],
      },
      delivery: { mergeQueueDepth: { state: 'measured-nonzero', value: 1 } },
    });
    const request = fetchMock.mock.calls[0]?.[1];
    expect(String(request?.body)).toContain(
      'pullRequests(states:OPEN,first:1)'
    );
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
      'queue depth below the listed entries',
      () => mergeQueueResponse({ queueTotalCount: 0 }),
    ],
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

  it('counts queue depth from totalCount even when the entry page is truncated', async () => {
    const read = await readMergeQueue({
      fetch: vi.fn(async () =>
        mergeQueueResponse({ hasNextPage: true, queueTotalCount: 25 })
      ),
      githubToken: 'test-token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
    });
    expect(read).toMatchObject({ status: 'ok', truncated: true });

    const projection = await publish({ 'github-native-merge-queue': read });
    expect(
      projection.sources['github-native-merge-queue'].counts.queued
    ).toEqual({ state: 'measured-nonzero', value: 25 });
    expect(projection.delivery.mergeQueueDepth).toEqual({
      state: 'measured-nonzero',
      value: 25,
    });
    expect(
      projection.sources['github-native-merge-queue'].counts.openPullRequests
    ).toEqual({ state: 'measured-nonzero', value: 126 });
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
  ])(
    'rejects malformed Production Controller identity: %s',
    async (_label, overrides) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(productionRunResponse(overrides));
      const read = await readWorkflow(
        {
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
    }
  );

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
  ])(
    'fails Production Controller unavailable on %s',
    async (_label, jobsRead) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(productionRunResponse())
        .mockImplementationOnce(jobsRead);

      const read = await readWorkflow(
        {
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
    }
  );
});

describe('shipping-state security', () => {
  it('reads only fixed https authorities, and refuses secrets and actuation keys', async () => {
    for (const url of Object.values(NAMED_AUTHORITY_URLS)) {
      expect(new URL(url).protocol).toBe('https:');
    }
    const { sanitizeErrorMessage } = await import('@/lib/ovie/shipping-state');
    const githubTokens = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'].map(
      prefix => `${prefix}abcdefghijklmnopqrstuvwxyz012345`
    );
    const sensitiveMessage = `failed ${githubTokens.join(' ')} GHP_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 github_pat_abcdefghijklmnopqrstuvwxyz012345 /home/timwhite/.ssh/id_rsa Bearer abcdef BEARER ABCDEFGH`;
    expect(sanitizeErrorMessage(sensitiveMessage)).not.toMatch(
      /gh[pousr]_|GHP_|github_pat_|Bearer abcdef|BEARER ABCDEFGH|\/home\/timwhite/i
    );
    for (const unsafe of [
      ...githubTokens,
      'GHP_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
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
        'lanes-status': ok('lanes-status', lanes(1), {
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
        }),
      })
    );
    const serialized = JSON.stringify(taintedProjection);
    expect(serialized).not.toMatch(
      /gh[pousr]_|github_pat_|Bearer abcdef|timwhite|private\.json/
    );
    expect(taintedProjection.sources['lanes-status']).toMatchObject({
      schema: SHIPPING_SOURCE_SCHEMAS['lanes-status'],
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
    expect(taintedProjection.sources['lanes-status'].eventId).not.toContain(
      'timwhite'
    );
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => {
      throw new Error('offline');
    });
    const readers = createLiveShippingStateReaders({ fetch: fetchMock });
    await readers['lanes-status']();
    await readers['summer-runtime']();
    for (const [url] of fetchMock.mock.calls) {
      expect(Object.values(NAMED_AUTHORITY_URLS)).toContain(String(url));
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

describe('truthful blocked-work and ship-time semantics', () => {
  it('never aliases blocked lane work as a terminal failure', async () => {
    const projection = await publish(
      baseline({
        'lane-pull-requests': ok('lane-pull-requests', {
          pullRequests: [
            {
              number: 1,
              title: 'One',
              headRefName: 'devin/jov-1-a',
              mergeable: 'CONFLICTING',
            },
            {
              number: 2,
              title: 'Two',
              headRefName: 'codex/jov-2-b',
              reviewDecision: 'CHANGES_REQUESTED',
            },
          ],
        }),
      })
    );

    expect(projection.sources['lane-pull-requests'].counts.blocked).toEqual({
      state: 'measured-nonzero',
      value: 2,
    });
    expect(projection.terminalFailures).toEqual({
      state: 'not-measured',
      value: null,
    });
  });

  it('requires matched work/build identity before computing ship time', async () => {
    const matching = await publish(
      baseline({
        'github-native-merge-queue': ok(
          'github-native-merge-queue',
          { entries: [] },
          {
            sourceTimestamp: T0,
            correlation: { sha: SHA },
          }
        ),
        'live-build-info': ok(
          'live-build-info',
          { commitSha: SHA },
          {
            sourceTimestamp: '2026-08-22T00:04:00.000Z',
            correlation: { sha: SHA, buildId: 'b1' },
          }
        ),
      })
    );
    expect(matching.timeToShipSeconds).toEqual({
      state: 'measured-nonzero',
      value: 240,
    });

    resetShippingStatePublisher();
    const unmatched = await publish(
      baseline({
        'github-native-merge-queue': ok(
          'github-native-merge-queue',
          { entries: [] },
          {
            sourceTimestamp: T0,
            correlation: { sha: SHA_B },
          }
        ),
        'live-build-info': ok(
          'live-build-info',
          { commitSha: SHA },
          {
            sourceTimestamp: '2026-08-22T00:04:00.000Z',
            correlation: { sha: SHA, buildId: 'b1' },
          }
        ),
      })
    );
    expect(unmatched.timeToShipSeconds).toEqual({
      state: 'not-measured',
      value: null,
    });
  });
});

describe('bounded authenticated Gem transport', () => {
  const bridge = { url: 'https://gem.example.internal/hud', token: 'tok' };
  const lanesReceipt = {
    schema: 'symphony-lanes-status/v1',
    at: T0,
    running: 1,
    idle: 1,
    lanes: { main: { running: 1, slots: 2 } },
  };

  it('addresses only fixed receipt keys on the configured bridge', () => {
    for (const sourceId of SHIPPING_SOURCE_IDS) {
      const url = gemBridgeReceiptUrl(bridge, sourceId);
      if (sourceId in GEM_BRIDGE_RECEIPT_KEYS) {
        expect(url).toBe(
          `https://gem.example.internal/hud/receipts/${sourceId}`
        );
      } else {
        expect(url).toBeNull();
      }
    }
    expect(gemBridgeReceiptUrl(bridge, 'lanes-status')).toBe(
      'https://gem.example.internal/hud/receipts/lanes-status'
    );
    expect(
      gemBridgeReceiptUrl(
        { ...bridge, url: 'https://gem.example.internal/hud///' },
        'lanes-status'
      )
    ).toBe('https://gem.example.internal/hud/receipts/lanes-status');
    for (const bad of [
      { url: 'ftp://gem.example.internal', token: 'tok' },
      { url: 'https://user:pw@gem.example.internal', token: 'tok' },
      { url: 'https://gem.example.internal/?cmd=retry', token: 'tok' },
      { url: 'https://gem.example.internal/#frag', token: 'tok' },
      { url: 'not-a-url', token: 'tok' },
      { url: 'https://gem.example.internal', token: '' },
    ]) {
      expect(gemBridgeReceiptUrl(bad, 'lanes-status')).toBeNull();
    }
  });

  it('reads the lanes status receipt over the bridge with bearer auth', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(lanesReceipt), { status: 200 })
    );
    const readers = createLiveShippingStateReaders({
      fetch: fetchMock,
      gemBridge: bridge,
    });

    const read = await readers['lanes-status']();

    expect(read).toMatchObject({
      status: 'ok',
      sourceTimestamp: T0,
      delivery: {
        lanes: expect.objectContaining({ running: expect.anything() }),
      },
    });
    const call = fetchMock.mock.calls[0];
    expect(String(call?.[0])).toBe(
      'https://gem.example.internal/hud/receipts/lanes-status'
    );
    expect((call?.[1]?.headers as Record<string, string>).authorization).toBe(
      'Bearer tok'
    );
  });

  it.each([
    ['unauthorized', 401, 'unauthorized'],
    ['forbidden', 403, 'unauthorized'],
    ['http failure', 502, 'unavailable'],
  ])(
    'maps bridge %s to an explicit observation state',
    async (_label, status, expected) => {
      const readers = createLiveShippingStateReaders({
        fetch: vi.fn(async () => new Response('{}', { status })),
        gemBridge: bridge,
        nowMs: () => Date.parse(T0),
      });

      expect(await readers['lanes-status']()).toMatchObject({
        status: expected,
      });
    }
  );

  it('reports disconnect and malformed bridge receipts without fabricating', async () => {
    const offline = createLiveShippingStateReaders({
      fetch: vi.fn(async () => {
        throw new Error('connection refused');
      }),
      gemBridge: bridge,
      nowMs: () => Date.parse(T0),
    });
    expect(await offline['lanes-status']()).toMatchObject({
      status: 'disconnected',
    });

    const malformed = createLiveShippingStateReaders({
      fetch: vi.fn(async () => new Response('[]', { status: 200 })),
      gemBridge: bridge,
      nowMs: () => Date.parse(T0),
    });
    expect(await malformed['lanes-status']()).toMatchObject({
      status: 'error',
      errorCode: 'malformed',
    });
  });
});

describe('terminal failures are not aliased to blocked', () => {
  it('measures terminal lane failures separately from blocked work', async () => {
    const projection = await publish(
      baseline({
        'lanes-status': ok('lanes-status', {
          schema: 'symphony-lanes-status/v1',
          running: 1,
          idle: 1,
          failed_by_reason: { watchdog: 2, checkout: 1 },
        }),
      })
    );

    expect(projection.sources['lanes-status'].counts.terminalFailures).toEqual({
      state: 'measured-nonzero',
      value: 3,
    });
    expect(projection.terminalFailures).toEqual({
      state: 'measured-nonzero',
      value: 3,
    });
  });

  it('stays not-measured when the feed reports no failure evidence', async () => {
    const projection = await publish(
      baseline({
        'lanes-status': ok('lanes-status', lanes(1)),
      })
    );

    expect(projection.terminalFailures).toEqual({
      state: 'not-measured',
      value: null,
    });
  });

  it('measures zero only when the failure record is actually empty', async () => {
    const projection = await publish(
      baseline({
        'lanes-status': ok('lanes-status', {
          schema: 'symphony-lanes-status/v1',
          running: 0,
          idle: 0,
          failed_by_reason: {},
        }),
      })
    );

    expect(projection.terminalFailures).toEqual({
      state: 'measured-zero',
      value: 0,
    });
  });
});
