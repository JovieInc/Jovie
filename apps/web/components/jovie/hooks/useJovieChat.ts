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
  readonly artistContext: ArtistContext;
  readonly conversationId?: string | null;
  readonly onConversationCreate?: (conversationId: string) => void;
}

export function useJovieChat({
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

  // Create transport with artist context in body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { artistContext },
      }),
    [artistContext]
  );

  // Convert loaded messages to the format useChat expects
  const initialMessages = useMemo(() => {
    if (!existingConversation?.messages) return undefined;
    return existingConversation.messages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      parts: [{ type: 'text' as const, text: msg.content }],
      createdAt: new Date(msg.createdAt),
    }));
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

  // Save messages to database when streaming completes
  // Consolidated: first extract assistant message, then persist
  useEffect(() => {
    if (status !== 'ready') return;

    // Extract assistant message from completed stream
    if (messages.length >= 2 && pendingMessagesRef.current) {
      const lastAssistantMessage = [...messages]
        .reverse()
        .find(m => m.role === 'assistant');

      if (lastAssistantMessage) {
        pendingMessagesRef.current.assistantMessage = getMessageText(
          lastAssistantMessage.parts
        );
      }
    }

    if (pendingMessagesRef.current && activeConversationId) {
      const { userMessage, assistantMessage } = pendingMessagesRef.current;

      // Only save if we have both messages
      if (userMessage && assistantMessage) {
        addMessagesMutation.mutate(
          {
            conversationId: activeConversationId,
            messages: [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: assistantMessage },
            ],
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

      pendingMessagesRef.current = null;
      setIsSubmitting(false);
    } else {
      setIsSubmitting(false);
    }
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
    // Refs
    inputRef,
    // Handlers
    handleSubmit,
    handleRetry,
    handleSuggestedPrompt,
  };
}
