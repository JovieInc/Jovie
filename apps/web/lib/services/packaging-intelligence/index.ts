import 'server-only';

import { analyzePackagingWithLlm } from './analyze';
import { getNichePriors } from './priors';
import {
  extractFirst30sHookText,
  fetchVideoCaptions,
  type TranscriptSource,
} from './transcript';
import type {
  AnalyzeVideoPackagingInput,
  AnalyzeVideoPackagingOptions,
  PackagingIntelligence,
  TranscriptSegment,
} from './types';
import { fetchYouTubeVideoContext } from './video-context';

export {
  analyzePackagingWithLlm,
  analyzePackagingWithLlmSafe,
} from './analyze';

export {
  getNichePriors,
  PACKAGING_NICHE_PRIORS,
} from './priors';

export {
  extractFirst30sHookText,
  fetchVideoCaptions,
  parseJson3Captions,
  parseWebVtt,
} from './transcript';
export type {
  AnalyzeVideoPackagingInput,
  AnalyzeVideoPackagingOptions,
  AsrTranscriptProvider,
  PackagingIntelligence,
  PackagingLlmOutput,
  PackagingNiche,
  PackagingPromise,
  TranscriptSegment,
} from './types';

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
  if (providedSegments && providedSegments.length > 0) {
    return { segments: providedSegments, source: 'provided' };
  }

  const captionSegments = await fetchVideoCaptions(videoId);
  if (captionSegments.length > 0) {
    return { segments: captionSegments, source: 'captions' };
  }

  if (asrProvider) {
    const asrSegments = await asrProvider(videoId);
    if (asrSegments && asrSegments.length > 0) {
      return { segments: asrSegments, source: 'asr' };
    }
  }

  return { segments: [], source: 'none' };
}

/**
 * Produce structured packaging intelligence for a YouTube video.
 *
 * Given a video_id (and optional metadata/transcript), returns transcript
 * summary, title/thumbnail promise, first-30s hook text, niche label, and
 * 1of10 face priors for downstream generator + policy gate consumers.
 */
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
    identity: {
      userId: input.userId,
      sessionId: input.sessionId,
    },
  });

  const priors = getNichePriors(llmResult.output.niche.category);

  return {
    videoId: input.videoId,
    transcriptSummary: llmResult.output.transcriptSummary,
    promise: llmResult.output.promise,
    first30sHookText,
    first30sDeliversPromise: llmResult.output.first30sDeliversPromise,
    first30sAssessment: llmResult.output.first30sAssessment,
    niche: llmResult.output.niche,
    priors,
    transcriptSource: source,
    modelUsed: llmResult.modelUsed,
    analyzedAt: new Date().toISOString(),
  };
}
