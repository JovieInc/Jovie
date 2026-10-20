import { streamText, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadChatAttachments } from '@/lib/chat/attachment-policy';
import {
  PROMPT_DISCLOSURE_REFUSAL,
  PROMPT_LEAK_CANARY,
} from '@/lib/chat/prompt-disclosure-guard';
import { executeChatTurn } from '@/lib/chat/run';
import type { ArtistContext } from '@/lib/chat/types';

const mocks = vi.hoisted(() => ({
  model: undefined as MockLanguageModelV3 | undefined,
  knowledge: vi.fn().mockResolvedValue(''),
  harness: vi.fn(),
  fetchTrap: vi.fn(() => {
    throw new Error('Unexpected network access');
  }),
  dnsTrap: vi.fn(() => {
    throw new Error('Unexpected DNS access');
  }),
}));

// Run the installed SDK; only the provider and optional external services are mocked.
vi.mock('@/lib/ai/sdk', async () => ({
  streamText: (await vi.importActual<typeof import('ai')>('ai')).streamText,
  gateway: () => mocks.model,
}));
vi.mock('@/lib/observability/langfuse', () => ({
  startChatTurnLangfuseTrace: vi.fn().mockResolvedValue(null),
}));

const blobUrl =
  'https://test-store.public.blob.vercel-storage.com/jovie/files/chat/user/cover.png';
const artistContext: ArtistContext = {
  displayName: 'Test Artist',
  username: 'test-artist',
  bio: null,
  genres: [],
  spotifyFollowers: null,
  spotifyPopularity: null,
  spotifyUrl: null,
  appleMusicUrl: null,
  profileViews: 0,
  hasSocialLinks: false,
  hasMusicLinks: false,
  tippingStats: {
    tipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

function input(url = blobUrl): Parameters<typeof executeChatTurn>[0] {
  const uiMessages: UIMessage[] = [
    {
      id: 'm1',
      role: 'user',
      parts: [
        { type: 'text', text: 'Describe this image' },
        { type: 'file', mediaType: 'image/png', url },
      ],
    },
  ];
  return {
    uiMessages,
    artistContext,
    releases: [],
    resolvedProfileId: 'profile-1',
    resolvedConversationId: 'conversation-1',
    userId: 'user-1',
    userPlan: 'pro',
    planLimits: {
      booleans: { aiCanUseTools: true },
      limits: { aiWeeklyMessageLimit: 500 },
    } as Parameters<typeof executeChatTurn>[0]['planLimits'],
    insightsEnabled: false,
    forceLightModel: false,
    tools: {},
    signal: new AbortController().signal,
    requestId: 'attachment-test',
    knowledgeRetriever: mocks.knowledge,
    coreChatHarness: { runCoreChatTurn: mocks.harness },
  };
}

function model(
  supportedUrls: Record<string, RegExp[]> = { '*/*': [/.*/] },
  output = 'ok'
) {
  return new MockLanguageModelV3({
    supportedUrls,
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'answer' });
          controller.enqueue({
            type: 'text-delta',
            id: 'answer',
            delta: output,
          });
          controller.enqueue({ type: 'text-end', id: 'answer' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    },
  });
}

const fetchTrap = mocks.fetchTrap;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.model = model();
  mocks.harness.mockResolvedValue({
    trace: {
      provider: 'eve',
      available: false,
      status: 'disabled',
      reason: 'feature_disabled',
      requestId: 'attachment-test',
      eventTypes: [],
      durationMs: 0,
    },
  });
  // The installed SDK uses a DNS-pinned native transport rather than global
  // fetch. Trap both transports so a deliberate-red test stays secret-free.
  const getBuiltinModule = process.getBuiltinModule;
  vi.spyOn(process, 'getBuiltinModule').mockImplementation(id => {
    if (id === 'node:module') {
      return {
        createRequire: () => () => ({ Agent: class {}, fetch: fetchTrap }),
      };
    }
    if (id === 'node:dns') return { lookup: mocks.dnsTrap };
    return getBuiltinModule(id);
  });
  vi.stubGlobal('fetch', fetchTrap);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('chat attachment boundary with the real AI SDK', () => {
  it('rejects unsafe attachments before retrieval, harness, or provider I/O', async () => {
    await expect(
      executeChatTurn(input('https://example.com/file.png'))
    ).rejects.toThrow('Invalid file attachment');
    expect(mocks.knowledge).not.toHaveBeenCalled();
    expect(mocks.harness).not.toHaveBeenCalled();
    expect(mocks.model?.doStreamCalls).toHaveLength(0);
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(mocks.dnsTrap).not.toHaveBeenCalled();
  });

  it('passes a supported upload URL to the gateway without fetching it locally', async () => {
    const turn = await executeChatTurn(input());
    await expect(turn.streamResult.text).resolves.toBe('ok');
    expect(mocks.model?.doStreamCalls).toHaveLength(1);
    expect(mocks.model?.doStreamCalls[0].prompt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'file',
              data: new URL(blobUrl),
              mediaType: 'image/png',
            }),
          ]),
        }),
      ])
    );
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(mocks.dnsTrap).not.toHaveBeenCalled();
  });

  it('rejects an unsafe URL even when the provider claims URL support', async () => {
    const result = streamText({
      model: mocks.model!,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: new URL('https://example.com/file.png'),
            },
          ],
        },
      ],
      experimental_download: downloadChatAttachments,
      onError: () => {},
    });
    await expect(result.text).rejects.toThrow();
    expect(mocks.model?.doStreamCalls).toHaveLength(0);
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(mocks.dnsTrap).not.toHaveBeenCalled();
  });

  it('preserves an inline image without issuing a network request', async () => {
    const turn = await executeChatTurn(
      input('data:image/png;base64,iVBORw0KGgo=')
    );
    await expect(turn.streamResult.text).resolves.toBe('ok');
    expect(mocks.model?.doStreamCalls).toHaveLength(1);
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(mocks.dnsTrap).not.toHaveBeenCalled();
  });

  it('rejects unsupported remote files before the SDK downloads or invokes the provider', async () => {
    mocks.model = model({});
    const turn = await executeChatTurn(input());
    await expect(turn.streamResult.text).rejects.toThrow();
    expect(mocks.model.doStreamCalls).toHaveLength(0);
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(mocks.dnsTrap).not.toHaveBeenCalled();
  });
});

describe('chat buffered completion with the real AI SDK', () => {
  it.each([
    ['safe answer', 'Your draft is ready.', 'Your draft is ready.'],
    [
      'prompt leak',
      `Internal setup: ${PROMPT_LEAK_CANARY}`,
      PROMPT_DISCLOSURE_REFUSAL,
    ],
  ])(
    'retains the guarded final text after consuming a %s stream',
    async (_, output, expected) => {
      mocks.model = model(undefined, output);
      const turn = await executeChatTurn(input());

      await turn.streamResult.consumeStream();

      await expect(turn.streamResult.text).resolves.toBe(expected);
      expect(mocks.model.doStreamCalls).toHaveLength(1);
      expect(fetchTrap).not.toHaveBeenCalled();
      expect(mocks.dnsTrap).not.toHaveBeenCalled();
    }
  );
});
