import { z } from 'zod';

export const DESIGN_TASTE_JURY_DISPOSITIONS = ['ship', 'taste'] as const;

export type DesignTasteJuryDisposition =
  (typeof DESIGN_TASTE_JURY_DISPOSITIONS)[number];

export const DESIGN_TASTE_JURY_CAPTURE_STYLES = [
  'raw',
  'device-mockup',
] as const;

export type DesignTasteJuryCaptureStyle =
  (typeof DESIGN_TASTE_JURY_CAPTURE_STYLES)[number];

export interface DesignTasteBenchmarkReference {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly rationale: string;
}

export interface DesignTasteSurfaceBenchmark {
  readonly surfaceId: string;
  readonly surfaceLabel: string;
  readonly category: 'metrics' | 'marketing' | 'product-ui' | 'gallery';
  readonly primaryReferences: readonly DesignTasteBenchmarkReference[];
  readonly galleryReferences: readonly DesignTasteBenchmarkReference[];
}

export interface DesignTasteCapturePlanEntry {
  readonly scenarioId: string;
  readonly reason: string;
  readonly captureStyle: DesignTasteJuryCaptureStyle;
}

export interface DesignTasteCapturePlan {
  readonly isNonUiPush: boolean;
  readonly capture: readonly DesignTasteCapturePlanEntry[];
  readonly skipped: readonly string[];
  readonly changedFiles: readonly string[];
}

export interface DesignTasteJurorFinding {
  readonly id: string;
  readonly summary: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly rank: number;
  readonly objective: boolean;
}

export interface DesignTasteJurorVerdict {
  readonly jurorId: string;
  readonly modelLabel: string;
  readonly findings: readonly DesignTasteJurorFinding[];
}

export interface DesignTasteConsensusFinding {
  readonly id: string;
  readonly summary: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly consensusRank: number;
  readonly voteCount: number;
  readonly jurorIds: readonly string[];
  readonly objective: boolean;
}

export interface DesignTasteJuryConsensus {
  readonly runId: string;
  readonly surfaceId: string;
  readonly computedAt: string;
  readonly findings: readonly DesignTasteConsensusFinding[];
}

export interface DesignTasteIssueFiling {
  readonly id: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly title: string;
  readonly body: string;
  readonly referenceComps: readonly DesignTasteBenchmarkReference[];
  readonly queue: 'visual-qa' | 'tim-taste';
}

export const DesignTasteJuryRunManifestSchema = z
  .object({
    runId: z.string().trim().min(1).max(80),
    gitSha: z.union([z.string().trim().min(1).max(64), z.null()]),
    computedAt: z.string().datetime(),
    capturePlan: z.object({
      isNonUiPush: z.boolean(),
      capture: z.array(
        z
          .object({
            scenarioId: z.string().trim().min(1),
            reason: z.string().trim().min(1),
            captureStyle: z.enum(DESIGN_TASTE_JURY_CAPTURE_STYLES),
          })
          .strict()
      ),
      skipped: z.array(z.string().trim().min(1)),
      changedFiles: z.array(z.string().trim().min(1)),
    }),
    consensus: z.array(
      z
        .object({
          runId: z.string().trim().min(1),
          surfaceId: z.string().trim().min(1),
          computedAt: z.string().datetime(),
          findings: z.array(
            z
              .object({
                id: z.string().trim().min(1),
                summary: z.string().trim().min(1),
                disposition: z.enum(DESIGN_TASTE_JURY_DISPOSITIONS),
                consensusRank: z.number().int().positive(),
                voteCount: z.number().int().positive(),
                jurorIds: z.array(z.string().trim().min(1)),
                objective: z.boolean(),
              })
              .strict()
          ),
        })
        .strict()
    ),
    issueFilings: z.array(
      z
        .object({
          id: z.string().trim().min(1),
          disposition: z.enum(DESIGN_TASTE_JURY_DISPOSITIONS),
          title: z.string().trim().min(1),
          body: z.string().trim().min(1),
          referenceComps: z.array(
            z
              .object({
                id: z.string().trim().min(1),
                label: z.string().trim().min(1),
                url: z.string().url(),
                rationale: z.string().trim().min(1),
              })
              .strict()
          ),
          queue: z.enum(['visual-qa', 'tim-taste']),
        })
        .strict()
    ),
  })
  .strict();

export type DesignTasteJuryRunManifest = z.infer<
  typeof DesignTasteJuryRunManifestSchema
>;
