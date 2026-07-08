import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import { analyzePackagingWithLlm } from './analyze';
import {
  extractFirst30sHookText,
  fetchVideoCaptions,
  type TranscriptSource,
} from './transcript';
import {
  type AnalyzeVideoPackagingInput,
  type AnalyzeVideoPackagingOptions,
  getNichePriors,
  type PackagingIntelligence,
  type TranscriptSegment,
} from './types';

export type {
  ChannelPackagingRules,
  DimensionRule,
  ExperimentOutcome,
  PackagingDimension,
  PackagingVariantSpec,
  ProvenanceEntry,
} from './channel-rules';
export {
  applyExperimentOutcome,
  CONFIDENCE_THRESHOLD,
  MIN_SAMPLE_SIZE,
  resolvePackagingPriors,
} from './channel-rules';
export type {
  AnalyzeVideoPackagingInput,
  AnalyzeVideoPackagingOptions,
  PackagingIntelligence,
} from './types';

interface YouTubeVideoContext {
  readonly title: string;
  readonly description: string;
  readonly thumbnailUrl?: string;
}

async function fetchYouTubeVideoContext(
  videoId: string
): Promise<YouTubeVideoContext | null> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    logger.warn('[packaging-intelligence] YOUTUBE_DATA_API_KEY not configured');
    return null;
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('id', videoId);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('key', apiKey);

  try {
    const response = await serverFetch(url.toString(), {
      timeoutMs: 10_000,
      context: 'YouTube videos.list',
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          description?: string;
          thumbnails?: Record<string, { url?: string } | undefined>;
        };
      }>;
    };
    const snippet = data.items?.[0]?.snippet;
    if (!snippet?.title) return null;

    const thumbnails = snippet.thumbnails ?? {};
    return {
      title: snippet.title,
      description: snippet.description ?? '',
      thumbnailUrl:
        thumbnails.maxres?.url ??
        thumbnails.high?.url ??
        thumbnails.medium?.url ??
        thumbnails.default?.url,
    };
  } catch (error) {
    logger.warn('[packaging-intelligence] videos.list error', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function segmentsToPlainText(segments: readonly TranscriptSegment[]): string {
  return segments
    .map(segment => segment.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveTranscript(
  videoId: string,
  providedSegments: readonly TranscriptSegment[] | undefined,
  asrProvider: AnalyzeVideoPackagingOptions['asrProvider']
): Promise<{
  segments: readonly TranscriptSegment[];
  source: TranscriptSource;
}> {
  if (providedSegments?.length) {
    return { segments: providedSegments, source: 'provided' };
  }

  const captionSegments = await fetchVideoCaptions(videoId);
  if (captionSegments.length > 0) {
    return { segments: captionSegments, source: 'captions' };
  }

  if (asrProvider) {
    const asrSegments = await asrProvider(videoId);
    if (asrSegments?.length) {
      return { segments: asrSegments, source: 'asr' };
    }
  }

  return { segments: [], source: 'none' };
}

export async function analyzeVideoPackaging(
  input: AnalyzeVideoPackagingInput,
  options: AnalyzeVideoPackagingOptions = {}
): Promise<PackagingIntelligence> {
  const videoContext = await fetchYouTubeVideoContext(input.videoId);
  const title = input.title ?? videoContext?.title ?? 'Untitled video';
  const description = input.description ?? videoContext?.description ?? '';
  const thumbnailUrl = input.thumbnailUrl ?? videoContext?.thumbnailUrl;
  const { segments, source } = await resolveTranscript(
    input.videoId,
    input.transcriptSegments,
    options.asrProvider
  );
  const transcriptText = segmentsToPlainText(segments);
  const first30sHookText = extractFirst30sHookText(segments);
  const llmResult = await analyzePackagingWithLlm({
    videoId: input.videoId,
    title,
    description,
    thumbnailUrl,
    transcriptText,
    first30sHookText,
    identity: { userId: input.userId, sessionId: input.sessionId },
  });

  return {
    videoId: input.videoId,
    transcriptSummary: llmResult.output.transcriptSummary,
    promise: llmResult.output.promise,
    first30sHookText,
    first30sDeliversPromise: llmResult.output.first30sDeliversPromise,
    first30sAssessment: llmResult.output.first30sAssessment,
    niche: llmResult.output.niche,
    priors: getNichePriors(llmResult.output.niche.category),
    transcriptSource: source,
    modelUsed: llmResult.modelUsed,
    analyzedAt: new Date().toISOString(),
  };
}
