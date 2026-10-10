import { z } from 'zod';

export const DESIGN_REFERENCE_CORPUS_SCHEMA =
  'jovie.design-reference-corpus/v1';

export const DESIGN_REFERENCE_VARIABLES = [
  'hero',
  'navigation',
  'logo-bar',
  'feature-section',
  'spec-grid',
  'testimonial',
  'pricing',
  'faq',
  'cta',
  'footer',
  'product-media',
  'other',
] as const;

export type DesignReferenceVariable =
  (typeof DESIGN_REFERENCE_VARIABLES)[number];

export const DESIGN_REFERENCE_SOURCE_KINDS = [
  'expert-critique',
  'live-page',
  'launch',
  'founder-work',
] as const;

export type DesignReferenceSourceKind =
  (typeof DESIGN_REFERENCE_SOURCE_KINDS)[number];

export const FOUNDER_REFERENCE_DECISIONS = [
  'approved',
  'rejected',
  'nuanced',
] as const;

export type FounderReferenceDecision =
  (typeof FOUNDER_REFERENCE_DECISIONS)[number];

export const CANDIDATE_ENTRY_KINDS = ['invariant', 'preference'] as const;

/**
 * `invariant` entries are objective correctness claims; `preference` entries
 * are taste claims. The corpus keeps them separate so a taste opinion can
 * never masquerade as a correctness rule.
 */
export type CandidateEntryKind = (typeof CANDIDATE_ENTRY_KINDS)[number];

export const DesignReferenceSourceSchema = z
  .object({
    kind: z.enum(DESIGN_REFERENCE_SOURCE_KINDS),
    title: z.string().trim().min(1).max(500),
    url: z.union([z.string().url(), z.null()]),
    author: z.union([z.string().trim().min(1).max(200), z.null()]),
    publishedAt: z.union([z.string().datetime(), z.null()]),
    capturedAt: z.string().datetime(),
  })
  .strict();

export type DesignReferenceSource = z.infer<typeof DesignReferenceSourceSchema>;

export const DesignReferenceSectionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    designVariable: z.enum(DESIGN_REFERENCE_VARIABLES),
    pageType: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(2000),
    excerpt: z.union([z.string().trim().max(8000), z.null()]),
    mediaRef: z.union([z.string().trim().min(1).max(500), z.null()]),
  })
  .strict();

export type DesignReferenceSection = z.infer<
  typeof DesignReferenceSectionSchema
>;

const Tag = z.string().trim().min(1).max(60);

/**
 * Retrieval tags (JOV-7081). `surfaces` names the Jovie surfaces a reference
 * informs (homepage, golden-path, profile, app-shell, ...), which can differ
 * from the page the reference was captured from.
 */
export const DesignReferenceTagsSchema = z
  .object({
    surfaces: z.array(Tag).max(12),
    mood: z.array(Tag).max(12),
    technique: z.array(Tag).max(12),
    palette: z.array(Tag).max(12),
    motion: z.array(Tag).max(12),
  })
  .strict();

export type DesignReferenceTags = z.infer<typeof DesignReferenceTagsSchema>;

const PerceptualHash = z.string().regex(/^[0-9a-f]{64}$/u);

/**
 * The captured pixels live outside git (third-party material is inspiration,
 * never a shipped asset); the corpus keeps the content digest and the
 * perceptual hashes the anti-copy guard compares against.
 */
export const DesignReferenceMediaSchema = z
  .object({
    file: z.string().trim().min(1).max(200),
    sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    /** 256-bit dHash of the whole capture. */
    dhash: PerceptualHash,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    capturedVia: z.enum(['playwright', 'image-fetch', 'file']),
  })
  .strict();

export type DesignReferenceMedia = z.infer<typeof DesignReferenceMediaSchema>;

export const DesignReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    source: DesignReferenceSourceSchema,
    pageType: z.string().trim().min(1).max(80),
    sections: z.array(DesignReferenceSectionSchema).min(1),
    notes: z.union([z.string().trim().max(4000), z.null()]),
    ingestedAt: z.string().datetime(),
    tags: DesignReferenceTagsSchema.optional(),
    media: DesignReferenceMediaSchema.optional(),
  })
  .strict();

export type DesignReference = z.infer<typeof DesignReferenceSchema>;

export const FounderDecisionRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    decision: z.enum(FOUNDER_REFERENCE_DECISIONS),
    reviewer: z.string().trim().min(1).max(160),
    rationale: z.string().trim().min(1).max(8000),
    nuance: z.union([z.string().trim().min(1).max(4000), z.null()]),
    decidedAt: z.string().datetime(),
  })
  .strict();

export type FounderDecisionRecord = z.infer<typeof FounderDecisionRecordSchema>;

/**
 * Free-form founder critique captured during a rapid (voice) review pass.
 * Retains the original rationale; structuring is additive, never replacing it.
 */
export const FounderCritiqueSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    referenceId: z.string().trim().min(1).max(120),
    sectionId: z.union([z.string().trim().min(1).max(120), z.null()]),
    critique: z.string().trim().min(1).max(8000),
    verdict: z.enum(FOUNDER_REFERENCE_DECISIONS),
    comparedAgainstId: z.union([z.string().trim().min(1).max(120), z.null()]),
    reviewer: z.string().trim().min(1).max(160),
    recordedAt: z.string().datetime(),
  })
  .strict();

export type FounderCritique = z.infer<typeof FounderCritiqueSchema>;

export const CorpusEntryStatuses = [
  'proposed',
  'certified',
  'rejected',
  'decertified',
] as const;

export type CorpusEntryStatus = (typeof CorpusEntryStatuses)[number];

export const CorpusCandidateEntrySchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    kind: z.enum(CANDIDATE_ENTRY_KINDS),
    statement: z.string().trim().min(1).max(4000),
    designVariable: z.union([z.enum(DESIGN_REFERENCE_VARIABLES), z.null()]),
    pageType: z.union([z.string().trim().min(1).max(80), z.null()]),
    derivedFrom: z
      .array(
        z
          .object({
            referenceId: z.string().trim().min(1).max(120),
            sectionId: z.union([z.string().trim().min(1).max(120), z.null()]),
            evidence: z.string().trim().min(1).max(2000),
          })
          .strict()
      )
      .min(1),
    status: z.enum(CorpusEntryStatuses),
    founderDecision: z.union([FounderDecisionRecordSchema, z.null()]),
    proposedAt: z.string().datetime(),
    certifiedAt: z.union([z.string().datetime(), z.null()]),
  })
  .strict();

export type CorpusCandidateEntry = z.infer<typeof CorpusCandidateEntrySchema>;

export const CorpusReferenceRecordSchema = z
  .object({
    reference: DesignReferenceSchema,
    status: z.enum(CorpusEntryStatuses),
    founderDecision: z.union([FounderDecisionRecordSchema, z.null()]),
    certifiedAt: z.union([z.string().datetime(), z.null()]),
  })
  .strict();

export type CorpusReferenceRecord = z.infer<typeof CorpusReferenceRecordSchema>;

export const DesignReferenceCorpusSchema = z
  .object({
    schema: z.literal(DESIGN_REFERENCE_CORPUS_SCHEMA),
    references: z.record(z.string(), CorpusReferenceRecordSchema),
    candidates: z.record(z.string(), CorpusCandidateEntrySchema),
    critiques: z.array(FounderCritiqueSchema),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type DesignReferenceCorpus = z.infer<typeof DesignReferenceCorpusSchema>;
