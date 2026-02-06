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

import type { ArtistContext, ChatError } from '../types';
import { MAX_MESSAGE_LENGTH, SUBMIT_THROTTLE_MS } from '../types';
import { getErrorType, getMessageText, getUserFriendlyMessage } from '../utils';

interface UseJovieChatOptions {
  /** Profile ID for server-side context fetching (preferred) */
  readonly profileId?: string;
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext;
  readonly conversationId?: string | null;
  readonly onConversationCreate?: (conversationId: string) => void;
}

/**
 * Extracts tool call data from message parts for persistence.
 */
function extractToolCalls(
  parts: Array<{ type: string; [key: string]: unknown }>
): Record<string, unknown>[] | undefined {
  const toolCalls = parts
    .filter(p => p.type === 'tool-invocation')
    .map(p => ({ type: p.type, toolInvocation: p.toolInvocation ?? p }));

  return toolCalls.length > 0 ? toolCalls : undefined;
}

export function useJovieChat({
  profileId,
  artistContext,
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

  // Mutations for persistence
  const createConversationMutation = useCreateConversationMutation();
  const addMessagesMutation = useAddMessagesMutation();

  // Load existing conversation if conversationId is provided
  const { data: existingConversation, isLoading: isLoadingConversation } =
    useChatConversationQuery({
      conversationId: activeConversationId,
      enabled: !!activeConversationId,
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

  // Convert loaded messages to the format useChat expects
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
        content: msg.content,
        parts: [{ type: 'text' as const, text: msg.content }],
        createdAt: new Date(msg.createdAt),
      })
    );
  }, [existingConversation]);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
    onError: error => {
      const errorType = getErrorType(error);
      let retryAfter: number | undefined;
      let errorCode: string | undefined;

      // Parse error response for rate limiting info
      try {
        const errorData = JSON.parse(error.message);
        retryAfter = errorData.retryAfter;
        errorCode = errorData.code || errorData.errorCode;
      } catch {
        // Not JSON, extract error code from message if present
        const codeMatch = error.message.match(/\[([A-Z_]+)\]/);
        errorCode = codeMatch?.[1];
      }

      setChatError({
        type: errorType,
        message: getUserFriendlyMessage(errorType, retryAfter),
        retryAfter,
        errorCode,
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
      lastAssistantMessage.parts as Array<{ type: string; [key: string]: unknown }>
    );

    const { userMessage } = pendingMessagesRef.current;

    if (userMessage) {
      const messagesToPersist: Array<{
        role: 'user' | 'assistant';
        content: string;
        toolCalls?: Record<string, unknown>[];
      }> = [
        { role: 'user', content: userMessage },
        {
          role: 'assistant',
          content: assistantText,
          ...(toolCalls ? { toolCalls } : {}),
        },
      ];

      addMessagesMutation.mutate(
        {
          conversationId: activeConversationId,
          messages: messagesToPersist,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: queryKeys.chat.conversation(activeConversationId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.chat.conversations(),
            });
          },
          onError: err => {
            console.error('[useJovieChat] Failed to save messages:', err);
            setChatError({
              type: 'server',
              message: 'Failed to save messages. Please try again.',
            });
          },
        }
      );
    }

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
    async (text: string) => {
      if (!text.trim() || isLoading || isSubmitting) return;

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

      // If no active conversation, create one first
      if (!activeConversationId) {
        try {
          const result = await createConversationMutation.mutateAsync({
            initialMessage: trimmedText,
          });
          setActiveConversationId(result.conversation.id);
          onConversationCreate?.(result.conversation.id);

          // Store pending message for later persistence
          pendingMessagesRef.current = {
            userMessage: trimmedText,
            assistantMessage: '', // Will be filled when response completes
          };
        } catch (err) {
          console.error('[useJovieChat] Failed to create conversation:', err);
          setChatError({
            type: 'server',
            message: 'Failed to create conversation',
            failedMessage: trimmedText,
          });
          setIsSubmitting(false);
          return;
        }
      } else {
        // Store pending message for persistence
        pendingMessagesRef.current = {
          userMessage: trimmedText,
          assistantMessage: '', // Will be filled when response completes
        };
      }

      sendMessage({ text: trimmedText });
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
    (e?: React.FormEvent) => {
      e?.preventDefault();
      throttledSubmit(input);
    },
    [input, throttledSubmit]
  );

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    setInput(prompt);
    // Focus the input after setting the prompt
    inputRef.current?.focus();
  }, []);

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
