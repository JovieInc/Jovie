'use client';

import { useChat } from '@ai-sdk/react';
import { useAsyncRateLimiter } from '@tanstack/react-pacer';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, isToolUIPart, type UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import {
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CHAT_STREAM_FAILED_USER_MESSAGE } from '@/lib/ai/gateway-errors';
import { track } from '@/lib/analytics';
import { matchCommand } from '@/lib/chat/command-registry';
import {
  type ComposerRecoveryContext,
  clearComposerDraft,
  clearSummerTurnRecovery,
  readComposerDraft,
  readSummerTurnRecovery,
  saveComposerDraft,
  saveSummerTurnRecovery,
} from '@/lib/chat/composer-draft-store';
import {
  consumeModelRotationNotice,
  readModelRotationStep,
  recordAssistantTurnClean,
} from '@/lib/chat/model-rotation-store';
import { consumePendingChatPrompt } from '@/lib/chat/open-chat-with-prompt';
import { trimMessagesForChatRequest } from '@/lib/chat/request-validation';
import { buildChatThreadRoute } from '@/lib/chat/sync-chat-thread-url';
import { isRecoverableToolErrorCode } from '@/lib/chat/tool-errors';
import { CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY } from '@/lib/chat/transcript-window';
import { recordUxLatency } from '@/lib/monitoring/interaction-latency';
import {
  parseSummerFailure,
  type SummerFailure,
  summerRetryExplanation,
} from '@/lib/ovie/summer-failure';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import { queryKeys, useChatConversationQuery } from '@/lib/queries';
import { subscribeCacheFence } from '@/lib/queries/cache-isolation';
import { FetchError } from '@/lib/queries/fetch';
import { captureException } from '@/lib/sentry/client-lite';
import { logger } from '@/lib/utils/logger';

import { hydratePersistedMessageParts } from '../message-parts';
import {
  type ChatTimelineEvent,
  type ChatTimelineMessage,
  type ChatTimelineServerMessage,
  type ChatTimelineState,
  createInitialChatTimelineState,
  reduceChatTimeline,
  selectRenderableMessages,
} from '../timeline/chat-timeline';
import type {
  ArtistContext,
  ChatConversationCreatePhase,
  ChatError,
  FileUIPart,
} from '../types';
import { MAX_MESSAGE_LENGTH } from '../types';
import {
  extractErrorMetadata,
  getErrorType,
  getPartsChangeFingerprint,
  getPreferredErrorMessage,
  shouldSuppressChatPauseForToolFailure,
} from '../utils';
import { composeMessage, useChipTray } from './useChipTray';
import { createComposerDraft, useComposerDraft } from './useComposerDraft';

interface UseJovieChatOptions {
  /** Profile ID for server-side context fetching (preferred) */
  readonly profileId?: string;
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext; // NOSONAR - kept for backward compatibility
  readonly conversationId?: string | null;
  readonly onConversationCreate?: (
    conversationId: string,
    phase?: ChatConversationCreatePhase
  ) => void;
  /** Artist username — used by deterministic commands (e.g. "preview my profile") */
  readonly username?: string;
  /**
   * Pinned opportunity card for server-side context injection (JOV-3933).
   * Sent on every turn while the pin is active so executeChatTurn can inject
   * a "Pinned opportunity" system block.
   */
  readonly pinnedOpportunity?: {
    readonly id: string;
    readonly title: string;
    readonly why: string;
    readonly typeLabel: string;
    readonly primaryActionLabel?: string;
    readonly signalType?: string;
  } | null;
  /**
   * Operator (OV) chat mode (JOV-4810). When 'ov', every turn body includes
   * `chatMode: 'ov'`; the server gates that mode on an admin role.
   */
  readonly chatMode?: 'ov';
}

/** Fast interval (ms) to poll for auto-generated title after first message. */
const TITLE_POLL_FAST_INTERVAL_MS = 2_000;

/** Slower interval (ms) used once title polling appears stalled. */
const TITLE_POLL_BACKOFF_INTERVAL_MS = 5_000;

/** Max duration (ms) to keep polling before giving up. */
const TITLE_POLL_MAX_DURATION_MS = 15_000;

/** Number of fast poll intervals to allow before backing off. */
const TITLE_POLL_FAST_WINDOW_MS = TITLE_POLL_FAST_INTERVAL_MS * 3;
const TIMELINE_CACHE_LIMIT = 20;
const timelineStateCache = new Map<string, ChatTimelineState>();

type ChatTurnSource = 'typed' | 'quick_action' | 'slash_command';

interface SubmitChatMessageOptions {
  readonly source?: ChatTurnSource;
  readonly toolIntent?: string | null;
  /** Stop the active turn before submitting a user-authored steering message. */
  readonly interrupt?: boolean;
  /** Resend an unrecorded Summer turn under its original id (idempotent replay). */
  readonly clientTurnId?: string;
  /** A retry can submit a failed message while a newer draft stays in the composer. */
  readonly preserveComposerDraft?: boolean;
}

interface ChatTurnMetadata {
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly requestId?: string;
  readonly toolStepCapExhausted?: boolean;
}

interface ActiveChatLatency {
  readonly clientTurnId: string;
  readonly startedAt: number;
  firstTokenRecorded: boolean;
  sendRoundTripRecorded: boolean;
}

function uxLatencyNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecoverableSummerHistoryFailure(error: unknown): boolean {
  return (
    error instanceof FetchError && (error.status === 404 || error.isRetryable())
  );
}

function extractChatTurnMetadata(value: unknown): ChatTurnMetadata | null {
  if (!isRecord(value)) return null;
  const conversationId =
    typeof value.conversationId === 'string' ? value.conversationId : undefined;
  const turnId = typeof value.turnId === 'string' ? value.turnId : undefined;
  const requestId =
    typeof value.requestId === 'string' ? value.requestId : undefined;
  const toolStepCapExhausted =
    value.toolStepCapExhausted === true ? true : undefined;

  if (!conversationId && !turnId && !requestId && !toolStepCapExhausted) {
    return null;
  }
  return { conversationId, turnId, requestId, toolStepCapExhausted };
}

function inferToolIntentFromPrompt(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  const mentionsAlbumArt =
    /\balbum\s+art\b/.test(normalized) ||
    /\bcover\s+art\b/.test(normalized) ||
    /\bartwork\b/.test(normalized);
  const asksForGeneration = /\b(generate|create|make|design|produce)\b/.test(
    normalized
  );
  const asksForBrief =
    /\bbrief\b/.test(normalized) || /\bdraft\b/.test(normalized);

  if (mentionsAlbumArt && asksForGeneration && !asksForBrief) {
    return 'album_art_generation';
  }

  const mentionsImage =
    /\b(photo|image|picture|shot|pic|selfie|portrait|press)\b/.test(normalized);
  const asksForRetouch =
    /\b(retouch|touch[\s-]?up|enhance|polish|clean\s+up)\b/.test(normalized);

  if (mentionsImage && asksForRetouch) {
    return 'image_retouch';
  }

  return null;
}

function inferToolIntentFromSkill(id: string): string | null {
  return id === 'generateAlbumArt' ? 'album_art_generation' : id;
}

function getTitlePollIntervalMs(
  titlePollingSince: number | null,
  currentTime: number
): number | false {
  if (titlePollingSince === null) {
    return false;
  }

  const elapsed = currentTime - titlePollingSince;

  if (elapsed >= TITLE_POLL_MAX_DURATION_MS) {
    return false;
  }

  return elapsed < TITLE_POLL_FAST_WINDOW_MS
    ? TITLE_POLL_FAST_INTERVAL_MS
    : TITLE_POLL_BACKOFF_INTERVAL_MS;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error('Chat send failed');
}

function readRecoveryError(context: ComposerRecoveryContext): ChatError | null {
  const recovery = readSummerTurnRecovery(context);
  if (!recovery) return null;
  return {
    type: 'server',
    message: summerRetryExplanation(recovery.retry),
    errorCode: recovery.errorCode,
    ...recovery.error,
    requestId: recovery.requestId,
    failedMessage: recovery.retry === 'none' ? undefined : recovery.message,
    ...(recovery.retry === 'same-turn'
      ? { retryClientTurnId: recovery.clientTurnId }
      : {}),
  };
}

function getMessageParts(message: UIMessage | undefined): UIMessage['parts'] {
  return Array.isArray(message?.parts) ? message.parts : [];
}

function hasAssistantOutput(parts: UIMessage['parts']): boolean {
  return parts.some(
    part =>
      (part.type === 'text' && part.text.trim().length > 0) ||
      part.type === 'file' ||
      isToolUIPart(part)
  );
}

function getLastAssistantMessage(messages: readonly UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      return messages[i];
    }
  }
  return undefined;
}

function summarizeTimelineState(state: ChatTimelineState) {
  return {
    conversationId: state.conversationId,
    phase: state.phase,
    messageCount: state.messages.length,
    activeClientTurnId: state.activeClientTurnId,
    statuses: state.messages.map(message => ({
      id: message.id,
      role: message.role,
      status: message.status,
      turnId: message.turnId,
      serverMessageId: message.serverMessageId,
    })),
  };
}

function getCachedTimelineState(conversationId: string | null) {
  if (!conversationId) {
    return createInitialChatTimelineState(null);
  }
  return (
    timelineStateCache.get(conversationId) ??
    createInitialChatTimelineState(conversationId)
  );
}

function isInFlightTimelineMessage(message: ChatTimelineMessage) {
  return (
    message.status === 'sending' ||
    message.status === 'pending' ||
    message.status === 'sent' ||
    message.status === 'streaming'
  );
}

function shouldCacheTimelineState(state: ChatTimelineState) {
  if (state.phase !== 'ready' || state.messages.length === 0) {
    return false;
  }
  return !state.messages.some(isInFlightTimelineMessage);
}

function takeCachedTimelineMessages(conversationId: string | null) {
  if (!conversationId) return undefined;
  const cached = timelineStateCache.get(conversationId);
  if (!cached || !shouldCacheTimelineState(cached)) return undefined;
  return cached.messages;
}

export function resetChatTimelineStateCacheForTests() {
  timelineStateCache.clear();
}

function cacheTimelineState(state: ChatTimelineState) {
  if (!state.conversationId) return;
  if (!shouldCacheTimelineState(state)) {
    timelineStateCache.delete(state.conversationId);
    return;
  }
  timelineStateCache.set(state.conversationId, state);
  while (timelineStateCache.size > TIMELINE_CACHE_LIMIT) {
    const oldestKey = timelineStateCache.keys().next().value;
    if (!oldestKey) break;
    timelineStateCache.delete(oldestKey);
  }
}

function isTimelineDebugEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    return (
      globalThis.localStorage?.getItem('jovie:chat-timeline-debug') === '1'
    );
  } catch {
    return false;
  }
}

export function useJovieChatController({
  profileId,
  artistContext, // NOSONAR - kept for backward compatibility
  conversationId: requestedConversationId,
  onConversationCreate,
  username,
  pinnedOpportunity = null,
  chatMode,
}: UseJovieChatOptions) {
  // The operator session is not a creator conversation or a customer cache key.
  const conversationId = chatMode === 'ov' ? null : requestedConversationId;
  const recoveryContext = useMemo(
    () => ({ chatMode, conversationId: conversationId ?? null, profileId }),
    [chatMode, conversationId, profileId]
  );
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAttemptedMessageRef = useRef<string>('');
  const activeClientTurnIdRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const pendingSendRef = useRef<Promise<void> | null>(null);
  const replacingTurnRef = useRef(false);
  const turnContextEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const activeChatLatencyRef = useRef<ActiveChatLatency | null>(null);
  // Assistant SDK message ids that existed BEFORE the active turn started.
  // Between send and stream start, the SDK's "last assistant message" is still
  // the previous turn's reply; reading its parts for the new turn flashes the
  // old reply into the fresh assistant row and then destructively re-renders
  // when the real stream begins (#11921).
  const preTurnAssistantMessageIdsRef = useRef<Set<string>>(new Set());
  const streamRevisionRef = useRef(0);
  const lastAssistantPartsSignatureRef = useRef<string | null>(null);
  const sdkMessagesRef = useRef<UIMessage[]>([]);
  // Failure hop carried on a data part so a stream error still knows whether
  // Retry may reuse the turn id (message metadata is not readable in onError).
  const pendingSummerFailureRef = useRef<SummerFailure | null>(null);
  const loadedConversationIdsRef = useRef<Set<string>>(new Set());
  const [draft] = useState(() =>
    createComposerDraft(readComposerDraft(conversationId ?? null))
  );
  const inputDraftConversationIdRef = useRef(conversationId ?? null);
  const chipTray = useChipTray();
  const [chatError, setChatErrorState] = useState<ChatError | null>(() =>
    readRecoveryError(recoveryContext)
  );
  // Error + draft writes may share one event before React commits (including a
  // failed send restoring its text). Keep the imperative comparison current.
  const chatErrorRef = useRef(chatError);
  const setChatError = useCallback(
    (update: SetStateAction<ChatError | null>) => {
      const next =
        typeof update === 'function' ? update(chatErrorRef.current) : update;
      chatErrorRef.current = next;
      setChatErrorState(next);
    },
    []
  );
  const setInput = useCallback(
    (update: SetStateAction<string>) => {
      const previous = draft.getSnapshot();
      draft.set(update);
      const next = draft.getSnapshot();
      const error = chatErrorRef.current;
      if (
        next &&
        next !== previous &&
        error &&
        next !== (error.failedMessage ?? lastAttemptedMessageRef.current)
      ) {
        setChatError(null);
      }
    },
    [draft, setChatError]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRateLimitHint, setShowRateLimitHint] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId ?? null);
  const queryClient = useQueryClient();
  const [timelineState, setTimelineState] = useState<ChatTimelineState>(() =>
    getCachedTimelineState(activeConversationId)
  );
  const [timelineMode, setTimelineMode] = useState(chatMode);
  const invalidateTurnContext = useCallback(() => {
    turnContextEpochRef.current += 1;
    activeClientTurnIdRef.current = null;
    activeRequestIdRef.current = null;
    activeChatLatencyRef.current = null;
    pendingSendRef.current = null;
    pendingSummerFailureRef.current = null;
    replacingTurnRef.current = false;
  }, []);
  const resetTurnContext = useCallback(() => {
    invalidateTurnContext();
    setIsSubmitting(false);
    setChatError(readRecoveryError(recoveryContext));
  }, [invalidateTurnContext, recoveryContext, setChatError]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateTurnContext();
    };
  }, [invalidateTurnContext]);
  useEffect(() => {
    if (timelineMode === chatMode) return;
    setTimelineMode(chatMode);
    setTimelineState(createInitialChatTimelineState(conversationId ?? null));
    inputDraftConversationIdRef.current = conversationId ?? null;
    setActiveConversationId(conversationId ?? null);
    resetTurnContext();
  }, [chatMode, conversationId, resetTurnContext, timelineMode]);
  const timelineStateRef = useRef(timelineState);
  useEffect(() => {
    timelineStateRef.current = timelineState;
    cacheTimelineState(timelineState);
  }, [timelineState]);
  const dispatchTimelineEvent = useCallback((event: ChatTimelineEvent) => {
    setTimelineState(previousState => {
      const nextState = reduceChatTimeline(previousState, event);
      timelineStateRef.current = nextState;
      cacheTimelineState(nextState);

      const ignoredAsStale = nextState.diagnostics.some(
        diagnostic =>
          diagnostic.event === event.type &&
          diagnostic.type === 'stale-event-ignored'
      );

      if (isTimelineDebugEnabled() || ignoredAsStale) {
        const payload = {
          eventName: event.type,
          conversationId:
            event.conversationId ?? nextState.conversationId ?? null,
          requestId: event.requestId ?? null,
          previousState: summarizeTimelineState(previousState),
          nextState: summarizeTimelineState(nextState),
          ignoredAsStale,
          timestamp: Date.now(),
          variantIdentity: CHAT_TRANSCRIPT_WINDOW_VARIANT_IDENTITY,
        };

        logger.info('chat_timeline.transition', payload, 'chat-timeline');
        try {
          track('chat_timeline.transition', payload);
        } catch {
          // Analytics failures must not affect chat state.
        }
      }

      return nextState;
    });
  }, []);

  // Track whether we're waiting for title generation from the server.
  // Set to a timestamp when title generation is initiated, cleared when title arrives.
  const [titlePollingSince, setTitlePollingSince] = useState<number | null>(
    null
  );

  const adoptServerConversationId = useCallback(
    (
      nextConversationId: string,
      phase: ChatConversationCreatePhase = 'reserved'
    ) => {
      if (!nextConversationId) {
        return;
      }

      const isNewConversation = nextConversationId !== activeConversationId;
      // Reserving a server conversation updates the address bar only.
      // Switching the hook's chat id before the AI SDK stream finishes
      // recreates the internal chat instance and drops in-flight tokens.
      if (isNewConversation && phase === 'completed') {
        inputDraftConversationIdRef.current = nextConversationId;
        setActiveConversationId(nextConversationId);
      }

      onConversationCreate?.(nextConversationId, phase);
    },
    [activeConversationId, onConversationCreate, setActiveConversationId]
  );
  const adoptServerConversationIdRef = useRef(adoptServerConversationId);
  useEffect(() => {
    adoptServerConversationIdRef.current = adoptServerConversationId;
  }, [adoptServerConversationId]);
  const lastConversationLoadFailureRef = useRef<string | null>(null);

  // Determine whether to poll: only while we're actively waiting for a title
  // and haven't exceeded the max poll duration.
  const titlePollIntervalMs = getTitlePollIntervalMs(
    titlePollingSince,
    Date.now()
  );

  // Load existing conversation if conversationId is provided.
  // When title is pending, enable refetchInterval to poll for the generated title.
  const {
    data: existingConversation,
    error: existingConversationError,
    isError: isConversationQueryError,
    isLoading: isLoadingConversation,
  } = useChatConversationQuery({
    conversationId: activeConversationId,
    enabled: chatMode === 'ov' || !!activeConversationId,
    chatMode,
    refetchInterval: titlePollIntervalMs,
  });
  const blocksOvieConversation =
    chatMode === 'ov' &&
    isConversationQueryError &&
    !isRecoverableSummerHistoryFailure(existingConversationError);
  // Recorded Summer failures that an answered turn has since superseded. They
  // collapse behind one control so the thread isn't a wall of failures; the
  // latest failure stays visible because Retry applies to it.
  const [showSupersededSummerFailures, setShowSupersededSummerFailures] =
    useState(false);
  const supersededSummerFailureIds = useMemo(() => {
    const rows =
      chatMode === 'ov' ? (existingConversation?.messages ?? []) : [];
    const lastAnswered = rows.findLastIndex(
      row => row.role === 'assistant' && !row.summerFailed
    );
    return new Set(
      rows
        .slice(0, Math.max(0, lastAnswered))
        .filter(row => row.summerFailed)
        .map(row => row.id)
    );
  }, [chatMode, existingConversation]);
  const messages = useMemo(() => {
    if (timelineMode !== chatMode || blocksOvieConversation) return [];
    const rows = selectRenderableMessages(timelineState);
    if (chatMode !== 'ov') return rows;
    // Canonical turn order wins over tied timestamps; never invent event times.
    // Unpersisted local rows remain in their existing order after recorded turns.
    const order = new Map(
      existingConversation?.messages.map((row, index) => [row.id, index])
    );
    return [...rows]
      .filter(
        row =>
          showSupersededSummerFailures ||
          !supersededSummerFailureIds.has(row.serverMessageId ?? '')
      )
      .sort(
        (a, b) =>
          (order.get(a.serverMessageId ?? '') ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.serverMessageId ?? '') ?? Number.MAX_SAFE_INTEGER)
      );
  }, [
    timelineMode,
    chatMode,
    blocksOvieConversation,
    timelineState,
    existingConversation,
    showSupersededSummerFailures,
    supersededSummerFailureIds,
  ]);
  const collapsedSummerFailureCount = showSupersededSummerFailures
    ? 0
    : (existingConversation?.messages ?? []).filter(
        row =>
          row.role === 'assistant' && supersededSummerFailureIds.has(row.id)
      ).length;

  // Create transport: prefer profileId for server-side fetching, fall back to artistContext
  const transport = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs are only read inside the fetch/prepareSendMessagesRequest closures at request time, never during render
      new DefaultChatTransport({
        api: '/api/chat',
        body: {
          ...(profileId ? { profileId } : { artistContext }),
          ...(chatMode !== 'ov' && activeConversationId
            ? { conversationId: activeConversationId }
            : {}),
          ...(pinnedOpportunity ? { pinnedOpportunity } : {}),
          ...(chatMode === 'ov' ? { chatMode } : {}),
        },
        prepareSendMessagesRequest: ({ messages, body }) => {
          const staticBody =
            typeof body === 'object' && body !== null
              ? (body as Record<string, unknown>)
              : {};
          return {
            body: {
              ...staticBody,
              messages: trimMessagesForChatRequest(messages, staticBody),
              ...(pinnedOpportunity ? { pinnedOpportunity } : {}),
            },
          };
        },
        fetch: async (input, init) => {
          const clientTurnId = activeClientTurnIdRef.current;
          const response = await globalThis.fetch(input, {
            ...init,
            credentials: 'same-origin',
          });
          if (clientTurnId !== activeClientTurnIdRef.current) return response;
          activeRequestIdRef.current = response.headers.get('x-request-id');
          const serverConversationId =
            response.headers.get('x-conversation-id');
          const serverTurnId = response.headers.get('x-chat-turn-id');
          const latency = activeChatLatencyRef.current;
          if (
            response.ok &&
            clientTurnId &&
            latency?.clientTurnId === clientTurnId &&
            !latency.sendRoundTripRecorded
          ) {
            latency.sendRoundTripRecorded = true;
            recordUxLatency(
              'chat_send_round_trip',
              Math.max(0, uxLatencyNowMs() - latency.startedAt)
            );
          }
          if (chatMode !== 'ov' && serverConversationId) {
            adoptServerConversationIdRef.current(
              serverConversationId,
              'reserved'
            );
          }
          if (chatMode !== 'ov' && serverConversationId && clientTurnId) {
            dispatchTimelineEvent({
              type: 'message.send.acknowledged',
              conversationId: serverConversationId,
              clientTurnId,
              turnId: serverTurnId,
              requestId: serverTurnId ?? undefined,
              now: Date.now(),
            });
          }
          return response;
        },
      }),
    [
      profileId,
      artistContext,
      activeConversationId,
      pinnedOpportunity,
      chatMode,
      dispatchTimelineEvent,
    ]
  );

  // Convert loaded messages to canonical timeline input. Query data feeds the
  // reducer as merge events; it never directly replaces rendered messages.
  const persistedTimelineMessages = useMemo(() => {
    if (!existingConversation?.messages) return undefined;
    if ((existingConversation.chatMode === 'ov') !== (chatMode === 'ov'))
      return undefined;
    return existingConversation.messages.map(
      (msg: {
        id: string;
        role: string;
        content: string;
        toolCalls?: unknown;
        createdAt: string;
        clientMessageId?: string | null;
        turnId?: string | null;
        requestId?: string | null;
      }): ChatTimelineServerMessage => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: hydratePersistedMessageParts(msg.content, msg.toolCalls),
        createdAt: new Date(msg.createdAt),
        clientMessageId: msg.clientMessageId ?? null,
        turnId: msg.turnId ?? null,
        requestId: msg.requestId ?? null,
      })
    );
  }, [existingConversation, chatMode]);

  const handleChatFailure = useCallback(
    (
      error: Error,
      errorType: 'send' | 'stream',
      clientTurnId = activeClientTurnIdRef.current
    ) => {
      if (!clientTurnId || clientTurnId !== activeClientTurnIdRef.current)
        return;
      captureException(error, {
        tags: {
          feature: 'ai-chat',
          source: 'useJovieChat',
          errorType,
        },
        extra: {
          profileId: profileId ?? null,
          conversationId: activeConversationId,
        },
      });

      const chatErrorType = getErrorType(error);
      const metadata = extractErrorMetadata(error);

      const suppressComposerPause =
        chatErrorType === 'tool' ||
        isRecoverableToolErrorCode(metadata.errorCode);

      if (!suppressComposerPause || chatErrorType === 'rate_limit') {
        saveSummerTurnRecovery(recoveryContext, {
          clientTurnId,
          message: lastAttemptedMessageRef.current,
          retry: suppressComposerPause ? 'none' : 'same-turn',
          requestId:
            metadata.requestId ?? activeRequestIdRef.current ?? undefined,
          error: {
            type: chatErrorType,
            message: getPreferredErrorMessage(error, chatErrorType, metadata),
            retryAfter: metadata.retryAfter,
            errorCode: metadata.errorCode,
            suppressComposerPause,
          },
        });
      }

      setChatError({
        type: chatErrorType,
        message: getPreferredErrorMessage(error, chatErrorType, metadata),
        retryAfter: metadata.retryAfter,
        errorCode: metadata.errorCode,
        requestId:
          metadata.requestId ?? activeRequestIdRef.current ?? undefined,
        failedMessage: suppressComposerPause
          ? undefined
          : lastAttemptedMessageRef.current,
        suppressComposerPause,
        ...(chatMode === 'ov' && !suppressComposerPause
          ? { retryClientTurnId: clientTurnId }
          : {}),
      });

      if (lastAttemptedMessageRef.current) {
        const failedMessage = lastAttemptedMessageRef.current;
        setInput(current => current || failedMessage);
      }

      if (clientTurnId) {
        dispatchTimelineEvent({
          type: 'assistant.stream.failed',
          conversationId: activeConversationId,
          clientTurnId,
          requestId: clientTurnId,
          error: getPreferredErrorMessage(error, chatErrorType, metadata),
          now: Date.now(),
        });
      }
      activeClientTurnIdRef.current = null;
      activeChatLatencyRef.current = null;
      setIsSubmitting(false);
    },
    [
      activeConversationId,
      chatMode,
      dispatchTimelineEvent,
      profileId,
      recoveryContext,
      setChatError,
      setInput,
    ]
  );

  /**
   * Parts of the assistant message that belongs to the ACTIVE turn. Returns []
   * when the SDK's last assistant message predates the active turn (the
   * previous reply), so stale content is never dispatched into the fresh
   * assistant row (#11921).
   */
  const getActiveTurnAssistantParts = useCallback(
    (candidateMessages: readonly UIMessage[]): UIMessage['parts'] => {
      const assistantMessage = getLastAssistantMessage(candidateMessages);
      if (!assistantMessage) return [];
      if (preTurnAssistantMessageIdsRef.current.has(assistantMessage.id)) {
        return [];
      }
      return getMessageParts(assistantMessage);
    },
    []
  );

  const {
    messages: sdkMessages,
    sendMessage,
    status,
    stop: rawStop,
  } = useChat({
    id:
      chatMode === 'ov'
        ? 'summer-operator-chat'
        : (activeConversationId ?? 'new-chat'),
    transport,
    // JOV-3525: batch streaming UI updates to ~20fps so raw token deltas don't
    // re-render the timeline on every burst; pairs with server-side
    // smoothStream word-level pacing in lib/chat/run.ts.
    experimental_throttle: 50,
    onData: dataPart => {
      if (dataPart.type === 'data-summer-failure') {
        pendingSummerFailureRef.current = parseSummerFailure(dataPart.data);
      }
    },
    onFinish: ({ message, isError, isAbort, isDisconnect }) => {
      // stop() settles the cancelled turn. Its eventual SDK callback must not
      // settle a replacement, even when it arrives after a fresh submission.
      if (isAbort) return;
      const metadata = extractChatTurnMetadata(message.metadata);
      const finishedConversationId =
        metadata?.conversationId ?? activeConversationId;
      const clientTurnId = activeClientTurnIdRef.current;
      if (!clientTurnId) return;
      const latency = activeChatLatencyRef.current;
      const messageParts = getMessageParts(message as UIMessage);

      if (isError || isDisconnect) {
        if (clientTurnId) {
          handleChatFailure(
            new Error(CHAT_STREAM_FAILED_USER_MESSAGE),
            'stream',
            clientTurnId
          );
        }
        return;
      }

      if (chatMode !== 'ov' && metadata?.conversationId) {
        adoptServerConversationId(metadata.conversationId, 'completed');
      }

      if (clientTurnId && !hasAssistantOutput(messageParts)) {
        handleChatFailure(
          new Error(CHAT_STREAM_FAILED_USER_MESSAGE),
          'stream',
          clientTurnId
        );
        return;
      }

      if (
        clientTurnId &&
        latency?.clientTurnId === clientTurnId &&
        !latency.firstTokenRecorded &&
        messageParts.length > 0
      ) {
        latency.firstTokenRecorded = true;
        recordUxLatency(
          'chat_first_token',
          Math.max(0, uxLatencyNowMs() - latency.startedAt)
        );
      }

      if (clientTurnId) {
        dispatchTimelineEvent({
          type: 'assistant.stream.completed',
          conversationId: finishedConversationId,
          clientTurnId,
          turnId: metadata?.turnId,
          requestId: metadata?.requestId,
          parts: messageParts,
          toolStepCapExhausted: metadata?.toolStepCapExhausted,
          now: Date.now(),
        });
      }
      const summerFailure =
        chatMode === 'ov' && isRecord(message.metadata)
          ? parseSummerFailure(message.metadata.summerFailure)
          : null;
      if (summerFailure) {
        saveSummerTurnRecovery(recoveryContext, {
          clientTurnId,
          message: lastAttemptedMessageRef.current,
          retry: summerFailure.retry,
          errorCode: summerFailure.hop,
          requestId: metadata?.requestId,
        });
        setChatError({
          type: 'server',
          message: summerRetryExplanation(summerFailure.retry),
          errorCode: summerFailure.hop,
          requestId: metadata?.requestId,
          failedMessage:
            summerFailure.retry === 'none'
              ? undefined
              : lastAttemptedMessageRef.current,
          ...(summerFailure.retry === 'same-turn' && clientTurnId
            ? { retryClientTurnId: clientTurnId }
            : {}),
        });
      } else {
        clearSummerTurnRecovery(recoveryContext, clientTurnId);
      }

      // 👎 recovery loop (JOV-3362 / #11461): count clean assistant turns so
      // a rotated conversation auto-reverts to the default model after 3
      // completions without a new thumbs-down.
      recordAssistantTurnClean(finishedConversationId);

      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.usage(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
      if (finishedConversationId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.chat.conversation(finishedConversationId),
        });
      }

      activeClientTurnIdRef.current = null;
      activeChatLatencyRef.current = null;
      setIsSubmitting(false);
    },
    onError: error => {
      const clientTurnId = activeClientTurnIdRef.current;
      if (!clientTurnId) return;
      const assistantParts = getActiveTurnAssistantParts(
        sdkMessagesRef.current
      );

      if (
        clientTurnId &&
        shouldSuppressChatPauseForToolFailure(error, assistantParts)
      ) {
        clearSummerTurnRecovery(recoveryContext, clientTurnId);
        dispatchTimelineEvent({
          type: 'assistant.stream.completed',
          conversationId: activeConversationId,
          clientTurnId,
          requestId: clientTurnId,
          parts: assistantParts,
          now: Date.now(),
        });
        activeClientTurnIdRef.current = null;
        activeChatLatencyRef.current = null;
        setIsSubmitting(false);
        return;
      }

      handleChatFailure(error, 'stream', clientTurnId);

      const summerFailure =
        chatMode === 'ov' ? pendingSummerFailureRef.current : null;
      pendingSummerFailureRef.current = null;
      if (summerFailure) {
        saveSummerTurnRecovery(recoveryContext, {
          clientTurnId,
          message: lastAttemptedMessageRef.current,
          retry: summerFailure.retry,
          errorCode: summerFailure.hop,
          requestId: activeRequestIdRef.current ?? undefined,
        });
        setChatError({
          type: 'server',
          message: summerRetryExplanation(summerFailure.retry),
          errorCode: summerFailure.hop,
          requestId: activeRequestIdRef.current ?? undefined,
          failedMessage:
            summerFailure.retry === 'none'
              ? undefined
              : lastAttemptedMessageRef.current,
          ...(summerFailure.retry === 'same-turn' && clientTurnId
            ? { retryClientTurnId: clientTurnId }
            : {}),
        });
      }

      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.usage(),
      });
    },
  });

  const previousProfileIdRef = useRef(profileId);
  useEffect(() => {
    if (previousProfileIdRef.current !== profileId) {
      previousProfileIdRef.current = profileId;
      rawStop();
      resetTurnContext();
    }
    return subscribeCacheFence(() => {
      rawStop();
      resetTurnContext();
    });
  }, [profileId, rawStop, resetTurnContext]);

  // Query data merges into the canonical timeline. It must never replace the
  // rendered list wholesale because optimistic/streaming rows may be newer.
  useEffect(() => {
    if (chatMode !== 'ov' || timelineMode !== chatMode) return;
    if (isLoadingConversation) {
      dispatchTimelineEvent({
        type: 'conversation.load.started',
        conversationId: null,
      });
    } else if (persistedTimelineMessages) {
      dispatchTimelineEvent({
        type: 'conversation.load.succeeded',
        conversationId: null,
        messages: persistedTimelineMessages,
      });
    }
  }, [
    chatMode,
    timelineMode,
    isLoadingConversation,
    persistedTimelineMessages,
    dispatchTimelineEvent,
  ]);

  useEffect(() => {
    if (chatMode === 'ov') return;
    if (!activeConversationId || !isLoadingConversation) return;
    if (loadedConversationIdsRef.current.has(activeConversationId)) return;
    dispatchTimelineEvent({
      type: 'conversation.load.started',
      conversationId: activeConversationId,
      requestId: activeConversationId,
      now: Date.now(),
    });
  }, [
    activeConversationId,
    dispatchTimelineEvent,
    isLoadingConversation,
    chatMode,
  ]);

  useEffect(() => {
    if (chatMode === 'ov') return;
    if (!activeConversationId || !isConversationQueryError) {
      lastConversationLoadFailureRef.current = null;
      return;
    }

    const errorMessage =
      existingConversationError instanceof Error
        ? existingConversationError.message
        : 'Chat failed to load';
    const failureKey = `${activeConversationId}:${errorMessage}`;
    if (lastConversationLoadFailureRef.current === failureKey) return;
    lastConversationLoadFailureRef.current = failureKey;

    dispatchTimelineEvent({
      type: 'conversation.load.failed',
      conversationId: activeConversationId,
      requestId: activeConversationId,
      error: errorMessage,
      now: Date.now(),
    });
  }, [
    activeConversationId,
    dispatchTimelineEvent,
    existingConversationError,
    isConversationQueryError,
    chatMode,
  ]);

  useEffect(() => {
    if (chatMode === 'ov') return;
    if (!activeConversationId || !persistedTimelineMessages) return;
    if (existingConversation?.conversation?.id !== activeConversationId) return;

    const hasLoaded =
      loadedConversationIdsRef.current.has(activeConversationId);
    dispatchTimelineEvent({
      type: hasLoaded
        ? 'conversation.refetch.succeeded'
        : 'conversation.load.succeeded',
      conversationId: activeConversationId,
      requestId: activeConversationId,
      messages: persistedTimelineMessages,
      receivedAt: Date.now(),
    });
    lastConversationLoadFailureRef.current = null;
    loadedConversationIdsRef.current.add(activeConversationId);
  }, [
    activeConversationId,
    dispatchTimelineEvent,
    existingConversation?.conversation?.id,
    persistedTimelineMessages,
    chatMode,
  ]);

  useEffect(() => {
    sdkMessagesRef.current = sdkMessages;
  }, [sdkMessages]);

  useEffect(() => {
    const clientTurnId = activeClientTurnIdRef.current;
    if (!clientTurnId) return;

    const parts = getActiveTurnAssistantParts(sdkMessages);
    if (status === 'streaming' && parts.length === 0) {
      dispatchTimelineEvent({
        type: 'assistant.stream.started',
        conversationId: activeConversationId,
        clientTurnId,
        requestId: clientTurnId,
        now: Date.now(),
      });
      return;
    }

    if (parts.length === 0) return;
    const latency = activeChatLatencyRef.current;
    if (latency?.clientTurnId === clientTurnId && !latency.firstTokenRecorded) {
      latency.firstTokenRecorded = true;
      recordUxLatency(
        'chat_first_token',
        Math.max(0, uxLatencyNowMs() - latency.startedAt)
      );
    }
    const signature = getPartsChangeFingerprint(parts);
    if (signature === lastAssistantPartsSignatureRef.current) return;

    lastAssistantPartsSignatureRef.current = signature;
    streamRevisionRef.current += 1;
    dispatchTimelineEvent({
      type: 'assistant.stream.delta',
      conversationId: activeConversationId,
      clientTurnId,
      requestId: clientTurnId,
      parts,
      revision: streamRevisionRef.current,
      now: Date.now(),
    });
  }, [
    activeConversationId,
    dispatchTimelineEvent,
    getActiveTurnAssistantParts,
    sdkMessages,
    status,
  ]);

  // Wrap stop to clear submission state so the composer re-enables immediately
  // instead of waiting for the 30s safety timeout.
  const stop = useCallback(() => {
    const clientTurnId = activeClientTurnIdRef.current;
    const assistantParts = getActiveTurnAssistantParts(sdkMessagesRef.current);
    rawStop();
    if (clientTurnId) {
      dispatchTimelineEvent({
        type: 'assistant.stream.completed',
        conversationId: activeConversationId,
        clientTurnId,
        requestId: clientTurnId,
        parts: assistantParts,
        now: Date.now(),
      });
      activeClientTurnIdRef.current = null;
      activeChatLatencyRef.current = null;
    }
    setIsSubmitting(false);
  }, [
    activeConversationId,
    dispatchTimelineEvent,
    getActiveTurnAssistantParts,
    rawStop,
  ]);

  const isLoading = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (status !== 'ready') return;
    queryClient.invalidateQueries({
      queryKey: queryKeys.chat.usage(),
    });
  }, [status, queryClient]);

  // Derive the conversation title from the query data
  const conversationTitle = existingConversation?.conversation?.title ?? null;

  // Stop polling once the title is present (or after timeout, handled by shouldPollForTitle)
  useEffect(() => {
    if (titlePollingSince !== null && conversationTitle) {
      setTitlePollingSince(null);
      // Also invalidate the conversations list so the sidebar picks up the new title
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.conversations(),
      });
    }
  }, [conversationTitle, titlePollingSince, queryClient]);

  // Safety: stop polling after max duration via a timeout
  useEffect(() => {
    if (titlePollingSince === null) return;
    const remaining =
      TITLE_POLL_MAX_DURATION_MS - (Date.now() - titlePollingSince);
    if (remaining <= 0) {
      setTitlePollingSince(null);
      return;
    }
    const timer = setTimeout(() => setTitlePollingSince(null), remaining);
    return () => clearTimeout(timer);
  }, [titlePollingSince]);

  useEffect(
    () => () => {
      saveComposerDraft(
        inputDraftConversationIdRef.current,
        draft.getSnapshot()
      );
    },
    [draft]
  );

  useEffect(() => {
    let handle: ReturnType<typeof globalThis.setTimeout>;
    const scheduleSave = () => {
      globalThis.clearTimeout(handle);
      handle = globalThis.setTimeout(() => {
        if (inputDraftConversationIdRef.current === activeConversationId) {
          saveComposerDraft(activeConversationId, draft.getSnapshot());
        }
      }, 250);
    };
    scheduleSave();
    const unsubscribe = draft.subscribe(scheduleSave);
    return () => {
      unsubscribe();
      globalThis.clearTimeout(handle);
    };
  }, [activeConversationId, draft]);

  // Sync activeConversationId when parent prop changes
  useEffect(() => {
    const nextConversationId = conversationId ?? null;
    if (activeConversationId === nextConversationId) {
      return;
    }

    if (activeConversationId && nextConversationId === null) {
      const reservedPath = buildChatThreadRoute(activeConversationId);
      if (globalThis.location?.pathname === reservedPath) {
        return;
      }
      // The new-chat page does not pass an id until Next notices the reserved
      // URL. Do not treat that stale prop as "switch back to empty".
      if (
        timelineStateRef.current.conversationId === activeConversationId ||
        timelineStateRef.current.messages.length > 0
      ) {
        return;
      }
    }

    // The parent route catching up to the already-acknowledged server id is
    // not a thread switch. Wiping here drops the in-flight transcript.
    if (
      !activeConversationId &&
      nextConversationId &&
      timelineStateRef.current.conversationId === nextConversationId
    ) {
      inputDraftConversationIdRef.current = nextConversationId;
      setActiveConversationId(nextConversationId);
      return;
    }

    saveComposerDraft(activeConversationId, draft.getSnapshot());
    inputDraftConversationIdRef.current = nextConversationId;
    setInput(readComposerDraft(nextConversationId));

    setActiveConversationId(nextConversationId);
    resetTurnContext();
    streamRevisionRef.current = 0;
    lastAssistantPartsSignatureRef.current = null;
    dispatchTimelineEvent({
      type: 'conversation.switched',
      conversationId: nextConversationId,
      requestId: nextConversationId ?? 'new-chat',
      cachedMessages: takeCachedTimelineMessages(nextConversationId),
      now: Date.now(),
    });
  }, [
    activeConversationId,
    conversationId,
    dispatchTimelineEvent,
    draft,
    resetTurnContext,
    setInput,
  ]);

  /** Try to handle text as a deterministic command. Returns true if handled. */
  const tryHandleCommand = useCallback(
    (trimmedText: string): boolean => {
      const commandCtx = { username, router };
      const command = matchCommand(trimmedText, commandCtx);
      if (!command) return false;

      dispatchTimelineEvent({
        type: 'deterministic.command.completed',
        conversationId: activeConversationId,
        clientTurnId: `cmd-${crypto.randomUUID()}`,
        userParts: [{ type: 'text' as const, text: trimmedText }],
        assistantParts: [
          { type: 'text' as const, text: command.confirmationMessage },
        ],
        now: Date.now(),
      });
      clearComposerDraft(activeConversationId);
      setInput('');
      command.execute(commandCtx);
      return true;
    },
    [activeConversationId, dispatchTimelineEvent, username, router, setInput]
  );

  // Core submit logic
  const doSubmit = useCallback(
    async (
      text: string,
      files?: FileUIPart[],
      options?: SubmitChatMessageOptions
    ): Promise<boolean> => {
      if (!mountedRef.current) return false;
      if (
        chatMode === 'ov' &&
        (isLoadingConversation || blocksOvieConversation)
      )
        return false;
      const hasFiles = files && files.length > 0;
      if (!text.trim() && !hasFiles) return false;
      if (replacingTurnRef.current) return false;
      const contextEpoch = turnContextEpochRef.current;
      const isBusy =
        isLoading ||
        isSubmitting ||
        activeClientTurnIdRef.current !== null ||
        pendingSendRef.current !== null;
      const shouldInterrupt = isBusy && options?.interrupt === true;
      if (isBusy && !shouldInterrupt) return false;
      if (shouldInterrupt) {
        replacingTurnRef.current = true;
        try {
          const pendingSend = pendingSendRef.current;
          stop();
          // Abort starts cancellation; the send promise owns its completion.
          // Drain it before the shared SDK callbacks can observe a new turn.
          await pendingSend;
        } finally {
          if (contextEpoch === turnContextEpochRef.current)
            replacingTurnRef.current = false;
        }
        if (contextEpoch !== turnContextEpochRef.current) return false;
      }

      // Validate message length
      if (text.length > MAX_MESSAGE_LENGTH) {
        setChatError({
          type: 'unknown',
          message: `Message is too long. Maximum is ${MAX_MESSAGE_LENGTH} characters.`,
        });
        return false;
      }

      const trimmedText = text.trim();

      // Check for deterministic commands before hitting AI
      if (!hasFiles && tryHandleCommand(trimmedText)) {
        clearSummerTurnRecovery(recoveryContext);
        return true;
      }

      const payload = {
        text: trimmedText,
        ...(hasFiles ? { files } : {}),
      };

      // Store the message before sending (in case of error)
      lastAttemptedMessageRef.current = trimmedText;

      setChatError(null);
      setIsSubmitting(true);
      const clientTurnId =
        options?.clientTurnId ??
        (chatMode === 'ov' && trimmedText === chatError?.failedMessage
          ? chatError.retryClientTurnId
          : undefined) ??
        crypto.randomUUID();
      if (
        readSummerTurnRecovery(recoveryContext)?.clientTurnId !== clientTurnId
      ) {
        clearSummerTurnRecovery(recoveryContext);
      }
      activeClientTurnIdRef.current = clientTurnId;
      activeRequestIdRef.current = null;
      pendingSummerFailureRef.current = null;
      activeChatLatencyRef.current = {
        clientTurnId,
        startedAt: uxLatencyNowMs(),
        firstTokenRecorded: false,
        sendRoundTripRecorded: false,
      };
      // Snapshot which assistant messages already exist so this turn never
      // treats a previous reply as its own streaming content (#11921).
      preTurnAssistantMessageIdsRef.current = new Set(
        sdkMessagesRef.current
          .filter(message => message.role === 'assistant')
          .map(message => message.id)
      );
      streamRevisionRef.current = 0;
      lastAssistantPartsSignatureRef.current = null;
      const toolIntent =
        options?.toolIntent ?? inferToolIntentFromPrompt(trimmedText);

      // 👎 recovery loop (JOV-3362 / #11461): after a thumbs-down, route this
      // conversation's next turn to the next model in the fallback chain. The
      // client only transmits an integer step; the server resolves + clamps
      // the actual model from its own vetted chain.
      const modelRotationStep = readModelRotationStep(activeConversationId);
      const modelRotationNotice = consumeModelRotationNotice(
        activeConversationId,
        modelRotationStep
      );

      const sendOptions = {
        body: {
          clientTurnId,
          clientMessageId: `${clientTurnId}:user`,
          source: options?.source ?? 'typed',
          ...(toolIntent ? { toolIntent } : {}),
          ...(modelRotationStep > 0 ? { modelRotationStep } : {}),
        },
      };
      dispatchTimelineEvent({
        type: 'message.send.started',
        conversationId: activeConversationId,
        clientTurnId,
        clientMessageId: `${clientTurnId}:user`,
        requestId: clientTurnId,
        ...(modelRotationNotice ? { modelRotationNotice } : {}),
        parts: [
          { type: 'text' as const, text: trimmedText },
          ...(files ?? []),
        ] as UIMessage['parts'],
        now: Date.now(),
      });

      try {
        const result = sendMessage(payload, sendOptions);
        if (!options?.preserveComposerDraft) {
          clearComposerDraft(activeConversationId);
          setInput('');
        }
        const pendingSend = Promise.resolve(result)
          .catch(error_ => {
            handleChatFailure(toError(error_), 'send', clientTurnId);
          })
          .finally(() => {
            if (pendingSendRef.current === pendingSend)
              pendingSendRef.current = null;
          });
        pendingSendRef.current = pendingSend;
        return true;
      } catch (error) {
        handleChatFailure(toError(error), 'send', clientTurnId);
        return false;
      }
    },
    [
      activeConversationId,
      chatError,
      dispatchTimelineEvent,
      handleChatFailure,
      isLoading,
      isSubmitting,
      recoveryContext,
      sendMessage,
      setChatError,
      setInput,
      stop,
      tryHandleCommand,
      chatMode,
      isLoadingConversation,
      blocksOvieConversation,
    ]
  );

  // Retry the last failed message
  const handleRetry = useCallback(() => {
    if (chatError?.failedMessage) {
      doSubmit(chatError.failedMessage, undefined, {
        clientTurnId: chatError.retryClientTurnId,
        preserveComposerDraft:
          Boolean(draft.getSnapshot()) &&
          draft.getSnapshot().trim() !== chatError.failedMessage,
      });
    }
  }, [chatError, doSubmit, draft]);

  const rateLimitedSubmitter = useAsyncRateLimiter(
    async ({
      text,
      files,
      source,
      toolIntent,
    }: { text: string; files?: FileUIPart[] } & SubmitChatMessageOptions) => {
      const submitted = await doSubmit(text, files, { source, toolIntent });
      if (submitted) {
        chipTray.clear();
      }
    },
    {
      limit: 1,
      window: PACER_TIMING.CHAT_RATE_LIMIT_MS,
      onReject: () => {
        setShowRateLimitHint(true);
        setChatError({
          type: 'rate_limit',
          message:
            'You’re sending messages too quickly. Please wait a moment and try again.',
          failedMessage: draft.getSnapshot(),
        });
      },
    }
  );

  useEffect(() => {
    if (!showRateLimitHint) return;

    const timer = setTimeout(() => {
      setShowRateLimitHint(false);
    }, PACER_TIMING.CHAT_RATE_LIMIT_MS);

    return () => clearTimeout(timer);
  }, [showRateLimitHint]);

  const isRateLimited = showRateLimitHint;

  const handleSubmit = useCallback(
    (e?: React.FormEvent, files?: FileUIPart[]) => {
      e?.preventDefault();
      const composed = composeMessage(chipTray.chips, draft.getSnapshot());
      const skillChip = chipTray.chips.find(chip => chip.type === 'skill');
      rateLimitedSubmitter.maybeExecute({
        text: composed,
        files,
        source: skillChip ? 'slash_command' : 'typed',
        toolIntent: skillChip ? inferToolIntentFromSkill(skillChip.id) : null,
      });
    },
    [chipTray, draft, rateLimitedSubmitter]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      rateLimitedSubmitter.maybeExecute({
        text: prompt,
        source: 'quick_action',
        toolIntent: inferToolIntentFromPrompt(prompt),
      });
    },
    [rateLimitedSubmitter]
  );

  const handleInterruptAndSubmit = useCallback(() => {
    const composed = composeMessage(chipTray.chips, draft.getSnapshot());
    const skillChip = chipTray.chips.find(chip => chip.type === 'skill');
    void doSubmit(composed, undefined, {
      source: skillChip ? 'slash_command' : 'typed',
      toolIntent: skillChip ? inferToolIntentFromSkill(skillChip.id) : null,
      interrupt: true,
    });
  }, [chipTray, doSubmit, draft]);

  // Consume a pending prompt set before the chat component mounted
  // (e.g. via "open-chat-with-prompt"). This is programmatic/automated, not
  // a repeated user action, so it bypasses the client-side rate limiter to
  // avoid consuming the first-message slot and blocking the user's first send.
  useEffect(() => {
    // Effect replay/unmount must settle before consuming the one-time prompt.
    // Otherwise StrictMode aborts its only send and the prompt is already gone.
    let canceled = false;
    queueMicrotask(() => {
      if (canceled) return;
      const pendingPrompt = consumePendingChatPrompt();
      if (pendingPrompt) void doSubmit(pendingPrompt);
    });
    return () => {
      canceled = true;
    };
  }, [doSubmit]);

  useEffect(() => {
    const handlePromptEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (!detail?.prompt) return;

      rateLimitedSubmitter.maybeExecute({ text: detail.prompt });
    };

    globalThis.addEventListener('jovie-chat-submit-prompt', handlePromptEvent);
    return () => {
      globalThis.removeEventListener(
        'jovie-chat-submit-prompt',
        handlePromptEvent
      );
    };
  }, [rateLimitedSubmitter]);

  // Handles "insert-mention" from card buttons (ChatAlbumArtCard, etc.).
  // Appends skill + entity chips to the tray; does NOT auto-submit. User
  // reviews chips, types any extra context, hits Enter. Replaces the
  // JSON-in-prompt auto-submit flow from the prior design.
  useEffect(() => {
    const handleInsertMention = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          skillId?: string;
          mention?: {
            kind: 'release' | 'artist' | 'track';
            id: string;
            label: string;
            thumbnail?: string;
          };
        }>
      ).detail;
      if (!detail) return;
      if (detail.skillId) chipTray.addSkill(detail.skillId);
      if (detail.mention) chipTray.addEntity(detail.mention);
    };

    globalThis.addEventListener(
      'jovie-chat-insert-mention',
      handleInsertMention
    );
    return () => {
      globalThis.removeEventListener(
        'jovie-chat-insert-mention',
        handleInsertMention
      );
    };
  }, [chipTray]);

  return {
    // State
    draft,
    setInput,
    chipTray,
    messages,
    chatError: blocksOvieConversation
      ? {
          type: 'unknown' as const,
          message:
            existingConversationError instanceof Error
              ? existingConversationError.message
              : 'Summer history couldn’t load. Reload to try again.',
        }
      : chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    /** Earlier unanswered Summer turns hidden behind one control. */
    collapsedSummerFailureCount,
    showCollapsedSummerFailures: () => setShowSupersededSummerFailures(true),
    isLoadingConversation:
      chatMode === 'ov'
        ? isLoadingConversation
        : timelineState.phase === 'initial-loading' &&
          !!activeConversationId &&
          messages.length === 0,
    status,
    activeConversationId,
    /** Auto-generated or user-set conversation title (null if not yet generated) */
    conversationTitle,
    // Refs
    inputRef,
    // Handlers
    handleSubmit,
    handleRetry,
    handleSuggestedPrompt,
    handleInterruptAndSubmit,
    /** Programmatic message submission (for imperative use without input state) */
    submitMessage: doSubmit,
    setChatError,
    isRateLimited,
    /** Stop the current AI generation */
    stop,
  };
}

/** Existing hook consumers keep the subscribed input API; the transcript does not. */
export function useJovieChat(options: UseJovieChatOptions) {
  const controller = useJovieChatController(options);
  const input = useComposerDraft(controller.draft);
  return { ...controller, input };
}
