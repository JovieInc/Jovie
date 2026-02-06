'use client';

/**
 * InlineChatArea Component
 *
 * Displays chat messages inline on the profile page, integrated with
 * the UniversalLinkInput for a unified links + chat experience.
 *
 * Refactored to use useJovieChat for shared persistence, error handling,
 * and race-condition-safe message saving.
 */

import { Button } from '@jovie/ui';
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
  useRef,
} from 'react';
// eslint-disable-next-line no-restricted-imports -- Direct file import, not barrel
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useJovieChat } from '@/components/jovie/hooks';
import type { ArtistContext } from '@/components/jovie/types';
import { getMessageText } from '@/components/jovie/utils';
import { cn } from '@/lib/utils';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from './ProfileEditPreviewCard';

interface InlineChatAreaProps {
  /** @deprecated Use profileId instead. Client-provided artist context for backward compatibility. */
  readonly artistContext?: ArtistContext;
  /** Profile ID for server-side context fetching and applying edits */
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

  // Use shared hook — handles persistence, error handling, and conversation management
  const {
    messages,
    chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    submitMessage,
    handleRetry,
  } = useJovieChat({
    profileId,
    artistContext,
  });

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

  // Expose submitMessage method via ref
  useImperativeHandle(
    ref,
    () => ({
      submitMessage,
      isLoading: isLoading || isSubmitting,
    }),
    [submitMessage, isLoading, isSubmitting]
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
