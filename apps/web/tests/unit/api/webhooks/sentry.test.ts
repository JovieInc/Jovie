import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockHasRecentDispatch = vi.hoisted(() => vi.fn());
const mockMarkRecentDispatch = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    SENTRY_WEBHOOK_SECRET: 'sentry-secret',
    GH_DISPATCH_TOKEN: 'gh-token',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/http/server-fetch', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/http/server-fetch')
  >('@/lib/http/server-fetch');
  return {
    ...actual,
    serverFetch: mockServerFetch,
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
}));

vi.mock('@/lib/webhooks/recent-dispatch', () => ({
  hasRecentDispatch: mockHasRecentDispatch,
  markRecentDispatch: mockMarkRecentDispatch,
}));

function sign(body: string): string {
  return createHmac('sha256', 'sentry-secret').update(body).digest('hex');
}

describe('POST /api/webhooks/sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns deduplicated response when a recent dispatch exists', async () => {
    mockHasRecentDispatch.mockResolvedValue(true);

    const { POST } = await import('@/app/api/webhooks/sentry/route');
    const payload = {
      data: {
        issue: {
          id: '42',
          title: 'Webhook error',
        },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/sentry', {
      method: 'POST',
      headers: {
        'sentry-hook-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true, deduplicated: true });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockMarkRecentDispatch).not.toHaveBeenCalled();
  });

  it('returns 502 when the GitHub dispatch times out', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockHasRecentDispatch.mockResolvedValue(false);
    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 5000)
    );

    const { POST } = await import('@/app/api/webhooks/sentry/route');
    const payload = {
      data: {
        issue: {
          id: '42',
          title: 'Webhook error',
        },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/sentry', {
      method: 'POST',
      headers: {
        'sentry-hook-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data).toEqual({ error: 'Dispatch timed out' });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Sentry webhook dispatch timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/webhooks/sentry',
        timeoutMs: 5000,
      })
    );
  });
});
