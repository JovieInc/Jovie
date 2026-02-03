'use client';

import { useChat } from '@ai-sdk/react';
import { Button } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport } from 'ai';
import {
  AlertCircle,
  ArrowUp,
  Loader2,
  RefreshCw,
  User,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// eslint-disable-next-line no-restricted-imports -- Direct file import, not barrel
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useThrottledCallback } from '@/lib/pacer';
import { queryKeys } from '@/lib/queries/keys';
import { useChatConversationQuery } from '@/lib/queries/useChatConversationQuery';
import {
  useAddMessagesMutation,
  useCreateConversationMutation,
} from '@/lib/queries/useChatMutations';
import { cn } from '@/lib/utils';

interface ArtistContext {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly profileViews: number;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks: boolean;
  readonly tippingStats: {
    readonly tipClicks: number;
    readonly tipsSubmitted: number;
    readonly totalReceivedCents: number;
    readonly monthReceivedCents: number;
  };
}

interface JovieChatProps {
  readonly artistContext: ArtistContext;
  /** Conversation ID to load and continue */
  readonly conversationId?: string | null;
  /** Callback when a new conversation is created */
  readonly onConversationCreate?: (conversationId: string) => void;
}

/** Maximum allowed message length */
const MAX_MESSAGE_LENGTH = 4000;

/** Minimum time between message submissions (ms) */
const SUBMIT_THROTTLE_MS = 1000;

const SUGGESTED_PROMPTS = [
  'What should I focus on this week?',
  'How can I grow my audience?',
  'What are my strengths based on my profile?',
  "Help me understand what's working",
];

// Helper to extract text content from message parts
function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('');
}

type ChatErrorType = 'network' | 'rate_limit' | 'server' | 'unknown';

interface ChatError {
  readonly type: ChatErrorType;
  readonly message: string;
  readonly retryAfter?: number;
  readonly errorCode?: string;
  readonly failedMessage?: string;
}

function getErrorType(error: Error): ChatErrorType {
  const msg = error.message.toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('offline')
  ) {
    return 'network';
  }
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('429')) {
    return 'rate_limit';
  }
  if (msg.includes('500') || msg.includes('server')) {
    return 'server';
  }
  return 'unknown';
}

function getUserFriendlyMessage(
  type: ChatErrorType,
  retryAfter?: number
): string {
  switch (type) {
    case 'network':
      return 'Unable to connect. Please check your internet connection.';
    case 'rate_limit':
      return retryAfter
        ? `Too many requests. Please wait ${retryAfter} seconds.`
        : 'Too many requests. Please wait a moment.';
    case 'server':
      return 'We encountered a temporary issue. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function getNextStepMessage(type: ChatErrorType): string {
  switch (type) {
    case 'network':
      return 'Check your connection and try again';
    case 'rate_limit':
      return 'Wait a moment, then try again';
    case 'server':
      return 'Try again or contact support if this persists';
    default:
      return 'Try again or contact support';
  }
}

interface ErrorDisplayProps {
  readonly chatError: ChatError;
  readonly onRetry: () => void;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
}

function ErrorDisplay({
  chatError,
  onRetry,
  isLoading,
  isSubmitting,
}: ErrorDisplayProps) {
  const ErrorIcon = chatError.type === 'network' ? WifiOff : AlertCircle;

  return (
    <div className='flex items-start gap-3 rounded-xl border border-error/20 bg-error-subtle p-4'>
      <ErrorIcon className='mt-0.5 h-5 w-5 shrink-0 text-error' />
      <div className='flex-1 space-y-2'>
        <div>
          <p className='text-sm font-medium text-primary-token'>
            {chatError.message}
          </p>
          <p className='mt-1 text-xs text-secondary-token'>
            {getNextStepMessage(chatError.type)}
            {chatError.errorCode && (
              <span className='ml-2 font-mono text-tertiary-token'>
                ({chatError.errorCode})
              </span>
            )}
          </p>
        </div>
        {chatError.failedMessage && !chatError.retryAfter && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onRetry}
            disabled={isLoading || isSubmitting}
            className='h-8 gap-2'
          >
            <RefreshCw className='h-3.5 w-3.5' />
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function JovieChat({
  artistContext,
  conversationId,
  onConversationCreate,
}: JovieChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Save messages to database when streaming completes
  useEffect(() => {
    if (
      status === 'ready' &&
      pendingMessagesRef.current &&
      activeConversationId
    ) {
      const { userMessage, assistantMessage } = pendingMessagesRef.current;

      // Only save if we have both messages
      if (userMessage && assistantMessage) {
        // Save both messages to database
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
              // Invalidate conversation query to refresh data
              queryClient.invalidateQueries({
                queryKey: queryKeys.chat.conversation(activeConversationId),
              });
              queryClient.invalidateQueries({
                queryKey: queryKeys.chat.conversations(),
              });
            },
          }
        );
      }

      pendingMessagesRef.current = null;
      setIsSubmitting(false);
    } else if (status === 'ready') {
      setIsSubmitting(false);
    }
  }, [status, activeConversationId, addMessagesMutation, queryClient]);

  // Track assistant response for persistence
  useEffect(() => {
    if (status === 'ready' && messages.length >= 2) {
      // Find last assistant message (reverse to find from end)
      const lastAssistantMessage = [...messages]
        .reverse()
        .find(m => m.role === 'assistant');

      if (lastAssistantMessage && pendingMessagesRef.current) {
        pendingMessagesRef.current.assistantMessage = getMessageText(
          lastAssistantMessage.parts
        );
      }
    }
  }, [status, messages]);

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
        } catch {
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
  }, []);

  // Character count display
  const characterCount = input.length;
  const isNearLimit = characterCount > MAX_MESSAGE_LENGTH * 0.9;
  const isOverLimit = characterCount > MAX_MESSAGE_LENGTH;

  // Show loading state while fetching existing conversation
  if (isLoadingConversation && activeConversationId) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Loader2 className='h-8 w-8 animate-spin text-secondary-token' />
      </div>
    );
  }

  return (
    <div className='flex h-full flex-col'>
      {hasMessages ? (
        // Chat view - messages + input at bottom
        <>
          {/* Messages area */}
          <div className='flex-1 overflow-y-auto px-4 py-6'>
            <div className='mx-auto max-w-2xl space-y-6'>
              {messages.map(message => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                      <BrandLogo size={16} tone='auto' />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      message.role === 'user'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-surface-2 text-primary-token'
                    )}
                  >
                    <div className='whitespace-pre-wrap text-sm leading-relaxed'>
                      {getMessageText(message.parts)}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                      <User className='h-4 w-4 text-secondary-token' />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className='flex gap-3'>
                  <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                    <BrandLogo size={16} tone='auto' />
                  </div>
                  <div className='rounded-2xl bg-surface-2 px-4 py-3'>
                    <Loader2 className='h-4 w-4 animate-spin text-secondary-token' />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Error display in chat view */}
          {chatError && (
            <div className='px-4 pb-3'>
              <div className='mx-auto max-w-2xl'>
                <ErrorDisplay
                  chatError={chatError}
                  onRetry={handleRetry}
                  isLoading={isLoading}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          )}

          {/* Input at bottom */}
          <div className='border-t border-subtle px-4 py-4'>
            <form onSubmit={handleSubmit} className='mx-auto max-w-2xl'>
              <div className='relative'>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder='Ask a follow-up...'
                  rows={1}
                  className={cn(
                    'w-full resize-none rounded-xl border bg-surface-1 px-4 py-3 pr-14',
                    'text-primary-token placeholder:text-tertiary-token',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-1',
                    'transition-colors duration-fast',
                    'max-h-32',
                    isOverLimit
                      ? 'border-error focus:border-error focus:ring-error/20'
                      : 'border-subtle focus:border-accent focus:ring-accent/20'
                  )}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  maxLength={MAX_MESSAGE_LENGTH + 100}
                  aria-label='Chat message input'
                />
                <Button
                  type='submit'
                  size='icon'
                  disabled={
                    !input.trim() || isLoading || isSubmitting || isOverLimit
                  }
                  className='absolute bottom-2 right-2 h-8 w-8 rounded-lg'
                  aria-label='Send message'
                >
                  {isLoading || isSubmitting ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <ArrowUp className='h-4 w-4' />
                  )}
                </Button>

                {/* Character count in chat view */}
                {isNearLimit && (
                  <div
                    className={cn(
                      'absolute bottom-2 left-3 text-xs',
                      isOverLimit ? 'text-error' : 'text-tertiary-token'
                    )}
                  >
                    {characterCount}/{MAX_MESSAGE_LENGTH}
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      ) : (
        // Empty state - centered content
        <div className='flex flex-1 flex-col items-center justify-center px-4'>
          <div className='w-full max-w-2xl space-y-8'>
            {/* Error display */}
            {chatError && (
              <ErrorDisplay
                chatError={chatError}
                onRetry={handleRetry}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
              />
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className='relative'>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder='What do you wanna ask Jovie?'
                className={cn(
                  'w-full resize-none rounded-xl border bg-surface-1 px-4 py-4 pr-14',
                  'text-primary-token placeholder:text-tertiary-token',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-1',
                  'transition-colors duration-fast',
                  'min-h-[120px]',
                  isOverLimit
                    ? 'border-error focus:border-error focus:ring-error/20'
                    : 'border-subtle focus:border-accent focus:ring-accent/20'
                )}
                onKeyDown={handleKeyDown}
                maxLength={MAX_MESSAGE_LENGTH + 100} // Allow slight overflow for UX
                aria-label='Chat message input'
                aria-describedby={isOverLimit ? 'char-limit-error' : undefined}
              />
              <Button
                type='submit'
                size='icon'
                disabled={
                  !input.trim() || isLoading || isSubmitting || isOverLimit
                }
                className='absolute bottom-3 right-3 h-10 w-10 rounded-lg'
                aria-label='Send message'
              >
                {isLoading || isSubmitting ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <ArrowUp className='h-4 w-4' />
                )}
              </Button>

              {/* Character count */}
              {isNearLimit && (
                <div
                  id='char-limit-error'
                  className={cn(
                    'absolute bottom-3 left-3 text-xs',
                    isOverLimit ? 'text-error' : 'text-tertiary-token'
                  )}
                >
                  {characterCount}/{MAX_MESSAGE_LENGTH}
                </div>
              )}
            </form>

            {/* Suggested prompts */}
            <div className='space-y-3'>
              <p className='text-center text-sm text-tertiary-token'>
                Try asking about:
              </p>
              <div className='flex flex-wrap justify-center gap-2'>
                {SUGGESTED_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type='button'
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className={cn(
                      'rounded-full border border-subtle bg-surface-1 px-4 py-2 text-sm',
                      'text-secondary-token transition-colors duration-fast',
                      'hover:border-default hover:bg-surface-2 hover:text-primary-token',
                      'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:ring-offset-2'
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
