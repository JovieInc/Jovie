import { z } from 'zod';

export const MERCH_CONCEPT_CONTRACT = 'merch-concepts/v1';
export const MERCH_CONCEPT_CRITERIA = [
  'standaloneWearability',
  'distinctiveness',
  'artistFidelity',
  'compositionHierarchy',
  'taste',
  'productionFeasibility',
  'originality',
] as const;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const rightsKind = z.enum([
  'composition_lyrics_publisher',
  'master_cover_label',
  'photo_portrait_consent',
  'logo_font',
  'original_graphic',
]);

/** Only read from the existing tenant-bound immutable QA store, never tool input. */
export const merchConceptReviewSchema = z.object({
  phase: z.literal('pre_art'),
  contractVersion: z.literal(MERCH_CONCEPT_CONTRACT),
  planHash: hash,
  feedbackHash: hash,
  authority: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('human'),
      actorId: nonempty,
      approvalReceiptId: nonempty,
    }),
    z.object({
      kind: z.literal('calibrated_evaluator'),
      adapterId: nonempty,
      benchmarkReceiptHash: hash,
    }),
  ]),
  artistConsentReceiptId: nonempty,
  validUntil: timestamp,
  sourceSnapshot: z.object({
    sourceId: nonempty,
    receiptId: nonempty,
    digest: hash,
    snapshotHash: hash,
    observedAt: timestamp,
    rightsKinds: z.array(rightsKind).min(1),
  }),
  rights: z.array(
    z.object({
      sourceId: nonempty,
      sourceDigest: hash,
      kind: rightsKind,
      use: z.enum([
        'concept_render',
        'public_artifact_hosting',
        'commercial_merch',
      ]),
      status: z.enum(['cleared', 'unknown', 'disputed']),
      receiptId: nonempty,
      validUntil: timestamp,
    })
  ),
  candidates: z
    .array(
      z.object({
        key: nonempty,
        verdict: z.enum(['approve', 'reject', 'pending']),
        scores: z.record(
          z.enum(MERCH_CONCEPT_CRITERIA),
          z.number().int().min(0).max(4)
        ),
        reasons: z.array(nonempty).min(1),
      })
    )
    .min(1),
  lockedLayerHashes: z.array(hash),
  eventRecords: z.array(
    z.object({
      sourceId: nonempty,
      snapshotHash: hash,
      date: z.string().date(),
    })
  ),
});

export type MerchConceptReview = z.infer<typeof merchConceptReviewSchema>;

/** Concept approval and a model legal guess never certify the resulting artwork. */
export function getMerchConceptPublicationBlockers(
  qualityReview: Record<string, unknown> | null | undefined
): string[] {
  if (!qualityReview || !('conceptReview' in qualityReview)) return [];
  return [
    'This concept still needs rights and production-art approval for the exact artwork before it can be sold.',
  ];
}
