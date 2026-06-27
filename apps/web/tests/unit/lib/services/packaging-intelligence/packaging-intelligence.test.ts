import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PACKAGING_INTELLIGENCE_MODEL } from '@/lib/constants/ai-models';

const {
  mockGenerateObject,
  mockGateway,
  mockServerFetch,
  mockFetchVideoCaptions,
} = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGateway: vi.fn((model: string) => model),
  mockServerFetch: vi.fn(),
  mockFetchVideoCaptions: vi.fn(),
}));

vi.mock('ai', () => ({ generateObject: mockGenerateObject }));
vi.mock('@ai-sdk/gateway', () => ({ gateway: mockGateway }));
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: mockServerFetch }));
vi.mock(
  '@/lib/services/packaging-intelligence/transcript',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('@/lib/services/packaging-intelligence/transcript')
      >();
    return { ...actual, fetchVideoCaptions: mockFetchVideoCaptions };
  }
);

import { analyzeVideoPackaging } from '@/lib/services/packaging-intelligence';
import { analyzePackagingWithLlm } from '@/lib/services/packaging-intelligence/analyze';
import {
  extractFirst30sHookText,
  parseWebVtt,
} from '@/lib/services/packaging-intelligence/transcript';
import {
  getNichePriors,
  PACKAGING_NICHE_PRIORS,
  packagingNicheSchema,
} from '@/lib/services/packaging-intelligence/types';

const SAMPLE_VTT = `WEBVTT
00:00:00.000 --> 00:00:05.000
Hook line one.
00:00:05.000 --> 00:00:35.000
Hook line two.
00:00:35.000 --> 00:00:40.000
Outside hook window.`;

const llmOutput = {
  transcriptSummary: 'Budgeting mistakes and fixes.',
  promise: {
    title: 'Learn three money mistakes',
    thumbnail: 'Shocked face beside wallet',
    combined: 'Discover three money mistakes and how to fix them.',
  },
  niche: {
    label: 'Personal Finance',
    category: 'finance' as const,
    confidence: 0.91,
    rationale: 'Consumer budgeting advice.',
  },
  first30sDeliversPromise: true,
  first30sAssessment: 'Opens with the first mistake immediately.',
};

function mockLlmResult(
  overrides: Partial<typeof llmOutput> = {}
): typeof llmOutput {
  return { ...llmOutput, ...overrides };
}

describe('packaging intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.YOUTUBE_DATA_API_KEY = 'test-key';
    mockServerFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            snippet: {
              title: '3 Money Mistakes Keeping You Broke',
              description: 'Stop doing these three things with your paycheck.',
              thumbnails: {
                high: { url: 'https://i.ytimg.com/vi/demo/hqdefault.jpg' },
              },
            },
          },
        ],
      }),
    });
    mockFetchVideoCaptions.mockResolvedValue([
      { startSeconds: 0, durationSeconds: 4, text: 'Mistake number one is' },
      {
        startSeconds: 4,
        durationSeconds: 6,
        text: 'spending before you save.',
      },
    ]);
    mockGenerateObject.mockResolvedValue({
      object: llmOutput,
      usage: { inputTokens: 400, outputTokens: 180 },
    });
  });

  it('parses WebVTT and extracts the first-30s hook window', () => {
    const segments = parseWebVtt(SAMPLE_VTT);
    expect(segments).toHaveLength(3);
    expect(extractFirst30sHookText(segments)).toBe(
      'Hook line one. Hook line two.'
    );
    expect(
      extractFirst30sHookText([
        { startSeconds: 40, durationSeconds: 5, text: 'Late start' },
      ])
    ).toBe('');
  });

  it('maps every niche to 1of10 priors', () => {
    for (const niche of packagingNicheSchema.options) {
      expect(PACKAGING_NICHE_PRIORS[niche].source).toBe('1of10');
    }
    expect(getNichePriors('gaming').faceEffect).toBe('hurts');
    expect(getNichePriors('lifestyle_vlog').faceEffect).toBe('helps');
  });

  it('routes LLM calls through the AI SDK telemetry chokepoint', async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        ...llmOutput,
        niche: {
          ...llmOutput.niche,
          category: 'gaming' as const,
          label: 'Gaming',
        },
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
        experimental_telemetry: expect.objectContaining({
          functionId: 'jovie-packaging-intelligence',
        }),
      })
    );
    expect(result.output.niche.category).toBe('gaming');
    expect(result.promptTokens).toBe(100);
  });

  it('returns structured packaging intelligence for generator and policy consumers', async () => {
    const result = await analyzeVideoPackaging({
      videoId: 'demoVideo123',
      userId: 'user_abc',
    });

    expect(result).toMatchObject({
      videoId: 'demoVideo123',
      transcriptSummary: llmOutput.transcriptSummary,
      promise: llmOutput.promise,
      first30sHookText: 'Mistake number one is spending before you save.',
      transcriptSource: 'captions',
      modelUsed: PACKAGING_INTELLIGENCE_MODEL,
      priors: { faceEffect: 'neutral', source: '1of10' },
    });
  });

  it('prefers provided transcript segments and falls back to ASR', async () => {
    const provided = await analyzeVideoPackaging({
      videoId: 'demoVideo123',
      transcriptSegments: [
        { startSeconds: 0, durationSeconds: 2, text: 'Provided hook line' },
      ],
    });
    expect(provided.transcriptSource).toBe('provided');
    expect(mockFetchVideoCaptions).not.toHaveBeenCalled();

    mockFetchVideoCaptions.mockResolvedValueOnce([]);
    const asrProvider = vi
      .fn()
      .mockResolvedValue([
        { startSeconds: 0, durationSeconds: 3, text: 'ASR transcript hook' },
      ]);
    const asr = await analyzeVideoPackaging(
      { videoId: 'demoVideo123' },
      { asrProvider }
    );
    expect(asr.transcriptSource).toBe('asr');
    expect(asr.first30sHookText).toBe('ASR transcript hook');
  });

  it('handles missing transcript sources without throwing', async () => {
    mockFetchVideoCaptions.mockResolvedValueOnce([]);
    mockGenerateObject.mockResolvedValueOnce({
      object: mockLlmResult({
        transcriptSummary: '(no transcript available) - inferred from title',
        promise: {
          title: 'Untitled video',
          thumbnail: 'no thumbnail',
          combined: 'Unable to determine promise without transcript.',
        },
        niche: {
          label: 'Other',
          category: 'other' as const,
          confidence: 0.1,
          rationale: 'No transcript or metadata available.',
        },
        first30sDeliversPromise: false,
        first30sAssessment: 'No transcript to assess.',
      }),
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await analyzeVideoPackaging({
      videoId: 'demoVideo123',
      title: 'Untitled Video',
      description: '',
    });

    expect(result.transcriptSource).toBe('none');
    expect(result.first30sHookText).toBe('');
  });
});
