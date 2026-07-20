/**
 * JOV-3525 — chat streaming cadence (server half).
 *
 * `executeChatTurn` must pace raw model deltas into a steady word-level reveal
 * via the AI SDK v6 `experimental_transform: smoothStream(...)` streamText
 * option, and that transform must still compose with the leak-guard /
 * stream-normalization boundary (#14540) that turns the result into a WHATWG
 * SSE response.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { executeChatTurn } from '@/lib/chat/run';
import type { ArtistContext } from '@/lib/chat/types';

const smoothStreamMock = vi.hoisted(() => {
  const sentinelTransform = vi.fn();
  return {
    sentinelTransform,
    mock: vi.fn(() => sentinelTransform),
  };
});

// Mirror run.parity.test.ts: capture streamText options instead of hitting the
// gateway; smoothStream is mocked so the exact pacing config is pinned.
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    smoothStream: smoothStreamMock.mock,
    streamText: vi.fn(opts => ({
      __mocked: true,
      __opts: opts,
    })),
  };
});

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() =>
    vi.fn((modelId: string) => ({ __model: modelId }))
  ),
  gateway: vi.fn(),
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

describe('executeChatTurn — stream smoothing (JOV-3525)', () => {
  const baseInput = {
    artistContext: baseArtistContext,
    releases: [],
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

  it('builds the transform with the issue-pinned pacing config', async () => {
    await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
    });

    expect(smoothStreamMock.mock).toHaveBeenCalledWith({
      delayInMs: 15,
      chunking: 'word',
    });
  });

  it('passes the smoothStream transform to streamText as experimental_transform', async () => {
    const turn = await executeChatTurn({
      ...baseInput,
      uiMessages: [userMessage('hello')],
      planLimits: paidPlanLimits,
    });

    const opts = (
      turn.streamResult as unknown as {
        __opts: { experimental_transform?: unknown };
      }
    ).__opts;
    expect(opts.experimental_transform).toBe(
      smoothStreamMock.sentinelTransform
    );
  });

  it('smoothed stream still produces a WHATWG SSE response through the #14540 normalization boundary', async () => {
    const actual = await vi.importActual<typeof import('ai')>('ai');
    const { createStaticTextLanguageModel } = await import(
      '@/lib/chat/prompt-disclosure-guard'
    );
    const { wrapStreamTextResult } = await import('@/lib/eval/leak-guard');

    const result = actual.streamText({
      model: createStaticTextLanguageModel('Onward.') as never,
      prompt: 'hi',
      experimental_transform: actual.smoothStream({
        delayInMs: 15,
        chunking: 'word',
      }),
    });
    const wrapped = wrapStreamTextResult(result, { source: 'streamText' });

    const response = wrapped.toUIMessageStreamResponse();
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('Onward.');
  });
});
