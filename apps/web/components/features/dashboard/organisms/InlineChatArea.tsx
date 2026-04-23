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
import { useVirtualizer } from '@tanstack/react-virtual';
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
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { useJovieChat } from '@/components/jovie/hooks';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import { type ArtistContext, type MessagePart } from '@/components/jovie/types';
import { getMessageText } from '@/components/jovie/utils';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

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

/** Memoized per-message renderer to avoid reprocessing tool invocations on every render. */
const InlineChatMessage = memo(function InlineChatMessage({
  message,
  profileId,
}: {
  message: { id: string; role: string; parts: MessagePart[] };
  profileId: string;
}) {
  const textContent = getMessageText(message.parts);

  return (
    <div className='space-y-3'>
      {textContent && (
        <div
          className={cn(
            'flex gap-3',
            message.role === 'user' ? 'justify-end' : 'justify-start'
          )}
        >
          {message.role === 'assistant' && (
            <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
              <BrandLogo size={14} tone='auto' />
            </div>
          )}
          <div
            className={cn(
              'max-w-[85%] rounded-xl px-3 py-2',
              message.role === 'user'
                ? 'bg-accent text-accent-foreground'
                : 'border border-(--linear-app-frame-seam) bg-surface-0 text-primary-token'
            )}
          >
            <div className='whitespace-pre-wrap text-[13px] leading-relaxed'>
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

      <div className='ml-10'>
        <ToolPartsRenderer
          parts={message.parts}
          profileId={profileId}
          variant='inline'
          hasMessageText={Boolean(textContent)}
        />
      </div>
    </div>
  );
});

export const InlineChatArea = forwardRef<
  InlineChatAreaRef,
  InlineChatAreaProps
>(({ artistContext, profileId, expanded = false, onExpandedChange }, ref) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
  const shouldVirtualizeMessages = messages.length > 12;

  // Virtualizer for inline chat messages
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 60,
    overscan: 5,
    measureElement: el => el.getBoundingClientRect().height,
  });

  // Auto-expand when messages arrive
  useEffect(() => {
    if (hasMessages && !expanded) {
      onExpandedChange?.(true);
    }
  }, [hasMessages, expanded, onExpandedChange]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && expanded) {
      if (shouldVirtualizeMessages) {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: 'end',
          behavior: 'smooth',
        });
      } else {
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer) {
          if (typeof scrollContainer.scrollTo === 'function') {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: 'smooth',
            });
          } else {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      }
    }
  }, [messages.length, expanded, shouldVirtualizeMessages, virtualizer]);

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
    <ContentSurfaceCard className='mb-4 overflow-hidden'>
      {/* Header - always visible when there are messages */}
      <button
        type='button'
        onClick={handleToggle}
        className='flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-2'
        aria-expanded={expanded}
      >
        <div className='flex items-center gap-2'>
          <BrandLogo size={16} tone='auto' />
          <span className='text-[13px] font-[510] text-primary-token'>
            Jovie
          </span>
          {messages.length > 0 && (
            <span className='text-[11px] text-tertiary-token'>
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
          <div
            ref={scrollContainerRef}
            className='max-h-80 overflow-y-auto px-4 py-4'
          >
            {shouldVirtualizeMessages ? (
              <div
                style={{
                  position: 'relative',
                  height: virtualizer.getTotalSize(),
                }}
              >
                {virtualizer.getVirtualItems().map(virtualItem => {
                  const message = messages[virtualItem.index];
                  return (
                    <div
                      key={message.id}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div className='pb-4'>
                        <InlineChatMessage
                          message={message}
                          profileId={profileId}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {messages.map(message => (
                  <div key={message.id} className='pb-4'>
                    <InlineChatMessage
                      message={message}
                      profileId={profileId}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Loading indicator — rendered outside virtualizer */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className='flex gap-3 pb-4'>
                <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                  <BrandLogo size={14} tone='auto' />
                </div>
                <div className='rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2'>
                  <Loader2 className='h-4 w-4 animate-spin text-secondary-token' />
                </div>
              </div>
            )}

            {/* Error display */}
            {chatError && (
              <div className='flex items-start gap-3 rounded-[10px] border border-error/20 bg-error-subtle p-3'>
                {chatError.type === 'network' ? (
                  <WifiOff className='mt-0.5 h-4 w-4 shrink-0 text-error' />
                ) : (
                  <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-error' />
                )}
                <div className='flex-1'>
                  <p className='text-[13px] text-primary-token'>
                    {chatError.message}
                  </p>
                  {chatError.failedMessage && !chatError.retryAfter && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      onClick={handleRetry}
                      disabled={isLoading || isSubmitting}
                      className='mt-2 h-7 gap-1.5 rounded-lg text-[11px] font-[510] tracking-[-0.01em]'
                    >
                      <RefreshCw className='h-3 w-3' />
                      Try again
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ContentSurfaceCard>
  );
});

InlineChatArea.displayName = 'InlineChatArea';
