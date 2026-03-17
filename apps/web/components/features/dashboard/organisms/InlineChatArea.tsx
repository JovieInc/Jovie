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
  useMemo,
  useRef,
} from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ChatAvatarUploadCard } from '@/components/jovie/components/ChatAvatarUploadCard';
import { ChatLinkConfirmationCard } from '@/components/jovie/components/ChatLinkConfirmationCard';
import { useJovieChat } from '@/components/jovie/hooks';
import {
  type ArtistContext,
  isToolInvocationPart,
  type SocialLinkToolResult,
  type ToolInvocationPart,
} from '@/components/jovie/types';
import { getMessageText } from '@/components/jovie/utils';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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

// Helper to extract tool invocation parts from message
function getToolInvocations(
  parts: Array<{ type: string }>
): ToolInvocationPart[] {
  return parts.filter(isToolInvocationPart);
}

/** Memoized per-message renderer to avoid reprocessing tool invocations on every render. */
const InlineChatMessage = memo(function InlineChatMessage({
  message,
  profileId,
}: {
  message: { id: string; role: string; parts: Array<{ type: string }> };
  profileId: string;
}) {
  const textContent = getMessageText(message.parts);
  const toolInvocations = useMemo(
    () => getToolInvocations(message.parts),
    [message.parts]
  );

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
            <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--linear-bg-surface-2)'>
              <BrandLogo size={14} tone='auto' />
            </div>
          )}
          <div
            className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2',
              message.role === 'user'
                ? 'bg-accent text-accent-foreground'
                : 'bg-(--linear-bg-surface-2) text-(--linear-text-primary)'
            )}
          >
            <div className='whitespace-pre-wrap text-[13px] leading-relaxed'>
              {textContent}
            </div>
          </div>
          {message.role === 'user' && (
            <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--linear-bg-surface-2)'>
              <User className='h-3.5 w-3.5 text-(--linear-text-secondary)' />
            </div>
          )}
        </div>
      )}

      {toolInvocations.map(toolInvocation => {
        if (
          toolInvocation.toolName === 'proposeProfileEdit' &&
          toolInvocation.state === 'result' &&
          toolInvocation.result?.success &&
          toolInvocation.result.preview
        ) {
          return (
            <div key={toolInvocation.toolInvocationId} className='ml-10'>
              <ProfileEditPreviewCard
                preview={toolInvocation.result.preview as ProfileEditPreview}
                profileId={profileId}
              />
            </div>
          );
        }

        if (
          toolInvocation.toolName === 'proposeAvatarUpload' &&
          toolInvocation.state === 'result' &&
          toolInvocation.result?.success
        ) {
          return (
            <div key={toolInvocation.toolInvocationId} className='ml-10'>
              <ChatAvatarUploadCard />
            </div>
          );
        }

        if (
          toolInvocation.toolName === 'proposeSocialLink' &&
          toolInvocation.state === 'result' &&
          toolInvocation.result?.success
        ) {
          const result =
            toolInvocation.result as unknown as SocialLinkToolResult;
          return (
            <div key={toolInvocation.toolInvocationId} className='ml-10'>
              <ChatLinkConfirmationCard
                profileId={profileId}
                platform={result.platform}
                normalizedUrl={result.normalizedUrl}
                originalUrl={result.originalUrl}
              />
            </div>
          );
        }

        return null;
      })}
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
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messages.length, expanded, virtualizer]);

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
        className='flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-(--linear-bg-surface-2)'
        aria-expanded={expanded}
      >
        <div className='flex items-center gap-2'>
          <BrandLogo size={16} tone='auto' />
          <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
            Jovie
          </span>
          {messages.length > 0 && (
            <span className='text-[11px] text-(--linear-text-tertiary)'>
              ({messages.length} messages)
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className='h-4 w-4 text-(--linear-text-secondary)' />
        ) : (
          <ChevronDown className='h-4 w-4 text-(--linear-text-secondary)' />
        )}
      </button>

      {/* Messages area - collapsible */}
      {expanded && (
        <div className='border-t border-(--linear-border-subtle)'>
          <div
            ref={scrollContainerRef}
            className='max-h-80 overflow-y-auto px-4 py-4'
          >
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

            {/* Loading indicator — rendered outside virtualizer */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className='flex gap-3 pb-4'>
                <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--linear-bg-surface-2)'>
                  <BrandLogo size={14} tone='auto' />
                </div>
                <div className='rounded-2xl bg-(--linear-bg-surface-2) px-3 py-2'>
                  <Loader2 className='h-4 w-4 animate-spin text-(--linear-text-secondary)' />
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
                  <p className='text-[13px] text-(--linear-text-primary)'>
                    {chatError.message}
                  </p>
                  {chatError.failedMessage && !chatError.retryAfter && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      onClick={handleRetry}
                      disabled={isLoading || isSubmitting}
                      className='mt-2 h-7 gap-1.5 text-[11px]'
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
