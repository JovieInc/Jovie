import { createHash } from 'node:crypto';
import type { SummerCardInput } from './summer-cards';

/**
 * Id and payload digests stay out of `summer-cards.ts`. HUD stories import
 * that module through the inbox client graph, and Vite externalizes
 * `node:crypto` for the browser.
 */

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
