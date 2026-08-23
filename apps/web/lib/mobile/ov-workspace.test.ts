import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOvConversationTitle,
  parseMobileWorkspace,
  withOvConversationTitle,
} from './workspace';

const h = vi.hoisted(() => ({
  canUseOvChatMode: vi.fn(),
  reserveChatTurn: vi.fn(),
  prepareOvieChatTurn: vi.fn(),
}));

vi.mock('@/lib/chat/ov-mode', () => ({ canUseOvChatMode: h.canUseOvChatMode }));
vi.mock('@/lib/chat/turns', () => ({
  reserveChatTurn: h.reserveChatTurn,
  persistTerminalAssistantMessage: vi.fn(),
  TURN_IN_PROGRESS_ERROR_CODE: 'TURN_IN_PROGRESS',
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
  bindCurrentSummerQueueSpeaker: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-transport', () => ({
  isSummerTransportEnabled: () => false,
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

const { handleMobileOvChatTurn } = await import('./chat/turn-handler-ov');
const parsed = {
  clientTurnId: 't1',
  clientMessageId: 'm1',
  text: 'Need a taste decision',
  source: 'typed' as const,
  chatMode: 'ov' as const,
};
const ovInput = {
  userId: 'u1',
  profileId: 'p1',
  parsed,
  signal: new AbortController().signal,
};

describe('mobile Ovie workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.canUseOvChatMode.mockResolvedValue(true);
    h.reserveChatTurn.mockResolvedValue({
      outcome: 'reserved',
      conversationId: 'conv_ov',
      turn: { id: 'turn_ov' },
    });
    h.prepareOvieChatTurn.mockResolvedValue({
      generation: {
        kind: 'summer-transport',
        state: 'unavailable',
        speaker: 'summer',
        session: null,
        text: 'Conversation with the current Summer is unavailable on this door.',
      },
    });
  });

  it('parses ids and keeps Summer off the artist path', async () => {
    expect(parseMobileWorkspace('ov')).toEqual({ ok: true, workspace: 'ov' });
    expect(isOvConversationTitle(withOvConversationTitle('Taste'))).toBe(true);
    h.canUseOvChatMode.mockResolvedValue(false);
    expect((await handleMobileOvChatTurn(ovInput)).status).toBe(403);
    h.canUseOvChatMode.mockResolvedValue(true);
    const summer = await handleMobileOvChatTurn(ovInput);
    expect(summer.status).toBe(200);
    expect(await summer.text()).toContain('unavailable');
  });
});
