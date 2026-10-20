import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Summer ↔ Jovie contract v1: approval cards in the admin Ovie inbox. */

export const SUMMER_CARD_MAX_BODY_BYTES = 32 * 1024;

/**
 * Default-plus-deadline contract (canon/FLEET.md, EVENT 2026-10-20): no ask
 * waits on the founder forever. Every card carries a deadline; at the deadline
 * its declared default is recorded as the decision and Summer acts on it.
 */
export const SUMMER_CARD_DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const SUMMER_CARD_MAX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const SUMMER_CARD_DEFAULT_DECIDER = 'default-on-expiry';
export const SUMMER_CARD_MAX_FEEDBACK = 20;

export type SummerCardDefaultDecision = 'approve' | 'reject';

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
    preflightReceiptId: z
      .string()
      .regex(/^spf_[0-9a-f]{32}$/u)
      .nullable()
      .default(null),
    evidence: z
      .array(z.url({ protocol: /^https$/u }).max(2048))
      .max(16)
      .default([]),
    /** When the default applies. Omitted: 48 hours after filing; capped at 14 days. */
    decideBy: z
      .string()
      .datetime({ offset: true })
      .optional()
      .transform(value => (value ? new Date(value).toISOString() : null)),
    /** What the deadline records. Omitted: `reject`, so silence never acts. */
    defaultDecision: z
      .enum(['approve', 'reject'])
      .optional()
      .transform(value => value ?? null),
  })
  .strict()
  .refine(card => card.kind !== 'spend' || card.preflightReceiptId, {
    path: ['preflightReceiptId'],
    message: 'spend cards require a purchase-admission preflight receipt',
  })
  .refine(
    card =>
      card.defaultDecision !== 'approve' ||
      (card.kind !== 'spend' && card.kind !== 'outbound'),
    {
      path: ['defaultDecision'],
      message: 'spend and outbound cards never approve by default',
    }
  )
  .refine(card => card.defaultDecision === null || card.defaultIfSilent, {
    path: ['defaultIfSilent'],
    message: 'a declared default must say what happens if silent',
  });

export type SummerCardInput = z.infer<typeof summerCardInputSchema>;

export const summerCardDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export const summerCardFeedbackSchema = z
  .object({ comment: z.string().trim().min(1).max(2000) })
  .strict();

export const summerCardListQuerySchema = z.object({
  status: z.enum(['pending', 'decided', 'all']).default('pending'),
  since: z.string().datetime({ offset: true }).optional(),
  /** Cards with post-decision founder feedback recorded at or after this time. */
  feedbackSince: z.string().datetime({ offset: true }).optional(),
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
  readonly preflightReceiptId?: string | null;
  readonly evidence: readonly string[];
  readonly status: SummerCardStatus;
  readonly comment: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  /** Effective deadline: the stored one, or 48 hours after filing for legacy cards. */
  readonly decideBy: string;
  readonly defaultDecision: SummerCardDefaultDecision;
  /** Who settled it: the founder, or the default at the deadline. */
  readonly resolution: 'founder' | 'default' | null;
  readonly feedback: readonly SummerCardFeedback[];
  readonly feedbackAt: string | null;
};

export type SummerCardFeedback = {
  readonly comment: string;
  readonly at: string;
};

/**
 * The deadline and default a card is filed with. Kinds that spend or speak
 * outward default to `reject` unless told otherwise, and the input schema
 * forbids them from defaulting to `approve`.
 */
export function summerCardDecisionContract(
  input: Pick<SummerCardInput, 'decideBy' | 'defaultDecision'>,
  createdAt: Date
): { decideBy: string; defaultDecision: SummerCardDefaultDecision } {
  const filed = createdAt.getTime();
  const requested = input.decideBy
    ? Date.parse(input.decideBy)
    : filed + SUMMER_CARD_DEFAULT_WINDOW_MS;
  const bounded = Math.min(
    Math.max(requested, filed),
    filed + SUMMER_CARD_MAX_WINDOW_MS
  );
  return {
    decideBy: new Date(bounded).toISOString(),
    defaultDecision: input.defaultDecision ?? 'reject',
  };
}

/** Legacy cards filed before the contract get the default window from filing. */
export function effectiveSummerCardDeadline(card: {
  readonly decideBy: string | null;
  readonly createdAt: string;
}): string {
  return (
    card.decideBy ??
    new Date(
      Date.parse(card.createdAt) + SUMMER_CARD_DEFAULT_WINDOW_MS
    ).toISOString()
  );
}

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
    input.preflightReceiptId,
    input.evidence,
    // Appended only when declared, so cards filed before the deadline
    // contract keep their digest and still replay.
    ...(input.decideBy !== null || input.defaultDecision !== null
      ? [input.decideBy, input.defaultDecision]
      : []),
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}
