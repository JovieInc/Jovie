'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ProfileCompletionCard } from '@/features/dashboard/molecules/ProfileCompletionCard';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import { useInsightsSummaryQuery, usePlanGate } from '@/lib/queries';

import {
  ChatInput,
  ChatMessage,
  ChatMessageSkeleton,
  ErrorDisplay,
  JovieGreeting,
  ScrollToBottom,
  SuggestedProfilesCarousel,
  SuggestedPrompts,
} from './components';
import { ChatUsageAlert } from './components/ChatUsageAlert';
import {
  useChatImageAttachments,
  useJovieChat,
  useStickToBottom,
  useSuggestedProfiles,
} from './hooks';
import type { JovieChatProps, MessagePart } from './types';

/** Sentinel ID for the synthetic thinking placeholder */
const THINKING_PLACEHOLDER_ID = 'thinking-placeholder';

function deriveSessionState(
  suggestedProfiles: ReturnType<typeof useSuggestedProfiles>,
  isFirstSessionProp: boolean,
  latestReleaseTitleProp: string | null,
  profileId: string | undefined
) {
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
  return {
    isFirstSession,
    latestReleaseTitle,
    showSuggestedProfiles,
    hasCarouselItems,
  };
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
  const { profileCompletion, tippingStats } = useDashboardData();
  const { aiCanUseTools } = usePlanGate();
  const initialQuerySubmitted = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  // Suggested profiles carousel data
  const shouldLoadSuggestedProfiles = Boolean(profileId) && !isFirstSessionProp;
  const suggestedProfiles = useSuggestedProfiles(profileId, {
    enabled: shouldLoadSuggestedProfiles,
  });
  const {
    isFirstSession,
    latestReleaseTitle,
    showSuggestedProfiles,
    hasCarouselItems,
  } = deriveSessionState(
    suggestedProfiles,
    isFirstSessionProp,
    latestReleaseTitleProp,
    profileId
  );
  const shouldLoadInsightSuggestions =
    Boolean(profileId) &&
    !isFirstSession &&
    !hasCarouselItems &&
    (profileCompletion?.percentage ?? 0) >= 100;
  const insightsSummary = useInsightsSummaryQuery({
    enabled: shouldLoadInsightSuggestions,
  });

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
    stop,
  } = useJovieChat({
    profileId,
    artistContext,
    conversationId,
    onConversationCreate,
    username,
  });

  const followUpQuickActions = useMemo(
    () => [
      {
        label: 'Summarize this thread',
        prompt: 'Summarize this thread in three concise bullets.',
      },
      {
        label: 'What should I do next?',
        prompt: 'Based on this conversation, what should I do next?',
      },
      {
        label: 'Turn it into a checklist',
        prompt: 'Turn this conversation into a short checklist I can follow.',
      },
    ],
    []
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

  const handleSubmitWithImages = useCallback(
    (e?: React.FormEvent) => {
      if (isLoading || isSubmitting) return;
      const files = toFileUIParts();
      handleSubmit(e, files.length > 0 ? files : undefined);
      clearImages();
    },
    [handleSubmit, toFileUIParts, clearImages, isLoading, isSubmitting]
  );

  // Notify parent when the conversation title changes
  const prevTitleRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationTitle !== prevTitleRef.current) {
      prevTitleRef.current = conversationTitle;
      onTitleChange?.(conversationTitle);
    }
  }, [conversationTitle, onTitleChange]);

  // Auto-submit initialQuery on mount
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

  // ─── Synthetic thinking message (render-only) ───────────────────
  // Append a placeholder when waiting for the AI to start responding.
  // This is a displayMessages array, NOT a modification to the real messages.
  const displayMessages = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (isLoading && lastMsg?.role === 'user') {
      return [
        ...messages,
        {
          id: THINKING_PLACEHOLDER_ID,
          role: 'assistant' as const,
          parts: [] as MessagePart[],
          createdAt: new Date(),
        },
      ];
    }
    return messages;
  }, [messages, isLoading]);

  // ─── Sticky scroll via ResizeObserver ────────────────────────────
  const {
    isStuckToBottom,
    setStuckToBottom,
    onScroll,
    totalSizeRef,
    scrollContainerRef,
  } = useStickToBottom({ messageCount: displayMessages.length });

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: el => el.getBoundingClientRect().height,
  });

  const scrollToBottom = useCallback(() => {
    if (displayMessages.length > 0) {
      virtualizer.scrollToIndex(displayMessages.length - 1, {
        align: 'end',
        behavior: 'smooth',
      });
      setStuckToBottom(true);
    }
  }, [displayMessages.length, virtualizer, setStuckToBottom]);

  // Find the last real assistant message index for streaming cursor
  const lastAssistantIndex = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (
        displayMessages[i].role === 'assistant' &&
        displayMessages[i].id !== THINKING_PLACEHOLDER_ID
      ) {
        return i;
      }
    }
    return -1;
  }, [displayMessages]);

  const isStreaming = status === 'streaming';

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
    isStreaming,
    onStop: stop,
    onImageAttach: openImagePicker,
    isImageProcessing,
    pendingImages,
    onRemoveImage: removeImage,
    onPaste: handlePaste,
  } as const;

  return (
    <div
      ref={dropZoneRef}
      className='relative flex h-full flex-col bg-[linear-gradient(180deg,color-mix(in_oklab,var(--linear-app-content-surface)_14%,transparent),transparent_18%)]'
      data-testid='chat-content'
    >
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

      <AnimatePresence mode='wait' initial={false}>
        {hasMessages ? (
          <motion.div
            key='chat-view'
            className='flex flex-1 flex-col overflow-hidden'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {/* Messages area */}
            <div
              ref={scrollContainerRef}
              className='relative flex-1 overflow-y-auto px-4 py-6 sm:px-5'
              onScroll={onScroll}
            >
              <div
                ref={totalSizeRef}
                className='mx-auto max-w-[44rem]'
                style={{
                  position: 'relative',
                  height: virtualizer.getTotalSize(),
                }}
              >
                {virtualizer.getVirtualItems().map(virtualItem => {
                  const message = displayMessages[virtualItem.index];
                  const index = virtualItem.index;
                  const isThinking = message.id === THINKING_PLACEHOLDER_ID;
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
                          isThinking={isThinking}
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

              {/* Scroll to bottom button */}
              <ScrollToBottom
                visible={!isStuckToBottom}
                onClick={scrollToBottom}
              />
            </div>

            <div className='px-4 pt-3'>
              <div className='mx-auto max-w-2xl'>
                <ChatUsageAlert />
              </div>
            </div>

            {/* Error display */}
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
            <div className='border-t border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 py-4 sm:px-5'>
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
                  quickActions={followUpQuickActions}
                  onQuickActionSelect={handleSuggestedPrompt}
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key='empty-state'
            className='flex flex-1 flex-col'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
          >
            {/* Content area */}
            <div className='flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-5 sm:py-10'>
              <div className='chat-stagger w-full max-w-[46rem] space-y-4 sm:space-y-5'>
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

                {!hasCarouselItems &&
                  (profileCompletion?.percentage ?? 0) < 100 && (
                    <ProfileCompletionCard />
                  )}

                {!hasCarouselItems &&
                  (profileCompletion?.percentage ?? 0) >= 100 && (
                    <>
                      <JovieGreeting
                        username={username}
                        isFirstSession={isFirstSession}
                        insights={insightsSummary.data?.insights ?? []}
                        tippingStats={tippingStats}
                      />

                      <SuggestedPrompts
                        onSelect={handleSuggestedPrompt}
                        isFirstSession={isFirstSession}
                        latestReleaseTitle={latestReleaseTitle}
                        canUseAdvancedTools={aiCanUseTools}
                      />
                    </>
                  )}
              </div>
            </div>

            {/* Input pinned at bottom */}
            <div className='bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-6'>
              <div className='mx-auto w-full max-w-2xl space-y-3'>
                {isRateLimited && (
                  <p className='text-xs text-tertiary-token' aria-live='polite'>
                    Sending too fast. Please wait a second before your next
                    message.
                  </p>
                )}
                <ChatUsageAlert />
                <ChatInput {...chatInputProps} />

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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
