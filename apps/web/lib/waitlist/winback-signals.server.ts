import 'server-only';

/**
 * Win-back capability-signal reads (founder dispatch 2026-11-09): the
 * certified-capability ledger and the shipped-watermark. Read/written by the
 * dry run and the operator flow; nothing here sends anything.
 *
 * FEATURE_REGISTRY.md is the canonical shipped registry
 * (docs/FEATURE_REGISTRY.md); certified capability keys live as an
 * operator-maintained receipt in the Ovie operating ledger until the
 * customer-capability certification store exposes them.
 */

import { eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import {
  WINBACK_CERTIFIED_CAPABILITIES_KV_KEY,
  WINBACK_SHIPPED_WATERMARK_KV_KEY,
} from '@/lib/waitlist/winback';

// ---------------------------------------------------------------------------
// Certified-capability reads and the shipped watermark.
// ---------------------------------------------------------------------------

export async function readKvJson(
  tx: DbOrTransaction,
  key: string
): Promise<unknown | undefined> {
  const [row] = await tx
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, key))
    .limit(1);
  return row?.value;
}

/**
 * Certified capability keys live as an operator-maintained receipt (Ovie
 * ledger) until the customer-capability certification store exposes them.
 */
export async function getCertifiedCapabilityKeys(
  tx: DbOrTransaction
): Promise<string[]> {
  const value = await readKvJson(tx, WINBACK_CERTIFIED_CAPABILITIES_KV_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter(
    (key): key is string => typeof key === 'string' && key.length > 0
  );
}

export async function getWinbackShippedWatermark(
  tx: DbOrTransaction
): Promise<{ keys: string[]; checkedAt: string } | null> {
  const value = await readKvJson(tx, WINBACK_SHIPPED_WATERMARK_KV_KEY);
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { keys?: unknown }).keys)
  ) {
    return null;
  }
  const record = value as { keys: unknown[]; checkedAt?: unknown };
  return {
    keys: record.keys.filter((key): key is string => typeof key === 'string'),
    checkedAt: typeof record.checkedAt === 'string' ? record.checkedAt : '',
  };
}

export async function markWinbackShippedWatermark(
  tx: DbOrTransaction,
  keys: readonly string[],
  now: Date
): Promise<void> {
  const value = { keys: [...keys], checkedAt: now.toISOString() };
  await tx
    .insert(ovieOperatingKv)
    .values({
      key: WINBACK_SHIPPED_WATERMARK_KV_KEY,
      value,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ovieOperatingKv.key,
      set: { value, updatedAt: now },
    });
}
