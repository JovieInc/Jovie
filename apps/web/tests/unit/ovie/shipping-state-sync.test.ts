import { afterEach, describe, expect, it } from 'vitest';
import {
  type AuthorityRead,
  type AuthorityReadStatus,
  projectShippingState,
  publishShippingState,
  resetShippingStatePublisher,
  SHIPPING_SOURCE_SCHEMAS,
  type ShippingClock,
  type ShippingSourceId,
  snapshotReaders,
} from '@/lib/ovie/shipping-state';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
  status: AuthorityReadStatus
): AuthorityRead {
  return {
    sourceId,
    status,
    schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
    payload: null,
    truncated: false,
    sourceTimestamp: null,
    sourceRevision: null,
    sequence: 1,
    eventId: `${sourceId}:${status}`,
    errorCode: status,
    errorMessage: status,
  };
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
  snapshots: Partial<Record<ShippingSourceId, AuthorityRead>>
) {
  return publishShippingState({
    readers: snapshotReaders(snapshots),
    clock: clockAt(T0),
  });
}

describe('shipping operational task sync', () => {
  afterEach(() => {
    resetShippingStatePublisher();
  });

  it('marks a fresh lane PR read as fresh and keeps a stopped projection stale', async () => {
    const fresh = await publish(baseline());
    expect(fresh.operationalTasks.syncState).toBe('fresh');
    expect(fresh.state).toBe('fresh');

    const stopped = projectShippingState({
      sequence: fresh.sequence + 1,
      observationTimestamp: T0,
      emissionTimestamp: T0,
      sources: fresh.sources,
      publishing: false,
      latencyMs: 1,
      nowIso: T0,
      lastKnown: fresh,
    });
    expect(stopped.state).toBe('stale');
    expect(stopped.operationalTasks.syncState).toBe('stale');

    const cold = projectShippingState({
      sequence: 1,
      observationTimestamp: T0,
      emissionTimestamp: T0,
      sources: fresh.sources,
      publishing: false,
      latencyMs: 1,
      nowIso: T0,
      lastKnown: null,
    });
    expect(cold.state).toBe('unavailable');
    expect(cold.operationalTasks.syncState).toBe('failed');
  });

  it('syncs an unknown lane PR read as syncing and an error read as failed', async () => {
    const syncing = await publish(
      baseline({
        'lane-pull-requests': failed('lane-pull-requests', 'unknown'),
      })
    );
    expect(syncing.sources['lane-pull-requests'].state).toBe('unknown');
    expect(syncing.operationalTasks.syncState).toBe('syncing');

    resetShippingStatePublisher();
    const errored = await publish(
      baseline({
        'lane-pull-requests': failed('lane-pull-requests', 'error'),
      })
    );
    expect(errored.sources['lane-pull-requests'].state).toBe('error');
    expect(errored.operationalTasks.syncState).toBe('failed');
  });
});
