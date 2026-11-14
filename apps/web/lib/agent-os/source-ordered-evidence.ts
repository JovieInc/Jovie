import { z } from 'zod';
import { canonicalJson } from '@/lib/agent-distribution/hash';
import type { RecordBackend } from '@/lib/ovie/mcp/store';

export const SOURCE_ORDER_SCHEMA = 'jovie.source-order/v1';
const positiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const deliveryOrderSchema = z
  .object({
    schema: z.literal(SOURCE_ORDER_SCHEMA),
    sourceOrdinal: positiveInteger,
    runNumber: positiveInteger,
    runAttempt: positiveInteger,
  })
  .strict();
export type DeliveryOrder = z.infer<typeof deliveryOrderSchema>;
export type OrderedEvidencePacket = Record<string, unknown> & {
  headSha: string;
  deliveryOrder?: DeliveryOrder;
};
type Backend = Pick<RecordBackend, 'get' | 'setIfAbsent' | 'compareAndSet'>;
export type OrderedEvidenceResult = {
  accepted: boolean;
  reason:
    | 'stored'
    | 'duplicate'
    | 'stale'
    | 'conflict'
    | 'legacy-after-ordered';
  packet: OrderedEvidencePacket;
};
const ATTEMPTS = 5;
// The Postgres backend is durable and ignores TTL; matches certification custody.
const TTL_SECONDS = 315_576_000;

function packetValue(value: unknown): OrderedEvidencePacket {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('headSha' in value) ||
    typeof value.headSha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.headSha)
  )
    throw new Error('Invalid source-ordered evidence packet');
  if ('deliveryOrder' in value && value.deliveryOrder !== undefined)
    deliveryOrderSchema.parse(value.deliveryOrder);
  return value as OrderedEvidencePacket;
}

function decision(
  current: OrderedEvidencePacket,
  next: OrderedEvidencePacket
): OrderedEvidenceResult['reason'] {
  const before = current.deliveryOrder;
  const after = next.deliveryOrder;
  if (before && !after) return 'legacy-after-ordered';
  if (before && after) {
    if (
      current.headSha === next.headSha &&
      before.sourceOrdinal !== after.sourceOrdinal
    )
      return 'conflict';
    if (after.sourceOrdinal < before.sourceOrdinal) return 'stale';
    if (after.sourceOrdinal === before.sourceOrdinal) {
      if (current.headSha !== next.headSha) return 'conflict';
      if (after.runNumber < before.runNumber) return 'stale';
      if (after.runNumber === before.runNumber) {
        if (after.runAttempt < before.runAttempt) return 'stale';
        if (after.runAttempt === before.runAttempt)
          return canonicalJson(current) === canonicalJson(next)
            ? 'duplicate'
            : 'conflict';
      }
    }
  }
  return canonicalJson(current) === canonicalJson(next)
    ? 'duplicate'
    : 'stored';
}

/** One atomic hot-record write. Re-evaluate a lost race against its winner. */
export async function storeOrderedEvidence(input: {
  backend: Backend;
  key: string;
  packet: Record<string, unknown> & { headSha: string };
}): Promise<OrderedEvidenceResult> {
  const next = packetValue(input.packet);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const raw = await input.backend.get(input.key);
    if (raw === null || raw === undefined) {
      if (await input.backend.setIfAbsent(input.key, next, TTL_SECONDS))
        return { accepted: true, reason: 'stored', packet: next };
      continue;
    }
    const current = packetValue(raw);
    const reason = decision(current, next);
    if (reason !== 'stored')
      return { accepted: reason === 'duplicate', reason, packet: current };
    if (await input.backend.compareAndSet(input.key, raw, next, TTL_SECONDS))
      return { accepted: true, reason, packet: next };
  }
  throw new Error('Source-ordered evidence lost compare-and-set repeatedly');
}
