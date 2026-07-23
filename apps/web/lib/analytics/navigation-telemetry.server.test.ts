import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRedis } = vi.hoisted(() => ({ mockGetRedis: vi.fn() }));

vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));

import type { NavigationTelemetryPayload } from '../tracking/navigation-telemetry-contract';
import {
  getNavigationTelemetryBaseline,
  NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS,
  NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
  NAVIGATION_TELEMETRY_RETENTION_DAYS,
  navigationTelemetryTestUtils,
  recordNavigationTelemetry,
  recordNavigationTelemetryBatch,
} from './navigation-telemetry.server';

const PAYLOAD: NavigationTelemetryPayload = {
  schema_version: 1,
  event_id: 'opaque-navigation-id:activation',
  event: 'activation',
  item_id: 'library',
  source_route: 'chat',
  destination_route: 'library',
  input_method: 'pointer',
  platform: 'web_desktop',
  nav_variant: 'canonical_customer_ia_v1',
  consent_mode: 'explicit',
  latency_bucket: 'na',
  success: false,
};

function createRedis(options?: { readonly loseFirstResponse?: boolean }) {
  const evalCalls: Array<{
    readonly keys: string[];
    readonly args: string[];
  }> = [];
  const dedupeKeys = new Set<string>();
  const contributionKeys = new Set<string>();
  const hash = new Map<string, number>();
  let loseNextResponse = options?.loseFirstResponse === true;

  const increment = (field: string) => {
    hash.set(field, (hash.get(field) ?? 0) + 1);
  };

  const evalScript = vi.fn(async (keys: string[], args: string[]) => {
    evalCalls.push({ keys, args });
    const results: number[] = [];
    const eventCount = (keys.length - 1) / 2;
    for (let index = 0; index < eventCount; index += 1) {
      const dedupeKey = keys[1 + index * 2];
      const contributionKey = keys[2 + index * 2];
      const argumentIndex = 3 + index * 3;
      const aggregateField = args[argumentIndex] ?? '';
      const unknownItem = args[argumentIndex + 1] === '1';
      const contributionCapped = args[argumentIndex + 2] === '1';
      if (!dedupeKey || !contributionKey) {
        throw new Error('Missing telemetry script key');
      }

      increment('health|attempts');
      if (
        dedupeKeys.has(dedupeKey) ||
        (contributionCapped && contributionKeys.has(contributionKey))
      ) {
        increment('health|duplicates');
        results.push(0);
        continue;
      }

      dedupeKeys.add(dedupeKey);
      if (contributionCapped) contributionKeys.add(contributionKey);
      increment(aggregateField);
      increment('health|accepted');
      if (unknownItem) increment('health|unknown_items');
      results.push(1);
    }

    if (loseNextResponse) {
      loseNextResponse = false;
      throw new Error('Simulated response loss after atomic commit');
    }
    return results;
  });

  return {
    contributionKeys,
    dedupeKeys,
    evalCalls,
    hash,
    redis: {
      createScript: vi.fn((script: string) => ({
        eval: evalScript,
        script,
      })),
    },
  };
}

describe('navigation telemetry aggregate sink', () => {
  beforeEach(() => mockGetRedis.mockReset());

  it('hashes the dedupe id and sends only bounded aggregate fields to one script', async () => {
    const { redis, evalCalls, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetry(PAYLOAD, new Date('2026-07-22T12:00:00Z'))
    ).resolves.toEqual({ status: 'accepted' });

    const [{ keys, args }] = evalCalls;
    const [dailyKey, dedupeKey, contributionKey] = keys ?? [];
    expect(dedupeKey).toMatch(/^navigation-telemetry:v1:dedupe:[a-f0-9]{24}$/);
    expect(dedupeKey).not.toContain(PAYLOAD.event_id);
    expect(dailyKey).toBe('navigation-telemetry:v1:day:2026-07-22');
    expect(contributionKey).toBe(`${dedupeKey}:uncapped`);
    expect(args?.[0]).toBe(String(NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS));
    expect(args?.[1]).toBe(
      String(NAVIGATION_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60)
    );
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(PAYLOAD))).toBe(
      1
    );

    const serializedEval = JSON.stringify(evalCalls);
    expect(serializedEval).not.toContain(PAYLOAD.event_id);
    expect(serializedEval).not.toMatch(/user_id|artist_id|pathname|ip/i);
    expect(redis.createScript).toHaveBeenCalledTimes(1);
  });

  it('counts deterministic retries without incrementing event aggregates', async () => {
    const { redis, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(recordNavigationTelemetry(PAYLOAD)).resolves.toEqual({
      status: 'accepted',
    });
    await expect(recordNavigationTelemetry(PAYLOAD)).resolves.toEqual({
      status: 'duplicate',
    });
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(PAYLOAD))).toBe(
      1
    );
    expect(hash.get('health|attempts')).toBe(2);
    expect(hash.get('health|accepted')).toBe(1);
    expect(hash.get('health|duplicates')).toBe(1);
  });

  it('remains idempotent when the first response is lost after atomic commit', async () => {
    const { redis, dedupeKeys, hash } = createRedis({
      loseFirstResponse: true,
    });
    mockGetRedis.mockReturnValue(redis);

    await expect(recordNavigationTelemetry(PAYLOAD)).rejects.toThrow(
      'Simulated response loss after atomic commit'
    );
    expect(dedupeKeys.size).toBe(1);

    await expect(recordNavigationTelemetry(PAYLOAD)).resolves.toEqual({
      status: 'duplicate',
    });
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(PAYLOAD))).toBe(
      1
    );
    expect(hash.get('health|accepted')).toBe(1);
    expect(hash.get('health|duplicates')).toBe(1);
  });

  it('records a bounded batch in one Redis script call', async () => {
    const { redis, evalCalls, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);
    const ready: NavigationTelemetryPayload = {
      ...PAYLOAD,
      event_id: 'opaque-navigation-id:destination_ready',
      event: 'destination_ready',
      latency_bucket: 'le_500ms',
      success: true,
    };

    await expect(
      recordNavigationTelemetryBatch([PAYLOAD, ready])
    ).resolves.toEqual({
      results: [{ status: 'accepted' }, { status: 'accepted' }],
    });
    expect(evalCalls).toHaveLength(1);
    expect(evalCalls[0]?.keys).toHaveLength(5);
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(PAYLOAD))).toBe(
      1
    );
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(ready))).toBe(
      1
    );
    expect(hash.get('health|attempts')).toBe(2);
  });

  it('rejects an internal batch over the shared maximum before Redis mutation', async () => {
    const { redis, evalCalls } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetryBatch(
        Array.from({ length: 9 }, (_, index) => ({
          ...PAYLOAD,
          event_id: `opaque-navigation-${index}:activation`,
        }))
      )
    ).rejects.toThrow('batch exceeds the bounded maximum');
    expect(evalCalls).toEqual([]);
  });

  it('caps one account to one impression contribution per item and UTC day', async () => {
    const { redis, contributionKeys, evalCalls, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);
    const impression: NavigationTelemetryPayload = {
      ...PAYLOAD,
      event_id: 'opaque-impression-id-0001:impression',
      event: 'impression',
      item_id: 'library',
      source_route: 'library',
      destination_route: 'library',
      input_method: 'none',
      latency_bucket: 'na',
      success: true,
    };

    for (let index = 0; index < 50; index += 1) {
      await recordNavigationTelemetryBatch(
        [
          {
            ...impression,
            event_id: `opaque-impression-${String(index).padStart(4, '0')}:impression`,
          },
        ],
        {
          contributorId: 'one-account',
          recordedAt: new Date('2026-07-22T12:00:00Z'),
        }
      );
    }

    expect(contributionKeys.size).toBe(1);
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(impression))
    ).toBe(1);
    expect(hash.get('health|attempts')).toBe(50);
    expect(hash.get('health|accepted')).toBe(1);
    expect(hash.get('health|duplicates')).toBe(49);
    expect(JSON.stringify(evalCalls)).not.toContain('one-account');
    expect([...contributionKeys][0]).toMatch(
      /^navigation-telemetry:v1:contribution:[a-f0-9]{24}:/
    );
  });

  it('fails closed on an unexpected script response', async () => {
    mockGetRedis.mockReturnValue({
      createScript: vi.fn(() => ({
        eval: vi.fn(async () => [2]),
      })),
    });

    await expect(recordNavigationTelemetry(PAYLOAD)).rejects.toThrow(
      'Unexpected navigation telemetry aggregate result'
    );
  });
});

describe('navigation telemetry baseline privacy', () => {
  const aggregate = (
    overrides: Partial<NavigationTelemetryPayload>,
    count: number
  ) => {
    const event = overrides.event ?? PAYLOAD.event;
    const eventDefaults: Partial<NavigationTelemetryPayload> =
      event === 'impression'
        ? {
            source_route: 'library',
            destination_route: 'library',
            input_method: 'none',
            latency_bucket: 'na',
            success: true,
          }
        : event === 'destination_ready'
          ? { latency_bucket: 'le_500ms', success: true }
          : event === 'activation'
            ? { latency_bucket: 'na', success: false }
            : { latency_bucket: 'le_10s', success: false };

    return [
      navigationTelemetryTestUtils.aggregateField({
        ...PAYLOAD,
        ...eventDefaults,
        ...overrides,
      }),
      count,
    ] as const;
  };

  it('suppresses cohorts and health below the minimum sample', () => {
    const [field, count] = aggregate({ event: 'impression' }, 49);
    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes: [
        { [field]: count, 'health|attempts': 49, 'health|accepted': 49 },
      ],
      startDate: '2026-06-23',
      endDate: '2026-07-22',
    });

    expect(result.published).toBe(false);
    expect(result.health).toBeNull();
    expect(result.segments).toEqual([
      {
        navVariant: 'canonical_customer_ia_v1',
        platform: 'web_desktop',
        suppressed: true,
        minimumSample: NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
      },
    ]);
  });

  it('publishes only aggregate rates and bounded latency quantiles at k=50', () => {
    const records = [
      aggregate({ event: 'impression' }, 50),
      aggregate({ event: 'activation' }, 40),
      aggregate(
        {
          event: 'destination_ready',
          latency_bucket: 'le_250ms',
          success: true,
        },
        20
      ),
      aggregate(
        { event: 'destination_ready', latency_bucket: 'le_1s', success: true },
        18
      ),
      aggregate({ event: 'drop_off' }, 2),
      aggregate({ event: 'short_return' }, 4),
    ];
    const hash = Object.fromEntries(records);
    Object.assign(hash, {
      'health|attempts': 52,
      'health|accepted': 50,
      'health|duplicates': 2,
    });

    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes: [hash],
      startDate: '2026-06-23',
      endDate: '2026-07-22',
    });

    expect(result.published).toBe(true);
    expect(result.health).toEqual({
      deliveryRate: 50 / 52,
      dedupeRate: 2 / 52,
      unknownItemRate: 0,
    });
    expect(result.segments[0]).toMatchObject({
      suppressed: false,
      denominator: 50,
      activationCount: 40,
      destinationReadyCount: 38,
      activationToReadyP50Bucket: 'le_250ms',
      activationToReadyP95Bucket: 'le_1s',
    });
  });

  it('loads exactly the bounded 30-day baseline from Redis', async () => {
    const impression = aggregate({ event: 'impression' }, 1);
    const hgetall = vi.fn();
    const exec = vi.fn().mockResolvedValue([
      {
        [impression[0]]: impression[1],
        'health|attempts': 1,
        'health|accepted': 1,
      },
      ...Array.from({ length: 29 }, () => null),
    ]);
    mockGetRedis.mockReturnValue({
      pipeline: vi.fn(() => ({
        hgetall,
        exec,
      })),
    });

    const baseline = await getNavigationTelemetryBaseline(
      new Date('2026-07-22T18:00:00Z')
    );

    expect(hgetall).toHaveBeenCalledTimes(30);
    expect(hgetall).toHaveBeenNthCalledWith(
      1,
      'navigation-telemetry:v1:day:2026-06-23'
    );
    expect(hgetall).toHaveBeenNthCalledWith(
      30,
      'navigation-telemetry:v1:day:2026-07-22'
    );
    expect(baseline).toMatchObject({
      startDate: '2026-06-23',
      endDate: '2026-07-22',
      published: false,
    });
  });

  it('one account cannot unsuppress a 30-day cohort', () => {
    const [field] = aggregate({ event: 'impression' }, 1);
    const hashes = Array.from({ length: 30 }, () => ({
      [field]: 1,
      'health|attempts': 50,
      'health|accepted': 1,
      'health|duplicates': 49,
    }));

    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes,
      startDate: '2026-06-23',
      endDate: '2026-07-22',
    });

    expect(result.published).toBe(false);
    expect(result.health).toBeNull();
    expect(result.segments[0]).toMatchObject({
      suppressed: true,
      minimumSample: NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
    });
  });
});
