'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import { SuggestionCard } from '@/components/shell/SuggestionCard';
import { useAppFlag } from '@/lib/flags/client';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';
import { cn } from '@/lib/utils';

import { CHAT_COMPOSER_DOCK_CLASSNAME } from './chat-layout';
import {
  ChatInput,
  ChatMessage,
  ChatMessageSkeleton,
  ErrorDisplay,
  ScrollToBottom,
} from './components';
import { ChatProvidersRegistrar } from './components/ChatProvidersRegistrar';
import { ChatUsageAlert } from './components/ChatUsageAlert';
import { EntityResolutionProvider } from './components/EntityResolutionProvider';
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

/**
 * Extracts the first name token for use in the empty-state greeting (e.g. "What are we working on, Alex?").
 * Handles null/undefined/blank by returning null. Splits on whitespace.
 */
export function getFirstNameForGreeting(
  name: string | null | undefined
): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function findLastAssistantIndex(
  messages: readonly { id: string; role: string }[]
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === 'assistant' &&
      messages[i].id !== THINKING_PLACEHOLDER_ID
    ) {
      return i;
    }
  }
  return -1;
}

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
  actionCards = [],
}: JovieChatProps) {
  const initialQuerySubmitted = useRef(false);
  const initialSkillApplied = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  // Track message IDs that were loaded from persistence to skip entrance animation
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  // Hide neighbouring affordances while the slash picker owns the composer.
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
  const showPendingBootstrap = messages.length === 0 && isSubmitting;
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
      : showPendingBootstrap
        ? [
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

  const lastAssistantIndex = findLastAssistantIndex(displayMessages);

  const isStreaming = status === 'streaming';
  const showThreadView = hasMessages || showPendingBootstrap;

  // Show skeleton while fetching existing conversation
  if (isLoadingConversation) {
    return (
      <div
        className='flex h-full flex-col bg-(--linear-app-content-surface)'
        data-testid='chat-loading-conversation-skeleton'
      >
        <div className='flex-1 overflow-hidden px-4 py-5 sm:px-5'>
          <ChatMessageSkeleton />
        </div>
        <div className='shrink-0 px-4 pb-4 pt-2 sm:px-5 sm:pb-5 sm:pt-2.5'>
          <div className='mx-auto h-[88px] w-full max-w-[45rem] rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0.014)_45%,transparent_100%),#16171b] shadow-[0_18px_56px_-30px_rgba(0,0,0,0.86),inset_0_1px_0_rgba(255,255,255,0.055)]'>
            <div className='grid h-full grid-rows-[minmax(24px,auto)_40px] gap-2 px-3 py-2.5'>
              <div className='mx-1 mt-1 h-5 w-44 rounded-full bg-white/[0.055]' />
              <div className='flex items-center justify-between'>
                <div className='h-9 w-9 rounded-full bg-white/[0.045]' />
                <div className='flex items-center gap-2'>
                  <div className='h-9 w-9 rounded-full bg-white/[0.045]' />
                  <div className='h-9 w-9 rounded-full bg-white/[0.08]' />
                </div>
              </div>
            </div>
          </div>
        </div>
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

  const greetingName =
    getFirstNameForGreeting(displayName) ?? getFirstNameForGreeting(username);
  const primaryActionCard = actionCards[0] ?? null;
  const showActionCardContent =
    primaryActionCard !== null &&
    input.trim().length === 0 &&
    !composerPickerOpen &&
    (pendingImages?.length ?? 0) === 0 &&
    chipTray.chips.length === 0;
  let emptyStateHeading: string;
  if (isFirstSession) {
    emptyStateHeading = "Hey, I'm Jovie.";
  } else {
    emptyStateHeading = greetingName
      ? `What are we working on, ${greetingName}?`
      : 'What are we working on?';
  }

  return (
    <EntityResolutionProvider profileId={profileId}>
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
              data-testid='chat-attachment-dropzone'
              className='absolute inset-0 z-50 flex items-center justify-center rounded-[var(--linear-app-shell-radius)] border border-dashed border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,color-mix(in_oklab,var(--linear-app-content-surface)_82%,black),color-mix(in_oklab,var(--linear-app-content-surface)_70%,black))] p-6 backdrop-blur-md'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className='flex min-h-40 w-full max-w-sm flex-col items-center justify-center gap-3 rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 px-6 py-8 text-center shadow-[0_24px_80px_-32px_rgba(0,0,0,0.95)]'>
                <ImagePlus
                  className='h-7 w-7 text-secondary-token'
                  aria-hidden='true'
                  strokeWidth={2.25}
                />
                <div>
                  <p className='text-sm font-semibold text-primary-token'>
                    Drop images to attach
                  </p>
                  <p className='mt-1 text-xs leading-5 text-secondary-token'>
                    Up to 4 images, 10 MB each.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Persistent scroll viewport (flex-1) + morphing upper content.
            The former hard switch (showThreadView ? thread-with-dock : centered-empty-with-dupe-composer)
            is replaced by always-present bottom dock + AnimatePresence on the upper
            (signals+heading+ornament+suggested vs. messages list). This is the exact
            mechanical mirror of the OnboardingChat first-turn stabilization.
            layoutId on ChatInput surface + dock position lock the geometry so hero↔compact
            and empty↔thread transitions have zero jump or flicker. */}
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div
            ref={scrollContainerRef}
            className='relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-5'
            onScroll={onScroll}
          >
            <AnimatePresence mode='popLayout' initial={false}>
              {!showThreadView ? (
                <div key='joviechat-empty-upper'>
                  {/* Giant Jovie circle mark behind empty thread.
                      Positioned absolute so it doesn't shift the welcome heading. */}
                  <div
                    aria-hidden
                    className='pointer-events-none absolute inset-0 flex items-center justify-center select-none anim-calm-breath opacity-45'
                    data-testid='chat-empty-thread-ornament'
                  >
                    {shellChatV1Enabled ? (
                      <JovieMarkElectric
                        spark={false}
                        className='opacity-100'
                        style={{
                          width: 'clamp(180px, 34vw, 360px)',
                          height: 'clamp(180px, 34vw, 360px)',
                          transform: 'translateY(-16px)',
                          WebkitMaskImage:
                            'radial-gradient(circle, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0) 95%)',
                          maskImage:
                            'radial-gradient(circle, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0) 95%)',
                        }}
                      />
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

                  <div
                    className='relative mx-auto flex min-h-full w-full max-w-[52rem] flex-col items-center justify-center gap-5 py-8'
                    data-testid='chat-empty-state-composer-region'
                  >
                    <h1
                      className={cn(
                        'text-balance text-center text-[2rem] font-semibold leading-[1.1] text-primary-token sm:text-[2.35rem] md:text-[2.65rem]',
                        composerPickerOpen && 'pointer-events-none opacity-0'
                      )}
                      aria-hidden={composerPickerOpen ? 'true' : undefined}
                    >
                      {emptyStateHeading}
                    </h1>

                    <div
                      className='mx-auto flex h-[172px] w-full max-w-[38rem] items-center justify-center sm:h-[148px]'
                      data-testid='chat-empty-state-action-card-slot'
                    >
                      {showActionCardContent ? (
                        <SuggestionCard
                          className='h-full'
                          title={primaryActionCard.title}
                          body={primaryActionCard.body}
                          actionLabel={primaryActionCard.actionLabel}
                          onAct={() =>
                            handleSuggestedPromptWithJank(
                              primaryActionCard.prompt
                            )
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div key='joviechat-messages'>
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
                        const isThinking =
                          message.id === THINKING_PLACEHOLDER_ID;
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
                                  message.role === 'user'
                                    ? avatarUrl
                                    : undefined
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
                        const isThinking =
                          message.id === THINKING_PLACEHOLDER_ID;
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
              )}
            </AnimatePresence>
          </div>

          {/*
            Persistent always-bottom composer dock.
            No more conditional + justify-center teleport for the input on first message.
            Variant (hero/compact) changes are smoothed by the layoutId on the inner
            motion surface. All transient chrome (alerts, rate, error) lives here for both
            empty and thread states.
          */}
          <div className={CHAT_COMPOSER_DOCK_CLASSNAME}>
            <div className='mx-auto w-full max-w-[45rem]'>
              {/* Transient alerts stack above the input. Each contributes its
                own bottom margin only when rendered. */}
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
                placeholder={
                  showThreadView ? 'Ask a follow-up...' : 'Ask Jovie...'
                }
                variant={showThreadView ? 'compact' : 'hero'}
                shellChatV1={shellChatV1Enabled}
              />
            </div>
          </div>
        </div>
      </div>
    </EntityResolutionProvider>
  );
}
