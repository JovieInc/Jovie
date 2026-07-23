import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRedis } = vi.hoisted(() => ({ mockGetRedis: vi.fn() }));

vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));

import type { NavigationTelemetryPayload } from '../tracking/navigation-telemetry-contract';
import {
  NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS,
  NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
  NAVIGATION_TELEMETRY_RETENTION_DAYS,
  navigationTelemetryTestUtils,
  recordNavigationTelemetry,
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
  const hash = new Map<string, number>();
  let loseNextResponse = options?.loseFirstResponse === true;

  const increment = (field: string) => {
    hash.set(field, (hash.get(field) ?? 0) + 1);
  };

  const evalScript = vi.fn(async (keys: string[], args: string[]) => {
    evalCalls.push({ keys, args });
    const [dedupeKey] = keys;
    if (!dedupeKey) throw new Error('Missing dedupe key');

    if (dedupeKeys.has(dedupeKey)) {
      increment(args[3] ?? '');
      increment(args[5] ?? '');
      return 0 as const;
    }

    dedupeKeys.add(dedupeKey);
    increment(args[2] ?? '');
    increment(args[3] ?? '');
    increment(args[4] ?? '');
    if (args[7] === '1') increment(args[6] ?? '');

    if (loseNextResponse) {
      loseNextResponse = false;
      throw new Error('Simulated response loss after atomic commit');
    }
    return 1 as const;
  });

  return {
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
    const [dedupeKey, dailyKey] = keys ?? [];
    expect(dedupeKey).toMatch(/^navigation-telemetry:v1:dedupe:[a-f0-9]{24}$/);
    expect(dedupeKey).not.toContain(PAYLOAD.event_id);
    expect(dailyKey).toBe('navigation-telemetry:v1:day:2026-07-22');
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

  it('fails closed on an unexpected script response', async () => {
    mockGetRedis.mockReturnValue({
      createScript: vi.fn(() => ({
        eval: vi.fn(async () => 2),
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
});
