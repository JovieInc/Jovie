'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';

import {
  ChatInput,
  ChatMessage,
  ChatMessageSkeleton,
  ErrorDisplay,
  ScrollToBottom,
  SuggestedPrompts,
} from './components';
import { ChatProvidersRegistrar } from './components/ChatProvidersRegistrar';
import { ChatUsageAlert } from './components/ChatUsageAlert';
import {
  useChatImageAttachments,
  useJovieChat,
  useStickToBottom,
} from './hooks';
import type { JovieChatProps, MessagePart } from './types';

/** Sentinel ID for the synthetic thinking placeholder */
const THINKING_PLACEHOLDER_ID = 'thinking-placeholder';
const VIRTUALIZATION_THRESHOLD = 12;

export function JovieChat({
  profileId,
  artistContext, // NOSONAR - intentional backward compatibility for deprecated prop
  conversationId,
  onConversationCreate,
  initialQuery,
  onTitleChange,
  avatarUrl,
  username,
  displayName,
  isFirstSession = false,
  latestReleaseTitle,
}: JovieChatProps) {
  const initialQuerySubmitted = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  // Track message IDs that were loaded from persistence to skip entrance animation
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
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
    chipTray,
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

  // Populate known message IDs from hydrated conversation to skip entrance animations
  useEffect(() => {
    if (messages.length > 0 && knownMessageIdsRef.current.size === 0) {
      for (const m of messages) {
        knownMessageIdsRef.current.add(m.id);
      }
    }
  }, [messages]);

  // ─── Synthetic thinking message (render-only) ───────────────────
  // Append a placeholder when waiting for the AI to start responding.
  // This is a displayMessages array, NOT a modification to the real messages.
  const lastMessage = messages[messages.length - 1];
  const displayMessages =
    isLoading && lastMessage?.role === 'user'
      ? [
          ...messages,
          {
            id: THINKING_PLACEHOLDER_ID,
            role: 'assistant' as const,
            parts: [] as MessagePart[],
            createdAt: new Date(),
          },
        ]
      : messages;

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
  const shouldVirtualizeMessages =
    displayMessages.length > VIRTUALIZATION_THRESHOLD;

  const scrollToBottom = useCallback(() => {
    if (displayMessages.length > 0) {
      if (shouldVirtualizeMessages) {
        virtualizer.scrollToIndex(displayMessages.length - 1, {
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
      setStuckToBottom(true);
    }
  }, [
    displayMessages.length,
    scrollContainerRef,
    setStuckToBottom,
    shouldVirtualizeMessages,
    virtualizer,
  ]);

  // Find the last real assistant message index for streaming cursor
  let lastAssistantIndex = -1;
  for (let i = displayMessages.length - 1; i >= 0; i--) {
    if (
      displayMessages[i].role === 'assistant' &&
      displayMessages[i].id !== THINKING_PLACEHOLDER_ID
    ) {
      lastAssistantIndex = i;
      break;
    }
  }

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
    chips: chipTray.chips,
    onRemoveChipAt: chipTray.removeAt,
    onRemoveLastChip: chipTray.removeLast,
    onAddSkill: chipTray.addSkill,
    onAddEntity: chipTray.addEntity,
  } as const;

  const greetingName = displayName?.trim() || username?.trim() || null;
  let emptyStateHeading: string;
  if (isFirstSession) {
    emptyStateHeading = 'Welcome to Jovie';
  } else if (greetingName) {
    emptyStateHeading = `Welcome Back ${greetingName}`;
  } else {
    emptyStateHeading = 'Welcome Back';
  }

  return (
    <div
      ref={dropZoneRef}
      className='relative flex h-full flex-col bg-(--linear-app-content-surface)'
      data-testid='chat-content'
    >
      {/* Registers entity providers (release, artist) for the slash menu */}
      {profileId ? <ChatProvidersRegistrar profileId={profileId} /> : null}

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
        <div className='flex flex-1 flex-col overflow-hidden'>
          {/* Messages area */}
          <div
            ref={scrollContainerRef}
            className='relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-5'
            onScroll={onScroll}
          >
            {shouldVirtualizeMessages ? (
              <div
                ref={totalSizeRef}
                className='mx-auto flex min-h-full w-full max-w-[44rem] flex-col'
                style={{
                  position: 'relative',
                  height: Math.max(
                    virtualizer.getTotalSize(),
                    scrollContainerRef.current?.clientHeight ?? 0
                  ),
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
                      <div className='pb-4'>
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
                          skipEntrance={knownMessageIdsRef.current.has(
                            message.id
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                ref={totalSizeRef}
                className='mx-auto flex min-h-full w-full max-w-[44rem] flex-col'
              >
                {displayMessages.map((message, index) => {
                  const isThinking = message.id === THINKING_PLACEHOLDER_ID;
                  return (
                    <div key={message.id} className='pb-4'>
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
                        skipEntrance={knownMessageIdsRef.current.has(
                          message.id
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Scroll to bottom button */}
            <ScrollToBottom
              visible={!isStuckToBottom}
              onClick={scrollToBottom}
            />
          </div>

          <div className='px-4 pt-3 sm:px-5'>
            <ChatUsageAlert />
          </div>

          {/* Error display */}
          {chatError && (
            <div className='px-4 pb-3 sm:px-5'>
              <ErrorDisplay
                chatError={chatError}
                onRetry={handleRetry}
                isLoading={isLoading}
                isSubmitting={isSubmitting}
              />
            </div>
          )}

          {/* Input at bottom */}
          <div className='bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
            <div className='mx-auto w-full max-w-[44rem]'>
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
        </div>
      ) : (
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className='flex-1 overflow-y-auto px-4 sm:px-6'>
            <div className='mx-auto flex min-h-full w-full max-w-[34rem] flex-col items-center justify-center gap-5 py-6'>
              <h1 className='text-[1.2rem] font-semibold tracking-[-0.03em] text-primary-token sm:text-[1.35rem]'>
                {emptyStateHeading}
              </h1>
              <div className='mx-auto flex w-full max-w-md flex-col items-center'>
                <SuggestedPrompts
                  onSelect={handleSuggestedPrompt}
                  isFirstSession={isFirstSession}
                  latestReleaseTitle={latestReleaseTitle}
                  layout='flat'
                />
                {chatError && (
                  <div className='mt-2.5 w-full'>
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
          </div>

          <div className='bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
            <div className='mx-auto w-full max-w-[34rem] space-y-2.5'>
              {isRateLimited && (
                <p
                  className='text-center text-xs text-tertiary-token'
                  aria-live='polite'
                >
                  Sending too fast. Please wait a second before your next
                  message.
                </p>
              )}
              <ChatUsageAlert />
              <ChatInput {...chatInputProps} placeholder='Ask Jovie...' />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
