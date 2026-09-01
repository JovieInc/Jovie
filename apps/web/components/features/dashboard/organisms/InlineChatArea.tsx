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

import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ChatMessage } from '@/components/jovie/components/ChatMessage';
import { ErrorDisplay } from '@/components/jovie/components/ErrorDisplay';
import { useJovieChat } from '@/components/jovie/hooks';
import type { ArtistContext } from '@/components/jovie/types';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

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

function getChatMessageRole(role: string): 'user' | 'assistant' | 'system' {
  if (role === 'user' || role === 'assistant') {
    return role;
  }

  return 'system';
}

const ASSISTANT_MESSAGE_ROLE = getChatMessageRole('assistant');

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
          <span className='text-app font-caption text-primary-token'>
            Jovie
          </span>
          {messages.length > 0 && (
            <span className='text-2xs text-tertiary-token'>
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
                        <ChatMessage
                          id={message.id}
                          role={getChatMessageRole(message.role)}
                          parts={message.parts}
                          profileId={profileId}
                          skipEntrance
                          toolVariant='inline'
                          showAssistantActions={false}
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
                    <ChatMessage
                      id={message.id}
                      role={getChatMessageRole(message.role)}
                      parts={message.parts}
                      profileId={profileId}
                      skipEntrance
                      toolVariant='inline'
                      showAssistantActions={false}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Loading indicator - rendered outside virtualizer */}
            {isLoading && messages.at(-1)?.role === 'user' && (
              <div className='pb-4'>
                <ChatMessage
                  id='inline-chat-loading'
                  role={ASSISTANT_MESSAGE_ROLE}
                  parts={[]}
                  isThinking
                  profileId={profileId}
                  renderTools={false}
                  skipEntrance
                  toolVariant='inline'
                  showAssistantActions={false}
                />
              </div>
            )}

            {/* Error display */}
            {chatError && (
              <div className='pb-4'>
                <ErrorDisplay
                  chatError={chatError}
                  onRetry={handleRetry}
                  isLoading={isLoading}
                  isSubmitting={isSubmitting}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </ContentSurfaceCard>
  );
});

InlineChatArea.displayName = 'InlineChatArea';
