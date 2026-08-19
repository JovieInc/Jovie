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
import type { OvieReceipt, SpawnFn } from '@/lib/ovie/ingest';
import {
  getDefaultOperatingStore,
  type OperatingStore,
} from '@/lib/ovie/mcp/store';
import { applyOvieDumpBeforeModel } from '@/lib/ovie/persist';

export async function prepareOvieChatTurn(
  chatMode: 'ov' | null | undefined,
  userText: string | null,
  options?: { readonly spawn?: SpawnFn; readonly store?: OperatingStore }
): Promise<{
  readonly eveTurn: EveBoundTurn;
  readonly receipts: OvieReceipt[];
}> {
  const eveTurn = bindEveIdentityForChatMode(chatMode);
  assertEveChatFactoryLock(eveTurn);
  const receipts = eveTurn.pack.canIngestAck
    ? await applyOvieDumpBeforeModel(userText, {
        spawn: options?.spawn,
        store: options?.store ?? getDefaultOperatingStore(),
      })
    : [];
  return { eveTurn, receipts };
}
