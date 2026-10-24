import 'server-only';

import { and, desc, sql as drizzleSql, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { summerCardId, summerCardPayloadDigest } from './summer-card-digest';
import {
  effectiveSummerCardDeadline,
  SUMMER_CARD_DEFAULT_DECIDER,
  SUMMER_CARD_MAX_FEEDBACK,
  type SummerCard,
  type SummerCardInput,
  summerCardDecisionContract,
} from './summer-cards';

/**
 * Cards live in the durable Ovie operating KV (no new table): the key is
 * derived from the idempotency key, so the primary key settles replay races.
 */
const KEY_PREFIX = 'summer-card:';

const storedCardSchema = z.object({
  id: z.string(),
  idempotencyKey: z.string(),
  payloadDigest: z.string(),
  kind: z.enum(['outbound', 'spend', 'taste', 'decision']),
  product: z.enum(['jov', 'lyb', 'company']),
  title: z.string(),
  body: z.string(),
  recommendation: z.string(),
  defaultIfSilent: z.string().nullable(),
  recipient: z.string().nullable(),
  amountUsd: z.number().nullable(),
  preflightReceiptId: z.string().nullable().default(null),
  evidence: z.array(z.string()),
  status: z.enum(['pending', 'approved', 'rejected']),
  comment: z.string().nullable(),
  decidedBy: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  // Deadline contract fields; rows filed before it parse with legacy defaults.
  decideBy: z.string().nullable().default(null),
  defaultDecision: z.enum(['approve', 'reject', 'none']).default('reject'),
  resolution: z.enum(['founder', 'default']).nullable().default(null),
  feedback: z
    .array(z.object({ comment: z.string(), at: z.string() }))
    .default([]),
  feedbackAt: z.string().nullable().default(null),
});

type StoredCard = z.infer<typeof storedCardSchema>;

function toCard(stored: StoredCard): SummerCard {
  const { payloadDigest: _digest, decidedBy: _decidedBy, ...card } = stored;
  return {
    ...card,
    decideBy: effectiveSummerCardDeadline(stored),
    // Cards decided before the contract were decided by the founder.
    resolution:
      stored.resolution ?? (stored.status === 'pending' ? null : 'founder'),
  };
}

/** The parsed card plus the raw JSON the compare-and-set must match. */
async function readStoredRow(
  id: string
): Promise<{ readonly card: StoredCard; readonly raw: unknown } | null> {
  const [row] = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, `${KEY_PREFIX}${id}`))
    .limit(1);
  if (!row) return null;
  const parsed = storedCardSchema.safeParse(row.value);
  if (!parsed.success) {
    throw new Error(`Summer card ${id} is not a valid stored card`);
  }
  return { card: parsed.data, raw: row.value };
}

async function readStoredCard(id: string): Promise<StoredCard | null> {
  return (await readStoredRow(id))?.card ?? null;
}

/** Compare-and-set against the exact stored JSON; false when another write won. */
async function replaceStoredCard(
  id: string,
  raw: unknown,
  next: StoredCard,
  now: Date
): Promise<boolean> {
  const updated = await db
    .update(ovieOperatingKv)
    .set({ value: next, updatedAt: now })
    .where(
      and(
        eq(ovieOperatingKv.key, `${KEY_PREFIX}${id}`),
        eq(ovieOperatingKv.value, raw)
      )
    )
    .returning({ key: ovieOperatingKv.key });
  return updated.length === 1;
}

export async function getSummerCard(id: string): Promise<SummerCard | null> {
  const stored = await readStoredCard(id);
  return stored ? toCard(stored) : null;
}

export type SummerCardSubmission =
  | { readonly outcome: 'created'; readonly card: SummerCard }
  | { readonly outcome: 'replayed'; readonly card: SummerCard }
  | { readonly outcome: 'conflict' };

export async function submitSummerCard(
  input: SummerCardInput,
  now = new Date()
): Promise<SummerCardSubmission> {
  const id = summerCardId(input.idempotencyKey);
  const contract = summerCardDecisionContract(input, now);
  const stored: StoredCard = {
    id,
    idempotencyKey: input.idempotencyKey,
    payloadDigest: summerCardPayloadDigest(input),
    kind: input.kind,
    product: input.product,
    title: input.title,
    body: input.body,
    recommendation: input.recommendation,
    defaultIfSilent: input.defaultIfSilent,
    recipient: input.recipient,
    amountUsd: input.amountUsd,
    preflightReceiptId: input.preflightReceiptId,
    evidence: input.evidence,
    status: 'pending',
    comment: null,
    decidedBy: null,
    createdAt: now.toISOString(),
    decidedAt: null,
    decideBy: contract.decideBy,
    defaultDecision: contract.defaultDecision,
    resolution: null,
    feedback: [],
    feedbackAt: null,
  };
  const inserted = await db
    .insert(ovieOperatingKv)
    .values({ key: `${KEY_PREFIX}${id}`, value: stored, updatedAt: now })
    .onConflictDoNothing({ target: ovieOperatingKv.key })
    .returning({ key: ovieOperatingKv.key });
  if (inserted.length === 1)
    return { outcome: 'created', card: toCard(stored) };

  const existing = await readStoredCard(id);
  if (!existing) {
    throw new Error('Summer card insert conflicted without an existing row');
  }
  return existing.payloadDigest === stored.payloadDigest
    ? { outcome: 'replayed', card: toCard(existing) }
    : { outcome: 'conflict' };
}

export async function listSummerCards(options: {
  readonly status: 'pending' | 'decided' | 'all';
  readonly since?: string;
  readonly feedbackSince?: string;
  readonly limit: number;
}): Promise<SummerCard[]> {
  const status = drizzleSql`${ovieOperatingKv.value}->>'status'`;
  const createdAt = drizzleSql`${ovieOperatingKv.value}->>'createdAt'`;
  const feedbackAt = drizzleSql`${ovieOperatingKv.value}->>'feedbackAt'`;
  const rows = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(
      and(
        like(ovieOperatingKv.key, `${KEY_PREFIX}%`),
        options.status === 'pending'
          ? drizzleSql`${status} = 'pending'`
          : undefined,
        options.status === 'decided'
          ? drizzleSql`${status} <> 'pending'`
          : undefined,
        // createdAt is always toISOString(), so text order is time order.
        options.since
          ? drizzleSql`${createdAt} >= ${new Date(options.since).toISOString()}`
          : undefined,
        // feedbackAt is toISOString() too; NULL never matches.
        options.feedbackSince
          ? drizzleSql`${feedbackAt} >= ${new Date(options.feedbackSince).toISOString()}`
          : undefined
      )
    )
    .orderBy(desc(createdAt))
    .limit(options.limit);
  return rows.flatMap(row => {
    const parsed = storedCardSchema.safeParse(row.value);
    return parsed.success ? [toCard(parsed.data)] : [];
  });
}

export type SummerCardDecisionResult =
  | { readonly outcome: 'decided'; readonly card: SummerCard }
  | { readonly outcome: 'already_decided'; readonly card: SummerCard }
  | { readonly outcome: 'not_found' };

/** Decisions are final: a compare-and-set moves a pending card exactly once. */
export async function decideSummerCard(
  input: {
    readonly id: string;
    readonly decision: 'approve' | 'reject';
    readonly comment: string | null;
    readonly decidedBy: string | null;
    readonly resolution?: 'founder' | 'default';
  },
  now = new Date()
): Promise<SummerCardDecisionResult> {
  const current = await readStoredRow(input.id);
  if (!current) return { outcome: 'not_found' };
  if (current.card.status !== 'pending') {
    return { outcome: 'already_decided', card: toCard(current.card) };
  }

  const next: StoredCard = {
    ...current.card,
    status: input.decision === 'approve' ? 'approved' : 'rejected',
    comment: input.comment,
    decidedBy: input.decidedBy,
    decidedAt: now.toISOString(),
    resolution: input.resolution ?? 'founder',
  };
  if (await replaceStoredCard(input.id, current.raw, next, now)) {
    return { outcome: 'decided', card: toCard(next) };
  }

  const raced = await readStoredCard(input.id);
  return raced
    ? { outcome: 'already_decided', card: toCard(raced) }
    : { outcome: 'not_found' };
}

export type SummerCardDefaultsResult = {
  readonly checked: number;
  readonly defaulted: number;
  readonly approvedByDefault: number;
  readonly rejectedByDefault: number;
  readonly raced: number;
  readonly cardIds: readonly string[];
};

/**
 * Applies each overdue card's declared default. The founder still wins a race:
 * the same compare-and-set as a manual decision moves the card at most once.
 */
export async function applySummerCardDefaults(
  now = new Date(),
  limit = 100
): Promise<SummerCardDefaultsResult> {
  const pending = await listSummerCards({ status: 'pending', limit });
  // `none` cards never settle themselves; they escalate on Home instead.
  const due = pending.filter(
    (card): card is typeof card & { defaultDecision: 'approve' | 'reject' } =>
      card.defaultDecision !== 'none' &&
      Date.parse(card.decideBy) <= now.getTime()
  );
  let approvedByDefault = 0;
  let rejectedByDefault = 0;
  let raced = 0;
  const cardIds: string[] = [];
  for (const card of due) {
    const result = await decideSummerCard(
      {
        id: card.id,
        decision: card.defaultDecision,
        comment: `Decided by default at the ${card.decideBy} deadline: ${
          card.defaultIfSilent ?? 'no action is taken'
        }`,
        decidedBy: SUMMER_CARD_DEFAULT_DECIDER,
        resolution: 'default',
      },
      now
    );
    if (result.outcome !== 'decided') {
      raced += 1;
      continue;
    }
    cardIds.push(card.id);
    if (card.defaultDecision === 'approve') approvedByDefault += 1;
    else rejectedByDefault += 1;
  }
  return {
    checked: pending.length,
    defaulted: cardIds.length,
    approvedByDefault,
    rejectedByDefault,
    raced,
    cardIds,
  };
}

export type SummerCardFeedbackResult =
  | { readonly outcome: 'recorded'; readonly card: SummerCard }
  | { readonly outcome: 'pending'; readonly card: SummerCard }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'conflict' };

/**
 * Post-ship feedback hook: the founder can comment on any decided card,
 * including one settled by default. It never changes the decision; Summer
 * reads it (`feedbackSince`) and files the revision.
 */
export async function recordSummerCardFeedback(
  input: { readonly id: string; readonly comment: string },
  now = new Date()
): Promise<SummerCardFeedbackResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readStoredRow(input.id);
    if (!current) return { outcome: 'not_found' };
    if (current.card.status === 'pending') {
      return { outcome: 'pending', card: toCard(current.card) };
    }
    const at = now.toISOString();
    const next: StoredCard = {
      ...current.card,
      feedback: [
        ...current.card.feedback,
        { comment: input.comment, at },
      ].slice(-SUMMER_CARD_MAX_FEEDBACK),
      feedbackAt: at,
    };
    if (await replaceStoredCard(input.id, current.raw, next, now)) {
      return { outcome: 'recorded', card: toCard(next) };
    }
  }
  return { outcome: 'conflict' };
}
