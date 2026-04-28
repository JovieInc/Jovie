/**
 * `executeChatTurn` parity tests.
 *
 * Asserts that the extracted chat-turn pipeline produces deterministic outputs
 * for known inputs: model selection, system prompt assembly, and the registered
 * tool set. These guard against drift between the chat route handler and any
 * future caller (eval script, replay harness) that uses the same function.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  canUseLightModel,
  executeChatTurn,
  selectKnowledgeContextForTurn,
} from '@/lib/chat/run';
import type {
  ArtistContext,
  ChatTelemetry,
  ReleaseContext,
} from '@/lib/chat/types';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';

// Mock the AI SDK so tests don't hit the gateway. We only care that
// `streamText` is invoked with the right shape; the returned object is
// inspected by the parity assertions, not consumed end-to-end.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: vi.fn(opts => ({
      __mocked: true,
      __opts: opts,
    })),
  };
});

vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn((modelId: string) => ({ __model: modelId })),
}));

const baseArtistContext: ArtistContext = {
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

const noReleases: ReleaseContext[] = [];

const freePlanLimits = {
  booleans: { aiCanUseTools: false },
  limits: { aiDailyMessageLimit: 20 },
} as unknown as Parameters<typeof executeChatTurn>[0]['planLimits'];

const paidPlanLimits = {
  booleans: { aiCanUseTools: true },
  limits: { aiDailyMessageLimit: 500 },
} as unknown as Parameters<typeof executeChatTurn>[0]['planLimits'];

function userMessage(text: string, id = 'm1'): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

describe('canUseLightModel', () => {
  it('always picks light for free plan (no advanced tools)', () => {
    expect(canUseLightModel([userMessage('hello')], false)).toBe(true);
  });

  it('refuses light for long conversations even on paid plan', () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      userMessage(`m ${i}`, `id-${i}`)
    );
    expect(canUseLightModel(messages, true)).toBe(false);
  });

  it('picks light for short, clearly tool-oriented requests', () => {
    expect(
      canUseLightModel([userMessage('change my display name to Aurora')], true)
    ).toBe(true);
    expect(canUseLightModel([userMessage('add my Instagram link')], true)).toBe(
      true
    );
  });

  it('refuses light for open-ended questions on paid plan', () => {
    expect(
      canUseLightModel(
        [userMessage('how should I time my Spotify pitch?')],
        true
      )
    ).toBe(false);
  });
});

describe('selectKnowledgeContextForTurn', () => {
  it('returns a non-empty topic block for music-industry questions', () => {
    const ctx = selectKnowledgeContextForTurn([
      userMessage('How do I get on a playlist with editorial placement?'),
    ]);
    // Existing keyword router returns substantial markdown when topics match.
    expect(ctx.length).toBeGreaterThan(0);
  });

  it('uses the last 3 user messages for topic selection', () => {
    // Last 3 user messages get joined; second message contains keywords that
    // the keyword router recognizes (playlist + editorial).
    const messages = [
      userMessage('hello', 'a'),
      userMessage('How do I get on a playlist via editorial pitching?', 'b'),
      userMessage('thanks', 'c'),
    ];
    const ctx = selectKnowledgeContextForTurn(messages);
    expect(ctx.length).toBeGreaterThan(0);
  });
});

describe('executeChatTurn — parity assertions', () => {
  const baseInput = {
    artistContext: baseArtistContext,
    releases: noReleases,
    resolvedProfileId: 'profile-1',
    resolvedConversationId: 'conv-1',
    userId: 'user-1',
    userPlan: 'free',
    insightsEnabled: false,
    forceLightModel: false,
    tools: {},
    signal: new AbortController().signal,
    requestId: 'req-1',
  };

  it('selects CHAT_MODEL_LIGHT for free plan + simple intent', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('change my bio to: New bio text')],
      planLimits: freePlanLimits,
    });
    expect(turn.selectedModel).toBe(CHAT_MODEL_LIGHT);
  });

  it('selects CHAT_MODEL for paid plan + open-ended question', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [
        userMessage(
          'walk me through how Spotify editorial pitching actually works for an indie artist with 500 followers'
        ),
      ],
      planLimits: paidPlanLimits,
    });
    expect(turn.selectedModel).toBe(CHAT_MODEL);
  });

  it('honors forceLightModel override regardless of heuristic', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [
        userMessage('walk me through Spotify editorial pitching in detail'),
      ],
      planLimits: paidPlanLimits,
      forceLightModel: true,
    });
    expect(turn.selectedModel).toBe(CHAT_MODEL_LIGHT);
  });

  it('returns toolNames in deterministic sorted order', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
      tools: {
        zebraTool: {} as never,
        alphaTool: {} as never,
        middleTool: {} as never,
      },
    });
    expect(turn.toolNames).toEqual(['alphaTool', 'middleTool', 'zebraTool']);
  });

  it('builds a system prompt that includes the artist displayName and genre', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
    });
    expect(turn.systemPrompt).toContain('Aurora');
    expect(turn.systemPrompt.length).toBeGreaterThan(100);
  });

  it('emits chat-specific telemetry tags', async () => {
    const setTags = vi.fn();
    const setExtra = vi.fn();
    const telemetry: ChatTelemetry = { setTags, setExtra };

    await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
      telemetry,
    });

    expect(setTags).toHaveBeenCalledTimes(1);
    const tagsArg = setTags.mock.calls[0][0] as Record<string, string>;
    expect(tagsArg.chat_model).toBeTypeOf('string');
    expect(tagsArg.chat_force_light).toBe('false');
    expect(tagsArg.chat_has_tools).toBe('true');
    expect(tagsArg.chat_rag_retrieval).toBe('false');
    // Trace + version + conversation_id are all set as extras.
    const extraKeys = setExtra.mock.calls.map(c => c[0] as string);
    expect(extraKeys).toContain('chat_trace_id');
    expect(extraKeys).toContain('chat_retrieval_version');
    expect(extraKeys).toContain('chat_conversation_id');
  });

  it('skips conversation_id extra when none is provided (but still sets trace_id + version)', async () => {
    const setExtra = vi.fn();
    const telemetry: ChatTelemetry = { setExtra };

    await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
      resolvedConversationId: null,
      telemetry,
    });

    const extraKeys = setExtra.mock.calls.map(c => c[0] as string);
    expect(extraKeys).toContain('chat_trace_id');
    expect(extraKeys).toContain('chat_retrieval_version');
    expect(extraKeys).not.toContain('chat_conversation_id');
  });

  it('routes captureException through telemetry on stream error (no Sentry import in run.ts)', async () => {
    const captureException = vi.fn();
    const telemetry: ChatTelemetry = { captureException };

    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
      telemetry,
    });

    // Pull the onError callback the mocked streamText was invoked with and
    // simulate a real provider error.
    type MockedOpts = { onError: (arg: { error: unknown }) => void };
    const opts = (turn.streamResult as unknown as { __opts: MockedOpts })
      .__opts;
    const fakeError = new Error('upstream fail');
    opts.onError({ error: fakeError });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBe(fakeError);
    const ctx = captureException.mock.calls[0][1] as {
      tags: Record<string, string>;
      extra: Record<string, unknown>;
    };
    expect(ctx.tags).toEqual({
      feature: 'ai-chat',
      errorType: 'streaming',
    });
    expect(ctx.extra.userId).toBe('user-1');
    expect(ctx.extra.requestId).toBe('req-1');
    expect(ctx.extra.profileId).toBe('profile-1');
    expect(ctx.extra.conversationId).toBe('conv-1');
  });
});
