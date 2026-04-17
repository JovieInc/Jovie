'use client';

import { useChat } from '@ai-sdk/react';
import { useAsyncRateLimiter } from '@tanstack/react-pacer';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { matchCommand } from '@/lib/chat/command-registry';
import { consumePendingChatPrompt } from '@/lib/chat/open-chat-with-prompt';
import type {
  ChatPersistenceMessage,
  PendingToolPersistenceEnvelope,
} from '@/lib/chat/tool-events';
import { PACER_TIMING } from '@/lib/pacer/hooks/timing';
import {
  FetchError,
  queryKeys,
  useAddMessagesMutation,
  useChatConversationQuery,
  useCreateConversationMutation,
} from '@/lib/queries';
import { addBreadcrumb, captureException } from '@/lib/sentry/client-lite';
import { logger } from '@/lib/utils/logger';

import {
  extractPersistableToolCalls,
  hydratePersistedMessageParts,
} from '../message-parts';
import type { ArtistContext, ChatError, FileUIPart } from '../types';
import { MAX_MESSAGE_LENGTH } from '../types';
import {
  extractErrorMetadata,
  getErrorType,
  getMessageText,
  getPreferredErrorMessage,
} from '../utils';

interface UseJovieChatOptions {
  /** Profile ID for server-side context fetching (preferred) */
  readonly profileId?: string;
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext; // NOSONAR - kept for backward compatibility
  readonly conversationId?: string | null;
  readonly onConversationCreate?: (conversationId: string) => void;
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
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRateLimitHint, setShowRateLimitHint] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId ?? null);
  const pendingMessagesRef = useRef<PendingToolPersistenceEnvelope | null>(
    null
  );
  const pendingInitialSendRef = useRef<{
    text: string;
    files?: FileUIPart[];
  } | null>(null);
  /** Deferred navigation callback — called only after the AI stream completes
   *  to prevent component remount from killing the in-flight response (JOV-1233). */
  const deferredNavigationRef = useRef<{
    callback: (conversationId: string) => void;
    conversationId: string;
  } | null>(null);
  const queryClient = useQueryClient();

  // Track whether we're waiting for title generation from the server.
  // Set to a timestamp when title generation is initiated, cleared when title arrives.
  const [titlePollingSince, setTitlePollingSince] = useState<number | null>(
    null
  );

  // Mutations for persistence
  const createConversationMutation = useCreateConversationMutation();
  const addMessagesMutation = useAddMessagesMutation();

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
      }),
    [profileId, artistContext, activeConversationId]
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

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    stop: rawStop,
  } = useChat({
    id: activeConversationId ?? 'new-chat',
    transport,
    onError: error => {
      captureException(error, {
        tags: {
          feature: 'ai-chat',
          source: 'useJovieChat',
          errorType: 'stream',
        },
        extra: {
          profileId: profileId ?? null,
          conversationId: activeConversationId,
        },
      });

      const errorType = getErrorType(error);
      const metadata = extractErrorMetadata(error);

      setChatError({
        type: errorType,
        message: getPreferredErrorMessage(error, errorType, metadata),
        retryAfter: metadata.retryAfter,
        errorCode: metadata.errorCode,
        requestId: metadata.requestId,
        failedMessage: lastAttemptedMessageRef.current,
      });

      // Restore the user's message so they don't lose it
      if (lastAttemptedMessageRef.current) {
        setInput(lastAttemptedMessageRef.current);
      }

      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.usage(),
      });

      // Clear pending messages ref so the persistence effect doesn't
      // keep trying to find an assistant message that will never arrive
      pendingMessagesRef.current = null;
      setIsSubmitting(false);

      // Fire deferred navigation on error too so the URL updates (JOV-1233)
      if (deferredNavigationRef.current) {
        const { callback, conversationId: navId } =
          deferredNavigationRef.current;
        deferredNavigationRef.current = null;
        callback(navId);
      }
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
  // NOTE: We intentionally do NOT clear pendingMessagesRef here. When the stream
  // aborts, status will transition back to 'ready', and the persistence effect
  // needs pendingMessagesRef to still be populated so it can save the user message
  // (and any partial assistant response) to the database. Clearing it here would
  // cause aborted turns to silently disappear on reload.
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
      pendingMessagesRef.current = null;
    }, 30_000);

    return () => {
      globalThis.clearTimeout(safetyTimer);
    };
  }, [isSubmitting]);

  // Clear error when user starts typing
  useEffect(() => {
    if (input && chatError) {
      setChatError(null);
    }
  }, [input, chatError]);

  // Sync activeConversationId when parent prop changes
  useEffect(() => {
    setActiveConversationId(conversationId ?? null);
  }, [conversationId]);

  // Ensure the first message in a new chat is sent only after activeConversationId
  // has been committed, so transport includes conversationId on the request.
  // Navigation is deferred until the stream completes to prevent the component
  // remount from killing the in-flight AI response (JOV-1233).
  useEffect(() => {
    if (!activeConversationId || !pendingInitialSendRef.current) return;

    const pendingPayload = pendingInitialSendRef.current;
    pendingInitialSendRef.current = null;

    sendMessage({
      text: pendingPayload.text,
      ...(pendingPayload.files && pendingPayload.files.length > 0
        ? { files: pendingPayload.files }
        : {}),
    });
  }, [activeConversationId, sendMessage]);

  // Save messages to database when streaming completes.
  // FIX: Don't clear pendingMessagesRef unless we successfully extracted the
  // assistant message. If the assistant message is empty, leave the ref so
  // the next render (when messages updates) will try extraction again.
  useEffect(() => {
    if (status !== 'ready') return;
    if (!pendingMessagesRef.current) {
      setIsSubmitting(false);
      return;
    }
    if (!activeConversationId) {
      // No conversation yet - wait for it
      return;
    }

    // Extract assistant message from the completed stream
    const lastAssistantMessage = [...messages]
      .reverse()
      .find(m => m.role === 'assistant');

    if (!lastAssistantMessage) {
      // No assistant message yet - leave pending for next render
      return;
    }

    const assistantText = getMessageText(lastAssistantMessage.parts);
    const toolCalls = extractPersistableToolCalls(lastAssistantMessage.parts);

    if (!assistantText && (!toolCalls || toolCalls.length === 0)) {
      // Assistant message exists but has no persisted text or tool payload yet - leave pending
      return;
    }

    const { userMessage } = pendingMessagesRef.current;

    // Build messages to persist - user message may be empty if already persisted during conversation creation
    const messagesToPersist: ChatPersistenceMessage[] = [];

    if (userMessage) {
      messagesToPersist.push({ role: 'user', content: userMessage });
    }

    messagesToPersist.push({
      role: 'assistant',
      content: assistantText,
      ...(toolCalls ? { toolCalls } : {}),
    });

    addMessagesMutation.mutate(
      {
        conversationId: activeConversationId,
        messages: messagesToPersist,
      },
      {
        onSuccess: data => {
          pendingMessagesRef.current = null;
          setIsSubmitting(false);
          queryClient.invalidateQueries({
            queryKey: queryKeys.chat.conversation(activeConversationId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.chat.conversations(),
          });

          // If the server indicated title generation was kicked off,
          // start polling so the title auto-updates in sidebar + header.
          if (data?.titlePending) {
            setTitlePollingSince(Date.now());
          }

          if (!assistantText && toolCalls && toolCalls.length > 0) {
            addBreadcrumb({
              category: 'ai-chat',
              message: 'Persisted tool-only assistant response',
              level: 'info',
              data: {
                conversationId: activeConversationId,
                toolCount: toolCalls.length,
              },
            });
          }

          if (deferredNavigationRef.current) {
            const { callback, conversationId: navConversationId } =
              deferredNavigationRef.current;
            deferredNavigationRef.current = null;
            callback(navConversationId);
          }
        },
        onError: err => {
          const isTransient = err instanceof FetchError && err.isRetryable();

          if (isTransient) {
            addBreadcrumb({
              category: 'ai-chat',
              message: `Message persistence failed after retries: ${err.message}`,
              level: 'warning',
              data: {
                status: err.status,
                profileId: profileId ?? null,
                conversationId: activeConversationId,
              },
            });
          } else {
            captureException(err, {
              tags: {
                feature: 'ai-chat',
                source: 'useJovieChat',
                errorType: 'message-persistence',
              },
              extra: {
                profileId: profileId ?? null,
                conversationId: activeConversationId,
                messageCount: messagesToPersist.length,
              },
            });
          }
          logger.error('[useJovieChat] Failed to save messages:', err);
          setChatError({
            type: 'server',
            message:
              'Your response arrived, but we could not save it yet. Please retry in a moment.',
            errorCode: 'MESSAGE_PERSIST_FAILED',
            failedMessage: lastAttemptedMessageRef.current,
          });
          setIsSubmitting(false);
        },
      }
    );
  }, [
    status,
    activeConversationId,
    addMessagesMutation,
    queryClient,
    messages,
    profileId,
  ]);

  // Extracted helper: create a new conversation and set up pending refs.
  // Returns true on success, false on failure (error state already set).
  const handleCreateConversation = useCallback(
    async (
      trimmedText: string,
      payload: { text: string; files?: FileUIPart[] }
    ): Promise<boolean> => {
      try {
        const result = await createConversationMutation.mutateAsync({
          initialMessage: trimmedText || '(image attachment)',
        });
        setActiveConversationId(result.conversation.id);

        // User message already persisted via initialMessage in conversation creation.
        // Only store pending ref to persist the assistant response.
        pendingMessagesRef.current = {
          userMessage: '', // Empty - already persisted via initialMessage
        };

        // Store the send payload for the effect that fires after activeConversationId updates.
        pendingInitialSendRef.current = payload;

        // Defer navigation until the AI stream completes (status === 'ready').
        // Navigating earlier would remount the component and kill the stream (JOV-1233).
        if (onConversationCreate) {
          deferredNavigationRef.current = {
            callback: onConversationCreate,
            conversationId: result.conversation.id,
          };
        }

        setInput('');

        return true;
      } catch (err) {
        // Transient server errors (5xx, timeout, rate-limit) were already
        // retried by TanStack Query. Only log a breadcrumb to reduce Sentry
        // noise for temporary outages (JOV-1352).
        const isTransient = err instanceof FetchError && err.isRetryable();

        if (isTransient) {
          addBreadcrumb({
            category: 'ai-chat',
            message: `Conversation create failed after retries: ${err.message}`,
            level: 'warning',
            data: {
              status: err.status,
              profileId: profileId ?? null,
            },
          });
        } else {
          captureException(err, {
            tags: {
              feature: 'ai-chat',
              source: 'useJovieChat',
              errorType: 'conversation-create',
            },
            extra: {
              profileId: profileId ?? null,
              conversationId: activeConversationId,
            },
          });
        }
        logger.error('[useJovieChat] Failed to create conversation:', err);
        setChatError({
          type: 'server',
          message:
            'We could not start a new conversation right now. Please try again.',
          errorCode: 'CONVERSATION_CREATE_FAILED',
          failedMessage: trimmedText,
        });
        setIsSubmitting(false);
        return false;
      }
    },
    [
      createConversationMutation,
      onConversationCreate,
      setActiveConversationId,
      profileId,
      activeConversationId,
      setInput,
      setChatError,
      setIsSubmitting,
    ]
  );

  /** Try to handle text as a deterministic command. Returns true if handled. */
  const tryHandleCommand = useCallback(
    (trimmedText: string): boolean => {
      const commandCtx = { username, router };
      const command = matchCommand(trimmedText, commandCtx);
      if (!command) return false;

      const userMsg = {
        id: `cmd-user-${Date.now()}`,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: trimmedText }],
        createdAt: new Date(),
      };
      const assistantMsg = {
        id: `cmd-assistant-${Date.now()}`,
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
    async (text: string, files?: FileUIPart[]) => {
      const hasFiles = files && files.length > 0;
      if (!text.trim() && !hasFiles) return;
      if (isLoading || isSubmitting) return;

      // Validate message length
      if (text.length > MAX_MESSAGE_LENGTH) {
        setChatError({
          type: 'unknown',
          message: `Message is too long. Maximum is ${MAX_MESSAGE_LENGTH} characters.`,
        });
        return;
      }

      const trimmedText = text.trim();

      // Check for deterministic commands before hitting AI
      if (!hasFiles && tryHandleCommand(trimmedText)) return;

      const payload = {
        text: trimmedText,
        ...(hasFiles ? { files } : {}),
      };

      // Store the message before sending (in case of error)
      lastAttemptedMessageRef.current = trimmedText;

      setChatError(null);
      setIsSubmitting(true);

      if (activeConversationId) {
        // Store pending message for persistence (both user and assistant)
        pendingMessagesRef.current = {
          userMessage: trimmedText,
        };
      } else {
        // No active conversation — create one first, then return
        // (sendMessage is dispatched by the effect watching activeConversationId)
        const created = await handleCreateConversation(trimmedText, payload);
        if (!created) return;
        return;
      }

      sendMessage(payload);
      setInput('');
    },
    [
      isLoading,
      isSubmitting,
      sendMessage,
      activeConversationId,
      handleCreateConversation,
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
    async ({ text, files }: { text: string; files?: FileUIPart[] }) => {
      await doSubmit(text, files);
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
      rateLimitedSubmitter.maybeExecute({ text: input, files });
    },
    [input, rateLimitedSubmitter]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      rateLimitedSubmitter.maybeExecute({ text: prompt });
    },
    [rateLimitedSubmitter]
  );

  useEffect(() => {
    const pendingPrompt = consumePendingChatPrompt();
    if (!pendingPrompt) return;

    rateLimitedSubmitter.maybeExecute({ text: pendingPrompt });
  }, [rateLimitedSubmitter]);

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

  return {
    // State
    input,
    setInput,
    messages,
    chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    isLoadingConversation: isLoadingConversation && !!activeConversationId,
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
