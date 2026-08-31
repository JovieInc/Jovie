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

const VALID_BODY = {
  destination: 'jovie',
  transcript: 'draft a drop',
  clientTurnId: 'turn_1234',
  clientMessageId: 'msg_1234',
} as const;

function captureRequest(body: unknown): Request {
  return new Request('https://jov.ie/api/mobile/v1/eyes-free-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function completedTurn(input: {
  conversationId: string;
  turnId: string;
  clientTurnId: string;
  text: string;
}): Response {
  return new Response(
    [
      encodeMobileChatNdjsonEvent({
        type: 'turn.reserved',
        conversationId: input.conversationId,
        turnId: input.turnId,
        clientTurnId: input.clientTurnId,
      }),
      encodeMobileChatNdjsonEvent({
        type: 'assistant.completed',
        clientTurnId: input.clientTurnId,
        conversationId: input.conversationId,
        turnId: input.turnId,
        text: input.text,
      }),
    ].join(''),
    { status: 200 }
  );
}

async function postCapture(body: unknown) {
  const { POST } = await routeModulePromise;
  return POST(captureRequest(body));
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
    const response = await postCapture(VALID_BODY);
    expect(response.status).toBe(401);
    expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
  });

  it('rejects invalid capture payloads before the turn handler', async () => {
    const cases = [
      {
        body: { ...VALID_BODY, destination: 'kanban; rm -rf' },
        errorCode: EYES_FREE_ERROR.INVALID_DESTINATION,
      },
      {
        body: { ...VALID_BODY, transcript: '   ' },
        errorCode: EYES_FREE_ERROR.TRANSCRIPTION_EMPTY,
      },
      {
        body: { ...VALID_BODY, clientTurnId: 'short' },
        errorCode: EYES_FREE_ERROR.INVALID_IDEMPOTENCY,
      },
    ] as const;

    for (const testCase of cases) {
      const response = await postCapture(testCase.body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        errorCode: testCase.errorCode,
      });
      expect(hoisted.handleMobileChatTurn).not.toHaveBeenCalled();
    }
  });

  it('rejects ordinary users from Summer before the turn handler', async () => {
    const response = await postCapture({
      ...VALID_BODY,
      destination: 'summer',
      transcript: 'what is the bottleneck',
    });
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
      completedTurn({
        conversationId: 'conv_jovie',
        turnId: 'turn_1',
        clientTurnId: 'turn_1234',
        text: 'Here is a caption for Friday.',
      })
    );

    const response = await postCapture({
      ...VALID_BODY,
      transcript: 'draft a drop caption',
    });

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

  it('proves an authorized founder Summer round trip and idempotent replay', async () => {
    hoisted.canUseOvChatMode.mockResolvedValue(true);
    hoisted.handleMobileChatTurn.mockResolvedValue(
      completedTurn({
        conversationId: 'conv_ov',
        turnId: 'turn_9',
        clientTurnId: 'turn_summer',
        text: 'Queued for the current Summer.',
      })
    );

    const summerBody = {
      destination: 'summer',
      transcript: 'park the teardown wave',
      clientTurnId: 'turn_summer',
      clientMessageId: 'msg_summer',
    };
    const response = await postCapture(summerBody);

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
    await expect((await postCapture(summerBody)).json()).resolves.toMatchObject(
      {
        status: 'duplicate',
        readback: 'Queued for the current Summer.',
      }
    );
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
    const response = await postCapture(VALID_BODY);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      status: 'unavailable',
    });
  });
});
