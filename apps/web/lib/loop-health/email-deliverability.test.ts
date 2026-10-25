import { describe, expect, it, vi } from 'vitest';

const execute = vi.fn();
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: (fn: (tx: unknown) => unknown) => fn({ execute }),
}));

import {
  computeEmailMetrics,
  loadEmailDeliverabilityMetrics,
} from './email-deliverability';

describe('loadEmailDeliverabilityMetrics', () => {
  it('folds grouped event counts and the latency row into metrics', async () => {
    execute
      .mockResolvedValueOnce({
        rows: [
          { event_type: 'email.sent', n: 100 },
          { event_type: 'email.delivered', n: 97 },
          { event_type: 'email.bounced', n: 3 },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ samples: 20, p95: '42.04' }] });
    const metrics = await loadEmailDeliverabilityMetrics(
      new Date('2026-10-25T00:00:00Z')
    );
    expect(metrics.attempts7d).toBe(100);
    expect(metrics.bounceRatePct).toBe(3);
    expect(metrics.complaints7d).toBe(0);
    expect(metrics.deliveryLatencyP95Sec).toBe(42);
    expect(metrics.latencySamples7d).toBe(20);
  });

  it('returns null rates and latency for an empty window', async () => {
    execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ samples: 0, p95: null }] });
    const metrics = await loadEmailDeliverabilityMetrics();
    expect(metrics.bounceRatePct).toBeNull();
    expect(metrics.deliveryLatencyP95Sec).toBeNull();
  });
});

describe('computeEmailMetrics', () => {
  it('derives rates from the larger of sent and terminal outcomes', () => {
    const metrics = computeEmailMetrics(
      { sent: 0, delivered: 196, bounced: 4, complained: 1 },
      { p95Sec: 12.34, samples: 40 }
    );
    expect(metrics.attempts7d).toBe(200);
    expect(metrics.bounceRatePct).toBe(2);
    expect(metrics.complaintRatePct).toBe(0.5);
    expect(metrics.deliveryLatencyP95Sec).toBe(12.3);
  });

  it('prefers provider sent counts when they exceed outcomes', () => {
    const metrics = computeEmailMetrics(
      { sent: 1000, delivered: 900, bounced: 10, complained: 0 },
      { p95Sec: null, samples: 0 }
    );
    expect(metrics.attempts7d).toBe(1000);
    expect(metrics.bounceRatePct).toBe(1);
    expect(metrics.deliveryLatencyP95Sec).toBeNull();
  });

  it('reports null rates, not zero, when nothing was sent', () => {
    const metrics = computeEmailMetrics(
      { sent: 0, delivered: 0, bounced: 0, complained: 0 },
      { p95Sec: null, samples: 0 }
    );
    expect(metrics.bounceRatePct).toBeNull();
    expect(metrics.complaintRatePct).toBeNull();
  });
});
