import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getMobileSessionUserIdMock: vi.fn(),
  handleMobileChatTurnMock: vi.fn(),
}));

vi.mock('@/lib/mobile/session-auth', () => ({
  getMobileSessionUserId: hoisted.getMobileSessionUserIdMock,
}));

vi.mock('@/lib/mobile/chat/turn-handler', () => ({
  handleMobileChatTurn: hoisted.handleMobileChatTurnMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/chat/turns/route');

async function text(response: Response) {
  return response.text();
}

describe('POST /api/mobile/v1/chat/turns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getMobileSessionUserIdMock.mockResolvedValue('user_123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when the mobile session token is missing', async () => {
    hoisted.getMobileSessionUserIdMock.mockResolvedValue(null);

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

  it('fails closed with an NDJSON error event when the runtime flag is off', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', '');

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
    expect(hoisted.handleMobileChatTurnMock).not.toHaveBeenCalled();
  });

  it('delegates to the chat runtime when the flag is enabled', async () => {
    vi.stubEnv('MOBILE_CHAT_RUNTIME_ENABLED', 'true');
    const runtimeResponse = new Response('{"type":"turn.reserved"}\n', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
    });
    hoisted.handleMobileChatTurnMock.mockResolvedValue(runtimeResponse);

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

    expect(response.status).toBe(200);
    expect(hoisted.handleMobileChatTurnMock).toHaveBeenCalledTimes(1);
    expect(hoisted.handleMobileChatTurnMock).toHaveBeenCalledWith(
      'user_123',
      expect.objectContaining({
        clientTurnId: 'turn_123',
        clientMessageId: 'msg_123',
        text: 'Help me launch my release',
        source: 'typed',
      }),
      expect.anything()
    );
  });
});
