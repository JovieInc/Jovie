import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockAcquireRecentDispatch = vi.hoisted(() => vi.fn());
const mockClearRecentDispatch = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    LINEAR_WEBHOOK_SECRET: 'linear-secret',
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
  acquireRecentDispatch: mockAcquireRecentDispatch,
  clearRecentDispatch: mockClearRecentDispatch,
}));

function sign(body: string): string {
  return createHmac('sha256', 'linear-secret').update(body).digest('hex');
}

describe('POST /api/webhooks/linear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns deduplicated response when a recent dispatch exists', async () => {
    mockAcquireRecentDispatch.mockResolvedValue(false);

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Issue',
      action: 'update',
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedFrom: { stateId: 'old' },
      data: {
        id: 'issue_123',
        updatedAt: '2026-03-10T00:00:01.000Z',
        stateId: 'new',
        state: { name: 'Todo' },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true, deduplicated: true });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
  });

  it('returns 502 when the GitHub dispatch times out', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockAcquireRecentDispatch.mockResolvedValue(true);
    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 10000)
    );

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Issue',
      action: 'update',
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedFrom: { stateId: 'old' },
      data: {
        id: 'issue_123',
        updatedAt: '2026-03-10T00:00:01.000Z',
        stateId: 'new',
        state: { name: 'Todo' },
      },
    };
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data).toEqual({ error: 'Dispatch timed out' });
    expect(mockClearRecentDispatch).toHaveBeenCalledWith(
      'linear',
      'issue_123:2026-03-10T00:00:01.000Z:todo'
    );
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Linear webhook dispatch timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/webhooks/linear',
        timeoutMs: 10000,
      })
    );
  });
});
