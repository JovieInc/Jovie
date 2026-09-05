import { z } from 'zod';
import { ovieSummerTurnId } from '@/lib/ovie/summer-conversation';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';
import {
  bindCurrentSummerSpeaker,
  type SummerSpeaker,
} from '@/lib/ovie/summer-transport';

const resultSchema = z.object({
  eventId: z.string(),
  conversationId: z.literal('summer-session-current'),
  sessionId: z.string().regex(/^ses_/u),
  turnId: z.string(),
  responseText: z.string().max(64 * 1024),
  status: z.enum(['completed', 'failed']),
  nextStartIndex: z.number().int().nonnegative(),
  model: z.literal('zai/glm-5.3-flash'),
});
const prefix = '/ovie/v1/summer-shadow/conversation/events';
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_MIGRATION_HISTORY_BYTES = 20 * 1024;
const MAX_MIGRATION_HISTORY_ENTRIES = 200;

function boundedMigrationHistory(
  history: readonly { role: 'user' | 'assistant'; text: string }[]
) {
  const bounded = history.slice(-MAX_MIGRATION_HISTORY_ENTRIES);
  while (
    bounded.length > 0 &&
    new TextEncoder().encode(JSON.stringify(bounded)).byteLength >
      MAX_MIGRATION_HISTORY_BYTES
  ) {
    bounded.shift();
  }
  return bounded;
}

async function body(response: Response): Promise<Record<string, unknown>> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES)
    throw new Error('oversized_summer_response');
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('oversized_summer_response');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_summer_response');
  return value as Record<string, unknown>;
}

export function createEveSummerSpeaker(
  fetchShadow = fetchSummerShadow
): SummerSpeaker {
  return {
    id: 'summer',
    runtime: 'eve',
    async *speak(input) {
      const eventId = ovieSummerTurnId({
        conversationId: CURRENT_SUMMER_SESSION_ID,
        clientTurnId: input.clientTurnId ?? '',
      });
      try {
        if (!input.clientTurnId) throw new Error('client_turn_id_required');
        const response = await fetchShadow(prefix, {
          method: 'POST',
          signal: input.signal,
          body: JSON.stringify({
            eventId,
            conversationId: 'summer-session-current',
            previousEventId: input.previousEveEventId ?? null,
            message: input.userText,
            history: input.previousEveEventId
              ? []
              : boundedMigrationHistory(input.history),
          }),
        });
        const admission = await body(response);
        if (!response.ok) {
          if (
            admission.code === 'daily_turn_budget_exhausted' &&
            typeof admission.resetAt === 'string'
          ) {
            yield {
              type: 'notice',
              text: `Summer's daily conversation allowance is used up. It resets at ${admission.resetAt}.`,
              code: 'daily_turn_budget_exhausted',
            };
          }
          yield { type: 'error', state: 'unavailable' };
          return;
        }
        const terminalResponse = await fetchShadow(
          `${prefix}/${eventId}/result`,
          { signal: input.signal }
        );
        const terminal = await body(terminalResponse);
        if (!terminalResponse.ok) {
          yield { type: 'error', state: 'unknown' };
          return;
        }
        const result = resultSchema.parse(terminal.result);
        if (
          result.eventId !== eventId ||
          (input.previousEveSessionId &&
            result.sessionId !== input.previousEveSessionId)
        )
          throw new Error('summer_session_drift');
        yield {
          type: 'receipt',
          receipt: {
            eventId,
            sessionId: result.sessionId,
            turnId: result.turnId,
            nextStartIndex: result.nextStartIndex,
          },
        };
        if (result.status !== 'completed' || !result.responseText.trim()) {
          yield { type: 'error', state: 'failure' };
          return;
        }
        yield { type: 'text-delta', text: result.responseText };
      } catch {
        yield { type: 'error', state: 'unknown' };
      }
    },
  };
}
export function bindEveSummerSpeaker(): SummerSpeaker {
  return bindCurrentSummerSpeaker(createEveSummerSpeaker());
}
