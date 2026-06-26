import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PACKAGING_INTELLIGENCE_MODEL } from '@/lib/constants/ai-models';

const { mockGenerateObject, mockGateway } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGateway: vi.fn((model: string) => model),
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@ai-sdk/gateway', () => ({
  gateway: mockGateway,
}));

import { analyzePackagingWithLlm } from '@/lib/services/packaging-intelligence/analyze';

describe('analyzePackagingWithLlm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes LLM calls through the AI SDK telemetry chokepoint', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        transcriptSummary: 'Summary',
        promise: {
          title: 'Title promise',
          thumbnail: 'Thumbnail promise',
          combined: 'Combined promise',
        },
        niche: {
          label: 'Gaming',
          category: 'gaming',
          confidence: 0.88,
          rationale: 'Gameplay commentary and tips.',
        },
        first30sDeliversPromise: false,
        first30sAssessment: 'Opens with a generic greeting before gameplay.',
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await analyzePackagingWithLlm({
      videoId: 'abc123',
      title: 'How I Beat Elden Ring',
      description: 'Full no-hit run breakdown',
      transcriptText: 'Welcome back to the channel...',
      first30sHookText: 'Welcome back to the channel',
      identity: { userId: 'user_1', sessionId: 'session_1' },
    });

    expect(mockGateway).toHaveBeenCalledWith(PACKAGING_INTELLIGENCE_MODEL);
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: PACKAGING_INTELLIGENCE_MODEL,
        experimental_telemetry: expect.objectContaining({
          functionId: 'jovie-packaging-intelligence',
          metadata: expect.objectContaining({
            videoId: 'abc123',
            model: PACKAGING_INTELLIGENCE_MODEL,
          }),
        }),
      })
    );

    expect(result.output.niche.category).toBe('gaming');
    expect(result.modelUsed).toBe(PACKAGING_INTELLIGENCE_MODEL);
    expect(result.promptTokens).toBe(100);
    expect(result.completionTokens).toBe(50);
  });
});
