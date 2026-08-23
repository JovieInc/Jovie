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

const DELIVERY_ID = 'linear-delivery-abc';

function sign(body: string): string {
  return createHmac('sha256', 'linear-secret').update(body).digest('hex');
}

function intakePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: 'Issue',
    action: 'update',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedFrom: { stateId: 'old' },
    data: {
      id: 'issue_123',
      identifier: 'JOV-5313',
      updatedAt: '2026-03-10T00:00:01.000Z',
      stateId: 'new',
      state: { name: 'Todo' },
      team: { key: 'JOV' },
    },
    ...overrides,
  };
}

function signedRequest(
  payload: Record<string, unknown>,
  { deliveryId = DELIVERY_ID }: { deliveryId?: string | null } = {}
): Request {
  const body = JSON.stringify(payload);
  const headers = new Headers({
    'linear-signature': sign(body),
  });
  if (deliveryId) {
    headers.set('linear-delivery', deliveryId);
  }
  return new Request('https://example.com/api/webhooks/linear', {
    method: 'POST',
    headers,
    body,
  });
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

    const { POST, LINEAR_DISPATCH_DEDUPE_TTL_SECONDS } = await import(
      '@/app/api/webhooks/linear/route'
    );
    const response = await POST(signedRequest(intakePayload()) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ received: true, deduplicated: true });
    expect(mockAcquireRecentDispatch).toHaveBeenCalledWith(
      'linear',
      DELIVERY_ID,
      LINEAR_DISPATCH_DEDUPE_TTL_SECONDS
    );
    expect(LINEAR_DISPATCH_DEDUPE_TTL_SECONDS).toBe(6 * 60 * 60);
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
  });

  it('returns 400 when provider delivery identity is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const response = await POST(
      signedRequest(intakePayload(), { deliveryId: null }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing delivery identity',
    });
    expect(mockAcquireRecentDispatch).not.toHaveBeenCalled();
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('returns 503 when webhook dedupe backend is unavailable', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'backend_unavailable',
    });

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const response = await POST(signedRequest(intakePayload()) as never);

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

  it('acknowledges an ambiguous GitHub dispatch timeout without replay', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 10000, 'Linear dispatch')
    );

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const response = await POST(signedRequest(intakePayload()) as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      received: true,
      dispatched: 'ambiguous',
      reconcile_required: true,
    });
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Linear webhook dispatch timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/webhooks/linear',
        timeoutMs: 10000,
        deliveryId: DELIVERY_ID,
      })
    );
  });

  it('releases the delivery lock when GitHub reports a known dispatch failure', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response('boom', { status: 500 }));

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const response = await POST(signedRequest(intakePayload()) as never);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Dispatch failed' });
    expect(mockClearRecentDispatch).toHaveBeenCalledWith('linear', DELIVERY_ID);
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
    const response = await POST(signedRequest(intakePayload()) as never);

    expect(response.status).toBe(200);
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/JovieInc/Jovie/dispatches',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 10000,
      })
    );
    expect(mockServerFetch.mock.calls[0]?.[1]).not.toHaveProperty('retry');
  });

  it('dispatches a label-free JOV backlog create within GitHub payload bounds', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const { POST, GITHUB_REPOSITORY_DISPATCH_MAX_CLIENT_PAYLOAD_KEYS } =
      await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Issue',
      action: 'create',
      createdAt: '2026-08-15T00:00:00.000Z',
      data: {
        id: 'issue_backlog',
        identifier: 'JOV-100',
        title: 'Bounded ordinary fix',
        description: 'x'.repeat(80_000),
        updatedAt: '2026-08-15T00:00:00.000Z',
        team: { key: 'JOV' },
        state: { name: 'Backlog' },
      },
    };
    const response = await POST(signedRequest(payload) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, dispatched: true });
    const dispatched = JSON.parse(
      String(mockServerFetch.mock.calls[0]?.[1]?.body)
    ) as {
      event_type: string;
      client_payload: Record<string, unknown>;
    };
    expect(dispatched.event_type).toBe('linear-intake-changed');
    expect(Object.keys(dispatched.client_payload)).toHaveLength(9);
    expect(Object.keys(dispatched.client_payload).length).toBeLessThanOrEqual(
      GITHUB_REPOSITORY_DISPATCH_MAX_CLIENT_PAYLOAD_KEYS
    );
    expect(dispatched.client_payload).toEqual({
      delivery_id: DELIVERY_ID,
      issue_id: 'issue_backlog',
      issue_identifier: 'JOV-100',
      issue_updated_at: '2026-08-15T00:00:00.000Z',
      team_key: 'JOV',
      state_name: 'Backlog',
      intake_action: 'create',
      plan_ready: false,
      contract: {
        verify_required: true,
        simplify_bounded: true,
        model_tier: 'premium',
      },
    });
    expect(JSON.stringify(dispatched.client_payload)).not.toContain(
      'issue_description'
    );
  });
});
