import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOvConversationTitle,
  parseMobileWorkspace,
  withOvConversationTitle,
} from './workspace';

const h = vi.hoisted(() => ({
  canUseOvChatMode: vi.fn(),
  resolveChatAccountContext: vi.fn(),
  checkAiChatRateLimitForPlan: vi.fn(),
  reserveChatTurn: vi.fn(),
  resumeStaleChatTurn: vi.fn(),
  resumeTerminalChatTurn: vi.fn(),
  prepareOvieChatTurn: vi.fn(),
  markChatTurnStreaming: vi.fn(),
  markChatTurnTerminal: vi.fn(),
  persistTerminalAssistantMessageWithReceipt: vi.fn(),
  isSummerTransportEnabled: vi.fn(),
  bindEveSummerSpeaker: vi.fn(),
  getBoundSummerSpeaker: vi.fn(),
  authorizeFounderSummerUser: vi.fn(),
  founderPrincipalHash: vi.fn(),
  runOvieSummerTurn: vi.fn(),
  getMobileConversationDetail: vi.fn(),
}));

vi.mock('@/lib/chat/ov-mode', () => ({ canUseOvChatMode: h.canUseOvChatMode }));
vi.mock('@/lib/chat/account-context', () => ({
  resolveChatAccountContext: h.resolveChatAccountContext,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkAiChatRateLimitForPlan: h.checkAiChatRateLimitForPlan,
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
vi.mock('@/lib/mobile/chat/conversations', () => ({
  getMobileConversationDetail: h.getMobileConversationDetail,
}));
vi.mock('@/lib/ovie/chat-entry', () => ({
  prepareOvieChatTurn: h.prepareOvieChatTurn,
}));
vi.mock('@/lib/ovie/mcp/runtime-store', () => ({
  getOvieOperatingStore: () => ({}),
}));
vi.mock('@/lib/ovie/summer-eve-speaker', () => ({
  bindEveSummerSpeaker: h.bindEveSummerSpeaker,
}));
vi.mock('@/lib/ovie/summer-founder-auth', () => ({
  authorizeFounderSummerUser: h.authorizeFounderSummerUser,
  founderPrincipalHash: h.founderPrincipalHash,
}));
vi.mock('@/lib/ovie/summer-transport', () => ({
  getBoundSummerSpeaker: h.getBoundSummerSpeaker,
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

async function eventsOf(response: Response) {
  return (await response.text())
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

const binding = {
  type: 'binding' as const,
  binding: {
    eveWorkId: 'ini_eve_1',
    eveAcks: [] as string[],
    summerSessionId: 'summer-session:current',
    correlationId: 'ini_eve_1:t1',
    speaker: 'summer' as const,
  },
};

async function expectCode(code: string) {
  expect(
    (await eventsOf(await handleMobileOvChatTurn(ovInput))).some(
      event => event.errorCode === code
    )
  ).toBe(true);
}

describe('mobile Ovie workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.canUseOvChatMode.mockResolvedValue(true);
    h.resolveChatAccountContext.mockResolvedValue({ plan: 'pro' });
    h.checkAiChatRateLimitForPlan.mockResolvedValue({ success: true });
    h.isSummerTransportEnabled.mockReturnValue(true);
    h.authorizeFounderSummerUser.mockReturnValue('authorized');
    h.founderPrincipalHash.mockReturnValue('founder_hash');
    h.markChatTurnStreaming.mockResolvedValue(undefined);
    h.markChatTurnTerminal.mockResolvedValue(true);
    h.resumeStaleChatTurn.mockResolvedValue('resumed');
    h.resumeTerminalChatTurn.mockResolvedValue('resumed');
    h.getMobileConversationDetail.mockResolvedValue(null);
    h.persistTerminalAssistantMessageWithReceipt.mockResolvedValue({
      message: { id: 'a1' },
      persisted: true,
    });
    h.bindEveSummerSpeaker.mockReturnValue({
      id: 'summer',
      runtime: 'eve',
    });
    h.getBoundSummerSpeaker.mockReturnValue({
      id: 'summer',
      runtime: 'eve',
    });
    h.reserveChatTurn.mockResolvedValue({
      outcome: 'reserved',
      conversationId: 'conv_ov',
      turn: { id: 'turn_ov', status: 'reserved' },
    });
    h.prepareOvieChatTurn.mockResolvedValue({
      receipts: [{ workId: 'ini_eve_1' }],
      generation: {
        kind: 'summer-transport',
        state: 'fresh',
        speaker: 'summer',
        session: { sessionId: 'summer-session:current' },
        text: '',
      },
    });
    h.runOvieSummerTurn.mockImplementation(async function* () {
      yield binding;
      yield { type: 'state', state: 'streaming' };
      yield { type: 'text-delta', text: 'Summer reply' };
      yield { type: 'state', state: 'completed' };
    });
  });

  it('parses ids, streams Summer, and fails closed on red paths', async () => {
    expect(parseMobileWorkspace('ov')).toEqual({ ok: true, workspace: 'ov' });
    expect(isOvConversationTitle(withOvConversationTitle('Taste'))).toBe(true);
    const live = await eventsOf(await handleMobileOvChatTurn(ovInput));
    expect(live.some(event => event.state === 'queued')).toBe(true);
    expect(live.at(-1)).toMatchObject({
      type: 'assistant.completed',
      text: 'Summer reply',
    });

    h.canUseOvChatMode.mockResolvedValueOnce(false);
    expect((await handleMobileOvChatTurn(ovInput)).status).toBe(403);

    h.getMobileConversationDetail.mockResolvedValueOnce({
      conversation: { title: 'Launch plan' },
    });
    expect(
      (
        await eventsOf(
          await handleMobileOvChatTurn({
            ...ovInput,
            parsed: { ...parsed, conversationId: 'c' },
          })
        )
      )[0]
    ).toMatchObject({ errorCode: 'WORKSPACE_MISMATCH' });

    h.prepareOvieChatTurn.mockResolvedValueOnce({
      receipts: [],
      generation: { kind: 'artist-jovie' },
    });
    await expectCode('OVIE_DOOR_ARTIST_FALLTHROUGH');

    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield { type: 'state', state: 'completed' };
    });
    await expectCode('SUMMER_EVE_RUN_MISSING');

    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_in_progress',
      conversationId: 'conv_ov',
      turn: { id: 'turn_ov', status: 'streaming' },
    });
    expect((await handleMobileOvChatTurn(ovInput)).status).toBe(409);

    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_completed',
      conversationId: 'conv_ov',
      turn: { id: 'turn_ov', status: 'completed' },
      messages: [{ role: 'assistant', content: 'Summer reply' }],
    });
    expect(
      (await eventsOf(await handleMobileOvChatTurn(ovInput))).at(-1)
    ).toMatchObject({
      type: 'assistant.completed',
      text: 'Summer reply',
    });

    h.reserveChatTurn.mockResolvedValueOnce({
      outcome: 'duplicate_completed',
      conversationId: 'conv_ov',
      turn: {
        id: 'turn_ov',
        status: 'failed_model_error',
        errorCode: 'SUMMER_TRANSPORT_FAILED',
        errorMessage: 'no',
      },
      messages: [],
    });
    expect(
      (await eventsOf(await handleMobileOvChatTurn(ovInput))).some(
        e => e.type === 'assistant.completed'
      )
    ).toBe(false);

    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield binding;
      yield { type: 'state', state: 'completed' };
    });
    await expectCode('SUMMER_EMPTY_COMPLETION');

    h.persistTerminalAssistantMessageWithReceipt.mockResolvedValueOnce({
      message: { id: 'ephemeral-turn_ov' },
      persisted: false,
    });
    await expectCode('SUMMER_DURABILITY_FAILED');

    const leaked = await eventsOf(
      await handleMobileOvChatTurn({
        ...ovInput,
        parsed: { ...parsed, text: 'SECRET_PROMPT_TOKEN x' },
      })
    );
    expect(JSON.stringify(leaked)).not.toContain('SECRET_PROMPT_TOKEN');

    h.runOvieSummerTurn.mockImplementationOnce(async function* () {
      yield binding;
      yield {
        type: 'tool',
        receipt: {
          tool: 'create_initiative',
          ok: false,
          receiptId: 'x',
          summary: 'denied',
        },
      };
      yield { type: 'state', state: 'failed_tool' };
    });
    await expectCode('SUMMER_TOOL_FAILED');

    h.isSummerTransportEnabled.mockReturnValue(false);
    await expectCode('SUMMER_TRANSPORT_UNAVAILABLE');
  });
});
