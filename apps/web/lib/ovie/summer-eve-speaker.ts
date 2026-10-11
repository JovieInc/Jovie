import { z } from 'zod';
import { ovieSummerTurnId } from '@/lib/ovie/summer-conversation';
import type { SummerFailureHop } from '@/lib/ovie/summer-failure';
import { resolveSummerEveCallerOrigin } from '@/lib/ovie/summer-production-pin';
import { CURRENT_SUMMER_SESSION_ID } from '@/lib/ovie/summer-session';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';
import {
  bindCurrentSummerSpeaker,
  type SummerSpeaker,
} from '@/lib/ovie/summer-transport';

const eveSessionIdSchema = z.string().regex(/^(?:ses_|wrun_)[A-Za-z0-9_-]+$/u);
const resultSchema = z.object({
  eventId: z.string(),
  conversationId: z.literal('summer-session-current'),
  principalHash: z.string(),
  deploymentId: z.string(),
  sessionId: eveSessionIdSchema,
  turnId: z.string(),
  responseText: z.string().max(64 * 1024),
  status: z.enum(['completed', 'failed']),
  nextStartIndex: z.number().int().nonnegative(),
  // Summer records the gateway model that ran the turn; the founder chat model is config.
  model: z.string().regex(/^[a-z0-9-]+\/[a-z0-9.-]+$/u),
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
const blockingEventSchema = z.object({
  eventId: z.string().regex(/^sum_[A-Za-z0-9_-]{24}$/u),
  deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/u),
});
const prefix = '/ovie/v1/summer-shadow/conversation/events';
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_MIGRATION_HISTORY_BYTES = 20 * 1024;
const MAX_MIGRATION_HISTORY_ENTRIES = 200;
const PENDING_RECOVERY_TEXT =
  'Summer is still reconciling this turn. Retry this message in a moment; the same turn is recovered rather than duplicated.';
const BLOCKING_RECOVERY_TEXT =
  'Summer is still finishing an earlier turn. This message was not sent; wait for that turn to finish, then retry.';

async function verifiedDeploymentId(
  response: Response,
  expected: string,
  refresh: () => Promise<string>
): Promise<string> {
  const observed = response.headers.get('x-jovie-eve-deployment-id');
  if (observed === expected) return expected;
  let live: string;
  try {
    live = await refresh();
  } catch {
    throw new Error('unverified_eve_deployment');
  }
  if (observed === live) return live;
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

/** Summer will never run these event ids (summer-config#119: abandoned dispatch). */
const PERMANENT_ADMISSION_REJECTIONS = new Set([
  'dispatch_abandoned',
  'event_conflict',
]);

/** Summer answered admission with something Jovie cannot trust. */
const ADMISSION_REJECTIONS = new Set([
  'oversized_summer_response',
  'invalid_summer_response',
  'summer_checkpoint_drift',
  'summer_blocking_result_drift',
]);

function failureHopFor(
  error: unknown,
  stage: 'admission' | 'result'
): SummerFailureHop {
  const code = error instanceof Error ? error.message : '';
  if (code === 'unverified_eve_deployment')
    return 'summer_deployment_unverified';
  if (stage === 'result') return 'summer_result_unverified';
  return ADMISSION_REJECTIONS.has(code) || error instanceof z.ZodError
    ? 'summer_admission_rejected'
    : 'summer_unreachable';
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
      let stage: 'admission' | 'result' = 'admission';
      try {
        if (!input.clientTurnId) throw new Error('client_turn_id_required');
        if (!input.principalHash) throw new Error('founder_principal_required');
        const target = await resolveSummerEveCallerOrigin();
        let deploymentId = target.deploymentId;
        const refreshDeploymentId = async () =>
          (await resolveSummerEveCallerOrigin({ refresh: true })).deploymentId;
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
          ...(input.canonicalTailRecovery
            ? { canonicalTailRecovery: true }
            : {}),
        });
        let response = await fetchShadow(prefix, {
          method: 'POST',
          signal: input.signal,
          body: rawBody,
        });
        deploymentId = await verifiedDeploymentId(
          response,
          deploymentId,
          refreshDeploymentId
        );
        let admission = await body(response);
        if (response.status === 409 && admission.code === 'conversation_busy') {
          const blocking = blockingEventSchema.safeParse(
            admission.blockingEvent
          );
          if (!blocking.success) {
            yield {
              type: 'notice',
              text: BLOCKING_RECOVERY_TEXT,
              code: 'summer_turn_pending',
            };
            yield { type: 'error', state: 'unknown', hop: 'summer_busy' };
            return;
          }
          const blockingResponse = await fetchShadow(
            `${prefix}/${blocking.data.eventId}/result`,
            {
              signal: input.signal,
              headers: {
                'x-jovie-summer-principal-hash': input.principalHash,
                'x-jovie-summer-deployment-id': blocking.data.deploymentId,
              },
            }
          );
          deploymentId = await verifiedDeploymentId(
            blockingResponse,
            deploymentId,
            refreshDeploymentId
          );
          const blockingTerminal = await body(blockingResponse);
          if (!blockingResponse.ok) {
            yield {
              type: 'notice',
              text: BLOCKING_RECOVERY_TEXT,
              code: 'summer_turn_pending',
            };
            yield { type: 'error', state: 'unknown', hop: 'summer_busy' };
            return;
          }
          const blockingResult = resultSchema.parse(blockingTerminal.result);
          if (
            blockingResult.eventId !== blocking.data.eventId ||
            blockingResult.principalHash !== input.principalHash ||
            blockingResult.deploymentId !== blocking.data.deploymentId
          )
            throw new Error('summer_blocking_result_drift');
          response = await fetchShadow(prefix, {
            method: 'POST',
            signal: input.signal,
            body: rawBody,
          });
          deploymentId = await verifiedDeploymentId(
            response,
            deploymentId,
            refreshDeploymentId
          );
          admission = await body(response);
        }
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
          yield {
            type: 'error',
            // This event id can never produce an answer; record it so Retry
            // sends a new turn instead of replaying a dead one.
            state: PERMANENT_ADMISSION_REJECTIONS.has(String(admission.code))
              ? 'failure'
              : 'unavailable',
            hop:
              admission.code === 'daily_turn_budget_exhausted'
                ? 'summer_budget_exhausted'
                : 'summer_admission_rejected',
          };
          return;
        }
        stage = 'result';
        const terminalPath = `${prefix}/${eventId}/result`;
        const terminalResponse = await fetchShadow(terminalPath, {
          signal: input.signal,
          headers: {
            'x-jovie-summer-principal-hash': input.principalHash,
            'x-jovie-summer-deployment-id': deploymentId,
          },
        });
        deploymentId = await verifiedDeploymentId(
          terminalResponse,
          deploymentId,
          refreshDeploymentId
        );
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
          const pending =
            terminal.code === 'turn_pending' ||
            terminal.code === 'accepted_turn_unavailable';
          yield {
            type: 'error',
            state: 'unknown',
            hop: pending ? 'summer_result_pending' : 'summer_result_unreadable',
          };
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
          yield { type: 'error', state: 'failure', hop: 'summer_turn_failed' };
          return;
        }
        yield { type: 'text-delta', text: result.responseText };
      } catch (error) {
        yield {
          type: 'error',
          state: 'unknown',
          hop: failureHopFor(error, stage),
        };
      }
    },
  };
}
export function bindEveSummerSpeaker(): SummerSpeaker {
  return bindCurrentSummerSpeaker(createEveSummerSpeaker());
}
