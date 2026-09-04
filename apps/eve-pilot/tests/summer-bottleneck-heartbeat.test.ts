import { describe, expect, it, vi } from 'vitest';
import type { SummerBottleneckDependencies } from '../agent/lib/summer-bottleneck-loop';
import { runSummerBottleneckHeartbeat } from '../agent/schedules/summer-bottleneck-heartbeat';

describe('Summer bottleneck heartbeat', () => {
  it('is a cheap reconciler when the durable event set is empty', async () => {
    const list = vi.fn(async () => ({
      entries: [],
      hasMore: false,
      scanned: 0,
    }));
    const dependencies: SummerBottleneckDependencies = {
      dispatchToSymphony: vi.fn(),
      now: () => new Date('2026-09-02T08:00:00.000Z'),
      observeSymphonyOutcome: vi.fn(),
      producerVerificationKeys: new Map(),
      receiptSigningKey: 'r'.repeat(64),
      receiptSigningKeyId: 'eve-receipts-2026-09',
      store: {
        create: vi.fn(),
        read: vi.fn(),
        list,
        write: vi.fn(),
      },
    };

    await expect(runSummerBottleneckHeartbeat(dependencies)).resolves.toEqual(
      []
    );
    expect(list).toHaveBeenCalledWith('summer-bottleneck/events/', {
      limit: 25,
    });
    expect(dependencies.dispatchToSymphony).not.toHaveBeenCalled();
  });
});
