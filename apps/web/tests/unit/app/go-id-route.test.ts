import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const afterTasks: Promise<unknown>[] = [];
  return {
    afterTasks,
    getWrappedLink: vi.fn(),
    incrementClickCount: vi.fn().mockResolvedValue(true),
    detectBot: vi.fn().mockReturnValue({ isBot: false, reason: 'ok' }),
    getBotSafeHeaders: vi.fn().mockReturnValue({}),
  };
});

vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: (task: () => unknown) => {
    mocks.afterTasks.push(Promise.resolve().then(task));
    return true;
  },
}));

vi.mock('@/lib/services/link-wrapping', () => ({
  getWrappedLink: mocks.getWrappedLink,
  incrementClickCount: mocks.incrementClickCount,
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mocks.detectBot,
  getBotSafeHeaders: mocks.getBotSafeHeaders,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { GET } from '@/app/go/[id]/route';

describe('GET /go/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterTasks.length = 0;
    mocks.getWrappedLink.mockResolvedValue({
      shortId: 'abc123',
      originalUrl: 'https://example.com/dest',
      kind: 'normal',
    });
    mocks.incrementClickCount.mockResolvedValue(true);
    mocks.detectBot.mockReturnValue({ isBot: false, reason: 'ok' });
  });

  it('returns Location while click accounting is still pending (hot-path budget)', async () => {
    let releaseClick: () => void = () => undefined;
    mocks.incrementClickCount.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          releaseClick = () => resolve(true);
        })
    );

    const response = await GET(new NextRequest('http://localhost/go/abc123'), {
      params: Promise.resolve({ id: 'abc123' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.com/dest');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    // Click work may have started via scheduleAfter, but the 302 already flushed
    // while that promise is still pending.
    expect(mocks.incrementClickCount).toHaveBeenCalledWith('abc123');

    releaseClick();
    await Promise.all(mocks.afterTasks.splice(0));
  });

  it('302s sensitive wraps to /out without incrementing clicks on /go', async () => {
    mocks.getWrappedLink.mockResolvedValueOnce({
      shortId: 'sens1',
      originalUrl: 'https://example.com/sensitive',
      kind: 'sensitive',
    });

    const response = await GET(new NextRequest('http://localhost/go/sens1'), {
      params: Promise.resolve({ id: 'sens1' }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/out/sens1');
    expect(mocks.afterTasks).toHaveLength(0);
    expect(mocks.incrementClickCount).not.toHaveBeenCalled();
  });
});
