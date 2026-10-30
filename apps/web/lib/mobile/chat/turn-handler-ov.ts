import 'server-only';

import { eq } from 'drizzle-orm';
import { resolveChatAccountContext } from '@/lib/chat/account-context';
import { canUseOvChatMode } from '@/lib/chat/ov-mode';
import {
  markChatTurnStreaming,
  markChatTurnTerminal,
  persistTerminalAssistantMessageWithReceipt,
  reserveChatTurn,
  resumeStaleChatTurn,
  resumeTerminalChatTurn,
  type TerminalChatTurnStatus,
  TURN_IN_PROGRESS_ERROR_CODE,
} from '@/lib/chat/turns';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import {
  encodeMobileChatNdjsonEvent,
  MOBILE_CHAT_NDJSON_HEADERS,
  type MobileChatNdjsonEvent,
  type MobileChatTurnLifecycle,
  type ParsedMobileChatTurnRequest,
} from '@/lib/mobile/chat/contract';
import { getMobileConversationDetail } from '@/lib/mobile/chat/conversations';
import {
  isOvConversationTitle,
  withOvConversationTitle,
} from '@/lib/mobile/workspace';
import { prepareOvieChatTurn } from '@/lib/ovie/chat-entry';
import { getOvieOperatingStore } from '@/lib/ovie/mcp/runtime-store';
import { assertModelMustNotSelfIdentifyAsOvie } from '@/lib/ovie/program';
import { bindCurrentSummerQueueSpeaker } from '@/lib/ovie/summer-queue-speaker';
import {
  isSummerTransportEnabled,
  runOvieSummerTurn,
  type SummerSpeaker,
} from '@/lib/ovie/summer-transport';
import { checkAiChatRateLimitForPlan } from '@/lib/rate-limit';

type ReservedOvTurn = Extract<
  Awaited<ReturnType<typeof reserveChatTurn>>,
  { readonly outcome: 'reserved' }
>;

const RETRYABLE_SUMMER_ERROR_CODES = new Set([
  'SUMMER_ADMISSION_UNAVAILABLE',
  'SUMMER_TURN_CANCELED',
  'SUMMER_TEMPORARILY_UNAVAILABLE',
  'SUMMER_TRANSPORT_UNAVAILABLE',
]);
const STALE_OVIE_TURN_MS = 60_000;

function ndjson(
  events: readonly MobileChatNdjsonEvent[],
  status = 200
): Response {
  return new Response(events.map(encodeMobileChatNdjsonEvent).join(''), {
    status,
    headers: MOBILE_CHAT_NDJSON_HEADERS,
  });
}

function ndjsonError(
  status: number,
  errorCode: string,
  message: string
): Response {
  return ndjson([{ type: 'error', errorCode, message }], status);
}

function stateEvent(
  clientTurnId: string,
  state: MobileChatTurnLifecycle,
  eveWorkId?: string | null
): MobileChatNdjsonEvent {
  return { type: 'turn.state', clientTurnId, state, eveWorkId };
}

function isInFlightStatus(
  status: string
): status is 'reserved' | 'running' | 'streaming' {
  return (
    status === 'reserved' || status === 'running' || status === 'streaming'
  );
}

type FailStatus =
  | 'canceled'
  | 'failed_model_error'
  | 'failed_network'
  | 'failed_timeout'
  | 'failed_tool_unavailable';

async function persistFailure(input: {
  readonly turnId: string;
  readonly status: FailStatus;
  readonly errorCode: string;
  readonly message: string;
}) {
  const persisted = await markChatTurnTerminal({
    turnId: input.turnId,
    status: input.status,
    errorCode: input.errorCode,
    errorMessage: input.message,
  });
  return persisted
    ? input
    : {
        errorCode: 'SUMMER_DURABILITY_FAILED',
        message: 'Summer could not confirm the durable turn state.',
      };
}

function streamSummerTurn(input: {
  readonly reservation: ReservedOvTurn;
  readonly parsed: ParsedMobileChatTurnRequest;
  readonly receipts: Awaited<
    ReturnType<typeof prepareOvieChatTurn>
  >['receipts'];
  readonly speaker: SummerSpeaker;
  readonly store: ReturnType<typeof getOvieOperatingStore>;
  readonly signal: AbortSignal;
}): Response {
  const { reservation, parsed } = input;
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const enqueue = (event: MobileChatNdjsonEvent) => {
          if (!input.signal.aborted) {
            controller.enqueue(
              encoder.encode(encodeMobileChatNdjsonEvent(event))
            );
          }
        };
        enqueue({
          type: 'turn.reserved',
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          clientTurnId: parsed.clientTurnId,
        });
        enqueue(stateEvent(parsed.clientTurnId, 'queued'));
        let text = '';
        let tool = '';
        let terminal:
          | 'completed'
          | 'canceled'
          | 'failed_tool'
          | 'failure'
          | 'unavailable' = 'unavailable';
        let bound = false;
        let eveWorkId: string | null = null;
        const fail = async (
          status: Parameters<typeof persistFailure>[0]['status'],
          errorCode: string,
          message: string,
          state: 'failed' | 'canceled'
        ) => {
          const receipt = await persistFailure({
            turnId: reservation.turn.id,
            status,
            errorCode,
            message,
          });
          enqueue(stateEvent(parsed.clientTurnId, state, eveWorkId));
          enqueue({
            type: 'error',
            errorCode: receipt.errorCode,
            message: receipt.message,
          });
        };
        try {
          await markChatTurnStreaming(reservation.turn.id);
          for await (const event of runOvieSummerTurn({
            receipts: input.receipts,
            userText: parsed.text,
            speaker: input.speaker,
            store: input.store,
            signal: input.signal,
            clientTurnId: parsed.clientTurnId,
          })) {
            if (event.type === 'binding') {
              bound = true;
              eveWorkId = event.binding.eveWorkId;
              enqueue(stateEvent(parsed.clientTurnId, 'queued', eveWorkId));
            } else if (event.type === 'state') {
              if (event.state === 'streaming' || event.state === 'fresh') {
                enqueue(stateEvent(parsed.clientTurnId, 'running', eveWorkId));
              } else if (event.state === 'recovery') {
                enqueue(stateEvent(parsed.clientTurnId, 'retrying', eveWorkId));
              } else if (
                event.state === 'completed' ||
                event.state === 'canceled' ||
                event.state === 'failed_tool' ||
                event.state === 'failure' ||
                event.state === 'unavailable'
              ) {
                terminal = event.state;
              }
            } else if (event.type === 'text-delta' && bound) {
              // Buffer assistant text: it is only emitted after the durable
              // completion is persisted, so a disconnect or a rejected
              // speaker identity never leaks unconfirmed text.
              text += event.text;
            } else if (event.type === 'tool') {
              if (event.receipt.ok) tool = event.receipt.summary;
              else terminal = 'failed_tool';
            }
          }
          if (input.signal.aborted) terminal = 'canceled';
          if (!bound) {
            await fail(
              'failed_model_error',
              'SUMMER_EVE_RUN_MISSING',
              'Eve did not bind a durable run for this Summer turn. No fallback reply was generated.',
              'failed'
            );
            return;
          }
          const completedText = text.trim() || tool.trim();
          if (terminal === 'completed' && completedText) {
            assertModelMustNotSelfIdentifyAsOvie(completedText);
            const receipt = await persistTerminalAssistantMessageWithReceipt({
              conversationId: reservation.conversationId,
              turnId: reservation.turn.id,
              status: 'completed',
              content: completedText,
            });
            if (!receipt.persisted) {
              await fail(
                'failed_model_error',
                'SUMMER_DURABILITY_FAILED',
                'Summer replied, but the durable turn could not be confirmed. No completion was recorded.',
                'failed'
              );
              return;
            }
            enqueue({
              type: 'assistant.delta',
              clientTurnId: parsed.clientTurnId,
              text: completedText,
            });
            enqueue(stateEvent(parsed.clientTurnId, 'completed', eveWorkId));
            enqueue({
              type: 'assistant.completed',
              clientTurnId: parsed.clientTurnId,
              conversationId: reservation.conversationId,
              turnId: reservation.turn.id,
              text: completedText,
            });
            return;
          }
          if (terminal === 'canceled') {
            await fail(
              'canceled',
              'SUMMER_TURN_CANCELED',
              'Canceled.',
              'canceled'
            );
          } else if (terminal === 'failed_tool') {
            await fail(
              'failed_tool_unavailable',
              'SUMMER_TOOL_FAILED',
              'Tool failed.',
              'failed'
            );
          } else if (terminal === 'failure') {
            await fail(
              'failed_model_error',
              'SUMMER_TRANSPORT_FAILED',
              'Turn failed.',
              'failed'
            );
          } else if (terminal === 'completed') {
            await fail(
              'failed_model_error',
              'SUMMER_EMPTY_COMPLETION',
              'Empty reply.',
              'failed'
            );
          } else {
            await fail(
              'failed_timeout',
              'SUMMER_TRANSPORT_UNAVAILABLE',
              'Unavailable.',
              'failed'
            );
          }
        } catch {
          const aborted = input.signal.aborted;
          await fail(
            aborted ? 'canceled' : 'failed_network',
            aborted ? 'SUMMER_TURN_CANCELED' : 'SUMMER_TRANSPORT_FAILED',
            aborted
              ? 'Summer turn was canceled before completion.'
              : 'Summer is unavailable. No command was run.',
            aborted ? 'canceled' : 'failed'
          );
        } finally {
          try {
            controller.close();
          } catch {
            /* disconnect */
          }
        }
      },
    }),
    {
      status: 200,
      headers: {
        ...MOBILE_CHAT_NDJSON_HEADERS,
        'x-ovie-door': '1',
        'x-ovie-summer-speaker': 'summer',
      },
    }
  );
}

async function tagOvConversationTitle(conversationId: string): Promise<void> {
  const [conversation] = await db
    .select({ title: chatConversations.title })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conversation) return;
  const nextTitle = withOvConversationTitle(conversation.title);
  if (nextTitle === conversation.title) return;
  await db
    .update(chatConversations)
    .set({ title: nextTitle })
    .where(eq(chatConversations.id, conversationId));
}

/** Admin-only Summer/ops chat. Never calls fetchMobileArtistContext. */
export async function handleMobileOvChatTurn(input: {
  readonly userId: string;
  readonly profileId: string;
  readonly parsed: ParsedMobileChatTurnRequest;
  readonly signal: AbortSignal;
}): Promise<Response> {
  const { userId, profileId, parsed } = input;

  if (!(await canUseOvChatMode(userId))) {
    return ndjsonError(
      403,
      'OV_CHAT_FORBIDDEN',
      'Admin role required for Ovie chat.'
    );
  }

  if (parsed.conversationId) {
    const existing = await getMobileConversationDetail({
      conversationId: parsed.conversationId,
      creatorProfileId: profileId,
      limit: 1,
    });
    if (!existing) {
      return ndjsonError(
        404,
        'CONVERSATION_NOT_FOUND',
        'Conversation not found.'
      );
    }
    if (!isOvConversationTitle(existing.conversation.title)) {
      return ndjsonError(
        400,
        'WORKSPACE_MISMATCH',
        'That conversation belongs to Jovie mode.'
      );
    }
  }

  let reservation = await reserveChatTurn({
    conversationId: parsed.conversationId ?? null,
    clientTurnId: parsed.clientTurnId,
    clientMessageId: parsed.clientMessageId,
    source: parsed.source,
    userMessage: parsed.text,
    userId,
    creatorProfileId: profileId,
  });

  if (reservation.outcome === 'duplicate_in_progress') {
    const updatedAt = reservation.turn.updatedAt;
    const stale =
      updatedAt instanceof Date &&
      Date.now() - updatedAt.getTime() >= STALE_OVIE_TURN_MS &&
      isInFlightStatus(reservation.turn.status);
    if (stale) {
      const resumed = await resumeStaleChatTurn({
        turnId: reservation.turn.id,
        status: reservation.turn.status as 'reserved' | 'running' | 'streaming',
        updatedAt,
      });
      if (resumed === 'resumed') {
        reservation = {
          outcome: 'reserved',
          conversationId: reservation.conversationId,
          turn: {
            ...reservation.turn,
            status: 'reserved',
            errorCode: null,
            errorMessage: null,
          },
        };
      } else if (resumed === 'error') {
        return ndjsonError(
          503,
          'SUMMER_DURABILITY_FAILED',
          'Summer could not reclaim the durable turn. Retry after the service recovers.'
        );
      }
    }
    if (reservation.outcome === 'duplicate_in_progress') {
      return ndjsonError(
        409,
        TURN_IN_PROGRESS_ERROR_CODE,
        'This chat action is still in progress.'
      );
    }
  }

  if (reservation.outcome === 'duplicate_completed') {
    const errorCode = reservation.turn.errorCode;
    if (errorCode && RETRYABLE_SUMMER_ERROR_CODES.has(errorCode)) {
      const resumed = await resumeTerminalChatTurn({
        turnId: reservation.turn.id,
        status: reservation.turn.status as TerminalChatTurnStatus,
        errorCode,
        errorMessage: reservation.turn.errorMessage ?? '',
      });
      if (resumed === 'resumed') {
        reservation = {
          outcome: 'reserved',
          conversationId: reservation.conversationId,
          turn: {
            ...reservation.turn,
            status: 'reserved',
            errorCode: null,
            errorMessage: null,
          },
        };
      } else if (resumed === 'error') {
        return ndjsonError(
          503,
          'SUMMER_DURABILITY_FAILED',
          'Summer could not reclaim the durable turn. Retry after the service recovers.'
        );
      } else {
        return ndjsonError(
          409,
          TURN_IN_PROGRESS_ERROR_CODE,
          'This chat action is already being resumed.'
        );
      }
    } else if (reservation.turn.status !== 'completed') {
      return ndjsonError(
        200,
        errorCode ?? 'SUMMER_TURN_FAILED',
        reservation.turn.errorMessage ??
          'Summer could not complete this turn. Send a new message to retry.'
      );
    } else {
      const assistantMessage = [...reservation.messages]
        .reverse()
        .find(message => message.role === 'assistant');
      return ndjson([
        {
          type: 'assistant.completed',
          clientTurnId: parsed.clientTurnId,
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          text:
            assistantMessage?.content ??
            'This chat action already finished. Send a new message if you need anything else.',
        },
      ]);
    }
  }

  if (reservation.outcome !== 'reserved') {
    return ndjsonError(
      409,
      TURN_IN_PROGRESS_ERROR_CODE,
      'This chat action is still in progress.'
    );
  }

  const accountContext = await resolveChatAccountContext({ userId });
  const rateLimitResult = await checkAiChatRateLimitForPlan(
    userId,
    accountContext.plan
  );
  if (
    !rateLimitResult.success ||
    rateLimitResult.degraded ||
    rateLimitResult.unavailable
  ) {
    const admissionUnavailable =
      rateLimitResult.success &&
      (rateLimitResult.degraded === true ||
        rateLimitResult.unavailable === true);
    const receipt = await persistFailure({
      turnId: reservation.turn.id,
      status: 'failed_model_error',
      errorCode: admissionUnavailable
        ? 'SUMMER_ADMISSION_UNAVAILABLE'
        : 'RATE_LIMITED',
      message: admissionUnavailable
        ? 'Summer admission control is temporarily unavailable. Please try again later.'
        : (rateLimitResult.reason ??
          'Summer is temporarily rate limited. Please try again later.'),
    });
    return ndjson([
      {
        type: 'turn.reserved',
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        clientTurnId: parsed.clientTurnId,
      },
      { type: 'error', errorCode: receipt.errorCode, message: receipt.message },
    ]);
  }

  await tagOvConversationTitle(reservation.conversationId);

  const ovieStore = getOvieOperatingStore();
  const speaker = isSummerTransportEnabled()
    ? bindCurrentSummerQueueSpeaker(ovieStore)
    : null;
  const { generation, receipts } = await prepareOvieChatTurn(
    'ov',
    parsed.text,
    {
      store: ovieStore,
    }
  );

  if (
    generation.kind !== 'summer-transport' ||
    !speaker ||
    generation.state !== 'fresh'
  ) {
    const artist = generation.kind !== 'summer-transport';
    const receipt = await persistFailure({
      turnId: reservation.turn.id,
      status: artist ? 'failed_model_error' : 'failed_network',
      errorCode: artist
        ? 'OVIE_DOOR_ARTIST_FALLTHROUGH'
        : 'SUMMER_TRANSPORT_UNAVAILABLE',
      message: artist
        ? 'Ovie chat cannot fall through to artist Jovie. Summer is the speaker.'
        : 'Conversation with the current Summer is unavailable on this door.',
    });
    return ndjson([
      {
        type: 'turn.reserved',
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        clientTurnId: parsed.clientTurnId,
      },
      { type: 'error', errorCode: receipt.errorCode, message: receipt.message },
    ]);
  }

  return streamSummerTurn({
    reservation,
    parsed,
    receipts,
    speaker,
    store: ovieStore,
    signal: input.signal,
  });
}
