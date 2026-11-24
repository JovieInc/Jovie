import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ovie/summer-production-pin', () => ({
  logSummerBridgeEvent: log,
}));

import {
  admitWithRetry,
  COMPANY_STATE_MAX_AGE_MS,
  isCurrentCompanySnapshot,
} from './summer-turn-admission';

const verify = async (response: Response) => {
  if (!response.ok) throw new Error('summer_http_error');
};

describe('Summer admission', () => {
  it('resends an admission that never reached Summer under the same body', async () => {
    const send = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 202 }));
    const response = await admitWithRetry({
      eventId: 'sum_test',
      send,
      verify,
      attempts: 3,
      retryDelayMs: 0,
    });
    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.map(([entry]) => entry)).toEqual([
      expect.objectContaining({
        attempt: 1,
        cause: 'fetch failed',
        willRetry: true,
      }),
      expect.objectContaining({
        attempt: 2,
        cause: 'summer_http_error:502',
        willRetry: true,
      }),
    ]);
  });

  it('does not resend an admission Summer refused with a 4xx', async () => {
    log.mockClear();
    const send = vi.fn(async () => new Response('forbidden', { status: 403 }));
    await expect(
      admitWithRetry({
        eventId: 'sum_test',
        send,
        verify,
        attempts: 3,
        retryDelayMs: 0,
      })
    ).rejects.toThrow('summer_http_error');
    expect(send).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        cause: 'summer_http_error:403',
        willRetry: false,
      })
    );
  });

  it('gives up after the last attempt with the original transport error', async () => {
    const send = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    await expect(
      admitWithRetry({
        eventId: 'sum_test',
        send,
        verify,
        attempts: 2,
        retryDelayMs: 0,
      })
    ).rejects.toThrow('fetch failed');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('never treats a frozen company snapshot as current state', () => {
    // Staging never runs the refresh cron: Summer quoted a 2026-09-27 GitHub
    // read as current on 2026-11-22.
    const now = Date.parse('2026-11-22T10:37:00.000Z');
    expect(isCurrentCompanySnapshot('2026-09-27T02:38:00.000Z', now)).toBe(
      false
    );
    expect(isCurrentCompanySnapshot('not a date', now)).toBe(false);
    expect(
      isCurrentCompanySnapshot(
        new Date(now - COMPANY_STATE_MAX_AGE_MS).toISOString(),
        now
      )
    ).toBe(true);
  });
});
