import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.authMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/chat/turns/route');

async function text(response: Response) {
  return response.text();
}

describe('POST /api/mobile/v1/chat/turns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
  });

  it('returns 401 when the mobile session token is missing', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/chat/turns', {
        method: 'POST',
        body: JSON.stringify({
          clientTurnId: 'turn_123',
          clientMessageId: 'msg_123',
          text: 'Help me launch my release',
          source: 'typed',
        }),
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('validates required mobile turn ids before the runtime starts', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/chat/turns', {
        method: 'POST',
        body: JSON.stringify({
          text: 'Help me launch my release',
          source: 'typed',
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid request body',
    });
  });

  it('fails closed with an NDJSON error event until native chat runtime is enabled', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/chat/turns', {
        method: 'POST',
        body: JSON.stringify({
          clientTurnId: 'turn_123',
          clientMessageId: 'msg_123',
          text: 'Help me launch my release',
          source: 'typed',
        }),
      })
    );

    expect(response.status).toBe(501);
    expect(response.headers.get('Content-Type')).toBe(
      'application/x-ndjson; charset=utf-8'
    );
    await expect(text(response)).resolves.toBe(
      '{"type":"error","errorCode":"MOBILE_CHAT_RUNTIME_DISABLED","message":"Native chat is not enabled for this build."}\n'
    );
  });
});
