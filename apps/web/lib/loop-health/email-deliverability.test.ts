import { describe, expect, it } from 'vitest';
import { computeEmailMetrics } from './email-deliverability';

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
