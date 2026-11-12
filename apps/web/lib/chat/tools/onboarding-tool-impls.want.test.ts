import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildOnboardingTools,
  createOnboardingTurnState,
} from './onboarding-tool-impls';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  createFeedbackItem: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock('@/lib/feedback', () => ({
  createFeedbackItem: mocks.createFeedbackItem,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));
vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => [],
  };
  return { db: { select: () => chain } };
});
vi.mock('@/lib/onboarding/catalog-preview.server', () => ({
  fetchOnboardingCatalogPreview: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  recordFunnelStep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: vi.fn().mockResolvedValue(true),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/lib/spotify', () => ({
  getSpotifyArtist: vi.fn(),
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
}));

type RecordSignal = {
  execute: (input: unknown) => Promise<{
    action: string;
    signalCount: number;
  }>;
};

function recordInterviewSignal(sessionId: string) {
  const state = createOnboardingTurnState({ sessionId, turnCount: 1 });
  const tools = buildOnboardingTools(state);
  return {
    state,
    tool: tools.recordInterviewSignal as unknown as RecordSignal,
  };
}

describe('recordInterviewSignal wants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFeedbackItem.mockResolvedValue({ id: 'feedback_1' });
    mocks.captureError.mockResolvedValue(undefined);
  });

  it('logs a not_available want as one onboarding_want build request', async () => {
    const { state, tool } = recordInterviewSignal('session-want');
    const result = await tool.execute({
      want: { text: 'Sell paid fan memberships', capability: 'not_available' },
    });

    expect(result).toMatchObject({ action: 'signal_recorded', signalCount: 1 });
    expect(state.signals).toHaveLength(1);
    expect(mocks.createFeedbackItem).toHaveBeenCalledTimes(1);
    expect(mocks.createFeedbackItem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        source: 'onboarding_want',
        message: 'Sell paid fan memberships',
        context: expect.objectContaining({
          onboardingSessionId: 'session-want',
          matchedCapability: 'not_available',
        }),
      })
    );
  });

  it('records an available want as a signal only', async () => {
    const { state, tool } = recordInterviewSignal('session-available');
    await tool.execute({
      want: { text: 'One link for my single', capability: 'smart-links' },
    });
    await tool.execute({ releaseStage: 'just_released' });

    expect(state.signals).toHaveLength(2);
    expect(mocks.createFeedbackItem).not.toHaveBeenCalled();
  });

  it('keeps the chat turn alive when the build request write fails', async () => {
    mocks.createFeedbackItem.mockRejectedValue(new Error('db down'));
    const { tool } = recordInterviewSignal('session-fail');

    await expect(
      tool.execute({
        want: {
          text: 'Sell paid fan memberships',
          capability: 'not_available',
        },
      })
    ).resolves.toMatchObject({ action: 'signal_recorded' });
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
  });
});
