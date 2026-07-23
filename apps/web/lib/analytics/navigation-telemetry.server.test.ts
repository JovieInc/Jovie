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

function createRedis(setResult: 'OK' | null = 'OK') {
  const commands: Array<readonly unknown[]> = [];
  const pipeline = {
    hincrby: vi.fn((...args: unknown[]) => {
      commands.push(['hincrby', ...args]);
      return pipeline;
    }),
    expire: vi.fn((...args: unknown[]) => {
      commands.push(['expire', ...args]);
      return pipeline;
    }),
    exec: vi.fn(async () => commands.map(() => 1)),
  };
  return {
    commands,
    redis: {
      set: vi.fn(
        async (_key: string, _value: string, _options: unknown) => setResult
      ),
      pipeline: vi.fn(() => pipeline),
      del: vi.fn(async () => 1),
    },
  };
}

describe('navigation telemetry aggregate sink', () => {
  beforeEach(() => mockGetRedis.mockReset());

  it('hashes the dedupe id and persists only an expiring aggregate', async () => {
    const { redis, commands } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetry(PAYLOAD, new Date('2026-07-22T12:00:00Z'))
    ).resolves.toEqual({ status: 'accepted' });

    const [dedupeKey, value, options] = redis.set.mock.calls[0] ?? [];
    expect(dedupeKey).toMatch(/^navigation-telemetry:v1:dedupe:[a-f0-9]{24}$/);
    expect(dedupeKey).not.toContain(PAYLOAD.event_id);
    expect(value).toBe('1');
    expect(options).toEqual({
      nx: true,
      ex: NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS,
    });

    const serializedCommands = JSON.stringify(commands);
    expect(serializedCommands).not.toContain(PAYLOAD.event_id);
    expect(serializedCommands).not.toMatch(/user_id|artist_id|pathname|ip/i);
    expect(commands).toContainEqual([
      'expire',
      'navigation-telemetry:v1:day:2026-07-22',
      NAVIGATION_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60,
    ]);
  });

  it('counts deterministic retries without incrementing event aggregates', async () => {
    const { redis, commands } = createRedis(null);
    mockGetRedis.mockReturnValue(redis);

    await expect(recordNavigationTelemetry(PAYLOAD)).resolves.toEqual({
      status: 'duplicate',
    });
    expect(
      commands.filter(command => String(command[2]).startsWith('event|'))
    ).toHaveLength(0);
    expect(commands).toContainEqual([
      'hincrby',
      expect.stringMatching(/navigation-telemetry:v1:day:/),
      'health|duplicates',
      1,
    ]);
  });
});

describe('navigation telemetry baseline privacy', () => {
  const aggregate = (
    overrides: Partial<NavigationTelemetryPayload>,
    count: number
  ) =>
    [
      navigationTelemetryTestUtils.aggregateField({ ...PAYLOAD, ...overrides }),
      count,
    ] as const;

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
