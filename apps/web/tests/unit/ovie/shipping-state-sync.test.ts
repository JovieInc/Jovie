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

  it('marks a fresh runtime read as fresh and keeps a stopped projection stale', async () => {
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

  it('syncs an unknown runtime as syncing and an error runtime as failed', async () => {
    const syncing = await publish(
      baseline({
        'symphony-runtime': failed('symphony-runtime', 'unknown'),
      })
    );
    expect(syncing.sources['symphony-runtime'].state).toBe('unknown');
    expect(syncing.operationalTasks.syncState).toBe('syncing');

    resetShippingStatePublisher();
    const errored = await publish(
      baseline({
        'symphony-runtime': failed('symphony-runtime', 'error'),
      })
    );
    expect(errored.sources['symphony-runtime'].state).toBe('error');
    expect(errored.operationalTasks.syncState).toBe('failed');
  });
});
