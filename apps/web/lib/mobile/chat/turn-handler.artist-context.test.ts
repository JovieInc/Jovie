import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAccountContext } from '@/lib/chat/account-context';
import { getEntitlements } from '@/lib/entitlements/registry';
import type { MobileChatNdjsonEvent } from '@/lib/mobile/chat/contract';
import { mobileMerchToolEventsFromResults } from '@/lib/mobile/chat/tool-artifacts';

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
const GENERIC_ARTIST_CONTEXT_ERROR =
  'Jovie could not load your artist context for this request. Refresh and try again.';

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
      canAccessMerchCreation: false,
      canGenerateAlbumArt: planLimits.booleans.canGenerateAlbumArt,
      canAccessAdvancedAnalytics:
        planLimits.booleans.canAccessAdvancedAnalytics,
    },
    flags: { merchMvp: false },
    billing: {
      hasStripeCustomer: true,
      hasStripeSubscription: true,
    },
    merchAccess: { available: false, reason: 'plan_unavailable' },
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

type TerminalInput = Parameters<
  typeof import('@/lib/chat/turns').persistTerminalAssistantMessage
>[0];
type ToolResult = { toolName: string; toolCallId: string; output: unknown };
const generation = {
  success: true,
  generationId: 'gen-1',
  options: [
    {
      id: 'option-1',
      option_number: 1,
      design_name: 'Signal Tee',
      product_type: 'Premium Tee',
      concept: 'Typography-led tee.',
      mockup_urls: ['https://cdn.test/signal.jpg'],
    },
  ],
};
const preview = {
  success: true,
  generationId: 'gen-2',
  designs: [
    {
      id: 'design-1',
      option_number: 1,
      design_name: 'Neon Pulse',
      status: 'ready',
      preview_url: 'https://cdn.test/neon.jpg',
    },
  ],
};
const request = {
  clientTurnId: 'client_merch',
  clientMessageId: 'message_merch',
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
function streamMerch(
  text = 'Here are designs.',
  results: ToolResult[] = [
    { toolName: 'createMerch', toolCallId: 'call-1', output: generation },
  ]
) {
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('handleMobileChatTurn artist-context seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.persistTerminalAssistantMessageWithReceipt
      .mockReset()
      .mockImplementation(receiptFor);
    hoisted.getCreatorConversationDetail.mockReset();
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
    hoisted.executeChatTurn.mockResolvedValue({
      streamResult: {
        textStream: (async function* () {
          yield 'Here is a real reply.';
        })(),
        toolResults: Promise.resolve([]),
      },
    });
  });

  it('streams a model reply when the extra artist-context lookup misses', async () => {
    const response = await handleMobileChatTurn(
      USER_ID,
      {
        clientTurnId: 'client_turn_1',
        clientMessageId: 'client_msg_1',
        text: 'What should I post this week?',
        source: 'typed',
        chatMode: null,
      },
      new AbortController().signal
    );

    expect(response.status).toBe(200);
    expect(hoisted.executeChatTurn).toHaveBeenCalledTimes(1);
    expect(hoisted.executeChatTurn.mock.calls[0]?.[0]).toMatchObject({
      artistContext: {
        displayName: 'Tim White',
        username: 'tim',
      },
      resolvedProfileId: PROFILE_ID,
    });
    expect(hoisted.persistTerminalAssistantMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'ARTIST_CONTEXT_UNAVAILABLE',
      })
    );

    const body = await response.text();
    expect(body).not.toContain(GENERIC_ARTIST_CONTEXT_ERROR);
    expect(body).toContain('Here is a real reply.');
    expect(hoisted.handleMobileOvChatTurn).not.toHaveBeenCalled();
  });

  it('routes ov chatMode to Summer/ops and never runs artist Jovie generation', async () => {
    const ovResponse = new Response('{"type":"assistant.completed"}\n');
    hoisted.handleMobileOvChatTurn.mockResolvedValue(ovResponse);
    const response = await handleMobileChatTurn(
      USER_ID,
      {
        clientTurnId: 'client_turn_ov',
        clientMessageId: 'client_msg_ov',
        text: 'What stills need a taste decision?',
        source: 'typed',
        chatMode: 'ov',
      },
      new AbortController().signal
    );
    expect(response).toBe(ovResponse);
    expect(hoisted.executeChatTurn).not.toHaveBeenCalled();
    expect(hoisted.reserveChatTurn).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['createMerch', generation, 'Here are designs.'],
    ['createMerch', generation, ''],
    ['previewMerchOptions', preview, 'Here are previews.'],
    ['previewMerchOptions', preview, ''],
  ])(
    'hands off saved %s and restores the same artifact on reload',
    async (toolName, output, text) => {
      streamMerch(text, [{ toolName, output, toolCallId: 'call-1' }]);
      const events = await readEvents(await runMerch());
      const completion = events.at(-1);
      expect(completion?.type).toBe('assistant.completed');
      if (completion?.type !== 'assistant.completed')
        throw new Error('missing completion');
      expect(events.filter(event => event.type === 'web.handoff')).toEqual([
        {
          type: 'web.handoff',
          clientTurnId: request.clientTurnId,
          conversationId: 'conv_1',
          url: '/app/chat/conv_1',
          summary: completion.text,
        },
      ]);
      expect(events.at(-2)?.type).toBe('web.handoff');
      expect(completion.text).toContain(`<name>${toolName}</name>`);
      const input = hoisted.persistTerminalAssistantMessageWithReceipt.mock
        .calls[0]?.[0] as TerminalInput;
      expect(input).toMatchObject({
        content: completion.text,
        conversationId: 'conv_1',
        turnId: 'turn_1',
      });
      const message = receiptFor(input).message;
      // PostgreSQL JSONB may reorder keys relative to the live embedded payload.
      const reordered = Object.fromEntries(Object.entries(output).reverse());
      hoisted.getCreatorConversationDetail.mockResolvedValue({
        conversation: { id: 'conv_1' },
        hasMore: false,
        messages: [
          {
            ...message,
            toolCalls: mobileMerchToolEventsFromResults([
              { toolName, output: reordered, toolCallId: 'call-1' },
            ]),
          },
        ],
      });
      const actual = await vi.importActual<
        typeof import('@/lib/mobile/chat/conversations')
      >('@/lib/mobile/chat/conversations');
      const reloaded = await actual.getMobileConversationDetail({
        conversationId: 'conv_1',
        creatorProfileId: PROFILE_ID,
      });
      expect(reloaded?.messages[0]).toMatchObject({
        content: completion.text,
        requiresWebHandoff: true,
      });
      hoisted.reserveChatTurn.mockResolvedValue({
        outcome: 'duplicate_completed',
        conversationId: 'conv_1',
        turn: { id: 'turn_1', status: 'completed' },
        messages: [message],
      });
      const replay = await readEvents(await runMerch());
      expect(replay).toEqual([
        expect.objectContaining({
          type: 'web.handoff',
          url: '/app/chat/conv_1',
        }),
      ]);
      expect(hoisted.executeChatTurn).toHaveBeenCalledTimes(1);
      expect(
        hoisted.persistTerminalAssistantMessageWithReceipt
      ).toHaveBeenCalledTimes(1);
    }
  );

  it.each<[string, unknown]>([
    ['createMerch', undefined],
    ['createMerch', null],
    ['createMerch', []],
    ['createMerch', { ...generation, success: false }],
    ['createMerch', { success: true, generationId: 7, options: [] }],
    ['createMerch', { success: true, generationId: 'missing-options' }],
    ['unsupportedTool', generation],
  ])(
    'does not grant handoff for invalid %s output %j',
    async (toolName, output) => {
      streamMerch('Plain reply.', [
        { toolName, output, toolCallId: 'invalid' },
      ]);
      const events = await readEvents(await runMerch());
      expect(events.some(event => event.type === 'web.handoff')).toBe(false);
      expect(events.at(-1)).toMatchObject({
        type: 'assistant.completed',
        text: 'Plain reply.',
      });
    }
  );

  it.each([
    'not-persisted',
    'other-conversation',
    'other-turn',
    'different-content',
    'different-artifact',
    'no-artifact',
    'failed-artifact',
  ])('does not advertise a %s receipt as the live design', async kind => {
    streamMerch();
    hoisted.persistTerminalAssistantMessageWithReceipt.mockImplementation(
      (input: TerminalInput) => {
        const receipt = receiptFor(input);
        if (kind === 'not-persisted') receipt.persisted = false;
        if (kind === 'other-conversation')
          receipt.message.conversationId = 'other';
        if (kind === 'other-turn') receipt.message.turnId = 'other';
        if (kind === 'different-content')
          receipt.message.content = 'Earlier winner';
        if (kind === 'different-artifact')
          receipt.message.content = input.content.replace(
            'gen-1',
            'earlier-generation'
          );
        if (kind === 'no-artifact') receipt.message.toolCalls = null;
        if (kind === 'failed-artifact')
          receipt.message.toolCalls = input.toolCalls?.map(event => ({
            ...event,
            state: 'failed' as const,
          }));
        return receipt;
      }
    );
    const events = await readEvents(await runMerch());
    expect(events.some(event => event.type === 'web.handoff')).toBe(false);
    expect(events.at(-1)).toMatchObject({
      type: 'assistant.completed',
      text: expect.stringContaining('gen-1'),
    });
  });

  it('waits for the receipt and releases all pending response work', async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    streamMerch();
    hoisted.persistTerminalAssistantMessageWithReceipt.mockImplementation(
      async (input: TerminalInput) => {
        entered.resolve();
        await release.promise;
        return receiptFor(input);
      }
    );
    const response = await runMerch();
    const reader = response.body!.getReader();
    const seen: MobileChatNdjsonEvent[] = [];
    const decode = (chunk: ReadableStreamReadResult<Uint8Array>) => {
      if (!chunk.done)
        seen.push(
          JSON.parse(
            new TextDecoder().decode(chunk.value)
          ) as MobileChatNdjsonEvent
        );
    };
    let pending: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
    try {
      // Each production enqueue writes exactly one complete NDJSON line.
      decode(await reader.read());
      decode(await reader.read());
      expect(seen.map(event => event.type)).toEqual([
        'turn.reserved',
        'assistant.delta',
      ]);
      pending = reader.read();
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      const didEnter = await Promise.race([
        entered.promise.then(() => true),
        pending.then(() => false),
      ]);
      expect(didEnter).toBe(true);
      // A queued early handoff resolves read() immediately. Its handler runs
      // before this checkpoint, unlike a genuinely pending gated read.
      await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      release.resolve();
      try {
        if (pending) decode(await pending);
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          decode(chunk);
        }
      } finally {
        reader.releaseLock();
      }
    }
    expect(seen.slice(-2).map(event => event.type)).toEqual([
      'web.handoff',
      'assistant.completed',
    ]);
  });

  it('keeps the error path when the receipt unexpectedly rejects', async () => {
    streamMerch();
    hoisted.persistTerminalAssistantMessageWithReceipt.mockRejectedValueOnce(
      new Error('write rejected')
    );
    const events = await readEvents(await runMerch());
    expect(events.at(-1)?.type).toBe('error');
    expect(
      events.some(
        event =>
          event.type === 'web.handoff' || event.type === 'assistant.completed'
      )
    ).toBe(false);
  });

  it('emits one handoff for mixed valid outputs and preserves plan tool gating', async () => {
    const account = makeAccountContext();
    hoisted.resolveChatAccountContext.mockResolvedValue({
      ...account,
      planLimits: {
        ...account.planLimits,
        booleans: {
          ...account.planLimits.booleans,
          canAccessMerchCreation: false,
        },
      },
    });
    streamMerch('', [
      { toolName: 'createMerch', toolCallId: 'valid', output: generation },
      {
        toolName: 'previewMerchOptions',
        toolCallId: 'preview',
        output: preview,
      },
      {
        toolName: 'createMerch',
        toolCallId: 'invalid',
        output: { success: false },
      },
    ]);
    const events = await readEvents(await runMerch());
    expect(events.filter(event => event.type === 'web.handoff')).toHaveLength(
      1
    );
    expect(hoisted.executeChatTurn.mock.calls[0]?.[0].tools).toEqual({});
  });

  it('keeps plain text and empty-result fallback behavior', async () => {
    streamMerch('Plain reply.', []);
    expect(
      (await readEvents(await runMerch())).map(event => event.type)
    ).toEqual(['turn.reserved', 'assistant.delta', 'assistant.completed']);
    streamMerch('', []);
    expect(
      (await readEvents(await runMerch())).map(event => event.type)
    ).toEqual(['turn.reserved', 'web.handoff', 'assistant.completed']);
  });
});
