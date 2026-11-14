import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import { getEntitlements } from '@/lib/entitlements/registry';
import type { MobileChatNdjsonEvent } from '@/lib/mobile/chat/contract';

const hoisted = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  reserveChatTurn: vi.fn(),
  persistTerminalAssistantMessage: vi.fn(),
  persistTerminalAssistantMessageWithReceipt: vi.fn(),
  getCreatorConversationDetail: vi.fn(),
  markChatTurnStreaming: vi.fn(),
  resolveChatAccountContext: vi.fn(),
  checkAiChatRateLimitForPlan: vi.fn(),
  classifyIntent: vi.fn(),
  isDeterministicIntent: vi.fn(),
  executeChatTurn: vi.fn(),
  getMobileConversationDetail: vi.fn(),
  fetchReleasesForChat: vi.fn(),
  dbLimit: vi.fn(),
  handleMobileOvChatTurn: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContext,
}));

vi.mock('@/lib/chat/turns', () => ({
  reserveChatTurn: hoisted.reserveChatTurn,
  persistTerminalAssistantMessage: hoisted.persistTerminalAssistantMessage,
  persistTerminalAssistantMessageWithReceipt:
    hoisted.persistTerminalAssistantMessageWithReceipt,
  markChatTurnStreaming: hoisted.markChatTurnStreaming,
  TURN_IN_PROGRESS_ERROR_CODE: 'TURN_IN_PROGRESS',
}));

vi.mock('@/lib/chat/account-context', () => ({
  resolveChatAccountContext: hoisted.resolveChatAccountContext,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAiChatRateLimitForPlan: hoisted.checkAiChatRateLimitForPlan,
}));

vi.mock('@/lib/intent-detection', () => ({
  classifyIntent: hoisted.classifyIntent,
  isDeterministicIntent: hoisted.isDeterministicIntent,
  routeIntent: vi.fn(),
}));

vi.mock('@/lib/chat/run', () => ({
  executeChatTurn: hoisted.executeChatTurn,
}));

vi.mock('@/lib/mobile/chat/conversations', () => ({
  getMobileConversationDetail: hoisted.getMobileConversationDetail,
}));

vi.mock('@/lib/mobile/chat/turn-handler-ov', () => ({
  handleMobileOvChatTurn: hoisted.handleMobileOvChatTurn,
}));

vi.mock('@/lib/chat/releases', () => ({
  fetchReleasesForChat: hoisted.fetchReleasesForChat,
}));

vi.mock('@/lib/chat/tools/merch-tools', () => ({
  createMerchGenerateTool: vi.fn(),
  createMerchPreviewTool: vi.fn(),
  createMerchSelectTool: vi.fn(),
  createMerchSourceTool: vi.fn(),
}));

// Provider boundary: Sentry capture only.
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
  captureCriticalError: vi.fn(),
}));

vi.mock('@/lib/chat/conversation-queries', () => ({
  getCreatorConversationDetail: hoisted.getCreatorConversationDetail,
  listCreatorConversations: vi.fn(),
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
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { handleMobileChatTurn } = await import('@/lib/mobile/chat/turn-handler');

const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const USER_ID = '00000000-0000-4000-8000-000000000001';

type TerminalInput = Parameters<
  typeof import('@/lib/chat/turns').persistTerminalAssistantMessage
>[0];
type ToolResult = { toolName: string; toolCallId: string; output: unknown };

const sourceSelectionOutput = {
  success: true as const,
  state: 'source_selection_required' as const,
  message:
    'Choose a confirmed catalog phrase before Jovie generates any artwork.',
  recommendation: null,
  candidates: [
    {
      sourceType: 'song_title',
      sourceText: 'Neon Skyline',
      provenanceTitle: 'Neon Skyline',
    },
  ],
};

const request = {
  clientTurnId: 'client_merch_pr5',
  clientMessageId: 'message_merch_pr5',
  text: 'Make merch',
  source: 'typed' as const,
  chatMode: null,
};

function receiptFor(input: TerminalInput) {
  return {
    persisted: true,
    message: {
      ...input,
      id: 'saved',
      role: 'assistant' as const,
      createdAt: new Date('2026-01-01'),
      clientMessageId: null,
      turnStatus: input.status,
    },
  };
}

function streamMerch(text: string, results: ToolResult[]) {
  hoisted.executeChatTurn.mockResolvedValue({
    streamResult: {
      textStream: (async function* () {
        if (text) yield text;
      })(),
      toolResults: Promise.resolve(results),
    },
  });
}

async function readEvents(response: Response) {
  return (await response.text())
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as MobileChatNdjsonEvent);
}

function runMerch() {
  return handleMobileChatTurn(USER_ID, request, new AbortController().signal);
}

function makeAccountContext(): ChatAccountContext {
  const planLimits = getEntitlements('pro');
  return {
    email: 'artist@example.com',
    plan: 'pro',
    displayPlan: 'Pro',
    isPro: true,
    billingVerification: 'verified',
    planMismatch: null,
    usage: null,
    entitlements: {
      aiCanUseTools: planLimits.booleans.aiCanUseTools,
      canAccessMerchCreation: true,
      canGenerateAlbumArt: planLimits.booleans.canGenerateAlbumArt,
      canAccessAdvancedAnalytics:
        planLimits.booleans.canAccessAdvancedAnalytics,
    },
    flags: { merchMvp: false },
    billing: {
      hasStripeCustomer: true,
      hasStripeSubscription: true,
    },
    merchAccess: { available: true, reason: 'available' },
    planLimits,
    userEntitlements: {
      userId: USER_ID,
      email: 'artist@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'pro',
      isPro: true,
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      billingVerification: 'verified',
      hasStripeCustomer: true,
      hasStripeSubscription: true,
      ...planLimits.booleans,
      ...planLimits.limits,
    },
  };
}

describe('handleMobileChatTurn merch honesty (PR-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.persistTerminalAssistantMessageWithReceipt
      .mockReset()
      .mockImplementation(receiptFor);
    hoisted.dbLimit.mockResolvedValue([]);
    hoisted.getSessionContext.mockResolvedValue({
      clerkUserId: USER_ID,
      user: { id: USER_ID },
      profile: {
        id: PROFILE_ID,
        userId: USER_ID,
        username: 'tim',
        usernameNormalized: 'tim',
        displayName: 'Tim White',
        avatarUrl: null,
        isPublic: true,
        isClaimed: true,
        onboardingCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    hoisted.reserveChatTurn.mockResolvedValue({
      outcome: 'reserved',
      conversationId: 'conv_1',
      turn: { id: 'turn_1' },
    });
    hoisted.resolveChatAccountContext.mockResolvedValue(makeAccountContext());
    hoisted.checkAiChatRateLimitForPlan.mockResolvedValue({ success: true });
    hoisted.classifyIntent.mockReturnValue({ category: 'unknown' });
    hoisted.isDeterministicIntent.mockReturnValue(false);
    hoisted.getMobileConversationDetail.mockResolvedValue({
      messages: [],
    });
    hoisted.fetchReleasesForChat.mockResolvedValue([]);
    streamMerch('Here are designs.', []);
  });

  it('wraps merch tools with the web fail-soft wrapper', async () => {
    const merchTools = await import('@/lib/chat/tools/merch-tools');
    vi.mocked(merchTools.createMerchGenerateTool).mockReturnValue({
      description: 'Generate merch',
      inputSchema: {},
      execute: async () => {
        throw new Error('model exploded');
      },
    } as never);

    await runMerch();

    const tools = hoisted.executeChatTurn.mock.calls[0]?.[0]?.tools as Record<
      string,
      { execute?: (input: unknown, options: unknown) => Promise<unknown> }
    >;
    expect(tools.createMerch).toBeDefined();
    expect(typeof tools.createMerch.execute).toBe('function');
    const result = (await tools.createMerch.execute!({}, {})) as {
      success: boolean;
      error?: string;
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('shows a thrown merch generation as a failed event, not completed', async () => {
    streamMerch('', [
      {
        toolName: 'createMerch',
        toolCallId: 'call-1',
        output: { success: false, error: 'Merch generation failed.' },
      },
    ]);
    const events = await readEvents(await runMerch());
    const completion = events.find(
      event => event.type === 'assistant.completed'
    );
    expect(completion?.type).toBe('assistant.completed');
    if (completion?.type !== 'assistant.completed')
      throw new Error('missing completion');
    expect(completion.text).toContain('Merch generation failed.');

    const input = hoisted.persistTerminalAssistantMessageWithReceipt.mock
      .calls[0]?.[0] as TerminalInput;
    expect(input.status).toBe('failed_tool_unavailable');
    expect(input.errorCode).toBe('WEB_HANDOFF_REQUIRED');
    const failedEvent = (input.toolCalls ?? [])[0] as {
      state: string;
      errorMessage?: string;
    };
    expect(failedEvent.state).toBe('failed');
    expect(failedEvent.errorMessage).toBe('Merch generation failed.');
    expect(events.some(event => event.type === 'web.handoff')).toBe(false);
  });

  it('does not mark a zero-design result succeeded', async () => {
    streamMerch('', [
      {
        toolName: 'previewMerchOptions',
        toolCallId: 'call-2',
        output: {
          success: true,
          generationId: 'gen-zero',
          designs: [],
          nextStep: 'Jovie will not generate from unverified phrases.',
        },
      },
    ]);
    await readEvents(await runMerch());

    const input = hoisted.persistTerminalAssistantMessageWithReceipt.mock
      .calls[0]?.[0] as TerminalInput;
    const event = (input.toolCalls ?? [])[0] as {
      state: string;
      errorMessage?: string;
    };
    expect(event.state).toBe('failed');
    expect(event.errorMessage).toContain(
      'Jovie will not generate from unverified phrases.'
    );
    expect(input.status).toBe('failed_tool_unavailable');
  });

  it('emits the source-selection artifact on the initial turn and on replay', async () => {
    streamMerch('Let me confirm the phrase.', [
      {
        toolName: 'findMerchSources',
        toolCallId: 'call-3',
        output: sourceSelectionOutput,
      },
    ]);
    const events = await readEvents(await runMerch());
    const completion = events.at(-1);
    expect(completion?.type).toBe('assistant.completed');
    if (completion?.type !== 'assistant.completed')
      throw new Error('missing completion');
    expect(completion.text).toContain('<name>findMerchSources</name>');
    expect(completion.text).toContain('Neon Skyline');
    expect(events.some(event => event.type === 'web.handoff')).toBe(true);

    const input = hoisted.persistTerminalAssistantMessageWithReceipt.mock
      .calls[0]?.[0] as TerminalInput;
    expect(input.status).toBe('completed');

    // Replay of the persisted turn hands off with the same artifact.
    hoisted.reserveChatTurn.mockResolvedValue({
      outcome: 'duplicate_completed',
      conversationId: 'conv_1',
      turn: { id: 'turn_1', status: 'completed' },
      messages: [
        {
          ...receiptFor(input).message,
          content: completion.text,
          conversationId: 'conv_1',
        },
      ],
    });
    const replay = await readEvents(await runMerch());
    expect(replay).toEqual([
      expect.objectContaining({
        type: 'web.handoff',
        url: '/app/chat/conv_1',
      }),
    ]);
  });
});
