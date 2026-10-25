import { describe, expect, it } from 'vitest';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { fleetVerdict } from './fleet-verdict';

const count = (value: number | null): DeliveryLanes['running'] =>
  value === null
    ? { state: 'not-measured', value: null }
    : value === 0
      ? { state: 'measured-zero', value: 0 }
      : { state: 'measured-nonzero', value };

function lanes(overrides: Partial<DeliveryLanes> = {}): DeliveryLanes {
  return {
    running: count(2),
    slots: count(3),
    idle: count(1),
    pool: count(null),
    lastLandingAgeSeconds: count(null),
    diskFreePct: null,
    lanes: [],
    alerts: [],
    heldByReason: {},
    failedByReason: {},
    capacity: null,
    publishedAt: null,
    stale: false,
    ...overrides,
  };
}

describe('fleetVerdict', () => {
  it('is healthy only with a current feed and no alerts', () => {
    expect(fleetVerdict(lanes())).toMatchObject({
      level: 'healthy',
      headline: 'Fleet healthy: 2 of 3 lanes running',
    });
  });

  it('joins the doctor alert and lane ratio into one degraded sentence', () => {
    const verdict = fleetVerdict(
      lanes({
        alerts: [
          'remediation action lacks authoritative acknowledgement; failed=57, exhausted=0; inspect event-delivery.json',
          '0 of 28 Todo issues eligible',
        ],
      })
    );
    expect(verdict.level).toBe('degraded');
    expect(verdict.headline).toBe(
      'Fleet degraded: Remediation alerts are not being acknowledged (57 failed delivery records) (+1 more)'
    );
    expect(verdict.reasons).toHaveLength(2);
    expect(verdict.capacity).toBe('2 of 3 lanes running');
  });

  it('is down when the feed is stale, whatever the lane counts say', () => {
    expect(fleetVerdict(lanes({ stale: true })).level).toBe('down');
  });

  it('never reads an unmeasured feed as healthy', () => {
    expect(
      fleetVerdict(lanes({ running: count(null), slots: count(null) })).level
    ).toBe('unknown');
  });

  it('keeps zero running lanes measured, not unknown', () => {
    expect(fleetVerdict(lanes({ running: count(0) })).capacity).toBe(
      '0 of 3 lanes running'
    );
  });
});

describe('no false green (JOV-9019)', () => {
  const measurements = [
    ['running', count(null), count(2)],
    ['slots', count(null), count(3)],
  ] as const;

  it('never reports healthy unless the feed is current and every count is measured', () => {
    for (const running of [count(null), count(2)]) {
      for (const slots of [count(null), count(3)]) {
        for (const stale of [false, true]) {
          const verdict = fleetVerdict(lanes({ running, slots, stale }));
          const complete =
            running.state !== 'not-measured' &&
            slots.state !== 'not-measured' &&
            !stale;
          expect(verdict.level === 'healthy').toBe(complete);
          if (!complete) expect(verdict.headline).not.toMatch(/healthy|clear/i);
        }
      }
    }
    expect(measurements).toHaveLength(2);
  });

  it('keeps alerts louder than missing counts', () => {
    expect(
      fleetVerdict(
        lanes({ running: count(null), slots: count(null), alerts: ['a'] })
      ).level
    ).toBe('degraded');
  });
});
