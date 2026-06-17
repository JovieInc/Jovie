import { z } from 'zod';

export const DESIGN_TASTE_JURY_QUEUE_TAGS = ['ship', 'taste'] as const;

export type DesignTasteJuryQueueTag =
  (typeof DESIGN_TASTE_JURY_QUEUE_TAGS)[number];

export const DESIGN_TASTE_CAPTURE_MODES = ['raw', 'device-mockup'] as const;

export type DesignTasteCaptureMode =
  (typeof DESIGN_TASTE_CAPTURE_MODES)[number];

export const DESIGN_TASTE_SURFACE_CATEGORIES = [
  'marketing',
  'product-ui',
  'metrics',
  'public-profile',
] as const;

export type DesignTasteSurfaceCategory =
  (typeof DESIGN_TASTE_SURFACE_CATEGORIES)[number];

export interface DesignTasteBenchmarkReference {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly notes: string;
}

export interface DesignTasteSurfaceBenchmark {
  readonly surfaceId: string;
  readonly category: DesignTasteSurfaceCategory;
  readonly primary: DesignTasteBenchmarkReference;
  readonly secondary: readonly DesignTasteBenchmarkReference[];
  readonly galleryRefs: readonly DesignTasteBenchmarkReference[];
}

export interface DesignTasteChangeScope {
  readonly hasUiChanges: boolean;
  readonly skipReason: string | null;
  readonly changedFiles: readonly string[];
  readonly affectedCanonicalSurfaceIds: readonly string[];
  readonly affectedVisualQaSurfaceIds: readonly string[];
  readonly unchangedSurfaceIds: readonly string[];
}

export interface DesignTasteCaptureTarget {
  readonly surfaceId: string;
  readonly title: string;
  readonly captureMode: DesignTasteCaptureMode;
  readonly reviewRoute: string;
  readonly reason: string;
}

export interface DesignTasteCapturePlan {
  readonly runId: string;
  readonly createdAt: string;
  readonly skipped: boolean;
  readonly skipReason: string | null;
  readonly targets: readonly DesignTasteCaptureTarget[];
  readonly unchangedSurfaceIds: readonly string[];
}

export interface DesignTasteJurorVerdict {
  readonly jurorId: string;
  readonly modelRoute: string;
  readonly findingId: string;
  readonly surfaceId: string;
  readonly title: string;
  readonly summary: string;
  readonly queueTag: DesignTasteJuryQueueTag;
  readonly score: number;
  readonly benchmarkRefs: readonly string[];
  readonly compArtifactPath: string | null;
}

export interface DesignTasteConsensusFinding {
  readonly id: string;
  readonly rank: number;
  readonly surfaceId: string;
  readonly title: string;
  readonly summary: string;
  readonly queueTag: DesignTasteJuryQueueTag;
  readonly consensusScore: number;
  readonly jurorCount: number;
  readonly benchmarkRefs: readonly string[];
  readonly compArtifactPath: string | null;
}

export interface DesignTasteJuryResult {
  readonly runId: string;
  readonly computedAt: string;
  readonly verdicts: readonly DesignTasteJurorVerdict[];
  readonly consensus: readonly DesignTasteConsensusFinding[];
}

export interface DesignTasteIssueDraft {
  readonly queueTag: DesignTasteJuryQueueTag;
  readonly title: string;
  readonly description: string;
  readonly benchmarkRefs: readonly string[];
  readonly compArtifactPath: string | null;
  readonly surfaceId: string;
  readonly findingId: string;
}

export interface DesignTasteFiledIssue {
  readonly draft: DesignTasteIssueDraft;
  readonly filed: boolean;
  readonly identifier: string | null;
  readonly url: string | null;
  readonly error: string | null;
}

export interface DesignTasteJuryLoopResult {
  readonly runId: string;
  readonly completedAt: string;
  readonly changeScope: DesignTasteChangeScope;
  readonly capturePlan: DesignTasteCapturePlan;
  readonly jury: DesignTasteJuryResult | null;
  readonly filedIssues: readonly DesignTasteFiledIssue[];
  readonly tasteMemoryWritten: boolean;
  readonly gbrainWritten: boolean;
}

export const DesignTasteJurySignalSchema = z
  .object({
    surfaceId: z.string().trim().min(1),
    kind: z.enum([
      'pixel_drift',
      'breakpoint_failure',
      'layout_shift',
      'contrast_failure',
      'depth_opacity',
      'marketing_composition',
      'consumer_tone',
    ]),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    severity: z.number().min(0).max(1),
    compArtifactPath: z.union([z.string().trim().min(1), z.null()]).optional(),
  })
  .strict();

export type DesignTasteJurySignal = z.infer<typeof DesignTasteJurySignalSchema>;
