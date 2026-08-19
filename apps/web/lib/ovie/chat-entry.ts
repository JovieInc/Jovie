/**
 * Shipped Ovie/Jovie chat entry (JOV-5215/5216).
 *
 * The chat route must call this — not classify-and-void. Identity packs are
 * bound here; factory gbrain-write / Symphony heal fail closed.
 */

import {
  assertEveChatFactoryLock,
  bindEveIdentityForChatMode,
  type EveBoundTurn,
} from '@/lib/ovie/identity';
import {
  applyOvieDumpBeforeModel,
  type OvieReceipt,
  type SpawnFn,
} from '@/lib/ovie/ingest';

export function prepareOvieChatTurn(
  chatMode: 'ov' | null | undefined,
  userText: string | null,
  options?: { readonly spawn?: SpawnFn }
): { readonly eveTurn: EveBoundTurn; readonly receipts: OvieReceipt[] } {
  const eveTurn = bindEveIdentityForChatMode(chatMode);
  assertEveChatFactoryLock(eveTurn);
  const receipts = eveTurn.pack.canIngestAck
    ? applyOvieDumpBeforeModel(userText, options)
    : [];
  return { eveTurn, receipts };
}
