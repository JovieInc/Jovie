import { unknownProjection } from '@/lib/ovie/shipping-state';

/**
 * Admin Shipping and Ops read the delivery projection the fleet host
 * publishes. CI has no fleet host, so the visual suite answers this read
 * instead of capturing a disconnected card.
 */

const measured = (value: number) =>
  value === 0
    ? { state: 'measured-zero', value: 0 }
    : { state: 'measured-nonzero', value };

/**
 * A connected `ovie.shipping-state.v1` read. Starts from the contract's own
 * empty projection, so every source the strict parser needs is present, then
 * marks it fresh with fixed delivery numbers.
 */
export function freshShippingProjection() {
  const now = Date.now();
  const at = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const base = unknownProjection({
    sequence: 4,
    observationTimestamp: at(0),
    emissionTimestamp: at(0),
    latencyMs: 12,
    publishing: true,
    lastError: null,
  });
  const sources = Object.fromEntries(
    Object.entries(base.sources).map(([id, source]) => [
      id,
      { ...source, state: 'fresh' },
    ])
  );
  return {
    ...base,
    sourceRevision: 'rev-4',
    freshnessDeadline: new Date(now + 3_600_000).toISOString(),
    state: 'fresh',
    sources,
    delivery: {
      lanes: {
        running: measured(7),
        slots: measured(9),
        idle: measured(2),
        pool: measured(186),
        lastLandingAgeSeconds: measured(85),
        diskFreePct: 28.4,
        lanes: [
          { name: 'codex', running: 4, slots: 4 },
          { name: 'claude', running: 3, slots: 3 },
          { name: 'cursor', running: 0, slots: 2 },
        ],
        alerts: [],
        heldByReason: {},
        failedByReason: {},
        publishedAt: at(60_000),
        stale: false,
      },
      merges: {
        since: at(86_400_000),
        today: measured(42),
        byRepo: { Jovie: measured(36), 'summer-config': measured(6) },
        last7Days: measured(280),
        prior7Days: measured(225),
      },
      mergeQueueDepth: measured(2),
      inFlight: measured(0),
      certifiedHead: {
        sha: 'c3e74e00a9d234b8f6a1b2c3d4e5f60718293a4b',
        certifiedAt: at(1_800_000),
      },
      production: {
        sha: 'ee7401f37e0b324e225751f0d97ce229838ac8b4',
        version: '26.11.5',
        deployedAt: at(3_600_000),
        behindMain: measured(4),
      },
      staging: {
        sha: 'a1b2c3d4e5f60718293a4bc3e74e00a9d234b8f6',
        version: '26.11.6',
        deployedAt: at(1_200_000),
        behindMain: measured(1),
      },
      summer: { availability: 'up' },
    },
    meanings: {
      merged: { state: 'measured', value: false },
      queued: { state: 'measured', value: true },
      ciGreen: { state: 'measured', value: true },
      productionVerified: { state: 'measured', value: true },
      exactLiveBuild: { state: 'measured', value: true },
    },
  };
}
