'use client';

import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useThrottledCallback } from '@/lib/pacer';
import { queryKeys } from '@/lib/queries/keys';
import { useChatConversationQuery } from '@/lib/queries/useChatConversationQuery';
import {
  useAddMessagesMutation,
  useCreateConversationMutation,
} from '@/lib/queries/useChatMutations';

import type { ArtistContext, ChatError, FileUIPart } from '../types';
import { MAX_MESSAGE_LENGTH, SUBMIT_THROTTLE_MS } from '../types';
import {
  extractErrorMetadata,
  getErrorType,
  getMessageText,
  getUserFriendlyMessage,
} from '../utils';

interface UseJovieChatOptions {
  /** Profile ID for server-side context fetching (preferred) */
  readonly profileId?: string;
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext; // NOSONAR - kept for backward compatibility
  readonly conversationId?: string | null;
  readonly onConversationCreate?: (conversationId: string) => void;
}

/**
 * Extracts tool call data from message parts for persistence.
 * Only includes parts that have a toolInvocation property to ensure consistent shape.
 */
function extractToolCalls(
  parts: Array<{ type: string; [key: string]: unknown }>
): Record<string, unknown>[] | undefined {
  const toolCalls = parts
    .filter(p => p.type === 'tool-invocation' && p.toolInvocation != null)
    .map(p => ({ type: p.type, toolInvocation: p.toolInvocation }));

  return toolCalls.length > 0 ? toolCalls : undefined;
}

/** Interval (ms) to poll for auto-generated title after first message. */
const TITLE_POLL_INTERVAL_MS = 2_000;

/** Max duration (ms) to keep polling before giving up. */
const TITLE_POLL_MAX_DURATION_MS = 15_000;

export function useJovieChat({
  profileId,
  artistContext, // NOSONAR - kept for backward compatibility
  conversationId,
  onConversationCreate,
}: UseJovieChatOptions) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAttemptedMessageRef = useRef<string>('');
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId ?? null);
  const pendingMessagesRef = useRef<{
    userMessage: string;
    assistantMessage: string;
    toolCalls?: Record<string, unknown>[];
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
  const shouldPollForTitle =
    titlePollingSince !== null &&
    Date.now() - titlePollingSince < TITLE_POLL_MAX_DURATION_MS;

  // Load existing conversation if conversationId is provided.
  // When title is pending, enable refetchInterval to poll for the generated title.
  const { data: existingConversation, isLoading: isLoadingConversation } =
    useChatConversationQuery({
      conversationId: activeConversationId,
      enabled: !!activeConversationId,
      refetchInterval: shouldPollForTitle ? TITLE_POLL_INTERVAL_MS : false,
    });

  // Create transport: prefer profileId for server-side fetching, fall back to artistContext
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: profileId ? { profileId } : { artistContext },
      }),
    [profileId, artistContext]
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
        parts: [{ type: 'text' as const, text: msg.content }],
        createdAt: new Date(msg.createdAt),
      })
    );
  }, [existingConversation]);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    onError: error => {
      const errorType = getErrorType(error);
      const metadata = extractErrorMetadata(error);

      setChatError({
        type: errorType,
        message: getUserFriendlyMessage(errorType, metadata.retryAfter),
        retryAfter: metadata.retryAfter,
        errorCode: metadata.errorCode,
        requestId: metadata.requestId,
        failedMessage: lastAttemptedMessageRef.current,
      });

      // Restore the user's message so they don't lose it
      if (lastAttemptedMessageRef.current) {
        setInput(lastAttemptedMessageRef.current);
      }

      setIsSubmitting(false);
    },
  });

  // Sync initial messages when loaded
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  const isLoading = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

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
    if (input && chatError) {
      setChatError(null);
    }
  }, [input, chatError]);

  // Sync activeConversationId when parent prop changes
  useEffect(() => {
    setActiveConversationId(conversationId ?? null);
  }, [conversationId]);

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
    if (!assistantText) {
      // Assistant message exists but has no text yet - leave pending
      return;
    }

    // Extract tool calls for persistence
    const toolCalls = extractToolCalls(
      lastAssistantMessage.parts as Array<{
        type: string;
        [key: string]: unknown;
      }>
    );

    const { userMessage } = pendingMessagesRef.current;

    // Build messages to persist - user message may be empty if already persisted during conversation creation
    const messagesToPersist: Array<{
      role: 'user' | 'assistant';
      content: string;
      toolCalls?: Record<string, unknown>[];
    }> = [];

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
        },
        onError: err => {
          console.error('[useJovieChat] Failed to save messages:', err);
          setChatError({
            type: 'server',
            message:
              'Your response arrived, but we could not save it yet. Please retry in a moment.',
            errorCode: 'MESSAGE_PERSIST_FAILED',
            failedMessage: lastAttemptedMessageRef.current,
          });
        },
      }
    );

    // Successfully extracted and dispatched — clear pending
    pendingMessagesRef.current = null;
    setIsSubmitting(false);
  }, [
    status,
    activeConversationId,
    addMessagesMutation,
    queryClient,
    messages,
  ]);

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

      // Store the message before sending (in case of error)
      lastAttemptedMessageRef.current = trimmedText;

      setChatError(null);
      setIsSubmitting(true);

      if (activeConversationId) {
        // Store pending message for persistence (both user and assistant)
        pendingMessagesRef.current = {
          userMessage: trimmedText,
          assistantMessage: '', // Will be filled when response completes
        };
      } else {
        // No active conversation, create one first
        try {
          const result = await createConversationMutation.mutateAsync({
            initialMessage: trimmedText || '(image attachment)',
          });
          setActiveConversationId(result.conversation.id);
          onConversationCreate?.(result.conversation.id);

          // User message already persisted via initialMessage in conversation creation.
          // Only store pending ref to persist the assistant response.
          pendingMessagesRef.current = {
            userMessage: '', // Empty - already persisted via initialMessage
            assistantMessage: '', // Will be filled when response completes
          };
        } catch (err) {
          console.error('[useJovieChat] Failed to create conversation:', err);
          setChatError({
            type: 'server',
            message:
              'We could not start a new conversation right now. Please try again.',
            errorCode: 'CONVERSATION_CREATE_FAILED',
            failedMessage: trimmedText,
          });
          setIsSubmitting(false);
          return;
        }
      }

      sendMessage({
        text: trimmedText,
        ...(hasFiles ? { files } : {}),
      });
      setInput('');

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    },
    [
      isLoading,
      isSubmitting,
      sendMessage,
      activeConversationId,
      createConversationMutation,
      onConversationCreate,
    ]
  );

  // Retry the last failed message
  const handleRetry = useCallback(() => {
    if (chatError?.failedMessage) {
      setChatError(null);
      doSubmit(chatError.failedMessage);
    }
  }, [chatError, doSubmit]);

  // Throttled submit to prevent rapid submissions
  const throttledSubmit = useThrottledCallback(doSubmit, {
    wait: SUBMIT_THROTTLE_MS,
    leading: true,
    trailing: false,
  });

  const handleSubmit = useCallback(
    (e?: React.FormEvent, files?: FileUIPart[]) => {
      e?.preventDefault();
      throttledSubmit(input, files);
    },
    [input, throttledSubmit]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      doSubmit(prompt);
    },
    [doSubmit]
  );

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
  };
}
