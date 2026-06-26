import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PACKAGING_INTELLIGENCE_MODEL } from '@/lib/constants/ai-models';

const {
  mockGenerateObject,
  mockGateway,
  mockFetchYouTubeVideoContext,
  mockFetchVideoCaptions,
  mockAnalyzePackagingWithLlm,
} = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGateway: vi.fn((model: string) => model),
  mockFetchYouTubeVideoContext: vi.fn(),
  mockFetchVideoCaptions: vi.fn(),
  mockAnalyzePackagingWithLlm: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@ai-sdk/gateway', () => ({
  gateway: mockGateway,
}));

vi.mock('@/lib/services/packaging-intelligence/video-context', () => ({
  fetchYouTubeVideoContext: mockFetchYouTubeVideoContext,
}));

vi.mock(
  '@/lib/services/packaging-intelligence/transcript',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('@/lib/services/packaging-intelligence/transcript')
      >();
    return {
      ...actual,
      fetchVideoCaptions: mockFetchVideoCaptions,
    };
  }
);

vi.mock('@/lib/services/packaging-intelligence/analyze', () => ({
  analyzePackagingWithLlm: mockAnalyzePackagingWithLlm,
}));

import { analyzeVideoPackaging } from '@/lib/services/packaging-intelligence';

const llmFixture = {
  output: {
    transcriptSummary:
      'The creator explains three budgeting mistakes and how to fix them.',
    promise: {
      title: 'Learn the three money mistakes keeping you broke',
      thumbnail: 'Shocked face beside shrinking wallet graphic',
      combined:
        'You will discover three specific money mistakes and how to fix them fast.',
    },
    niche: {
      label: 'Personal Finance',
      category: 'finance' as const,
      confidence: 0.91,
      rationale: 'Budgeting and money-management advice for consumers.',
    },
    first30sDeliversPromise: true,
    first30sAssessment:
      'Opens by naming the first mistake immediately, matching the title payoff.',
  },
  modelUsed: PACKAGING_INTELLIGENCE_MODEL,
  promptTokens: 400,
  completionTokens: 180,
};

describe('analyzeVideoPackaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFetchYouTubeVideoContext.mockResolvedValue({
      title: '3 Money Mistakes Keeping You Broke',
      description: 'Stop doing these three things with your paycheck.',
      thumbnailUrl: 'https://i.ytimg.com/vi/demo/hqdefault.jpg',
    });

    mockFetchVideoCaptions.mockResolvedValue([
      { startSeconds: 0, durationSeconds: 4, text: 'Mistake number one is' },
      {
        startSeconds: 4,
        durationSeconds: 6,
        text: 'spending before you save.',
      },
    ]);

    mockAnalyzePackagingWithLlm.mockResolvedValue(llmFixture);
  });

  it('returns structured packaging intelligence consumable by generator and policy gate', async () => {
    const result = await analyzeVideoPackaging({
      videoId: 'demoVideo123',
      userId: 'user_abc',
    });

    expect(result).toEqual({
      videoId: 'demoVideo123',
      transcriptSummary: llmFixture.output.transcriptSummary,
      promise: llmFixture.output.promise,
      first30sHookText: 'Mistake number one is spending before you save.',
      first30sDeliversPromise: true,
      first30sAssessment: llmFixture.output.first30sAssessment,
      niche: llmFixture.output.niche,
      priors: {
        faceEffect: 'neutral',
        source: '1of10',
      },
      transcriptSource: 'captions',
      modelUsed: PACKAGING_INTELLIGENCE_MODEL,
      analyzedAt: expect.any(String),
    });

    expect(mockAnalyzePackagingWithLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'demoVideo123',
        title: '3 Money Mistakes Keeping You Broke',
        first30sHookText: 'Mistake number one is spending before you save.',
        identity: {
          userId: 'user_abc',
          sessionId: undefined,
        },
      })
    );
  });

  it('prefers provided transcript segments over caption fetch', async () => {
    const result = await analyzeVideoPackaging({
      videoId: 'demoVideo123',
      transcriptSegments: [
        { startSeconds: 0, durationSeconds: 2, text: 'Provided hook line' },
      ],
    });

    expect(result.transcriptSource).toBe('provided');
    expect(result.first30sHookText).toBe('Provided hook line');
    expect(mockFetchVideoCaptions).not.toHaveBeenCalled();
  });

  it('falls back to ASR when captions are unavailable', async () => {
    mockFetchVideoCaptions.mockResolvedValueOnce([]);

    const asrProvider = vi
      .fn()
      .mockResolvedValue([
        { startSeconds: 0, durationSeconds: 3, text: 'ASR transcript hook' },
      ]);

    const result = await analyzeVideoPackaging(
      { videoId: 'demoVideo123' },
      { asrProvider }
    );

    expect(asrProvider).toHaveBeenCalledWith('demoVideo123');
    expect(result.transcriptSource).toBe('asr');
    expect(result.first30sHookText).toBe('ASR transcript hook');
  });
});
