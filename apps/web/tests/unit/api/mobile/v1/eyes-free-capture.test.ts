import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMobileChatNdjsonEvent } from '@/lib/mobile/chat/contract';
import { EYES_FREE_ERROR } from '@/lib/mobile/eyes-free-capture';

const hoisted = vi.hoisted(() => ({
  getMobileSessionUserId: vi.fn(),
  canUseOvChatMode: vi.fn(),
  handleMobileChatTurn: vi.fn(),
}));

vi.mock('@/lib/mobile/session-auth', () => ({
  getMobileSessionUserId: hoisted.getMobileSessionUserId,
}));

vi.mock('@/lib/chat/ov-mode', () => ({
  canUseOvChatMode: hoisted.canUseOvChatMode,
}));

vi.mock('@/lib/mobile/chat/turn-handler', () => ({
  handleMobileChatTurn: hoisted.handleMobileChatTurn,
}));

const routeModulePromise = import(
  '@/app/api/mobile/v1/eyes-free-capture/route'
);

function captureRequest(body: unknown): Request {
  return new Request('https://jov.ie/api/mobile/v1/eyes-free-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/mobile/v1/eyes-free-capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getMobileSessionUserId.mockResolvedValue('user_123');
    hoisted.canUseOvChatMode.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when the mobile session is missing', async () => {
    hoisted.getMobileSessionUserId.mockResolvedValue(null);
    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'jovie',
        transcript: 'draft a drop',
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      })
    );
    expect(response.status).toBe(401);
    expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
  });

  it('rejects user-controlled destination strings', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'kanban; rm -rf',
        transcript: 'draft a drop',
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: EYES_FREE_ERROR.INVALID_DESTINATION,
    });
    expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
  });

  it('rejects empty transcription before any creative or Summer route', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'jovie',
        transcript: '   ',
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: EYES_FREE_ERROR.TRANSCRIPTION_EMPTY,
    });
    expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
  });

  it('rejects ordinary users from Summer before the turn handler', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'summer',
        transcript: 'what is the bottleneck',
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      })
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      destination: 'summer',
      status: 'forbidden',
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
      readback: 'Summer is only available to the founder.',
    });
    expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
  });

  it('routes Jovie through the existing creative chat turn path', async () => {
    hoisted.handleMobileChatTurn.mockResolvedValue(
      new Response(
        [
          encodeMobileChatNdjsonEvent({
            type: 'turn.reserved',
            conversationId: 'conv_jovie',
            turnId: 'turn_1',
            clientTurnId: 'turn_1234',
          }),
          encodeMobileChatNdjsonEvent({
            type: 'assistant.completed',
            clientTurnId: 'turn_1234',
            conversationId: 'conv_jovie',
            turnId: 'turn_1',
            text: 'Here is a caption for Friday.',
          }),
        ].join(''),
        { status: 200 }
      )
    );

    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'jovie',
        transcript: 'draft a drop caption',
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.handleMobileChatTurn).toHaveBeenCalledWith(
      'user_123',
      expect.objectContaining({
        text: 'draft a drop caption',
        source: 'typed',
        chatMode: null,
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      }),
      expect.anything()
    );
    await expect(response.json()).resolves.toMatchObject({
      destination: 'jovie',
      status: 'completed',
      conversationId: 'conv_jovie',
      readback: 'Here is a caption for Friday.',
    });
  });

  it('proves an authorized founder Summer round trip through OV chat', async () => {
    hoisted.canUseOvChatMode.mockResolvedValue(true);
    hoisted.handleMobileChatTurn.mockResolvedValue(
      new Response(
        [
          encodeMobileChatNdjsonEvent({
            type: 'turn.reserved',
            conversationId: 'conv_ov',
            turnId: 'turn_9',
            clientTurnId: 'turn_summer',
          }),
          encodeMobileChatNdjsonEvent({
            type: 'assistant.completed',
            clientTurnId: 'turn_summer',
            conversationId: 'conv_ov',
            turnId: 'turn_9',
            text: 'Queued for the current Summer.',
          }),
        ].join(''),
        { status: 200 }
      )
    );

    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'summer',
        transcript: 'park the teardown wave',
        clientTurnId: 'turn_summer',
        clientMessageId: 'msg_summer',
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.handleMobileChatTurn).toHaveBeenCalledWith(
      'user_123',
      expect.objectContaining({ chatMode: 'ov' }),
      expect.anything()
    );
    await expect(response.json()).resolves.toMatchObject({
      destination: 'summer',
      status: 'completed',
      conversationId: 'conv_ov',
      readback: 'Queued for the current Summer.',
    });
  });

  it('replays an idempotent founder Summer duplicate without a second reservation', async () => {
    hoisted.canUseOvChatMode.mockResolvedValue(true);
    hoisted.handleMobileChatTurn.mockResolvedValue(
      new Response(
        encodeMobileChatNdjsonEvent({
          type: 'assistant.completed',
          clientTurnId: 'turn_summer',
          conversationId: 'conv_ov',
          turnId: 'turn_9',
          text: 'Queued for the current Summer.',
        }),
        { status: 200 }
      )
    );

    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'summer',
        transcript: 'park the teardown wave',
        clientTurnId: 'turn_summer',
        clientMessageId: 'msg_summer',
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      destination: 'summer',
      status: 'duplicate',
      readback: 'Queued for the current Summer.',
    });
  });

  it('rejects short idempotency keys before routing', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'jovie',
        transcript: 'draft a drop',
        clientTurnId: 'short',
        clientMessageId: 'msg_1234',
      })
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: EYES_FREE_ERROR.INVALID_IDEMPOTENCY,
    });
    expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
  });

  it('maps a missing mobile chat profile to unavailable', async () => {
    hoisted.handleMobileChatTurn.mockResolvedValue(
      new Response(
        encodeMobileChatNdjsonEvent({
          type: 'error',
          errorCode: 'MOBILE_CHAT_PROFILE_REQUIRED',
          message: 'Profile required',
        }),
        { status: 404 }
      )
    );

    const { POST } = await routeModulePromise;
    const response = await POST(
      captureRequest({
        destination: 'jovie',
        transcript: 'draft a drop',
        clientTurnId: 'turn_1234',
        clientMessageId: 'msg_1234',
      })
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      status: 'unavailable',
    });
  });
});
