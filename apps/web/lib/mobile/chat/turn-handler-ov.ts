import 'server-only';

import { eq } from 'drizzle-orm';
import { canUseOvChatMode } from '@/lib/chat/ov-mode';
import {
  markChatTurnStreaming,
  persistTerminalAssistantMessage,
  reserveChatTurn,
  TURN_IN_PROGRESS_ERROR_CODE,
} from '@/lib/chat/turns';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import {
  encodeMobileChatNdjsonEvent,
  type MobileChatNdjsonEvent,
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
  getBoundSummerSpeaker,
  isSummerTransportEnabled,
  runOvieSummerTurn,
} from '@/lib/ovie/summer-transport';

function ndjsonResponse(events: readonly MobileChatNdjsonEvent[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(encodeMobileChatNdjsonEvent(event)));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

function errorNdjsonResponse(
  status: number,
  errorCode: string,
  message: string
): Response {
  return new Response(
    encodeMobileChatNdjsonEvent({ type: 'error', errorCode, message }),
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'Content-Type': 'application/x-ndjson; charset=utf-8',
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

/**
 * Admin-only Summer/ops chat. Must never call fetchMobileArtistContext or
 * executeChatTurn (artist Jovie generation).
 */
export async function handleMobileOvChatTurn(input: {
  readonly userId: string;
  readonly profileId: string;
  readonly parsed: ParsedMobileChatTurnRequest;
  readonly signal: AbortSignal;
}): Promise<Response> {
  const { userId, profileId, parsed, signal } = input;

  if (!(await canUseOvChatMode(userId))) {
    return errorNdjsonResponse(
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
      return errorNdjsonResponse(
        404,
        'CONVERSATION_NOT_FOUND',
        'Conversation not found.'
      );
    }
    if (!isOvConversationTitle(existing.conversation.title)) {
      return errorNdjsonResponse(
        400,
        'WORKSPACE_MISMATCH',
        'That conversation belongs to Jovie mode.'
      );
    }
  }

  const reservation = await reserveChatTurn({
    conversationId: parsed.conversationId ?? null,
    clientTurnId: parsed.clientTurnId,
    clientMessageId: parsed.clientMessageId,
    source: parsed.source,
    userMessage: parsed.text,
    userId,
    creatorProfileId: profileId,
  });

  if (reservation.outcome === 'duplicate_in_progress') {
    return errorNdjsonResponse(
      409,
      TURN_IN_PROGRESS_ERROR_CODE,
      'This chat action is still in progress.'
    );
  }

  if (reservation.outcome === 'duplicate_completed') {
    const assistantMessage = [...reservation.messages]
      .reverse()
      .find(message => message.role === 'assistant');
    return ndjsonResponse([
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

  await tagOvConversationTitle(reservation.conversationId);

  const ovieStore = getOvieOperatingStore();
  if (isSummerTransportEnabled()) {
    bindCurrentSummerQueueSpeaker(ovieStore);
  }

  const { generation } = await prepareOvieChatTurn('ov', parsed.text, {
    store: ovieStore,
  });

  if (generation.kind !== 'summer-transport') {
    const message =
      'Ovie chat cannot fall through to artist Jovie. Summer is the speaker.';
    await persistTerminalAssistantMessage({
      conversationId: reservation.conversationId,
      turnId: reservation.turn.id,
      status: 'failed_model_error',
      content: message,
      errorCode: 'OVIE_DOOR_ARTIST_FALLTHROUGH',
    });
    return ndjsonResponse([
      {
        type: 'assistant.completed',
        clientTurnId: parsed.clientTurnId,
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        text: message,
      },
    ]);
  }

  const speaker = getBoundSummerSpeaker();
  const summerLive =
    generation.session !== null &&
    generation.state === 'fresh' &&
    isSummerTransportEnabled() &&
    speaker !== null;

  if (!summerLive || !speaker) {
    const replyText = generation.text;
    assertModelMustNotSelfIdentifyAsOvie(replyText);
    await persistTerminalAssistantMessage({
      conversationId: reservation.conversationId,
      turnId: reservation.turn.id,
      status: 'completed',
      content: replyText,
    });
    return ndjsonResponse([
      {
        type: 'turn.reserved',
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        clientTurnId: parsed.clientTurnId,
      },
      {
        type: 'assistant.completed',
        clientTurnId: parsed.clientTurnId,
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        text: replyText,
      },
    ]);
  }

  await markChatTurnStreaming(reservation.turn.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: MobileChatNdjsonEvent) => {
        controller.enqueue(encoder.encode(encodeMobileChatNdjsonEvent(event)));
      };

      enqueue({
        type: 'turn.reserved',
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        clientTurnId: parsed.clientTurnId,
      });

      let fullText = '';
      try {
        for await (const event of runOvieSummerTurn({
          receipts: [],
          userText: parsed.text,
          speaker,
          store: ovieStore,
          signal,
          clientTurnId: parsed.clientTurnId,
        })) {
          if (event.type === 'text-delta' && event.text) {
            fullText += event.text;
            enqueue({
              type: 'assistant.delta',
              clientTurnId: parsed.clientTurnId,
              text: event.text,
            });
          }
        }

        const finalText =
          fullText.trim().length > 0
            ? fullText.trim()
            : generation.text ||
              'Conversation with the current Summer is unavailable on this door.';
        assertModelMustNotSelfIdentifyAsOvie(finalText);

        await persistTerminalAssistantMessage({
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          status: 'completed',
          content: finalText,
        });

        enqueue({
          type: 'assistant.completed',
          clientTurnId: parsed.clientTurnId,
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          text: finalText,
        });
      } catch {
        enqueue({
          type: 'error',
          errorCode: 'CHAT_STREAM_FAILED',
          message:
            'Summer hit a temporary issue while processing your message. Please retry.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}
