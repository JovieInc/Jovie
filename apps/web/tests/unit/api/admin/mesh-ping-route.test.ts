import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  freshAuth: vi.fn(),
  origin: vi.fn(),
  credentials: vi.fn(),
  sendPing: vi.fn(),
  limit: vi.fn(),
  denialStatus: vi.fn(),
  rateHeaders: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.access,
}));
vi.mock('@/lib/ovie/mesh/read.server', () => ({
  getSummerMeshOrigin: mocks.origin,
}));
vi.mock('@/lib/ovie/mesh/ping.server', () => ({
  meshCredentialsFromEnv: mocks.credentials,
  sendMeshPing: mocks.sendPing,
}));
vi.mock('@/lib/auth/cached', () => ({
  getFreshAuth: mocks.freshAuth,
}));
vi.mock('@/lib/rate-limit', () => ({
  meshPingLimiter: { limit: mocks.limit },
  rateLimitDenialStatus: mocks.denialStatus,
  createRateLimitHeaders: mocks.rateHeaders,
}));

import { POST } from '@/app/api/admin/mesh/ping/route';
import { MESH_PING_HOURLY_LIMIT } from '@/lib/rate-limit/config';

const post = (body: unknown) =>
  new Request('https://jov.ie/api/admin/mesh/ping', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(null);
  mocks.freshAuth.mockResolvedValue({ userId: 'founder-1' });
  mocks.origin.mockReturnValue('https://summer.jov.ie');
  mocks.credentials.mockReturnValue({
    token: 't',
    senderId: '0f0e0d0c-0b0a-4009-8008-700600500400',
    senderKind: 'jovie-web',
  });
  mocks.sendPing.mockResolvedValue({ ok: true, correlationId: 'mesh-ping-1' });
  mocks.limit.mockResolvedValue({
    success: true,
    limit: 10,
    remaining: 9,
    reset: new Date(),
  });
  mocks.denialStatus.mockReturnValue(429);
  mocks.rateHeaders.mockReturnValue({});
});

describe('POST /api/admin/mesh/ping', () => {
  it('enforces the Ovie admin gate before anything else', async () => {
    mocks.access.mockResolvedValue(new Response('denied', { status: 403 }));
    const response = await POST(post({ agentId: 'summer' }));
    expect(response.status).toBe(403);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('rejects unknown agent ids as bad requests', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ agentId: 'not-an-agent' }))).status).toBe(400);
    expect(
      (
        await POST(
          new Request('https://jov.ie/api/admin/mesh/ping', {
            method: 'POST',
            body: 'not json',
          })
        )
      ).status
    ).toBe(400);
  });

  it('rejects agents that are not mesh recipients', async () => {
    const response = await POST(post({ agentId: 'mesh-watcher' }));
    expect(response.status).toBe(400);
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('caps pings at MESH_PING_HOURLY_LIMIT per agent and returns 429 beyond', async () => {
    expect(MESH_PING_HOURLY_LIMIT).toBe(10);
    const response = await POST(post({ agentId: 'lola' }));
    expect(response.status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith('mesh_ping:lola');

    mocks.limit.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: new Date(),
    });
    const capped = await POST(post({ agentId: 'lola' }));
    expect(capped.status).toBe(429);
    expect(mocks.sendPing).not.toHaveBeenCalled();
  });

  it('returns 503 when the mesh endpoint or credentials are unconfigured', async () => {
    mocks.origin.mockReturnValue(null);
    expect((await POST(post({ agentId: 'summer' }))).status).toBe(503);
    mocks.origin.mockReturnValue('https://summer.jov.ie');
    mocks.credentials.mockReturnValue(null);
    expect((await POST(post({ agentId: 'summer' }))).status).toBe(503);
    expect(mocks.sendPing).not.toHaveBeenCalled();
  });

  it('delivers the ping through the server-side transport with resolved credentials', async () => {
    const response = await POST(post({ agentId: 'aeon' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.sendPing).toHaveBeenCalledWith({
      agentKind: 'aeon',
      origin: 'https://summer.jov.ie',
      credentials: {
        token: 't',
        senderId: '0f0e0d0c-0b0a-4009-8008-700600500400',
        senderKind: 'jovie-web',
      },
    });
  });

  it('maps upstream delivery failure to 502', async () => {
    mocks.sendPing.mockResolvedValue({ ok: false, reason: 'upstream-error' });
    const response = await POST(post({ agentId: 'summer' }));
    expect(response.status).toBe(502);
  });
});
