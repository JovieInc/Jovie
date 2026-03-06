'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BrandLogo } from '@/components/atoms/BrandLogo';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';

import {
  ChatInput,
  ChatMessage,
  ChatMessageSkeleton,
  ErrorDisplay,
  FeedbackForm,
  ScrollToBottom,
  SuggestedProfilesCarousel,
  SuggestedPrompts,
} from './components';
import { ChatUsageAlert } from './components/ChatUsageAlert';
import {
  useChatImageAttachments,
  useJovieChat,
  useSuggestedProfiles,
} from './hooks';
import type { JovieChatProps, MessagePart } from './types';
import { FEEDBACK_PROMPT_TRIGGER, TOOL_LABELS } from './types';

/** Scroll distance (px) from bottom before showing the scroll-to-bottom button. */
const SCROLL_THRESHOLD = 200;

/**
 * Derives a user-friendly label from the last assistant message's active tool invocation.
 * Returns null when no tool is actively being called.
 */
function getActiveToolLabel(
  messages: Array<{ role: string; parts: MessagePart[] }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (
        part.type === 'tool-invocation' &&
        part.toolInvocation?.state === 'call'
      ) {
        return TOOL_LABELS[part.toolInvocation.toolName] ?? 'Working on it...';
      }
    }
    break;
  }
  return null;
}

export function JovieChat({
  profileId,
  artistContext, // NOSONAR - intentional backward compatibility for deprecated prop
  conversationId,
  onConversationCreate,
  initialQuery,
  onTitleChange,
  displayName,
  avatarUrl,
  username,
  isFirstSession: isFirstSessionProp = false,
  latestReleaseTitle: latestReleaseTitleProp = null,
}: JovieChatProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialQuerySubmitted = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  // Suggested profiles carousel data — lifted here so we can hide
  // the help text and suggested prompts while the carousel has items.
  const shouldLoadSuggestedProfiles = Boolean(profileId) && !isFirstSessionProp;
  const suggestedProfiles = useSuggestedProfiles(profileId, {
    enabled: shouldLoadSuggestedProfiles,
  });
  const suggestionsReady = !suggestedProfiles.isLoading;
  const detectedFirstSession = suggestionsReady
    ? (suggestedProfiles.starterContext?.conversationCount ?? 0) === 0
    : null;
  const isFirstSession =
    detectedFirstSession === null
      ? isFirstSessionProp
      : isFirstSessionProp || detectedFirstSession;
  const latestReleaseTitle =
    latestReleaseTitleProp ??
    suggestedProfiles.starterContext?.latestReleaseTitle ??
    null;
  const showSuggestedProfiles = Boolean(profileId) && !isFirstSession;
  const hasCarouselItems =
    showSuggestedProfiles &&
    !suggestedProfiles.isLoading &&
    suggestedProfiles.total > 0;

  const {
    input,
    setInput,
    messages,
    chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    isLoadingConversation,
    conversationTitle,
    status,
    inputRef,
    handleSubmit,
    handleRetry,
    handleSuggestedPrompt,
    submitMessage,
    setChatError,
    isRateLimited,
  } = useJovieChat({
    profileId,
    artistContext,
    conversationId,
    onConversationCreate,
    username,
  });

  // Intercept feedback trigger before it reaches the AI
  const handleSuggestedPromptWithFeedback = useCallback(
    (prompt: string) => {
      if (prompt === FEEDBACK_PROMPT_TRIGGER) {
        setShowFeedbackForm(true);
        return;
      }
      handleSuggestedPrompt(prompt);
    },
    [handleSuggestedPrompt]
  );

  // Image attachments for chat messages
  const {
    pendingImages,
    isDragOver,
    isProcessing: isImageProcessing,
    addFiles,
    removeImage,
    clearImages,
    toFileUIParts,
    dropZoneRef,
  } = useChatImageAttachments({
    onError: error => setChatError({ type: 'unknown', message: error }),
    disabled: isLoading || isSubmitting,
  });

  // Open file picker for image attachments
  const openImagePicker = useCallback(() => {
    imageFileInputRef.current?.click();
  }, []);

  const handleImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  // Handle clipboard paste for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const imageFiles = Array.from(e.clipboardData.items)
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  // Submit with image attachments
  const handleSubmitWithImages = useCallback(
    (e?: React.FormEvent) => {
      if (isLoading || isSubmitting) return;
      const files = toFileUIParts();
      handleSubmit(e, files.length > 0 ? files : undefined);
      clearImages();
    },
    [handleSubmit, toFileUIParts, clearImages, isLoading, isSubmitting]
  );

  // Notify parent when the conversation title changes (e.g. after auto-generation)
  const prevTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationTitle !== prevTitleRef.current) {
      prevTitleRef.current = conversationTitle;
      onTitleChange?.(conversationTitle);
    }
  }, [conversationTitle, onTitleChange]);

  // Auto-submit initialQuery on mount (e.g. navigated from profile with ?q=)
  useEffect(() => {
    if (
      initialQuery &&
      !initialQuerySubmitted.current &&
      !isLoadingConversation
    ) {
      initialQuerySubmitted.current = true;
      submitMessage(initialQuery);
    }
  }, [initialQuery, isLoadingConversation, submitMessage]);

  // Virtualizer for chat messages
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: el => el.getBoundingClientRect().height,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messages.length, virtualizer]);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > SCROLL_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
    }
  }, [messages.length, virtualizer]);

  // Find the last assistant message index for streaming cursor
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  // Determine the active tool label for contextual loading state
  const isStreaming = status === 'streaming';
  const activeToolLabel = useMemo(
    () => (isLoading ? getActiveToolLabel(messages) : null),
    [isLoading, messages]
  );
  const thinkingLabel = activeToolLabel ?? 'Thinking...';

  // Show skeleton while fetching existing conversation
  if (isLoadingConversation) {
    return (
      <div className='flex h-full flex-col'>
        <ChatMessageSkeleton />
      </div>
    );
  }

  // Shared ChatInput props for both views
  const chatInputProps = {
    ref: inputRef,
    value: input,
    onChange: setInput,
    onSubmit: handleSubmitWithImages,
    isLoading,
    isSubmitting,
    onImageAttach: openImagePicker,
    isImageProcessing,
    pendingImages,
    onRemoveImage: removeImage,
    onPaste: handlePaste,
  } as const;

  return (
    <div ref={dropZoneRef} className='relative flex h-full flex-col'>
      {/* Hidden file input for image attachments */}
      <input
        ref={imageFileInputRef}
        type='file'
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
        onChange={handleImageFileChange}
        multiple
        className='hidden'
        tabIndex={-1}
      />

      {/* Drag-and-drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            className='absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 backdrop-blur-sm'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className='flex flex-col items-center gap-2 text-accent'>
              <ImagePlus className='h-6 w-6' />
              <span className='text-sm font-medium'>Drop images here</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasMessages ? (
        // Chat view - messages + input at bottom
        <>
          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            className='relative flex-1 overflow-y-auto px-4 py-6'
            onScroll={handleScroll}
          >
            <div
              className='mx-auto max-w-[44rem]'
              style={{
                position: 'relative',
                height: virtualizer.getTotalSize(),
              }}
            >
              {virtualizer.getVirtualItems().map(virtualItem => {
                const message = messages[virtualItem.index];
                const index = virtualItem.index;
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
                    <div className='pb-7'>
                      <ChatMessage
                        id={message.id}
                        role={message.role}
                        parts={message.parts}
                        isStreaming={
                          isStreaming && index === lastAssistantIndex
                        }
                        avatarUrl={
                          message.role === 'user' ? avatarUrl : undefined
                        }
                        profileId={profileId}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Loading indicator — rendered outside virtualizer since it's not a real message */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className='mx-auto max-w-[44rem] pb-7'>
                <div className='flex gap-3'>
                  <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-1'>
                    <BrandLogo size={16} tone='auto' />
                  </div>
                  <div className='rounded-2xl bg-surface-1 px-5 py-3.5'>
                    <div className='flex items-center gap-1.5'>
                      <span
                        className='flex items-center gap-1'
                        aria-hidden='true'
                      >
                        <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none' />
                        <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none' />
                        <span className='h-1.5 w-1.5 rounded-full bg-tertiary-token animate-bounce motion-reduce:animate-none' />
                      </span>
                      {activeToolLabel && (
                        <span className='ml-2 text-xs font-medium tracking-wide text-tertiary-token'>
                          {activeToolLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className='sr-only' aria-live='polite'>
                    Jovie is {thinkingLabel.toLowerCase().replace(/\.{3}$/, '')}
                  </span>
                </div>
              </div>
            )}

            {/* Scroll to bottom button */}
            <ScrollToBottom
              visible={showScrollToBottom}
              onClick={scrollToBottom}
            />
          </div>

          <div className='px-4 pt-3'>
            <div className='mx-auto max-w-2xl'>
              <ChatUsageAlert />
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
          <div className='px-4 py-4'>
            <div className='mx-auto max-w-2xl space-y-2'>
              {isRateLimited && (
                <p className='text-xs text-tertiary-token' aria-live='polite'>
                  Sending too fast. Please wait a second before your next
                  message.
                </p>
              )}
              <ChatInput
                {...chatInputProps}
                placeholder='Ask a follow-up...'
                variant='compact'
              />
            </div>
          </div>
        </>
      ) : (
        // Empty state - centered content with input pinned at bottom
        <div className='flex flex-1 flex-col'>
          {/* Centered content area */}
          <div className='flex flex-1 flex-col items-center justify-center px-4'>
            <div className='chat-stagger w-full max-w-2xl space-y-4'>
              {/* Suggested profiles carousel (DSP matches, social links, avatars, profile ready) */}
              {showSuggestedProfiles && (
                <SuggestedProfilesCarousel
                  suggestions={suggestedProfiles.suggestions}
                  isLoading={suggestedProfiles.isLoading}
                  currentIndex={suggestedProfiles.currentIndex}
                  total={suggestedProfiles.total}
                  next={suggestedProfiles.next}
                  prev={suggestedProfiles.prev}
                  confirm={suggestedProfiles.confirm}
                  reject={suggestedProfiles.reject}
                  isActioning={suggestedProfiles.isActioning}
                  username={username}
                  displayName={displayName}
                  avatarUrl={avatarUrl}
                />
              )}

              {/* Feedback form (deterministic, no AI) */}
              {showFeedbackForm && (
                <FeedbackForm onClose={() => setShowFeedbackForm(false)} />
              )}

              {/* Hide help text and prompts while the carousel has items or feedback form is showing */}
              {!hasCarouselItems && !showFeedbackForm && (
                <>
                  {isFirstSession ? (
                    <p className='text-center text-[15px] text-secondary-token'>
                      Welcome, {displayName ?? 'there'}. Your profile is live at{' '}
                      <a
                        href={
                          username
                            ? `https://jov.ie/${username}`
                            : 'https://jov.ie'
                        }
                        target='_blank'
                        rel='noreferrer'
                        className='font-medium text-primary-token underline-offset-2 hover:underline'
                      >
                        {username ? `jov.ie/${username}` : 'jov.ie'}
                      </a>{' '}
                      .
                    </p>
                  ) : (
                    <p className='text-center text-[15px] text-secondary-token'>
                      What can I help you with?
                    </p>
                  )}

                  <SuggestedPrompts
                    onSelect={handleSuggestedPromptWithFeedback}
                    isFirstSession={isFirstSession}
                    latestReleaseTitle={latestReleaseTitle}
                  />
                </>
              )}
            </div>
          </div>

          {/* Input pinned at bottom */}
          <div className='px-4 pb-4 sm:pb-8'>
            <div className='mx-auto w-full max-w-2xl space-y-3'>
              {isRateLimited && (
                <p className='text-xs text-tertiary-token' aria-live='polite'>
                  Sending too fast. Please wait a second before your next
                  message.
                </p>
              )}
              <ChatUsageAlert />
              <ChatInput {...chatInputProps} />

              {/* Error display */}
              {chatError && (
                <ErrorDisplay
                  chatError={chatError}
                  onRetry={handleRetry}
                  isLoading={isLoading}
                  isSubmitting={isSubmitting}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
