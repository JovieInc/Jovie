import { afterEach, describe, expect, it } from 'vitest';
import {
  deliveryEvidence,
  publishShippingState,
  resetShippingStatePublisher,
  SHIPPING_SOURCE_IDS,
  type ShippingSourceId,
  snapshotReaders,
} from '@/lib/ovie/shipping-state';
import {
  defaultLiveIo,
  parseLanesStatus,
  readLanesStatus,
} from '@/lib/ovie/shipping-state/live';

/** Shape of the live gist feed on 2026-10-29: running may exceed slots. */
const LIVE_LANES = {
  schema: 'symphony-lanes-status/v1',
  at: new Date().toISOString(),
  release: '4089a9f',
  running: 4,
  idle: 0,
  lanes: {
    devin: { slots: 0, running: 0, base: 0 },
    codex: { slots: 2, running: 3, base: 3, leaseAgesComplete: true },
    hyperagent: { slots: 2, running: 0, base: 2 },
    grok: { slots: 1, running: 1, base: 1 },
  },
};

afterEach(() => resetShippingStatePublisher());

describe('live lanes feed', () => {
  it('parses when a lane runs more than its slots', () => {
    const lanes = parseLanesStatus(LIVE_LANES);
    expect(lanes?.running).toEqual({ state: 'measured-nonzero', value: 4 });
  });
});

describe('cold publish under a read deadline', () => {
  it('serves finished sources and labels the slow one instead of all-unknown', async () => {
    const io = defaultLiveIo({
      fetch: async () => new Response(JSON.stringify(LIVE_LANES)),
    });
    const lanesRead = await readLanesStatus(io);
    const slow = new Set<ShippingSourceId>(['lane-pull-requests']);
    const base = snapshotReaders({ 'lanes-status': lanesRead });
    const readers = { ...base };
    for (const id of slow) {
      readers[id] = () => new Promise(() => undefined);
    }
    const started = Date.now();
    const projection = await publishShippingState({
      readers,
      readDeadlineMs: 60,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(projection.delivery.lanes.running).toEqual({
      state: 'measured-nonzero',
      value: 4,
    });
    expect(projection.sources['lane-pull-requests'].lastError?.code).toBe(
      'reader-timeout'
    );
    const evidence = deliveryEvidence(projection, new Date().toISOString());
    expect(evidence.lanes.status).toBe('measured');
    expect(evidence.inFlight).toMatchObject({
      sourceId: 'lane-pull-requests',
      status: 'timeout',
    });
    // A deadline-bound publication is not reused as a fresh full one.
    const full = await publishShippingState({
      readers: snapshotReaders({ 'lanes-status': lanesRead }),
      maxAgeMs: 60_000,
    });
    expect(full.sources['lane-pull-requests'].lastError?.code).not.toBe(
      'reader-timeout'
    );
  });
});

describe('deliveryEvidence', () => {
  it('reports syncing for a never-read source and unavailable with code', async () => {
    const projection = await publishShippingState({
      readers: snapshotReaders({}),
    });
    const evidence = deliveryEvidence(projection, new Date().toISOString());
    expect(SHIPPING_SOURCE_IDS).toContain(evidence.merges.sourceId);
    expect(evidence.merges.status).not.toBe('measured');
    expect(evidence.merges.lastObservedAgeSeconds).toBeNull();
  });
});
