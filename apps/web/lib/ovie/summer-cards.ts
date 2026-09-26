import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Summer ↔ Jovie contract v1: approval cards in the admin Ovie inbox. */

export const SUMMER_CARD_MAX_BODY_BYTES = 32 * 1024;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform(value => (value ? value : null));

export const summerCardInputSchema = z
  .object({
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
    kind: z.enum(['outbound', 'spend', 'taste', 'decision']),
    product: z.enum(['jov', 'lyb', 'company']),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4000),
    recommendation: z.string().trim().min(1).max(500),
    defaultIfSilent: optionalText(300),
    recipient: optionalText(200),
    amountUsd: z
      .number()
      .nonnegative()
      .max(1_000_000_000)
      .optional()
      .transform(value => value ?? null),
    evidence: z
      .array(z.url({ protocol: /^https$/u }).max(2048))
      .max(16)
      .default([]),
  })
  .strict();

export type SummerCardInput = z.infer<typeof summerCardInputSchema>;

export const summerCardDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export const summerCardListQuerySchema = z.object({
  status: z.enum(['pending', 'decided', 'all']).default('pending'),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SummerCardStatus = 'pending' | 'approved' | 'rejected';

export type SummerCard = {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly kind: SummerCardInput['kind'];
  readonly product: SummerCardInput['product'];
  readonly title: string;
  readonly body: string;
  readonly recommendation: string;
  readonly defaultIfSilent: string | null;
  readonly recipient: string | null;
  readonly amountUsd: number | null;
  readonly evidence: readonly string[];
  readonly status: SummerCardStatus;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
};

export const SUMMER_CARD_ID_PATTERN = /^sc_[0-9a-f]{32}$/u;

/** One id per idempotency key, so the key's uniqueness is the row's primary key. */
export function summerCardId(idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(`summer-card:${idempotencyKey}`)
    .digest('hex');
  return `sc_${digest.slice(0, 32)}`;
}

/** Stable digest of everything but the key; same key + other digest is a conflict. */
export function summerCardPayloadDigest(input: SummerCardInput): string {
  const canonical = JSON.stringify([
    input.kind,
    input.product,
    input.title,
    input.body,
    input.recommendation,
    input.defaultIfSilent,
    input.recipient,
    input.amountUsd,
    input.evidence,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
