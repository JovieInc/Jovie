import { z } from 'zod';
import { env } from '@/lib/env-server';
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
  principalHash: z.string(),
  deploymentId: z.string(),
  sessionId: z.string().regex(/^ses_/u),
  turnId: z.string(),
  responseText: z.string().max(64 * 1024),
  status: z.enum(['completed', 'failed']),
  nextStartIndex: z.number().int().nonnegative(),
  model: z.literal('zai/glm-5.3-flash'),
});
const budgetCheckpointSchema = z.object({
  eventId: z.string(),
  conversationId: z.literal('summer-session-current'),
  principalHash: z.string(),
  deploymentId: z.string(),
  sessionId: z.string().nullable(),
  nextStartIndex: z.number().int().nonnegative(),
  status: z.literal('rejected_budget'),
});
const prefix = '/ovie/v1/summer-shadow/conversation/events';
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_MIGRATION_HISTORY_BYTES = 20 * 1024;
const MAX_MIGRATION_HISTORY_ENTRIES = 200;
const PENDING_RECOVERY_TEXT =
  'Summer is still reconciling this turn. Your message will not be sent again; reopen this conversation to check for the exact Eve result.';

function assertExpectedEveDeployment(response: Response): void {
  const expected = env.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID?.trim();
  if (
    !expected ||
    response.headers.get('x-jovie-eve-deployment-id') !== expected
  )
    throw new Error('unverified_eve_deployment');
}

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
        if (!input.principalHash) throw new Error('founder_principal_required');
        const deploymentId = env.OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID?.trim();
        if (!deploymentId) throw new Error('exact_eve_deployment_required');
        const rawBody = JSON.stringify({
          eventId,
          conversationId: 'summer-session-current',
          previousEventId: input.previousEveEventId ?? null,
          principalHash: input.principalHash,
          deploymentId,
          message: input.userText,
          history: input.previousEveEventId
            ? []
            : boundedMigrationHistory(input.history),
        });
        const response = await fetchShadow(prefix, {
          method: 'POST',
          signal: input.signal,
          body: rawBody,
        });
        assertExpectedEveDeployment(response);
        const admission = await body(response);
        const recoverableAdmission =
          admission.code === 'dispatch_unknown' ||
          admission.code === 'conversation_persistence_or_dispatch_unknown';
        if (!response.ok && !recoverableAdmission) {
          if (
            admission.code === 'daily_turn_budget_exhausted' &&
            typeof admission.resetAt === 'string'
          ) {
            const checkpoint = budgetCheckpointSchema.parse(
              admission.checkpoint
            );
            if (
              checkpoint.eventId !== eventId ||
              checkpoint.principalHash !== input.principalHash ||
              checkpoint.deploymentId !== deploymentId
            )
              throw new Error('summer_checkpoint_drift');
            yield { type: 'checkpoint', checkpoint };
            yield {
              type: 'notice',
              text: `Summer's daily conversation allowance is used up. It resets at ${admission.resetAt}.`,
              code: 'daily_turn_budget_exhausted',
            };
          }
          yield { type: 'error', state: 'unavailable' };
          return;
        }
        const terminalPath = `${prefix}/${eventId}/result`;
        const terminalResponse = await fetchShadow(terminalPath, {
          signal: input.signal,
          headers: {
            'x-jovie-summer-principal-hash': input.principalHash,
            'x-jovie-summer-deployment-id': deploymentId,
          },
        });
        assertExpectedEveDeployment(terminalResponse);
        const terminal = await body(terminalResponse);
        if (!terminalResponse.ok) {
          if (
            terminal.code === 'turn_pending' ||
            terminal.code === 'accepted_turn_unavailable'
          ) {
            yield {
              type: 'notice',
              text: PENDING_RECOVERY_TEXT,
              code: 'summer_turn_pending',
            };
          }
          yield { type: 'error', state: 'unknown' };
          return;
        }
        const result = resultSchema.parse(terminal.result);
        if (
          result.eventId !== eventId ||
          result.principalHash !== input.principalHash ||
          result.deploymentId !== deploymentId ||
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
