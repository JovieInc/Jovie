import { vi } from 'vitest';

export const h = vi.hoisted(() => ({
  canUseOvChatMode: vi.fn(),
  resolveChatAccountContext: vi.fn(),
  checkAiChatRateLimitForPlan: vi.fn(),
  reserveChatTurn: vi.fn(),
  resumeStaleChatTurn: vi.fn(),
  resumeTerminalChatTurn: vi.fn(),
  markChatTurnStreaming: vi.fn(),
  markChatTurnTerminal: vi.fn(),
  persistTerminalAssistantMessageWithReceipt: vi.fn(),
  prepareOvieChatTurn: vi.fn(),
  isSummerTransportEnabled: vi.fn(),
  bindCurrentSummerQueueSpeaker: vi.fn(),
  runOvieSummerTurn: vi.fn(),
}));

vi.mock('@/lib/chat/ov-mode', () => ({ canUseOvChatMode: h.canUseOvChatMode }));
vi.mock('@/lib/chat/account-context', () => ({
  resolveChatAccountContext: h.resolveChatAccountContext,
}));
vi.mock('@/lib/chat/turns', () => ({
  reserveChatTurn: h.reserveChatTurn,
  resumeStaleChatTurn: h.resumeStaleChatTurn,
  resumeTerminalChatTurn: h.resumeTerminalChatTurn,
  markChatTurnStreaming: h.markChatTurnStreaming,
  markChatTurnTerminal: h.markChatTurnTerminal,
  persistTerminalAssistantMessageWithReceipt:
    h.persistTerminalAssistantMessageWithReceipt,
  TURN_IN_PROGRESS_ERROR_CODE: 'TURN_IN_PROGRESS',
}));
vi.mock('@/lib/rate-limit', () => ({
  checkAiChatRateLimitForPlan: h.checkAiChatRateLimitForPlan,
}));
vi.mock('@/lib/mobile/chat/conversations', () => ({
  getMobileConversationDetail: vi.fn(),
}));
vi.mock('@/lib/ovie/chat-entry', () => ({
  prepareOvieChatTurn: h.prepareOvieChatTurn,
}));
vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: () => ({}),
}));
vi.mock('@/lib/ovie/summer-queue-speaker', () => ({
  bindCurrentSummerQueueSpeaker: h.bindCurrentSummerQueueSpeaker,
}));
vi.mock('@/lib/ovie/summer-transport', () => ({
  isSummerTransportEnabled: h.isSummerTransportEnabled,
  runOvieSummerTurn: h.runOvieSummerTurn,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ title: 'x' }] }) }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock('@/lib/db/schema/chat', () => ({
  chatConversations: { id: 'id', title: 'title' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

export const { handleMobileOvChatTurn } = await import(
  './chat/turn-handler-ov'
);

export const ovInput = {
  userId: 'u1',
  profileId: 'p1',
  parsed: {
    clientTurnId: 't1',
    clientMessageId: 'm1',
    text: 'Need a taste decision',
    source: 'typed' as const,
    chatMode: 'ov' as const,
  },
  signal: new AbortController().signal,
};

export function resetSummerMocks() {
  vi.clearAllMocks();
  h.canUseOvChatMode.mockResolvedValue(true);
  h.resolveChatAccountContext.mockResolvedValue({ plan: 'pro' });
  h.checkAiChatRateLimitForPlan.mockResolvedValue({ success: true });
  h.isSummerTransportEnabled.mockReturnValue(true);
  h.markChatTurnStreaming.mockResolvedValue(undefined);
  h.markChatTurnTerminal.mockResolvedValue(true);
  h.resumeStaleChatTurn.mockResolvedValue('resumed');
  h.resumeTerminalChatTurn.mockResolvedValue('resumed');
  h.persistTerminalAssistantMessageWithReceipt.mockResolvedValue({
    message: { id: 'assistant_1' },
    persisted: true,
  });
  h.bindCurrentSummerQueueSpeaker.mockReturnValue({
    id: 'summer',
    runtime: 'mac',
  });
  h.reserveChatTurn.mockResolvedValue({
    outcome: 'reserved',
    conversationId: 'conv_ov',
    turn: { id: 'turn_ov' },
  });
  h.prepareOvieChatTurn.mockResolvedValue({
    receipts: [
      {
        workId: 'ini_eve_1',
        ack: 'stored and queued for Summer lander',
      },
    ],
    generation: {
      kind: 'summer-transport',
      state: 'fresh',
      speaker: 'summer',
      session: { sessionId: 'summer-session:current' },
      text: '',
    },
  });
  h.runOvieSummerTurn.mockImplementation(async function* () {
    yield {
      type: 'binding',
      binding: {
        eveWorkId: 'ini_eve_1',
        eveAcks: ['stored and queued for Summer lander'],
        summerSessionId: 'summer-session:current',
        correlationId: 'ini_eve_1:t1',
        speaker: 'summer',
      },
    };
    yield { type: 'state', state: 'streaming' };
    yield { type: 'text-delta', text: 'Summer reply' };
    yield { type: 'state', state: 'completed' };
  });
}
