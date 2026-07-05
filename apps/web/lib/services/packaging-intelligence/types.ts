import { z } from 'zod';

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

export const transcriptSegmentSchema = z.object({
  startSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
  text: z.string(),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const packagingPromiseSchema = z.object({
  title: z.string(),
  thumbnail: z.string(),
  combined: z.string(),
});

export type PackagingPromise = z.infer<typeof packagingPromiseSchema>;

export const packagingLlmOutputSchema = z.object({
  transcriptSummary: z.string(),
  promise: packagingPromiseSchema,
  niche: z.object({
    label: z.string(),
    category: packagingNicheSchema,
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  }),
  first30sDeliversPromise: z.boolean(),
  first30sAssessment: z.string(),
});

export type PackagingLlmOutput = z.infer<typeof packagingLlmOutputSchema>;

export interface PackagingIntelligence {
  readonly videoId: string;
  readonly transcriptSummary: string;
  readonly promise: PackagingPromise;
  readonly first30sHookText: string;
  readonly first30sDeliversPromise: boolean;
  readonly first30sAssessment: string;
  readonly niche: PackagingLlmOutput['niche'];
  readonly priors: NichePriors;
  readonly transcriptSource: 'provided' | 'captions' | 'asr' | 'none';
  readonly modelUsed: string;
  readonly analyzedAt: string;
}

export interface AnalyzeVideoPackagingInput {
  readonly videoId: string;
  readonly title?: string;
  readonly description?: string;
  readonly thumbnailUrl?: string;
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

export interface NichePriors {
  readonly faceEffect: FaceEffect;
  readonly source: '1of10';
}

/** Default face-in-thumbnail priors from the 1of10 300k-video dataset. */
const FACE_EFFECT_BY_NICHE: Record<PackagingNiche, FaceEffect> = {
  entertainment: 'helps',
  education: 'neutral',
  gaming: 'hurts',
  tech: 'hurts',
  finance: 'neutral',
  lifestyle_vlog: 'helps',
  news_commentary: 'helps',
  music: 'neutral',
  fitness_health: 'helps',
  food_cooking: 'neutral',
  beauty_fashion: 'helps',
  sports: 'helps',
  diy_howto: 'hurts',
  science: 'neutral',
  travel: 'helps',
  business: 'helps',
  automotive: 'neutral',
  parenting: 'helps',
  other: 'neutral',
};

export const PACKAGING_NICHE_PRIORS = Object.fromEntries(
  packagingNicheSchema.options.map(niche => [
    niche,
    { faceEffect: FACE_EFFECT_BY_NICHE[niche], source: '1of10' as const },
  ])
) as Record<PackagingNiche, NichePriors>;

export function getNichePriors(niche: PackagingNiche): NichePriors {
  return PACKAGING_NICHE_PRIORS[niche];
}
