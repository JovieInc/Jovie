import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  canUseOvChatMode: vi.fn(),
  reserveChatTurn: vi.fn(),
  persistTerminalAssistantMessage: vi.fn(),
  markChatTurnStreaming: vi.fn(),
  getMobileConversationDetail: vi.fn(),
  prepareOvieChatTurn: vi.fn(),
  getOvieOperatingStore: vi.fn(),
  bindCurrentSummerQueueSpeaker: vi.fn(),
  isSummerTransportEnabled: vi.fn(),
  getBoundSummerSpeaker: vi.fn(),
  dbLimit: vi.fn(),
  dbUpdate: vi.fn(),
  dbSet: vi.fn(),
  dbWhere: vi.fn(),
}));

vi.mock('@/lib/chat/ov-mode', () => ({
  canUseOvChatMode: hoisted.canUseOvChatMode,
}));

vi.mock('@/lib/chat/turns', () => ({
  reserveChatTurn: hoisted.reserveChatTurn,
  persistTerminalAssistantMessage: hoisted.persistTerminalAssistantMessage,
  markChatTurnStreaming: hoisted.markChatTurnStreaming,
  TURN_IN_PROGRESS_ERROR_CODE: 'TURN_IN_PROGRESS',
}));

vi.mock('@/lib/mobile/chat/conversations', () => ({
  getMobileConversationDetail: hoisted.getMobileConversationDetail,
}));

vi.mock('@/lib/ovie/chat-entry', () => ({
  prepareOvieChatTurn: hoisted.prepareOvieChatTurn,
}));

vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: hoisted.getOvieOperatingStore,
}));

vi.mock('@/lib/ovie/summer-queue-speaker', () => ({
  bindCurrentSummerQueueSpeaker: hoisted.bindCurrentSummerQueueSpeaker,
}));

vi.mock('@/lib/ovie/summer-transport', () => ({
  isSummerTransportEnabled: hoisted.isSummerTransportEnabled,
  getBoundSummerSpeaker: hoisted.getBoundSummerSpeaker,
  runOvieSummerTurn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: hoisted.dbLimit,
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: hoisted.dbSet,
    })),
  },
}));

hoisted.dbSet.mockReturnValue({
  where: hoisted.dbWhere,
});
hoisted.dbWhere.mockResolvedValue(undefined);

vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: { id: 'id', title: 'title' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

const { handleMobileOvChatTurn } = await import('./turn-handler-ov');

describe('handleMobileOvChatTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.canUseOvChatMode.mockResolvedValue(true);
    hoisted.getOvieOperatingStore.mockReturnValue({});
    hoisted.isSummerTransportEnabled.mockReturnValue(false);
    hoisted.getBoundSummerSpeaker.mockReturnValue(null);
    hoisted.dbLimit.mockResolvedValue([{ title: 'Taste cards' }]);
    hoisted.reserveChatTurn.mockResolvedValue({
      outcome: 'reserved',
      conversationId: 'conv_ov',
      turn: { id: 'turn_ov' },
    });
    hoisted.prepareOvieChatTurn.mockResolvedValue({
      generation: {
        kind: 'summer-transport',
        state: 'unavailable',
        speaker: 'summer',
        session: null,
        text: 'Conversation with the current Summer is unavailable on this door. Ovie is the door, not the speaker.',
      },
      eveTurn: { pack: { id: 'eve' } },
      receipts: [],
    });
  });

  it('fails closed for non-admins without reserving an artist turn', async () => {
    hoisted.canUseOvChatMode.mockResolvedValue(false);

    const response = await handleMobileOvChatTurn({
      userId: 'user_1',
      profileId: 'profile_1',
      parsed: {
        clientTurnId: 't1',
        clientMessageId: 'm1',
        text: 'Need a taste decision',
        source: 'typed',
        chatMode: 'ov',
      },
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(403);
    expect(hoisted.reserveChatTurn).not.toHaveBeenCalled();
    expect(hoisted.prepareOvieChatTurn).not.toHaveBeenCalled();
  });

  it('returns Summer unavailable copy instead of artist Jovie generation', async () => {
    const response = await handleMobileOvChatTurn({
      userId: 'user_1',
      profileId: 'profile_1',
      parsed: {
        clientTurnId: 't1',
        clientMessageId: 'm1',
        text: 'Need a taste decision',
        source: 'typed',
        chatMode: 'ov',
      },
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('unavailable');
    expect(body).not.toContain('Ask Jovie');
    expect(hoisted.prepareOvieChatTurn).toHaveBeenCalledWith(
      'ov',
      'Need a taste decision',
      expect.anything()
    );
  });

  it('rejects artist conversations in ov mode', async () => {
    hoisted.getMobileConversationDetail.mockResolvedValue({
      conversation: { title: 'Launch plan' },
    });

    const response = await handleMobileOvChatTurn({
      userId: 'user_1',
      profileId: 'profile_1',
      parsed: {
        conversationId: 'conv_artist',
        clientTurnId: 't1',
        clientMessageId: 'm1',
        text: 'Need a taste decision',
        source: 'typed',
        chatMode: 'ov',
      },
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(400);
    expect(hoisted.reserveChatTurn).not.toHaveBeenCalled();
  });
});
