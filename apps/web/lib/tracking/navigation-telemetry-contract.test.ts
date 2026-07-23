import { describe, expect, it } from 'vitest';
import {
  allowlistNavigationItemId,
  bucketNavigationLatency,
  bucketNavigationRoute,
  NAVIGATION_LATENCY_BUCKETS,
  NAVIGATION_TELEMETRY_MAX_BATCH_SIZE,
  NAVIGATION_TELEMETRY_SCHEMA_VERSION,
  navigationLatencyBucketUpperBoundMs,
  navigationTelemetryBatchSchema,
  navigationTelemetryPayloadSchema,
} from './navigation-telemetry-contract';

const VALID_PAYLOAD = {
  schema_version: NAVIGATION_TELEMETRY_SCHEMA_VERSION,
  event_id: 'navigation-1234567890:activation',
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
} as const;

describe('navigation telemetry contract', () => {
  it('buckets routes without preserving dynamic IDs, queries, or fragments', () => {
    expect(
      bucketNavigationRoute(
        '/app/chat/private-thread-id?query=secret-message#artist-name'
      )
    ).toBe('chat');
    expect(
      bucketNavigationRoute('/app/releases/private-release-id/tasks?tab=lyrics')
    ).toBe('library');
    expect(
      bucketNavigationRoute('/app/settings/account?email=user@test.dev')
    ).toBe('settings');
    expect(bucketNavigationRoute('/app/unknown/private-value')).toBe(
      'other_app'
    );
  });

  it('maps unknown item IDs to the only allowed unknown bucket', () => {
    expect(allowlistNavigationItemId('library')).toBe('library');
    expect(allowlistNavigationItemId('artist-123-secret')).toBe('unknown');
  });

  it('uses inclusive bounded latency thresholds and published upper bounds', () => {
    const cases = [
      [-1, 'na'],
      [Number.NaN, 'na'],
      [0, 'le_100ms'],
      [100, 'le_100ms'],
      [101, 'le_250ms'],
      [250, 'le_250ms'],
      [251, 'le_500ms'],
      [500, 'le_500ms'],
      [501, 'le_1s'],
      [1000, 'le_1s'],
      [1001, 'le_2_5s'],
      [2500, 'le_2_5s'],
      [2501, 'le_5s'],
      [5000, 'le_5s'],
      [5001, 'le_10s'],
      [10_000, 'le_10s'],
      [10_001, 'gt_10s'],
    ] as const;

    for (const [duration, bucket] of cases) {
      expect(bucketNavigationLatency(duration)).toBe(bucket);
    }

    expect(
      NAVIGATION_LATENCY_BUCKETS.map(bucket =>
        navigationLatencyBucketUpperBoundMs(bucket)
      )
    ).toEqual([null, 100, 250, 500, 1000, 2500, 5000, 10_000, 10_001]);
  });

  it('accepts only strict non-empty batches of at most eight events', () => {
    const maxBatch = {
      schema_version: 1,
      events: Array.from(
        { length: NAVIGATION_TELEMETRY_MAX_BATCH_SIZE },
        (_, index) => ({
          ...VALID_PAYLOAD,
          event_id: `navigation-${index}-123456:activation`,
        })
      ),
    };

    expect(navigationTelemetryBatchSchema.safeParse(maxBatch).success).toBe(
      true
    );
    expect(
      navigationTelemetryBatchSchema.safeParse({
        ...maxBatch,
        events: [],
      }).success
    ).toBe(false);
    expect(
      navigationTelemetryBatchSchema.safeParse({
        ...maxBatch,
        events: [
          ...maxBatch.events,
          {
            ...VALID_PAYLOAD,
            event_id: 'navigation-overflow-123456:activation',
          },
        ],
      }).success
    ).toBe(false);
    expect(
      navigationTelemetryBatchSchema.safeParse({
        ...maxBatch,
        raw_path: '/private',
      }).success
    ).toBe(false);
  });

  it('accepts only the versioned low-cardinality payload', () => {
    expect(
      navigationTelemetryPayloadSchema.safeParse(VALID_PAYLOAD).success
    ).toBe(true);
    expect(
      navigationTelemetryPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        schema_version: 2,
      }).success
    ).toBe(false);
    expect(
      navigationTelemetryPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        item_id: 'private-artist-id',
      }).success
    ).toBe(false);
  });

  it('rejects impossible event-specific field combinations', () => {
    const impossible = [
      { ...VALID_PAYLOAD, input_method: 'none' },
      { ...VALID_PAYLOAD, latency_bucket: 'le_100ms' },
      { ...VALID_PAYLOAD, success: true },
      { ...VALID_PAYLOAD, destination_route: 'contacts' },
      {
        ...VALID_PAYLOAD,
        event: 'destination_ready',
        latency_bucket: 'le_500ms',
        success: true,
      },
      {
        ...VALID_PAYLOAD,
        event: 'impression',
        input_method: 'none',
        source_route: 'chat',
        destination_route: 'library',
        success: true,
      },
      {
        ...VALID_PAYLOAD,
        event: 'destination_ready',
        latency_bucket: 'na',
        success: true,
      },
      {
        ...VALID_PAYLOAD,
        event: 'drop_off',
        latency_bucket: 'le_10s',
        success: true,
      },
    ] as const;

    for (const payload of impossible) {
      expect(
        navigationTelemetryPayloadSchema.safeParse(payload).success,
        JSON.stringify(payload)
      ).toBe(false);
    }

    expect(
      navigationTelemetryPayloadSchema.safeParse({
        ...VALID_PAYLOAD,
        event_id: 'navigation-1234567890:destination_ready',
        event: 'destination_ready',
        latency_bucket: 'le_500ms',
        success: true,
      }).success
    ).toBe(true);
  });

  it('rejects every raw or identifying field instead of silently stripping it', () => {
    for (const forbidden of [
      'pathname',
      'query',
      'title',
      'content',
      'message',
      'search',
      'artist_id',
      'user_id',
      'fingerprint',
      'ip',
      'user_agent',
    ]) {
      expect(
        navigationTelemetryPayloadSchema.safeParse({
          ...VALID_PAYLOAD,
          [forbidden]: 'must-never-survive',
        }).success,
        forbidden
      ).toBe(false);
    }
  });
});
