import { isSummerSafeTool } from '@/lib/ovie/isolation';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import { buildShippingOpsCard } from '@/lib/ovie/ops-card';
import { getLastKnownShippingState } from '@/lib/ovie/shipping-state';
import {
  enqueueOvieSummerTurn,
  ovieSummerTurnId,
  waitForOvieSummerTurn,
} from '@/lib/ovie/summer-conversation';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';
import {
  bindCurrentSummerSpeaker,
  getBoundSummerSpeaker,
  type SummerSpeaker,
} from '@/lib/ovie/summer-transport';
import { buildProofBriefOpsCard } from '@/lib/proof-briefs/chat-card';
import { resolveLatestCertifiedProofBrief } from '@/lib/proof-briefs/resolve';

const SUMMER_RESPONSE_TIMEOUT_MS = 45_000;

/**
 * Operational read tools get a live card built from the authoritative
 * shipping-state projection so the founder chat renders editorial cards and
 * charts instead of a bare status row (JOV-6708). Only measured values are
 * emitted; a missing projection yields no card rather than invented data.
 */
function liveOpsCardData(toolName: string): unknown {
  // Deterministic fallback for the proof-brief dogfood path (JOV-7213): when
  // the worker did not attach a card payload, resolve the latest certified
  // investor brief so the chat still renders the editorial card.
  if (toolName === 'get_proof_brief') {
    const brief = resolveLatestCertifiedProofBrief('investor');
    return brief ? buildProofBriefOpsCard(brief) : undefined;
  }
  if (toolName !== 'inspect_kanban' && toolName !== 'get_org_state') {
    return undefined;
  }
  const projection = getLastKnownShippingState();
  return projection ? buildShippingOpsCard(projection) : undefined;
}

let boundStore: OperatingStore | null = null;
let queueSpeaker: SummerSpeaker | null = null;

export function createCurrentSummerQueueSpeaker(
  store: OperatingStore
): SummerSpeaker {
  return {
    id: 'summer',
    runtime: 'mac',
    async *speak(input) {
      const conversationId =
        input.conversationId?.trim() || CURRENT_SUMMER_SESSION_ID;
      const clientTurnId = input.clientTurnId?.trim() || 'turn-none';
      const turnId = ovieSummerTurnId({ conversationId, clientTurnId });
      let enqueued = false;
      try {
        await enqueueOvieSummerTurn(store, {
          id: turnId,
          conversationId,
          userText: input.userText,
          receipts: input.receipts,
        });
        enqueued = true;
        const terminal = await waitForOvieSummerTurn(store, {
          id: turnId,
          timeoutMs: SUMMER_RESPONSE_TIMEOUT_MS,
          signal: input.signal,
        });
        if (
          terminal?.state === 'completed' &&
          (terminal.responseText || terminal.tool)
        ) {
          if (terminal.responseText) {
            yield { type: 'text-delta', text: terminal.responseText };
          }
          if (terminal.tool && isSummerSafeTool(terminal.tool.name)) {
            yield {
              type: 'tool',
              tool: terminal.tool.name,
              ok: terminal.tool.ok,
              receiptId: terminal.tool.receiptId,
              summary: terminal.tool.summary,
              data: terminal.tool.data ?? liveOpsCardData(terminal.tool.name),
            };
          }
          return;
        }
        if (input.signal?.aborted) return;
        yield {
          type: 'error',
          state: terminal?.state === 'failed' ? 'failure' : 'unavailable',
        };
      } catch {
        let durableTurnExists = false;
        let durabilityWasChecked = false;
        try {
          durableTurnExists = Boolean(await store.getSummerTurn(turnId));
          durabilityWasChecked = true;
        } catch {
          // A failed read cannot prove the enqueue failed before persistence.
        }
        yield {
          type: 'error',
          state:
            enqueued || durableTurnExists || !durabilityWasChecked
              ? 'unknown'
              : 'failure',
        };
      }
    },
  };
}

export function bindCurrentSummerQueueSpeaker(
  store: OperatingStore
): SummerSpeaker {
  const existing = getBoundSummerSpeaker();
  if (existing) return existing;
  if (boundStore !== store || !queueSpeaker) {
    boundStore = store;
    queueSpeaker = createCurrentSummerQueueSpeaker(store);
  }
  return bindCurrentSummerSpeaker(queueSpeaker);
}
