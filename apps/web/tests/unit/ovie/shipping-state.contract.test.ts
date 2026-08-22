import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_TRUTH_STATES, TELEMETRY_BRIDGE } from '@/lib/ovie/program';
import {
  type AuthorityRead,
  type AuthorityReadStatus,
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
      cursor: { gapSequences: [2, 3] },
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
    expect(
      sanitizeErrorMessage(
        'failed ghp_abcdefghijklmnopqrstuvwxyz012345 /home/timwhite/.ssh/id_rsa Bearer abcdef'
      )
    ).not.toMatch(/ghp_|Bearer abcdef|\/home\/timwhite/);
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
