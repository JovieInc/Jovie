import { z } from 'zod';
import { DesignReferenceCorpusSchema, DesignReferenceSchema } from '../types';

const id = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._:-]+$/u)
  .refine(
    value => value !== 'prototype' && !Object.hasOwn(Object.prototype, value),
    'Reserved identifier.'
  );
export const ReferenceScopeSchema = z
  .object({
    tenantId: id,
    actorId: id,
    contextId: id,
    branchId: id,
  })
  .strict();
export type ReferenceScope = z.infer<typeof ReferenceScopeSchema>;
export const REFERENCE_BATCH_SIZE = 25;
/** Per-context limits: fail closed and retain the durable session at the cap. */
export const REFERENCE_LIMITS = {
  references: 500,
  intake: 100,
  commands: 5000,
  clusters: 50,
} as const;
/** Suggested labels in this context, never a global taxonomy. */
export const REFERENCE_CATEGORIES = [
  'editorial',
  'product shots',
  'landing sections',
  'video stills',
  'wardrobe',
  'model looks',
  'makeup',
  'sets',
  'locations',
] as const;

export function isReferenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hostname.includes(':') &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/u.test(
        url.hostname
      ) &&
      url.hostname.includes('.') &&
      !url.hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}
const sourceUrl = z.string().max(2048).refine(isReferenceUrl);
const previewUrl = z
  .string()
  .max(2048)
  .refine(
    value =>
      isReferenceUrl(value) ||
      /^\/api\/admin\/reference-review\/preview\?/u.test(value)
  );
export const MediaAnchorSchema = z
  .object({
    sourceUrl,
    originalUrl: sourceUrl,
    previewUrl: previewUrl.nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    capturedAt: z.string().datetime(),
    credit: z.string().trim().min(1).max(1200),
    kind: z.enum(['image', 'published-still', 'video-frame', 'page-section']),
    timecodeMs: z.number().int().nonnegative().nullable(),
    generated: z.literal(false),
    verification: z.enum(['verified', 'unverified', 'rejected']),
    rights: z
      .object({
        referenceOnly: z.literal(true),
        previewAllowed: z.boolean(),
        productionReuse: z.literal(false),
        publicRedistribution: z.literal(false),
        evidence: z.string().trim().min(1).max(2000),
      })
      .strict(),
    classification: z
      .object({
        category: z.enum(REFERENCE_CATEGORIES),
        substyles: z.array(z.string().trim().min(1).max(80)).max(12),
        model: z.string().min(1).max(120),
        version: z.number().int().positive(),
        inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict()
      .nullable(),
    clusterId: id.nullable(),
    previewSlot: z
      .number()
      .int()
      .min(0)
      .max(REFERENCE_LIMITS.references - 1)
      .nullable()
      .default(null),
  })
  .strict();
export type MediaAnchor = z.infer<typeof MediaAnchorSchema>;
export const ReferenceIntakeSchema = z
  .object({
    reference: DesignReferenceSchema.extend({ id }),
    media: MediaAnchorSchema,
  })
  .strict();
export const ReferenceActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('rate'),
      referenceId: id,
      rating: z.number().int().min(1).max(5),
    })
    .strict(),
  z.object({ type: z.literal('skip'), referenceId: id }).strict(),
  z.object({ type: z.literal('undo') }).strict(),
  z
    .object({
      type: z.literal('cluster'),
      referenceId: id,
      clusterId: id.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('create-cluster'),
      clusterId: id,
      label: z.string().trim().min(1).max(80),
    })
    .strict(),
]);
export type ReferenceAction = z.infer<typeof ReferenceActionSchema>;
export const ReferenceCommandSchema = z
  .object({
    commandId: id,
    revision: z.number().int().nonnegative(),
    action: ReferenceActionSchema,
  })
  .strict();
export type ReferenceCommand = z.infer<typeof ReferenceCommandSchema>;
const batchSchema = z
  .object({
    number: z.number().int().nonnegative(),
    ids: z.array(id).max(REFERENCE_BATCH_SIZE),
  })
  .strict();
export const ReferenceSessionSchema = z
  .object({
    schema: z.literal('jovie.adaptive-references/v1'),
    scope: ReferenceScopeSchema,
    revision: z.number().int().nonnegative(),
    corpus: DesignReferenceCorpusSchema,
    media: z.record(id, MediaAnchorSchema),
    ratings: z.record(z.string(), z.number().int().min(1).max(5)),
    skipped: z.array(id),
    clusters: z.record(z.string(), z.string().max(80)),
    batch: batchSchema,
    undo: z
      .object({
        referenceId: id,
        batch: batchSchema,
        kind: z.enum(['rate', 'skip']),
      })
      .strict()
      .nullable(),
    commands: z.record(z.string(), z.string()),
    feedback: z
      .array(
        z
          .object({
            commandId: id,
            action: ReferenceActionSchema,
            revision: z.number().int().positive(),
            recordedAt: z.string().datetime(),
          })
          .strict()
      )
      .max(REFERENCE_LIMITS.commands)
      .default([]),
  })
  .strict();
export type ReferenceSession = z.infer<typeof ReferenceSessionSchema>;

export interface ReferenceCard {
  readonly id: string;
  readonly title: string;
  readonly previewUrl: string;
  readonly sourceUrl: string;
  readonly credit: string;
  readonly width: number;
  readonly height: number;
  readonly category: string | null;
  readonly clusterId: string | null;
  readonly rating: number | null;
}
export interface ReferenceView {
  readonly boards: Readonly<Record<string, readonly ReferenceCard[]>>;
  readonly undoReferenceId: string | null;
  readonly revision: number;
  readonly batchNumber: number;
  readonly batchSize: number;
  readonly items: readonly ReferenceCard[];
  readonly top: readonly ReferenceCard[];
  readonly ratedCount: number;
  readonly remaining: number;
  readonly heldCount: number;
  readonly canUndo: boolean;
  readonly clusters: Readonly<Record<string, string>>;
}
