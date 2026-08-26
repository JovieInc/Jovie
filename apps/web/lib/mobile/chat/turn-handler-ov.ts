import 'server-only';

import { eq } from 'drizzle-orm';
import { canUseOvChatMode } from '@/lib/chat/ov-mode';
import {
  persistTerminalAssistantMessage,
  reserveChatTurn,
  TURN_IN_PROGRESS_ERROR_CODE,
} from '@/lib/chat/turns';
import { db } from '@/lib/db';
import { chatConversations } from '@/lib/db/schema/chat';
import {
  encodeMobileChatNdjsonEvent,
  MOBILE_CHAT_NDJSON_HEADERS,
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
import { isSummerTransportEnabled } from '@/lib/ovie/summer-transport';

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
    return ndjsonError(
      409,
      TURN_IN_PROGRESS_ERROR_CODE,
      'This chat action is still in progress.'
    );
  }

  if (reservation.outcome === 'duplicate_completed') {
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

  await tagOvConversationTitle(reservation.conversationId);

  const ovieStore = getOvieOperatingStore();
  if (isSummerTransportEnabled()) {
    bindCurrentSummerQueueSpeaker(ovieStore);
  }

  const { generation } = await prepareOvieChatTurn('ov', parsed.text, {
    store: ovieStore,
  });

  const completed = (text: string) =>
    ndjson([
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
        text,
      },
    ]);

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
    return completed(message);
  }

  const replyText =
    generation.text ||
    'Conversation with the current Summer is unavailable on this door.';
  assertModelMustNotSelfIdentifyAsOvie(replyText);
  await persistTerminalAssistantMessage({
    conversationId: reservation.conversationId,
    turnId: reservation.turn.id,
    status: 'completed',
    content: replyText,
  });
  return completed(replyText);
}
