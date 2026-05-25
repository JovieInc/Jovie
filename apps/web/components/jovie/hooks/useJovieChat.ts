'use client';

import { useChat } from '@ai-sdk/react';
import { useAsyncRateLimiter } from '@tanstack/react-pacer';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { track } from '@/lib/analytics';
import { matchCommand } from '@/lib/chat/command-registry';
import { consumePendingChatPrompt } from '@/lib/chat/open-chat-with-prompt';
import { useAppFlag } from '@/lib/flags/client';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import { queryKeys, useChatConversationQuery } from '@/lib/queries';
import { captureException } from '@/lib/sentry/client-lite';
import { logger } from '@/lib/utils/logger';

import { hydratePersistedMessageParts } from '../message-parts';
import {
  type ChatTimelineEvent,
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
  getPreferredErrorMessage,
} from '../utils';
import { composeMessage, useChipTray } from './useChipTray';

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
}

interface ChatTurnMetadata {
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractChatTurnMetadata(value: unknown): ChatTurnMetadata | null {
  if (!isRecord(value)) return null;
  const conversationId =
    typeof value.conversationId === 'string' ? value.conversationId : undefined;
  const turnId = typeof value.turnId === 'string' ? value.turnId : undefined;
  const requestId =
    typeof value.requestId === 'string' ? value.requestId : undefined;

  if (!conversationId && !turnId && !requestId) return null;
  return { conversationId, turnId, requestId };
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

  return mentionsAlbumArt && asksForGeneration && !asksForBrief
    ? 'album_art_generation'
    : null;
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

function getMessageParts(message: UIMessage | undefined): UIMessage['parts'] {
  return Array.isArray(message?.parts) ? message.parts : [];
}

function getLastAssistantMessage(messages: readonly UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      return messages[i];
    }
  }
  return undefined;
}

function getPartsSignature(parts: UIMessage['parts']): string {
  return JSON.stringify(parts);
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

function cacheTimelineState(state: ChatTimelineState) {
  if (!state.conversationId) return;
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

export function useJovieChat({
  profileId,
  artistContext, // NOSONAR - kept for backward compatibility
  conversationId,
  onConversationCreate,
  username,
}: UseJovieChatOptions) {
  const router = useRouter();
  const appleWalletProfilePassEnabled = useAppFlag('APPLE_WALLET_PROFILE_PASS');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAttemptedMessageRef = useRef<string>('');
  const activeClientTurnIdRef = useRef<string | null>(null);
  const streamRevisionRef = useRef(0);
  const lastAssistantPartsSignatureRef = useRef<string | null>(null);
  const loadedConversationIdsRef = useRef<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const chipTray = useChipTray();
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRateLimitHint, setShowRateLimitHint] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId ?? null);
  const queryClient = useQueryClient();
  const [timelineState, dispatchTimeline] = useReducer(
    reduceChatTimeline,
    activeConversationId,
    getCachedTimelineState
  );
  const timelineStateRef = useRef(timelineState);
  useEffect(() => {
    timelineStateRef.current = timelineState;
    cacheTimelineState(timelineState);
  }, [timelineState]);
  const dispatchTimelineEvent = useCallback((event: ChatTimelineEvent) => {
    const previousState = timelineStateRef.current;
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
      };

      logger.info('chat_timeline.transition', payload, 'chat-timeline');
      try {
        track('chat_timeline.transition', payload);
      } catch {
        // Analytics failures must not affect chat state.
      }
    }

    dispatchTimeline(event);
  }, []);
  const messages = selectRenderableMessages(timelineState);

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
      // Reserving a server conversation updates browser history only. Switching
      // the hook's chat id before the AI SDK stream finishes recreates the
      // internal chat instance and drops in-flight tokens.
      if (isNewConversation && phase === 'completed') {
        setActiveConversationId(nextConversationId);
      }

      if (phase === 'completed') {
        onConversationCreate?.(nextConversationId, phase);
      }
    },
    [activeConversationId, onConversationCreate]
  );

  // Determine whether to poll: only while we're actively waiting for a title
  // and haven't exceeded the max poll duration.
  const titlePollIntervalMs = getTitlePollIntervalMs(
    titlePollingSince,
    Date.now()
  );

  // Load existing conversation if conversationId is provided.
  // When title is pending, enable refetchInterval to poll for the generated title.
  const { data: existingConversation, isLoading: isLoadingConversation } =
    useChatConversationQuery({
      conversationId: activeConversationId,
      enabled: !!activeConversationId,
      refetchInterval: titlePollIntervalMs,
    });

  // Create transport: prefer profileId for server-side fetching, fall back to artistContext
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: {
          ...(profileId ? { profileId } : { artistContext }),
          ...(activeConversationId
            ? { conversationId: activeConversationId }
            : {}),
        },
        fetch: async (input, init) => {
          const response = await globalThis.fetch(input, init);
          const serverConversationId =
            response.headers.get('x-conversation-id');
          const serverTurnId = response.headers.get('x-chat-turn-id');
          const clientTurnId = activeClientTurnIdRef.current;
          if (serverConversationId) {
            adoptServerConversationId(serverConversationId, 'reserved');
          }
          if (serverConversationId && clientTurnId) {
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
      adoptServerConversationId,
      dispatchTimelineEvent,
    ]
  );

  // Convert loaded messages to canonical timeline input. Query data feeds the
  // reducer as merge events; it never directly replaces rendered messages.
  const persistedTimelineMessages = useMemo(() => {
    if (!existingConversation?.messages) return undefined;
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
  }, [existingConversation]);

  const handleChatFailure = useCallback(
    (
      error: Error,
      errorType: 'send' | 'stream',
      clientTurnId = activeClientTurnIdRef.current
    ) => {
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

      setChatError({
        type: chatErrorType,
        message: getPreferredErrorMessage(error, chatErrorType, metadata),
        retryAfter: metadata.retryAfter,
        errorCode: metadata.errorCode,
        requestId: metadata.requestId,
        failedMessage: lastAttemptedMessageRef.current,
      });

      if (lastAttemptedMessageRef.current) {
        setInput(lastAttemptedMessageRef.current);
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
      setIsSubmitting(false);
    },
    [activeConversationId, dispatchTimelineEvent, profileId]
  );

  const {
    messages: sdkMessages,
    sendMessage,
    status,
    stop: rawStop,
  } = useChat({
    id: activeConversationId ?? 'new-chat',
    transport,
    onFinish: ({ message }) => {
      const metadata = extractChatTurnMetadata(message.metadata);
      const finishedConversationId =
        metadata?.conversationId ?? activeConversationId;
      const clientTurnId = activeClientTurnIdRef.current;

      if (clientTurnId) {
        dispatchTimelineEvent({
          type: 'assistant.stream.completed',
          conversationId: finishedConversationId,
          clientTurnId,
          turnId: metadata?.turnId,
          requestId: metadata?.requestId,
          parts: getMessageParts(message as UIMessage),
          now: Date.now(),
        });
      }
      if (metadata?.conversationId) {
        adoptServerConversationId(metadata.conversationId, 'completed');
      }

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
      setIsSubmitting(false);
    },
    onError: error => {
      handleChatFailure(error, 'stream', activeClientTurnIdRef.current);

      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.usage(),
      });
    },
  });

  // Query data merges into the canonical timeline. It must never replace the
  // rendered list wholesale because optimistic/streaming rows may be newer.
  useEffect(() => {
    if (!activeConversationId || !isLoadingConversation) return;
    if (loadedConversationIdsRef.current.has(activeConversationId)) return;
    dispatchTimelineEvent({
      type: 'conversation.load.started',
      conversationId: activeConversationId,
      requestId: activeConversationId,
      now: Date.now(),
    });
  }, [activeConversationId, dispatchTimelineEvent, isLoadingConversation]);

  useEffect(() => {
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
    loadedConversationIdsRef.current.add(activeConversationId);
  }, [
    activeConversationId,
    dispatchTimelineEvent,
    existingConversation?.conversation?.id,
    persistedTimelineMessages,
  ]);

  useEffect(() => {
    const clientTurnId = activeClientTurnIdRef.current;
    if (!clientTurnId) return;

    const assistantMessage = getLastAssistantMessage(sdkMessages);
    const parts = getMessageParts(assistantMessage);
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
    const signature = getPartsSignature(parts);
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
  }, [activeConversationId, dispatchTimelineEvent, sdkMessages, status]);

  // Wrap stop to clear submission state so the composer re-enables immediately
  // instead of waiting for the 30s safety timeout.
  const stop = useCallback(() => {
    const clientTurnId = activeClientTurnIdRef.current;
    rawStop();
    if (clientTurnId) {
      dispatchTimelineEvent({
        type: 'assistant.stream.failed',
        conversationId: activeConversationId,
        clientTurnId,
        requestId: clientTurnId,
        error: 'Response stopped.',
        now: Date.now(),
      });
      activeClientTurnIdRef.current = null;
    }
    setIsSubmitting(false);
  }, [activeConversationId, dispatchTimelineEvent, rawStop]);

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

  // Clear error when user starts typing
  useEffect(() => {
    if (
      input &&
      chatError &&
      (!chatError.failedMessage || input !== chatError.failedMessage)
    ) {
      setChatError(null);
    }
  }, [input, chatError]);

  // Sync activeConversationId when parent prop changes
  useEffect(() => {
    const nextConversationId = conversationId ?? null;
    if (activeConversationId === nextConversationId) {
      return;
    }

    if (activeConversationId && nextConversationId === null) {
      const reservedPath = `/app/chat/${encodeURIComponent(activeConversationId)}`;
      if (globalThis.location?.pathname === reservedPath) {
        return;
      }
    }

    setActiveConversationId(nextConversationId);
    activeClientTurnIdRef.current = null;
    streamRevisionRef.current = 0;
    lastAssistantPartsSignatureRef.current = null;
    dispatchTimelineEvent({
      type: 'conversation.switched',
      conversationId: nextConversationId,
      requestId: nextConversationId ?? 'new-chat',
      now: Date.now(),
    });
  }, [activeConversationId, conversationId, dispatchTimelineEvent]);

  /** Try to handle text as a deterministic command. Returns true if handled. */
  const tryHandleCommand = useCallback(
    (trimmedText: string): boolean => {
      const commandCtx = {
        username,
        appleWalletProfilePassAvailable:
          appleWalletProfilePassEnabled && Boolean(username),
        router,
      };
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
      setInput('');
      command.execute(commandCtx);
      return true;
    },
    [
      activeConversationId,
      appleWalletProfilePassEnabled,
      dispatchTimelineEvent,
      username,
      router,
      setInput,
    ]
  );

  // Core submit logic
  const doSubmit = useCallback(
    async (
      text: string,
      files?: FileUIPart[],
      options?: SubmitChatMessageOptions
    ): Promise<boolean> => {
      const hasFiles = files && files.length > 0;
      if (!text.trim() && !hasFiles) return false;
      if (isLoading || isSubmitting) return false;

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
      if (!hasFiles && tryHandleCommand(trimmedText)) return true;

      const payload = {
        text: trimmedText,
        ...(hasFiles ? { files } : {}),
      };

      // Store the message before sending (in case of error)
      lastAttemptedMessageRef.current = trimmedText;

      setChatError(null);
      setIsSubmitting(true);
      const clientTurnId = crypto.randomUUID();
      activeClientTurnIdRef.current = clientTurnId;
      streamRevisionRef.current = 0;
      lastAssistantPartsSignatureRef.current = null;
      const toolIntent =
        options?.toolIntent ?? inferToolIntentFromPrompt(trimmedText);

      const sendOptions = {
        body: {
          clientTurnId,
          clientMessageId: `${clientTurnId}:user`,
          source: options?.source ?? 'typed',
          ...(toolIntent ? { toolIntent } : {}),
        },
      };
      dispatchTimelineEvent({
        type: 'message.send.started',
        conversationId: activeConversationId,
        clientTurnId,
        clientMessageId: `${clientTurnId}:user`,
        requestId: clientTurnId,
        parts: [
          { type: 'text' as const, text: trimmedText },
          ...(files ?? []),
        ] as UIMessage['parts'],
        now: Date.now(),
      });

      try {
        const result = sendMessage(payload, sendOptions);
        setInput('');
        void Promise.resolve(result).catch(error_ => {
          handleChatFailure(toError(error_), 'send', clientTurnId);
        });
        return true;
      } catch (error) {
        handleChatFailure(toError(error), 'send', clientTurnId);
        return false;
      }
    },
    [
      activeConversationId,
      dispatchTimelineEvent,
      handleChatFailure,
      isLoading,
      isSubmitting,
      sendMessage,
      tryHandleCommand,
    ]
  );

  // Retry the last failed message
  const handleRetry = useCallback(() => {
    if (chatError?.failedMessage) {
      setChatError(null);
      doSubmit(chatError.failedMessage);
    }
  }, [chatError, doSubmit]);

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
          failedMessage: input,
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
      const composed = composeMessage(chipTray.chips, input);
      const skillChip = chipTray.chips.find(chip => chip.type === 'skill');
      rateLimitedSubmitter.maybeExecute({
        text: composed,
        files,
        source: skillChip ? 'slash_command' : 'typed',
        toolIntent: skillChip ? inferToolIntentFromSkill(skillChip.id) : null,
      });
    },
    [chipTray, input, rateLimitedSubmitter]
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

  // Consume a pending prompt set before the chat component mounted
  // (e.g. via "open-chat-with-prompt"). This is programmatic/automated, not
  // a repeated user action, so it bypasses the client-side rate limiter to
  // avoid consuming the first-message slot and blocking the user's first send.
  useEffect(() => {
    const pendingPrompt = consumePendingChatPrompt();
    if (!pendingPrompt) return;

    doSubmit(pendingPrompt);
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
    input,
    setInput,
    chipTray,
    messages,
    chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    isLoadingConversation:
      timelineState.phase === 'initial-loading' &&
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
    /** Programmatic message submission (for imperative use without input state) */
    submitMessage: doSubmit,
    setChatError,
    isRateLimited,
    /** Stop the current AI generation */
    stop,
  };
}
