import type { OperatingStore } from '@/lib/ovie/mcp/store';
import {
  enqueueOvieSummerTurn,
  ovieSummerTurnId,
  waitForOvieSummerTurn,
} from '@/lib/ovie/summer-conversation';
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
      const turnId = ovieSummerTurnId({
        conversationId: input.conversationId,
        clientTurnId: input.clientTurnId,
      });
      try {
        await enqueueOvieSummerTurn(store, {
          id: turnId,
          conversationId: input.conversationId,
          userText: input.userText,
        });
        const terminal = await waitForOvieSummerTurn(store, {
          id: turnId,
          timeoutMs: SUMMER_RESPONSE_TIMEOUT_MS,
          signal: input.signal,
        });
        if (input.signal?.aborted) return;
        if (terminal?.state === 'completed' && terminal.responseText) {
          yield { type: 'text-delta', text: terminal.responseText };
          return;
        }
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

/**
 * Production caller for the canonical #16338 binding. Reuses one queue speaker
 * for the singleton runtime store and never installs a competing fallback.
 */
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

export const OVIE_SUMMER_RESPONSE_TIMEOUT_MS = SUMMER_RESPONSE_TIMEOUT_MS;
