import { describe, expect, it, vi } from 'vitest';

const sched = vi.hoisted(() => ({ run: null as null | (() => Promise<void>) }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: { CRON_SECRET: 'secret', NODE_ENV: 'production' },
}));
vi.mock('@/lib/utils/platform-detection/environment', () => ({
  getBaseUrl: () => 'https://example.test',
}));
vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: (fn: () => Promise<void>) => {
    sched.run = fn;
    return true;
  },
}));

import { KICK_TIMEOUT_MS, kickQueue } from '@/lib/cron/kick-queue';

describe('kickQueue', () => {
  it('uses a short abort budget so the caller after() finishes inside its limit', async () => {
    expect(KICK_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const f = vi.fn().mockResolvedValue(new Response('ok'));
    expect(kickQueue('merch', f)).toBe(true);
    await sched.run?.();
    expect(f).toHaveBeenCalledWith(
      'https://example.test/api/cron/queue-tick?only=merch',
      expect.objectContaining({
        headers: { authorization: 'Bearer secret' },
      })
    );
    expect(spy).toHaveBeenCalledWith(KICK_TIMEOUT_MS);
  });

  it('never throws when the tick is unreachable', async () => {
    const f = vi.fn().mockRejectedValue(new Error('aborted'));
    kickQueue('merch', f);
    await expect(sched.run?.()).resolves.toBeUndefined();
  });
});
