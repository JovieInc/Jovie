'use client';

import { useChat } from '@ai-sdk/react';
import { useAsyncRateLimiter } from '@tanstack/react-pacer';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchCommand } from '@/lib/chat/command-registry';
import { consumePendingChatPrompt } from '@/lib/chat/open-chat-with-prompt';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import { queryKeys, useChatConversationQuery } from '@/lib/queries';
import { captureException } from '@/lib/sentry/client-lite';

import { hydratePersistedMessageParts } from '../message-parts';
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

export function useJovieChat({
  profileId,
  artistContext, // NOSONAR - kept for backward compatibility
  conversationId,
  onConversationCreate,
  username,
}: UseJovieChatOptions) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAttemptedMessageRef = useRef<string>('');
  const hasHydratedRef = useRef<string | null>(null);
  const [input, setInput] = useState('');
  const chipTray = useChipTray();
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRateLimitHint, setShowRateLimitHint] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId ?? null);
  const queryClient = useQueryClient();

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
      if (isNewConversation) {
        setActiveConversationId(nextConversationId);
      }

      if (isNewConversation || phase === 'completed') {
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
          if (serverConversationId) {
            adoptServerConversationId(serverConversationId, 'reserved');
          }
          return response;
        },
      }),
    [profileId, artistContext, activeConversationId, adoptServerConversationId]
  );

  // Convert loaded messages to the UIMessage format useChat expects
  const initialMessages = useMemo(() => {
    if (!existingConversation?.messages) return undefined;
    return existingConversation.messages.map(
      (msg: {
        id: string;
        role: string;
        content: string;
        toolCalls?: unknown;
        createdAt: string;
      }) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: hydratePersistedMessageParts(
          msg.content,
          msg.toolCalls
        ) as UIMessage['parts'],
        createdAt: new Date(msg.createdAt),
      })
    );
  }, [existingConversation]);

  const handleChatFailure = useCallback(
    (error: Error, errorType: 'send' | 'stream') => {
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

      setIsSubmitting(false);
    },
    [activeConversationId, profileId]
  );

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    stop: rawStop,
  } = useChat({
    id: activeConversationId ?? 'new-chat',
    transport,
    onFinish: ({ message }) => {
      const metadata = extractChatTurnMetadata(message.metadata);
      const finishedConversationId =
        metadata?.conversationId ?? activeConversationId;

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

      setIsSubmitting(false);
    },
    onError: error => {
      handleChatFailure(error, 'stream');

      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.usage(),
      });
    },
  });

  // Sync initial messages when loaded — but only once per conversation to avoid
  // overwriting freshly streamed messages when the effect re-fires after
  // persistence refetch updates initialMessages.
  useEffect(() => {
    if (status !== 'ready') return;
    if (!initialMessages || initialMessages.length === 0) return;
    if (hasHydratedRef.current === activeConversationId) return;

    setMessages(initialMessages);
    hasHydratedRef.current = activeConversationId;
  }, [initialMessages, setMessages, status, activeConversationId]);

  // Wrap stop to clear submission state so the composer re-enables immediately
  // instead of waiting for the 30s safety timeout.
  const stop = useCallback(() => {
    rawStop();
    setIsSubmitting(false);
  }, [rawStop]);

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

  // Safety timeout: if isSubmitting stays true for more than 30 seconds,
  // force-clear it to prevent the input from being permanently blocked.
  // This guards against edge cases where the status/persistence effects
  // fail to clear the flag (e.g. stream silently drops, component re-mounts).
  useEffect(() => {
    if (!isSubmitting) return;

    const safetyTimer = globalThis.setTimeout(() => {
      setIsSubmitting(false);
    }, 30_000);

    return () => {
      globalThis.clearTimeout(safetyTimer);
    };
  }, [isSubmitting]);

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
    setActiveConversationId(conversationId ?? null);
  }, [conversationId]);

  /** Try to handle text as a deterministic command. Returns true if handled. */
  const tryHandleCommand = useCallback(
    (trimmedText: string): boolean => {
      const commandCtx = { username, router };
      const command = matchCommand(trimmedText, commandCtx);
      if (!command) return false;

      const userMsg = {
        id: `cmd-user-${crypto.randomUUID()}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: trimmedText }],
        createdAt: new Date(),
      };
      const assistantMsg = {
        id: `cmd-assistant-${crypto.randomUUID()}`,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: command.confirmationMessage }],
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setInput('');
      command.execute(commandCtx);
      return true;
    },
    [username, router, setMessages, setInput]
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

      try {
        const result = sendMessage(payload, sendOptions);
        setInput('');
        void Promise.resolve(result).catch(value => {
          handleChatFailure(toError(value), 'send');
        });
        return true;
      } catch (error) {
        handleChatFailure(toError(error), 'send');
        return false;
      }
    },
    [handleChatFailure, isLoading, isSubmitting, sendMessage, tryHandleCommand]
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
      isLoadingConversation && !!activeConversationId && messages.length === 0,
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
