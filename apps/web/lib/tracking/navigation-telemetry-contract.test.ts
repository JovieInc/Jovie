import { describe, expect, it } from 'vitest';
import {
  allowlistNavigationItemId,
  bucketNavigationLatency,
  bucketNavigationRoute,
  NAVIGATION_TELEMETRY_SCHEMA_VERSION,
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

  it('uses bounded latency buckets', () => {
    expect(bucketNavigationLatency(100)).toBe('le_100ms');
    expect(bucketNavigationLatency(101)).toBe('le_250ms');
    expect(bucketNavigationLatency(2501)).toBe('le_5s');
    expect(bucketNavigationLatency(10_001)).toBe('gt_10s');
    expect(bucketNavigationLatency(Number.NaN)).toBe('na');
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
