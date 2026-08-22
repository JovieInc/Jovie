import { isSummerSafeTool } from '@/lib/ovie/isolation';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
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

const SUMMER_RESPONSE_TIMEOUT_MS = 45_000;

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
      try {
        await enqueueOvieSummerTurn(store, {
          id: turnId,
          conversationId,
          userText: input.userText,
          receipts: input.receipts,
        });
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
        yield { type: 'error', state: 'failure' };
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
