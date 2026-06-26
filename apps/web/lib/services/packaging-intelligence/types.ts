import { z } from 'zod';

/** YouTube packaging niches aligned with 1of10 priors taxonomy. */
export const packagingNicheSchema = z.enum([
  'entertainment',
  'education',
  'gaming',
  'tech',
  'finance',
  'lifestyle_vlog',
  'news_commentary',
  'music',
  'fitness_health',
  'food_cooking',
  'beauty_fashion',
  'sports',
  'diy_howto',
  'science',
  'travel',
  'business',
  'automotive',
  'parenting',
  'other',
]);

export type PackagingNiche = z.infer<typeof packagingNicheSchema>;

export const faceEffectSchema = z.enum(['helps', 'hurts', 'neutral']);

export type FaceEffect = z.infer<typeof faceEffectSchema>;

/** A single timed transcript segment. */
export const transcriptSegmentSchema = z.object({
  startSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
  text: z.string(),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const packagingPromiseSchema = z.object({
  title: z
    .string()
    .describe('What the title promises the viewer will get or learn'),
  thumbnail: z
    .string()
    .describe('What the thumbnail visually promises (scene, emotion, payoff)'),
  combined: z
    .string()
    .describe('Single-sentence packaging promise across title + thumbnail'),
});

export type PackagingPromise = z.infer<typeof packagingPromiseSchema>;

/** LLM extraction output — validated before merging with deterministic fields. */
export const packagingLlmOutputSchema = z.object({
  transcriptSummary: z
    .string()
    .describe('2-4 sentence summary of the full video transcript'),
  promise: packagingPromiseSchema,
  niche: z.object({
    label: z
      .string()
      .describe('Human-readable niche label, e.g. "Personal Finance"'),
    category: packagingNicheSchema.describe(
      'Canonical niche bucket for priors lookup'
    ),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  first30sDeliversPromise: z
    .boolean()
    .describe(
      'Whether the first 30 seconds substantively deliver the title/thumbnail promise'
    ),
  first30sAssessment: z
    .string()
    .describe('Brief note on hook strength vs packaging promise'),
});

export type PackagingLlmOutput = z.infer<typeof packagingLlmOutputSchema>;

export const packagingIntelligenceSchema = z.object({
  videoId: z.string(),
  transcriptSummary: z.string(),
  promise: packagingPromiseSchema,
  first30sHookText: z.string(),
  first30sDeliversPromise: z.boolean(),
  first30sAssessment: z.string(),
  niche: z.object({
    label: z.string(),
    category: packagingNicheSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  priors: z.object({
    faceEffect: faceEffectSchema,
    source: z.literal('1of10'),
  }),
  transcriptSource: z.enum(['provided', 'captions', 'asr', 'none']),
  modelUsed: z.string(),
  analyzedAt: z.string(),
});

export type PackagingIntelligence = z.infer<typeof packagingIntelligenceSchema>;

export interface AnalyzeVideoPackagingInput {
  readonly videoId: string;
  readonly title?: string;
  readonly description?: string;
  readonly thumbnailUrl?: string;
  /** Pre-fetched transcript segments (skips caption/ASR fetch). */
  readonly transcriptSegments?: readonly TranscriptSegment[];
  readonly userId?: string | null;
  readonly sessionId?: string | null;
}

export type AsrTranscriptProvider = (
  videoId: string
) => Promise<readonly TranscriptSegment[] | null>;

export interface AnalyzeVideoPackagingOptions {
  readonly asrProvider?: AsrTranscriptProvider;
}
