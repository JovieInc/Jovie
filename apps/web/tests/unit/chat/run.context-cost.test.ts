/**
 * Chat context cost: the stable prompt prefix is cacheable, stale tool output
 * is not replayed, and every turn is tagged for AI Gateway spend reporting.
 */

import type { ModelMessage, UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  buildCachedSystemMessages,
  executeChatTurn,
  pruneStaleToolHistory,
} from '@/lib/chat/run';
import type { ArtistContext } from '@/lib/chat/types';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: vi.fn(opts => ({ __mocked: true, __opts: opts })),
  };
});

// Knowledge retrieval is per-turn context: it depends on the latest user text.
vi.mock('@/lib/chat/knowledge/router', () => ({
  selectKnowledgeContext: (text: string) =>
    text.includes('royalties') ? 'ROYALTY-KNOWLEDGE' : '',
}));

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() =>
    vi.fn((modelId: string) => ({ __model: modelId }))
  ),
  gateway: vi.fn(),
}));

const artistContext: ArtistContext = {
  displayName: 'Aurora',
  username: 'aurora',
  bio: null,
  genres: ['indie'],
  spotifyFollowers: 500,
  spotifyPopularity: 22,
  spotifyUrl: null,
  appleMusicUrl: null,
  profileViews: 100,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

const planLimits = {
  booleans: { aiCanUseTools: true },
  limits: { aiWeeklyMessageLimit: 500 },
} as unknown as Parameters<typeof executeChatTurn>[0]['planLimits'];

const baseInput = {
  artistContext,
  releases: [],
  resolvedProfileId: 'profile-1',
  resolvedConversationId: 'conv-1',
  userId: 'user-1',
  userPlan: 'pro',
  planLimits,
  insightsEnabled: false,
  forceLightModel: false,
  tools: {},
  signal: new AbortController().signal,
  requestId: 'req-1',
};

function user(text: string): ModelMessage {
  return { role: 'user', content: [{ type: 'text', text }] };
}

function toolTurn(id: string, output: string): ModelMessage[] {
  return [
    {
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: id, toolName: 'lookup', input: {} },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: id,
          toolName: 'lookup',
          output: { type: 'text', value: output },
        },
      ],
    },
    { role: 'assistant', content: [{ type: 'text', text: `done ${id}` }] },
  ];
}

function toolCallIds(messages: ModelMessage[]): string[] {
  return messages.flatMap(message =>
    typeof message.content === 'string'
      ? []
      : message.content.flatMap(part =>
          'toolCallId' in part ? [part.toolCallId] : []
        )
  );
}

function capturedOptions(turn: Awaited<ReturnType<typeof executeChatTurn>>) {
  return (turn.streamResult as unknown as { __opts: Record<string, unknown> })
    .__opts;
}

describe('pruneStaleToolHistory', () => {
  it('drops tool calls and results older than the last two user turns', () => {
    const messages: ModelMessage[] = [
      user('one'),
      ...toolTurn('old', 'x'.repeat(20_000)),
      user('two'),
      ...toolTurn('previous', 'kept'),
      user('three'),
      ...toolTurn('current', 'kept'),
    ];

    const pruned = pruneStaleToolHistory(messages);

    expect(toolCallIds(pruned)).toEqual([
      'previous',
      'previous',
      'current',
      'current',
    ]);
    expect(JSON.stringify(pruned)).not.toContain('x'.repeat(100));
    // Assistant text from the pruned turn stays in history.
    expect(JSON.stringify(pruned)).toContain('done old');
  });

  it('keeps short conversations unchanged', () => {
    const messages = [user('one'), ...toolTurn('only', 'kept'), user('two')];
    expect(pruneStaleToolHistory(messages)).toBe(messages);
  });
});

describe('buildCachedSystemMessages', () => {
  it('marks only the stable block as an Anthropic cache breakpoint', () => {
    expect(
      buildCachedSystemMessages({ stable: 'STABLE', dynamic: 'TURN' })
    ).toEqual([
      {
        role: 'system',
        content: 'STABLE',
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      },
      { role: 'system', content: 'TURN' },
    ]);
  });

  it('omits the dynamic block when there is no per-turn context', () => {
    expect(
      buildCachedSystemMessages({ stable: 'STABLE', dynamic: '' })
    ).toHaveLength(1);
  });
});

describe('executeChatTurn context cost', () => {
  it('sends a byte-identical cached prefix while per-turn context changes', async () => {
    const turnA = await executeChatTurn({
      ...baseInput,
      uiMessages: [
        { id: 'a', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ] as UIMessage[],
    });
    const turnB = await executeChatTurn({
      ...baseInput,
      uiMessages: [
        {
          id: 'b',
          role: 'user',
          parts: [
            { type: 'text', text: 'how do spotify royalties and PROs work?' },
          ],
        },
      ] as UIMessage[],
    });

    const systemA = capturedOptions(turnA).system as { content: string }[];
    const systemB = capturedOptions(turnB).system as { content: string }[];
    expect(systemA[0]?.content).toBe(systemB[0]?.content);
    expect(systemA).toHaveLength(1);
    expect(systemB[1]?.content).toContain('ROYALTY-KNOWLEDGE');
    expect(systemA[0]).toMatchObject({
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
    // The returned prompt is still the full composed prompt.
    expect(turnB.systemPrompt.startsWith(systemB[0]?.content ?? '')).toBe(true);
  });

  it('tags the turn for AI Gateway spend reporting', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [
        { id: 'a', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ] as UIMessage[],
    });

    expect(capturedOptions(turn).providerOptions).toMatchObject({
      gateway: {
        tags: expect.arrayContaining([
          'feature:jovie-chat',
          'surface:app',
          'app:web',
        ]),
      },
    });
  });

  it('logs the real model stream error even without telemetry (JOV-6533)', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      requestId: 'req-1',
      uiMessages: [
        { id: 'a', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ] as UIMessage[],
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const boom = new Error('provider rejected the request');
    await (
      capturedOptions(turn) as unknown as {
        onError: (e: { error: unknown }) => Promise<void>;
      }
    ).onError({ error: boom });

    expect(consoleError).toHaveBeenCalledWith(
      '[chat] model stream error',
      expect.objectContaining({
        message: 'provider rejected the request',
        requestId: 'req-1',
      })
    );

    type Opts = {
      onAbort: (e: { steps: unknown[] }) => void;
      onFinish: (e: {
        steps: { toolCalls: unknown[] }[];
        text: string;
        finishReason: string;
      }) => Promise<void>;
    };
    const opts = capturedOptions(turn) as unknown as Opts;
    opts.onAbort({ steps: [] });
    expect(consoleError).toHaveBeenCalledWith(
      '[chat] model stream aborted',
      expect.objectContaining({ requestId: 'req-1', steps: 0 })
    );
    await opts.onFinish({ steps: [], text: '', finishReason: 'stop' });
    expect(consoleError).toHaveBeenCalledWith(
      '[chat] model turn produced no output',
      expect.objectContaining({ requestId: 'req-1', finishReason: 'stop' })
    );
    consoleError.mockRestore();
  });
});
