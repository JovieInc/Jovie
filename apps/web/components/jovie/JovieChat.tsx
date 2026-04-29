'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppFlag } from '@/lib/flags/client';
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
  useChatJankMonitor,
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
  initialSkillId,
  onTitleChange,
  avatarUrl,
  username,
  displayName,
  isFirstSession = false,
  latestReleaseTitle,
}: JovieChatProps) {
  const initialQuerySubmitted = useRef(false);
  const initialSkillApplied = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  // Track message IDs that were loaded from persistence to skip entrance animation
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  // Variant F: dim suggestion chips while the slash picker is open so they
  // don't compete with the morphing surface.
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
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
    activeConversationId,
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

  // ─── Chat jank instrumentation (flag-gated) ─────────────────
  const jankMonitorEnabled = useAppFlag('CHAT_JANK_MONITOR');
  const shellChatV1Enabled = useAppFlag('DESIGN_V1');
  const designV1ChatEntitiesEnabled = useAppFlag('DESIGN_V1');
  const { onSend: notifyJankSend } = useChatJankMonitor({
    conversationId: activeConversationId,
    messages,
    status,
    isStuckToBottom,
    scrollContainerRef,
    enabled: jankMonitorEnabled,
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
      notifyJankSend();
      handleSubmit(e, files.length > 0 ? files : undefined);
      clearImages();
    },
    [
      handleSubmit,
      toFileUIParts,
      clearImages,
      isLoading,
      isSubmitting,
      notifyJankSend,
    ]
  );

  const handleSuggestedPromptWithJank = useCallback(
    (prompt: string) => {
      notifyJankSend();
      handleSuggestedPrompt(prompt);
    },
    [handleSuggestedPrompt, notifyJankSend]
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
      notifyJankSend();
      submitMessage(initialQuery);
    }
  }, [initialQuery, isLoadingConversation, submitMessage, notifyJankSend]);

  // Pre-load a skill chip on mount when the chat was opened from cmd+k with
  // `?skill=<id>`. We apply once and rely on the chip tray's normal
  // backspace-to-remove behavior for undo. New conversations only — re-loading
  // an existing thread shouldn't smuggle a chip into a finished context.
  useEffect(() => {
    if (
      !initialSkillId ||
      initialSkillApplied.current ||
      conversationId ||
      isLoadingConversation
    ) {
      return;
    }
    initialSkillApplied.current = true;
    chipTray.addSkill(initialSkillId);
  }, [initialSkillId, conversationId, isLoadingConversation, chipTray]);

  // Populate known message IDs from hydrated conversation to skip entrance animations
  useEffect(() => {
    if (messages.length > 0 && knownMessageIdsRef.current.size === 0) {
      for (const m of messages) {
        knownMessageIdsRef.current.add(m.id);
      }
    }
  }, [messages]);

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
    onPickerOpenChange: setComposerPickerOpen,
    profileId,
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
      data-design-v1-chat-entities={
        designV1ChatEntitiesEnabled ? 'true' : undefined
      }
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

          {/*
            Composer region anchors at the bottom (shrink-0 keeps it from
            collapsing under flex-1 siblings). Wrapper padding is fixed, so
            the input never jumps when transient alerts appear/disappear:
            previously, ChatUsageAlert was wrapped in an always-rendered
            `pt-3` div even when the alert returned null, leaving permanent
            empty chrome that flipped to actual content the moment the alert
            mounted. Now each alert opts in to its own bottom margin and is
            unmounted entirely when empty.
          */}
          <div className='shrink-0 bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
            <div className='mx-auto w-full max-w-[44rem]'>
              {/* Transient alerts stack above the input. Each contributes its
                  own bottom margin only when rendered, so toggling them does
                  not leave residual padding behind. */}
              <ChatUsageAlert />

              {chatError && (
                <div className='mb-2'>
                  <ErrorDisplay
                    chatError={chatError}
                    onRetry={handleRetry}
                    isLoading={isLoading}
                    isSubmitting={isSubmitting}
                  />
                </div>
              )}

              {isRateLimited && (
                <p
                  className='mb-1.5 text-xs text-tertiary-token'
                  aria-live='polite'
                >
                  Sending too fast. Please wait a second before your next
                  message.
                </p>
              )}

              <ChatInput
                {...chatInputProps}
                placeholder='Ask a follow-up...'
                variant='compact'
                shellChatV1={shellChatV1Enabled}
                quickActions={followUpQuickActions}
                onQuickActionSelect={handleSuggestedPromptWithJank}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div className='relative flex-1 overflow-y-auto px-4 sm:px-6'>
            {/* Giant Jovie circle mark behind empty thread.
                Positioned absolute so it doesn't shift the welcome heading. */}
            <div
              aria-hidden
              className='pointer-events-none absolute inset-0 flex items-center justify-center select-none'
              data-testid='chat-empty-thread-ornament'
            >
              {shellChatV1Enabled ? (
                <svg
                  viewBox='0 0 353.68 347.97'
                  aria-hidden='true'
                  fill='currentColor'
                  style={{
                    width: 'clamp(180px, 38vw, 360px)',
                    height: 'clamp(180px, 38vw, 360px)',
                    color: 'rgba(255,255,255,0.018)',
                    transform: 'translateY(-12px)',
                  }}
                >
                  <path d='m176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z' />
                </svg>
              ) : (
                <span
                  style={{
                    fontFamily:
                      'var(--font-display, "Satoshi", -apple-system, system-ui, sans-serif)',
                    fontWeight: 600,
                    fontSize: 'clamp(180px, 38vw, 360px)',
                    color: 'rgba(255,255,255,0.018)',
                    letterSpacing: '-0.08em',
                    lineHeight: 0.8,
                    transform: 'translateY(-12px)',
                  }}
                >
                  j
                </span>
              )}
            </div>
            <div className='relative mx-auto flex min-h-full w-full max-w-[44rem] flex-col items-center justify-center gap-6 py-8'>
              <h1 className='text-balance text-center text-[2rem] font-semibold leading-[1.1] tracking-[-0.035em] text-primary-token sm:text-[2.5rem] md:text-[3rem]'>
                {emptyStateHeading}
              </h1>
              <div className='mx-auto flex w-full max-w-[38rem] flex-col items-center gap-3'>
                <SuggestedPrompts
                  onSelect={handleSuggestedPromptWithJank}
                  isFirstSession={isFirstSession}
                  latestReleaseTitle={latestReleaseTitle}
                  layout='rail'
                  dimmed={composerPickerOpen}
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

          <div className='shrink-0 bg-(--linear-app-content-surface) px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
            <div className='mx-auto w-full max-w-[34rem]'>
              <ChatUsageAlert />

              {isRateLimited && (
                <p
                  className='mb-1.5 text-center text-xs text-tertiary-token'
                  aria-live='polite'
                >
                  Sending too fast. Please wait a second before your next
                  message.
                </p>
              )}

              <ChatInput
                {...chatInputProps}
                placeholder='Ask Jovie...'
                shellChatV1={shellChatV1Enabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
