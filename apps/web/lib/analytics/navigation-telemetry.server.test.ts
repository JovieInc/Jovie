import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRedis } = vi.hoisted(() => ({ mockGetRedis: vi.fn() }));

vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));

import {
  NAVIGATION_ITEM_IDS,
  NAVIGATION_PLATFORMS,
  NAVIGATION_VARIANTS,
  type NavigationTelemetryPayload,
} from '../tracking/navigation-telemetry-contract';
import {
  getNavigationTelemetryBaseline,
  NAVIGATION_TELEMETRY_CARDINALITY_SAFETY_MARGIN,
  NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS,
  NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
  NAVIGATION_TELEMETRY_RETENTION_DAYS,
  NavigationTelemetryPrivacyUnavailableError,
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

const IMPRESSION: NavigationTelemetryPayload = {
  ...PAYLOAD,
  event_id: 'opaque-navigation-id:impression',
  event: 'impression',
  source_route: 'library',
  destination_route: 'library',
  input_method: 'none',
  success: true,
};

function createRedis(options?: { readonly loseFirstResponse?: boolean }) {
  const evalCalls: Array<{
    readonly keys: string[];
    readonly args: string[];
  }> = [];
  const dedupeKeys = new Set<string>();
  const lifecycle = new Map<string, Map<string, string>>();
  const contributorSketches = new Map<string, Set<string>>();
  const hash = new Map<string, number>();
  let loseNextResponse = options?.loseFirstResponse === true;

  const increment = (field: string) => {
    hash.set(field, (hash.get(field) ?? 0) + 1);
  };

  const addContributor = (key: string, contributor: string) => {
    const sketch = contributorSketches.get(key) ?? new Set<string>();
    sketch.add(contributor);
    contributorSketches.set(key, sketch);
  };

  const evalScript = vi.fn(async (keys: string[], args: string[]) => {
    evalCalls.push({ keys, args });
    const results: number[] = [];
    const eventCount = (keys.length - 1) / 4;
    for (let index = 0; index < eventCount; index += 1) {
      const dedupeKey = keys[1 + index * 4];
      const lifecycleKey = keys[2 + index * 4];
      const segmentContributorsKey = keys[3 + index * 4];
      const itemContributorsKey = keys[4 + index * 4];
      const argumentIndex = 3 + index * 5;
      const aggregateField = args[argumentIndex] ?? '';
      const unknownItem = args[argumentIndex + 1] === '1';
      const event = args[argumentIndex + 2];
      const contributionCapped = args[argumentIndex + 3] === '1';
      const contributor = args[argumentIndex + 4];
      if (
        !dedupeKey ||
        !lifecycleKey ||
        !segmentContributorsKey ||
        !itemContributorsKey ||
        !contributor
      ) {
        throw new Error('Missing telemetry script input');
      }

      const state = lifecycle.get(lifecycleKey) ?? new Map<string, string>();
      const lifecycleAllowed =
        !contributionCapped ||
        (event === 'impression'
          ? !state.has('impression')
          : event === 'activation'
            ? state.get('impression') === '1' && !state.has('activation')
            : event === 'destination_ready' || event === 'drop_off'
              ? state.get('activation') === '1' && !state.has('outcome')
              : event === 'short_return'
                ? state.get('outcome') === 'destination_ready' &&
                  !state.has('short_return')
                : false);

      increment('health|attempts');
      if (dedupeKeys.has(dedupeKey) || !lifecycleAllowed) {
        increment('health|duplicates');
        results.push(0);
        continue;
      }

      dedupeKeys.add(dedupeKey);
      if (contributionCapped) {
        if (event === 'impression') {
          state.set('impression', '1');
          addContributor(segmentContributorsKey, contributor);
          addContributor(itemContributorsKey, contributor);
        } else if (event === 'activation') {
          state.set('activation', '1');
        } else if (event === 'destination_ready' || event === 'drop_off') {
          state.set('outcome', event);
        } else if (event === 'short_return') {
          state.set('short_return', '1');
        }
        lifecycle.set(lifecycleKey, state);
      }
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
    contributorSketches,
    dedupeKeys,
    evalCalls,
    hash,
    lifecycle,
    redis: {
      createScript: vi.fn((script: string) => ({
        eval: evalScript,
        script,
      })),
    },
  };
}

function contributorCounts(segmentCount: number, itemCount = segmentCount) {
  return {
    segments: new Map([['canonical_customer_ia_v1|web_desktop', segmentCount]]),
    items: new Map([
      ['canonical_customer_ia_v1|web_desktop|library', itemCount],
    ]),
  };
}

describe('navigation telemetry aggregate sink', () => {
  beforeEach(() => {
    mockGetRedis.mockReset();
    vi.stubEnv(
      'SESSION_SECRET',
      'navigation-telemetry-test-secret-at-least-32-characters'
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses only keyed, bounded identities in one atomic aggregate script', async () => {
    const { redis, evalCalls, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetry(
        IMPRESSION,
        'one-account',
        new Date('2026-07-22T12:00:00Z')
      )
    ).resolves.toEqual({ status: 'accepted' });

    const [{ keys, args }] = evalCalls;
    const [
      dailyKey,
      dedupeKey,
      lifecycleKey,
      segmentContributorKey,
      itemContributorKey,
    ] = keys ?? [];
    expect(dedupeKey).toMatch(/^navigation-telemetry:v1:dedupe:[a-f0-9]{24}$/);
    expect(dedupeKey).not.toContain(IMPRESSION.event_id);
    expect(dailyKey).toBe('navigation-telemetry:v1:day:2026-07-22');
    expect(lifecycleKey).toMatch(
      /^navigation-telemetry:v1:lifecycle:2026-07-22:[a-f0-9]{24}:/
    );
    expect(segmentContributorKey).toBe(
      'navigation-telemetry:v1:contributors:2026-07-22:canonical_customer_ia_v1:web_desktop'
    );
    expect(itemContributorKey).toBe(`${segmentContributorKey}:library`);
    expect(args?.[0]).toBe(String(NAVIGATION_TELEMETRY_DEDUP_TTL_SECONDS));
    expect(args?.[1]).toBe(
      String(NAVIGATION_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60)
    );
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(IMPRESSION))
    ).toBe(1);

    const serializedEval = JSON.stringify(evalCalls);
    expect(serializedEval).not.toContain(IMPRESSION.event_id);
    expect(serializedEval).not.toContain('one-account');
    expect(serializedEval).not.toMatch(/user_id|artist_id|pathname|ip/i);
    expect(redis.createScript).toHaveBeenCalledTimes(1);
  });

  it('counts deterministic retries without incrementing event aggregates', async () => {
    const { redis, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetry(IMPRESSION, 'one-account')
    ).resolves.toEqual({ status: 'accepted' });
    await expect(
      recordNavigationTelemetry(IMPRESSION, 'one-account')
    ).resolves.toEqual({ status: 'duplicate' });
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(IMPRESSION))
    ).toBe(1);
    expect(hash.get('health|attempts')).toBe(2);
    expect(hash.get('health|accepted')).toBe(1);
    expect(hash.get('health|duplicates')).toBe(1);
  });

  it('remains idempotent when the first response is lost after atomic commit', async () => {
    const { redis, dedupeKeys, hash } = createRedis({
      loseFirstResponse: true,
    });
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetry(IMPRESSION, 'one-account')
    ).rejects.toThrow('Simulated response loss after atomic commit');
    expect(dedupeKeys.size).toBe(1);

    await expect(
      recordNavigationTelemetry(IMPRESSION, 'one-account')
    ).resolves.toEqual({ status: 'duplicate' });
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(IMPRESSION))
    ).toBe(1);
    expect(hash.get('health|accepted')).toBe(1);
    expect(hash.get('health|duplicates')).toBe(1);
  });

  it('records a valid lifecycle batch in one Redis script call', async () => {
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
      recordNavigationTelemetryBatch([IMPRESSION, PAYLOAD, ready], {
        contributorId: 'one-account',
      })
    ).resolves.toEqual({
      results: [
        { status: 'accepted' },
        { status: 'accepted' },
        { status: 'accepted' },
      ],
    });
    expect(evalCalls).toHaveLength(1);
    expect(evalCalls[0]?.keys).toHaveLength(13);
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(IMPRESSION))
    ).toBe(1);
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(PAYLOAD))).toBe(
      1
    );
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(ready))).toBe(
      1
    );
    expect(hash.get('health|attempts')).toBe(3);
  });

  it('rejects an internal batch over the shared maximum before Redis mutation', async () => {
    const { redis, evalCalls } = createRedis();
    mockGetRedis.mockReturnValue(redis);

    await expect(
      recordNavigationTelemetryBatch(
        Array.from({ length: 9 }, (_, index) => ({
          ...PAYLOAD,
          event_id: `opaque-navigation-${index}:activation`,
        })),
        { contributorId: 'one-account' }
      )
    ).rejects.toThrow('batch exceeds the bounded maximum');
    expect(evalCalls).toEqual([]);
  });

  it('caps one account to one lifecycle and one distinct contribution per item and UTC day', async () => {
    const { redis, contributorSketches, evalCalls, hash, lifecycle } =
      createRedis();
    mockGetRedis.mockReturnValue(redis);

    for (let index = 0; index < 50; index += 1) {
      await recordNavigationTelemetry(
        {
          ...IMPRESSION,
          event_id: `opaque-impression-${String(index).padStart(4, '0')}:impression`,
        },
        'one-account',
        new Date('2026-07-22T12:00:00Z')
      );
    }

    expect(lifecycle).toHaveLength(1);
    expect(contributorSketches).toHaveLength(2);
    expect(
      [...contributorSketches.values()].every(sketch => sketch.size === 1)
    ).toBe(true);
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(IMPRESSION))
    ).toBe(1);
    expect(hash.get('health|attempts')).toBe(50);
    expect(hash.get('health|accepted')).toBe(1);
    expect(hash.get('health|duplicates')).toBe(49);
    expect(JSON.stringify(evalCalls)).not.toContain('one-account');
  });

  it('rejects out-of-order and repeated lifecycle events before they can poison rates or latency', async () => {
    const { redis, hash } = createRedis();
    mockGetRedis.mockReturnValue(redis);
    const activation2 = {
      ...PAYLOAD,
      event_id: 'opaque-navigation-id-2:activation',
    };
    const ready: NavigationTelemetryPayload = {
      ...PAYLOAD,
      event_id: 'opaque-navigation-id:destination_ready',
      event: 'destination_ready',
      latency_bucket: 'le_500ms',
      success: true,
    };
    const dropOff: NavigationTelemetryPayload = {
      ...PAYLOAD,
      event_id: 'opaque-navigation-id:drop_off',
      event: 'drop_off',
      latency_bucket: 'le_10s',
    };

    expect(await recordNavigationTelemetry(PAYLOAD, 'abusive-account')).toEqual(
      { status: 'duplicate' }
    );
    expect(
      await recordNavigationTelemetry(IMPRESSION, 'abusive-account')
    ).toEqual({ status: 'accepted' });
    expect(await recordNavigationTelemetry(PAYLOAD, 'abusive-account')).toEqual(
      { status: 'accepted' }
    );
    expect(
      await recordNavigationTelemetry(activation2, 'abusive-account')
    ).toEqual({ status: 'duplicate' });
    expect(await recordNavigationTelemetry(ready, 'abusive-account')).toEqual({
      status: 'accepted',
    });
    expect(await recordNavigationTelemetry(dropOff, 'abusive-account')).toEqual(
      { status: 'duplicate' }
    );

    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(IMPRESSION))
    ).toBe(1);
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(PAYLOAD))).toBe(
      1
    );
    expect(hash.get(navigationTelemetryTestUtils.aggregateField(ready))).toBe(
      1
    );
    expect(
      hash.get(navigationTelemetryTestUtils.aggregateField(dropOff))
    ).toBeUndefined();
  });

  it('fails closed before Redis mutation when the keyed privacy secret is unavailable', async () => {
    const { redis, evalCalls } = createRedis();
    mockGetRedis.mockReturnValue(redis);
    vi.stubEnv('SESSION_SECRET', '');

    await expect(
      recordNavigationTelemetry(IMPRESSION, 'one-account')
    ).rejects.toBeInstanceOf(NavigationTelemetryPrivacyUnavailableError);
    expect(evalCalls).toEqual([]);
  });

  it('fails closed on an unexpected script response', async () => {
    mockGetRedis.mockReturnValue({
      createScript: vi.fn(() => ({
        eval: vi.fn(async () => [2]),
      })),
    });

    await expect(
      recordNavigationTelemetry(IMPRESSION, 'one-account')
    ).rejects.toThrow('Unexpected navigation telemetry aggregate result');
  });
});

describe('navigation telemetry baseline privacy', () => {
  beforeEach(() => mockGetRedis.mockReset());

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

  it('suppresses cohorts and health below the distinct-contributor threshold', () => {
    const [field, count] = aggregate({ event: 'impression' }, 500);
    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes: [
        { [field]: count, 'health|attempts': 500, 'health|accepted': 500 },
      ],
      contributorCounts: contributorCounts(49),
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

  it('publishes aggregate rates and bounded latency only above the conservative HLL margin', () => {
    const records = [
      aggregate({ event: 'impression' }, 52),
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
      'health|attempts': 54,
      'health|accepted': 52,
      'health|duplicates': 2,
    });

    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes: [hash],
      contributorCounts: contributorCounts(
        NAVIGATION_TELEMETRY_MINIMUM_SAMPLE +
          NAVIGATION_TELEMETRY_CARDINALITY_SAFETY_MARGIN
      ),
      startDate: '2026-06-23',
      endDate: '2026-07-22',
    });

    expect(result.published).toBe(true);
    expect(result.health).toEqual({
      deliveryRate: 52 / 54,
      dedupeRate: 2 / 54,
      unknownItemRate: 0,
    });
    expect(result.segments[0]).toMatchObject({
      suppressed: false,
      denominator: 52,
      activationCount: 40,
      destinationReadyCount: 38,
      activationToReadyP50Bucket: 'le_250ms',
      activationToReadyP95Bucket: 'le_1s',
    });
  });

  it.each([
    NAVIGATION_TELEMETRY_MINIMUM_SAMPLE,
    NAVIGATION_TELEMETRY_MINIMUM_SAMPLE + 1,
  ])('keeps an HLL estimate of %i suppressed at the privacy boundary', count => {
    const [field, impressions] = aggregate({ event: 'impression' }, count);
    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes: [{ [field]: impressions }],
      contributorCounts: contributorCounts(count),
      startDate: '2026-06-23',
      endDate: '2026-07-22',
    });

    expect(result.published).toBe(false);
    expect(result.segments[0]?.suppressed).toBe(true);
  });

  it('clamps all published rates to one even if historical aggregates are malformed', () => {
    const hash = Object.fromEntries([
      aggregate({ event: 'impression' }, 52),
      aggregate({ event: 'activation' }, 500),
      aggregate({ event: 'destination_ready' }, 500),
      aggregate({ event: 'short_return' }, 500),
    ]);
    Object.assign(hash, {
      'health|attempts': 1,
      'health|accepted': 500,
      'health|unknown_items': 500,
    });

    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes: [hash],
      contributorCounts: contributorCounts(52),
      startDate: '2026-06-23',
      endDate: '2026-07-22',
    });
    const segment = result.segments[0];

    expect(segment?.suppressed).toBe(false);
    if (segment && !segment.suppressed) {
      expect(segment.consentCoverageRate).toBeLessThanOrEqual(1);
      expect(segment.destinationReadyCoverageRate).toBeLessThanOrEqual(1);
      expect(segment.shortReturnRate).toBeLessThanOrEqual(1);
      const library = segment.items.library;
      expect(library.suppressed).toBe(false);
      if (!library.suppressed) {
        expect(library.activationRate).toBeLessThanOrEqual(1);
        expect(library.destinationReadyRate).toBeLessThanOrEqual(1);
      }
    }
    expect(result.health?.deliveryRate).toBeLessThanOrEqual(1);
    expect(result.health?.unknownItemRate).toBeLessThanOrEqual(1);
  });

  it('loads exactly the bounded 30-day hashes and distinct-contributor unions', async () => {
    const impression = aggregate({ event: 'impression' }, 1);
    const hgetall = vi.fn();
    const hashExec = vi.fn().mockResolvedValue([
      {
        [impression[0]]: impression[1],
        'health|attempts': 1,
        'health|accepted': 1,
      },
      ...Array.from({ length: 29 }, () => null),
    ]);
    const pfcount = vi.fn();
    const cardinalityResultCount =
      NAVIGATION_VARIANTS.length *
      NAVIGATION_PLATFORMS.length *
      (NAVIGATION_ITEM_IDS.length + 1);
    const cardinalityExec = vi
      .fn()
      .mockResolvedValue(
        Array.from({ length: cardinalityResultCount }, () => 0)
      );
    mockGetRedis.mockReturnValue({
      pipeline: vi
        .fn()
        .mockReturnValueOnce({ exec: hashExec, hgetall })
        .mockReturnValueOnce({ exec: cardinalityExec, pfcount }),
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
    expect(pfcount).toHaveBeenCalledTimes(cardinalityResultCount);
    expect(pfcount.mock.calls.every(call => call.length === 30)).toBe(true);
    expect(baseline).toMatchObject({
      startDate: '2026-06-23',
      endDate: '2026-07-22',
      published: false,
    });
  });

  it.each([
    1, 2,
  ])('%i accounts cannot unsuppress a 30-day cohort regardless of event volume', distinctAccounts => {
    const [field] = aggregate({ event: 'impression' }, 1);
    const hashes = Array.from({ length: 30 }, () => ({
      [field]: 1,
      'health|attempts': 50,
      'health|accepted': 1,
      'health|duplicates': 49,
    }));

    const result = navigationTelemetryTestUtils.readDailyHashes({
      hashes,
      contributorCounts: contributorCounts(distinctAccounts),
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

  it('fails closed if the non-enumerable contributor sketch result is malformed', async () => {
    const hashExec = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 30 }, () => null));
    const cardinalityExec = vi.fn().mockResolvedValue([Number.NaN]);
    mockGetRedis.mockReturnValue({
      pipeline: vi
        .fn()
        .mockReturnValueOnce({ exec: hashExec, hgetall: vi.fn() })
        .mockReturnValueOnce({ exec: cardinalityExec, pfcount: vi.fn() }),
    });

    await expect(getNavigationTelemetryBaseline()).rejects.toBeInstanceOf(
      NavigationTelemetryPrivacyUnavailableError
    );
  });
});
