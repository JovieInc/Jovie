import 'server-only';

import { randomUUID } from 'node:crypto';
import type { UIMessage } from 'ai';
import { getSessionContext } from '@/lib/auth/session';
import { resolveChatAccountContext } from '@/lib/chat/account-context';
import { fetchReleasesForChat } from '@/lib/chat/releases';
import { executeChatTurn } from '@/lib/chat/run';
import {
  decodeToolEvents,
  resolvePersistedToolEventsForDisplay,
} from '@/lib/chat/tool-events';
import {
  markChatTurnStreaming,
  persistTerminalAssistantMessage,
  reserveChatTurn,
  TURN_IN_PROGRESS_ERROR_CODE,
} from '@/lib/chat/turns';
import {
  classifyIntent,
  isDeterministicIntent,
  routeIntent,
} from '@/lib/intent-detection';
import { fetchMobileArtistContext } from '@/lib/mobile/chat/artist-context';
import {
  buildMobileChatHandoffUrl,
  encodeMobileChatNdjsonEvent,
  MOBILE_CHAT_PROFILE_REQUIRED_CODE,
  type MobileChatNdjsonEvent,
  type ParsedMobileChatTurnRequest,
} from '@/lib/mobile/chat/contract';
import { getMobileConversationDetail } from '@/lib/mobile/chat/conversations';
import { checkAiChatRateLimitForPlan } from '@/lib/rate-limit';

function buildUiMessagesFromHistory(
  history: readonly { role: string; content: string }[],
  userText: string
): UIMessage[] {
  const prior = history
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-12)
    .map(
      (message, index): UIMessage => ({
        id: `history-${index}`,
        role: message.role as 'user' | 'assistant',
        parts: [{ type: 'text', text: message.content }],
      })
    );

  return [
    ...prior,
    {
      id: 'mobile-user-turn',
      role: 'user',
      parts: [{ type: 'text', text: userText }],
    },
  ];
}

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

export async function handleMobileChatTurn(
  userId: string,
  parsed: ParsedMobileChatTurnRequest,
  signal: AbortSignal
): Promise<Response> {
  const session = await getSessionContext({
    clerkUserId: userId,
    requireUser: true,
    requireProfile: true,
  });

  if (!session.profile) {
    return errorNdjsonResponse(
      404,
      MOBILE_CHAT_PROFILE_REQUIRED_CODE,
      'Complete onboarding on the web before using native chat.'
    );
  }

  const profileId = session.profile.id;
  const reservation = await reserveChatTurn({
    conversationId: parsed.conversationId ?? null,
    clientTurnId: parsed.clientTurnId,
    clientMessageId: parsed.clientMessageId,
    source: parsed.source,
    userMessage: parsed.text,
    userId: session.user.id,
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
    const resolvedToolCalls = resolvePersistedToolEventsForDisplay(
      decodeToolEvents(assistantMessage?.toolCalls).events,
      {
        messageCreatedAt: assistantMessage?.createdAt,
        turnStatus: reservation.turn.status,
      }
    );

    if (resolvedToolCalls.length > 0) {
      return ndjsonResponse([
        {
          type: 'web.handoff',
          clientTurnId: parsed.clientTurnId,
          conversationId: reservation.conversationId,
          url: buildMobileChatHandoffUrl(reservation.conversationId),
          summary:
            'This action needs the full web chat experience. Open it on the web to continue.',
        },
      ]);
    }

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

  const accountContext = await resolveChatAccountContext({ userId });
  const rateLimitResult = await checkAiChatRateLimitForPlan(
    userId,
    accountContext.plan
  );

  if (!rateLimitResult.success) {
    const rateLimitMessage =
      accountContext.billingVerification === 'unavailable'
        ? 'Jovie could not verify your billing status right now, so chat usage is temporarily limited.'
        : (rateLimitResult.reason ??
          'You have reached your chat limit. Please try again later.');

    await persistTerminalAssistantMessage({
      conversationId: reservation.conversationId,
      turnId: reservation.turn.id,
      status: 'failed_model_error',
      content: rateLimitMessage,
      errorCode: 'RATE_LIMITED',
      errorMessage: rateLimitResult.reason,
    });

    return ndjsonResponse([
      {
        type: 'assistant.completed',
        clientTurnId: parsed.clientTurnId,
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        text: rateLimitMessage,
      },
    ]);
  }

  const intent = classifyIntent(parsed.text);
  if (isDeterministicIntent(intent)) {
    const routed = await routeIntent(intent, {
      clerkUserId: userId,
      profileId,
    });

    if (routed?.clientAction) {
      return ndjsonResponse([
        {
          type: 'web.handoff',
          clientTurnId: parsed.clientTurnId,
          conversationId: reservation.conversationId,
          url: buildMobileChatHandoffUrl(reservation.conversationId),
          summary:
            routed.message ||
            'Continue this action in the full web chat experience.',
        },
      ]);
    }

    if (routed?.message) {
      await persistTerminalAssistantMessage({
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        status: 'completed',
        content: routed.message,
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
          text: routed.message,
        },
      ]);
    }
  }

  const artistContext = await fetchMobileArtistContext({
    profileId,
    clerkUserId: userId,
  });

  if (!artistContext) {
    const message =
      'Jovie could not load your artist context for this request. Refresh and try again.';
    await persistTerminalAssistantMessage({
      conversationId: reservation.conversationId,
      turnId: reservation.turn.id,
      status: 'failed_model_error',
      content: message,
      errorCode: 'ARTIST_CONTEXT_UNAVAILABLE',
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

  const conversationDetail = await getMobileConversationDetail({
    conversationId: reservation.conversationId,
    creatorProfileId: profileId,
    limit: 12,
  });

  const history =
    conversationDetail?.messages
      .filter(message => message.id !== parsed.clientMessageId)
      .map(message => ({
        role: message.role,
        content: message.content,
      })) ?? [];

  const uiMessages = buildUiMessagesFromHistory(history, parsed.text);
  const releases = await fetchReleasesForChat(profileId);
  const requestId = randomUUID();

  await markChatTurnStreaming(reservation.turn.id);

  const { streamResult } = await executeChatTurn({
    uiMessages,
    artistContext,
    releases,
    resolvedProfileId: profileId,
    resolvedConversationId: reservation.conversationId,
    userId,
    userPlan: accountContext.plan,
    planLimits: accountContext.planLimits,
    insightsEnabled: false,
    accountContext,
    forceLightModel: false,
    lastUserText: parsed.text,
    tools: {},
    signal,
    requestId,
    onStreamError: async error => {
      const message =
        error instanceof Error ? error.message : 'The assistant stream failed.';
      await persistTerminalAssistantMessage({
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        status: 'failed_model_error',
        content:
          'Jovie hit a temporary issue while processing your message. Please retry.',
        errorCode: 'CHAT_STREAM_FAILED',
        errorMessage: message,
      });
    },
  });

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
        for await (const delta of streamResult.textStream) {
          if (!delta) continue;
          fullText += delta;
          enqueue({
            type: 'assistant.delta',
            clientTurnId: parsed.clientTurnId,
            text: delta,
          });
        }

        const trimmed = fullText.trim();
        const finalText =
          trimmed.length > 0
            ? trimmed
            : 'I could not produce a text reply for that request. Open the web chat to continue with richer actions.';

        if (trimmed.length === 0) {
          enqueue({
            type: 'web.handoff',
            clientTurnId: parsed.clientTurnId,
            conversationId: reservation.conversationId,
            url: buildMobileChatHandoffUrl(reservation.conversationId),
            summary: finalText,
          });
        }

        await persistTerminalAssistantMessage({
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          status: trimmed.length > 0 ? 'completed' : 'failed_tool_unavailable',
          content: finalText,
          errorCode: trimmed.length > 0 ? null : 'WEB_HANDOFF_REQUIRED',
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
            'Jovie hit a temporary issue while processing your message. Please retry.',
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
