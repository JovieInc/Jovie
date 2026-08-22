/**
 * Shipped Ovie/Jovie chat entry (JOV-5215/5216/5214).
 *
 * The chat route must call this — not classify-and-void. Identity packs are
 * bound here; factory gbrain-write / Symphony heal fail closed. OV door
 * turns ingest via Eve then transport to Summer; they must not generate
 * as artist Jovie.
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
import {
  type OvieDoorGeneration,
  type ResolveOvieDoorGenerationOptions,
  resolveOvieDoorGeneration,
} from '@/lib/ovie/summer-transport';

export async function prepareOvieChatTurn(
  chatMode: 'ov' | null | undefined,
  userText: string | null,
  options?: {
    readonly spawn?: SpawnFn;
    readonly store?: OperatingStore;
    readonly summer?: ResolveOvieDoorGenerationOptions;
  }
): Promise<{
  readonly eveTurn: EveBoundTurn;
  readonly receipts: OvieReceipt[];
  readonly generation: OvieDoorGeneration;
}> {
  const eveTurn = bindEveIdentityForChatMode(chatMode);
  assertEveChatFactoryLock(eveTurn);
  const store = options?.store ?? getDefaultOperatingStore();
  const receipts = eveTurn.pack.canIngestAck
    ? await applyOvieDumpBeforeModel(userText, {
        spawn: options?.spawn,
        store,
      })
    : [];
  return {
    eveTurn,
    receipts,
    generation: resolveOvieDoorGeneration(chatMode, receipts, options?.summer),
  };
}
