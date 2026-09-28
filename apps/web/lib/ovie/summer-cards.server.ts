import 'server-only';

import { and, desc, sql as drizzleSql, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import {
  type SummerCard,
  type SummerCardInput,
  summerCardId,
  summerCardPayloadDigest,
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
  evidence: z.array(z.string()),
  status: z.enum(['pending', 'approved', 'rejected']),
  comment: z.string().nullable(),
  decidedBy: z.string().nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
});

type StoredCard = z.infer<typeof storedCardSchema>;

function toCard(stored: StoredCard): SummerCard {
  const { payloadDigest: _digest, decidedBy: _decidedBy, ...card } = stored;
  return card;
}

async function readStoredCard(id: string): Promise<StoredCard | null> {
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
  return parsed.data;
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
    evidence: input.evidence,
    status: 'pending',
    comment: null,
    decidedBy: null,
    createdAt: now.toISOString(),
    decidedAt: null,
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
  readonly limit: number;
}): Promise<SummerCard[]> {
  const status = drizzleSql`${ovieOperatingKv.value}->>'status'`;
  const createdAt = drizzleSql`${ovieOperatingKv.value}->>'createdAt'`;
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
  },
  now = new Date()
): Promise<SummerCardDecisionResult> {
  const current = await readStoredCard(input.id);
  if (!current) return { outcome: 'not_found' };
  if (current.status !== 'pending') {
    return { outcome: 'already_decided', card: toCard(current) };
  }

  const next: StoredCard = {
    ...current,
    status: input.decision === 'approve' ? 'approved' : 'rejected',
    comment: input.comment,
    decidedBy: input.decidedBy,
    decidedAt: now.toISOString(),
  };
  const updated = await db
    .update(ovieOperatingKv)
    .set({ value: next, updatedAt: now })
    .where(
      and(
        eq(ovieOperatingKv.key, `${KEY_PREFIX}${input.id}`),
        eq(ovieOperatingKv.value, current)
      )
    )
    .returning({ key: ovieOperatingKv.key });
  if (updated.length === 1) return { outcome: 'decided', card: toCard(next) };

  const raced = await readStoredCard(input.id);
  return raced
    ? { outcome: 'already_decided', card: toCard(raced) }
    : { outcome: 'not_found' };
}
