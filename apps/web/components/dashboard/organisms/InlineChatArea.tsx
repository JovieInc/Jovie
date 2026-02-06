'use client';

/**
 * InlineChatArea Component
 *
 * Displays chat messages inline on the profile page, integrated with
 * the UniversalLinkInput for a unified links + chat experience.
 */

import { useChat } from '@ai-sdk/react';
import { Button } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { DefaultChatTransport } from 'ai';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  User,
  WifiOff,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { queryKeys } from '@/lib/queries/keys';
import {
  useAddMessagesMutation,
  useCreateConversationMutation,
} from '@/lib/queries/useChatMutations';
import { cn } from '@/lib/utils';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from './ProfileEditPreviewCard';

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

interface InlineChatAreaProps {
  readonly artistContext: ArtistContext;
  /** Profile ID for applying edits */
  readonly profileId: string;
  /** Whether the chat area is expanded */
  readonly expanded?: boolean;
  /** Callback when expanded state changes */
  readonly onExpandedChange?: (expanded: boolean) => void;
}

export interface InlineChatAreaRef {
  /** Submit a message to the chat */
  submitMessage: (message: string) => void;
  /** Whether chat is currently loading/streaming */
  isLoading: boolean;
}

type ChatErrorType = 'network' | 'rate_limit' | 'server' | 'unknown';

interface ChatError {
  readonly type: ChatErrorType;
  readonly message: string;
  readonly retryAfter?: number;
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

// Type for tool invocation parts
interface ToolInvocationPart {
  type: 'tool-invocation';
  toolInvocationId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'call' | 'result' | 'partial-call';
  result?: {
    success: boolean;
    preview?: ProfileEditPreview;
    error?: string;
  };
}

// Helper to check if a part is a tool invocation
function isToolInvocationPart(part: unknown): part is ToolInvocationPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    (part as { type: string }).type === 'tool-invocation'
  );
}

// Helper to extract tool invocation parts from message
function getToolInvocations(
  parts: Array<{ type: string }>
): ToolInvocationPart[] {
  return parts.filter(isToolInvocationPart);
}

export const InlineChatArea = forwardRef<
  InlineChatAreaRef,
  InlineChatAreaProps
>(({ artistContext, profileId, expanded = false, onExpandedChange }, ref) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAttemptedMessageRef = useRef<string>('');
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const pendingMessagesRef = useRef<{
    userMessage: string;
    assistantMessage: string;
  } | null>(null);
  const queryClient = useQueryClient();

  // Mutations for persistence
  const createConversationMutation = useCreateConversationMutation();
  const addMessagesMutation = useAddMessagesMutation();

  // Create transport with artist context in body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { artistContext },
      }),
    [artistContext]
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: error => {
      const errorType = getErrorType(error);
      let retryAfter: number | undefined;

      try {
        const errorData = JSON.parse(error.message);
        retryAfter = errorData.retryAfter;
      } catch {
        // Not JSON, ignore
      }

      setChatError({
        type: errorType,
        message: getUserFriendlyMessage(errorType, retryAfter),
        retryAfter,
        failedMessage: lastAttemptedMessageRef.current,
      });

      setIsSubmitting(false);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  // Auto-expand when messages arrive
  useEffect(() => {
    if (hasMessages && !expanded) {
      onExpandedChange?.(true);
    }
  }, [hasMessages, expanded, onExpandedChange]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && expanded) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  // Save messages to database when streaming completes
  useEffect(() => {
    if (
      status === 'ready' &&
      pendingMessagesRef.current &&
      activeConversationId
    ) {
      const { userMessage, assistantMessage } = pendingMessagesRef.current;

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

      const trimmedText = text.trim();
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

          pendingMessagesRef.current = {
            userMessage: trimmedText,
            assistantMessage: '',
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
        pendingMessagesRef.current = {
          userMessage: trimmedText,
          assistantMessage: '',
        };
      }

      sendMessage({ text: trimmedText });
    },
    [
      isLoading,
      isSubmitting,
      sendMessage,
      activeConversationId,
      createConversationMutation,
    ]
  );

  // Retry the last failed message
  const handleRetry = useCallback(() => {
    if (chatError?.failedMessage) {
      setChatError(null);
      doSubmit(chatError.failedMessage);
    }
  }, [chatError, doSubmit]);

  // Expose submitMessage method via ref
  useImperativeHandle(
    ref,
    () => ({
      submitMessage: doSubmit,
      isLoading: isLoading || isSubmitting,
    }),
    [doSubmit, isLoading, isSubmitting]
  );

  // Toggle expansion
  const handleToggle = useCallback(() => {
    onExpandedChange?.(!expanded);
  }, [expanded, onExpandedChange]);

  // Don't render anything if no messages and not loading
  if (!hasMessages && !isLoading && !chatError) {
    return null;
  }

  return (
    <div className='mb-4 overflow-hidden rounded-xl border border-subtle bg-surface-1'>
      {/* Header - always visible when there are messages */}
      <button
        type='button'
        onClick={handleToggle}
        className='flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-2'
      >
        <div className='flex items-center gap-2'>
          <BrandLogo size={16} tone='auto' />
          <span className='text-sm font-medium text-primary-token'>Jovie</span>
          {messages.length > 0 && (
            <span className='text-xs text-tertiary-token'>
              ({messages.length} messages)
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className='h-4 w-4 text-secondary-token' />
        ) : (
          <ChevronDown className='h-4 w-4 text-secondary-token' />
        )}
      </button>

      {/* Messages area - collapsible */}
      {expanded && (
        <div className='border-t border-subtle'>
          <div className='max-h-80 overflow-y-auto px-4 py-4'>
            <div className='space-y-4'>
              {messages.map(message => {
                const textContent = getMessageText(message.parts);
                const toolInvocations = getToolInvocations(message.parts);

                return (
                  <div key={message.id} className='space-y-3'>
                    {/* Text content */}
                    {textContent && (
                      <div
                        className={cn(
                          'flex gap-3',
                          message.role === 'user'
                            ? 'justify-end'
                            : 'justify-start'
                        )}
                      >
                        {message.role === 'assistant' && (
                          <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                            <BrandLogo size={14} tone='auto' />
                          </div>
                        )}
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3 py-2',
                            message.role === 'user'
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-surface-2 text-primary-token'
                          )}
                        >
                          <div className='whitespace-pre-wrap text-sm leading-relaxed'>
                            {textContent}
                          </div>
                        </div>
                        {message.role === 'user' && (
                          <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                            <User className='h-3.5 w-3.5 text-secondary-token' />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tool invocation results */}
                    {toolInvocations.map(toolInvocation => {
                      if (
                        toolInvocation.toolName === 'proposeProfileEdit' &&
                        toolInvocation.state === 'result' &&
                        toolInvocation.result?.success &&
                        toolInvocation.result.preview
                      ) {
                        return (
                          <div
                            key={toolInvocation.toolInvocationId}
                            className='ml-10'
                          >
                            <ProfileEditPreviewCard
                              preview={toolInvocation.result.preview}
                              profileId={profileId}
                            />
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                );
              })}

              {/* Loading indicator */}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className='flex gap-3'>
                  <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                    <BrandLogo size={14} tone='auto' />
                  </div>
                  <div className='rounded-2xl bg-surface-2 px-3 py-2'>
                    <Loader2 className='h-4 w-4 animate-spin text-secondary-token' />
                  </div>
                </div>
              )}

              {/* Error display */}
              {chatError && (
                <div className='flex items-start gap-3 rounded-xl border border-error/20 bg-error-subtle p-3'>
                  {chatError.type === 'network' ? (
                    <WifiOff className='mt-0.5 h-4 w-4 shrink-0 text-error' />
                  ) : (
                    <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
                  )}
                  <div className='flex-1'>
                    <p className='text-sm text-primary-token'>
                      {chatError.message}
                    </p>
                    {chatError.failedMessage && !chatError.retryAfter && (
                      <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        onClick={handleRetry}
                        disabled={isLoading || isSubmitting}
                        className='mt-2 h-7 gap-1.5 text-xs'
                      >
                        <RefreshCw className='h-3 w-3' />
                        Try again
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

InlineChatArea.displayName = 'InlineChatArea';
