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

function planReadyPayload(webhookId?: string) {
  return {
    type: 'Comment',
    action: 'create',
    createdAt: '2026-03-10T00:00:00.000Z',
    webhookId,
    data: {
      id: 'comment_123',
      body: 'coderabbit-plan-ready verify_required=true',
      user: { name: 'CodeRabbit' },
      issue: {
        id: 'issue_123',
        identifier: 'JOV-123',
        updatedAt: '2026-03-10T00:00:01.000Z',
        state: { name: 'Todo' },
        team: { key: 'JOV' },
      },
    },
  };
}

describe('POST /api/webhooks/linear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns deduplicated response when a recent dispatch exists', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'duplicate',
    });

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
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
    expect(data).toEqual({
      received: true,
      deduplicated: true,
      eventId: 'issue_123:2026-03-10T00:00:01.000Z:plan',
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
  });

  it('returns 503 when webhook dedupe backend is unavailable', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'backend_unavailable',
    });

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Webhook dedupe unavailable',
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Linear webhook dedupe backend unavailable',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/linear',
        issueId: 'issue_123',
      })
    );
  });

  it('holds an ambiguous timeout for reconciliation without replay', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 4500, 'Linear dispatch')
    );

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
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

    expect(response.status).toBe(202);
    expect(data).toEqual({
      received: true,
      dispatchState: 'ambiguous',
      reconcileRequired: true,
      eventId: 'issue_123:2026-03-10T00:00:01.000Z:plan',
    });
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Linear webhook dispatch timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/webhooks/linear',
        timeoutMs: 4500,
      })
    );
  });

  it('does not retry the GitHub dispatch POST', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(
      new Response(null, {
        status: 204,
      })
    );

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/JovieInc/Jovie/dispatches',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 4500,
      })
    );
    expect(mockServerFetch.mock.calls[0]?.[1]).not.toHaveProperty('retry');
  });

  it('leaves JOV issue pickup to upstream OpenAI Symphony', async () => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Issue',
      action: 'create',
      createdAt: '2026-08-15T00:00:00.000Z',
      data: {
        id: 'issue_backlog',
        identifier: 'JOV-100',
        title: 'Bounded ordinary fix',
        updatedAt: '2026-08-15T00:00:00.000Z',
        team: { key: 'JOV' },
        state: { name: 'Backlog' },
      },
    };
    const body = JSON.stringify(payload);
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': sign(body) },
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(mockAcquireRecentDispatch).not.toHaveBeenCalled();
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('keeps plan-ready dispatches bounded and distinct from issue pickup', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload('linear-delivery-5306');
    const body = JSON.stringify(payload);
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': sign(body) },
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      eventId: 'linear-delivery-5306:plan',
    });
    const dispatch = JSON.parse(mockServerFetch.mock.calls[0]?.[1]?.body);
    expect(Object.keys(dispatch.client_payload).length).toBeLessThanOrEqual(10);
    expect(dispatch.client_payload.delivery_id).toBe('linear-delivery-5306');
    expect(dispatch.event_type).toBe('linear_plan_ready');
    expect(mockAcquireRecentDispatch).toHaveBeenCalledWith(
      'linear',
      'linear-delivery-5306:plan',
      21_600
    );
  });
});
