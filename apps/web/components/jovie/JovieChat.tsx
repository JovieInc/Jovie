'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalChatEntityPanel } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';
import { useAppFlag } from '@/lib/flags/client';
import { SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/images/config';

import { deriveChatRailContextTargets } from './chat-context-rail';
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
import type { JovieChatProps } from './types';

const VIRTUALIZATION_THRESHOLD = 12;
const CHAT_PICKER_THREAD_CLEARANCE = 'min(340px, calc(100vh - 12rem))';

function findLastAssistantIndex(
  messages: readonly { id: string; role: string }[]
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
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
  displayName,
  avatarUrl,
  username,
}: JovieChatProps) {
  const initialQuerySubmitted = useRef(false);
  const initialSkillApplied = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
  // Track message IDs that were loaded from persistence to skip entrance animation
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const initialConversationScrollRef = useRef<string | null>(null);
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

  // ─── Sticky scroll via ResizeObserver ────────────────────────────
  const {
    isStuckToBottom,
    setStuckToBottom,
    onScroll,
    totalSizeRef,
    scrollContainerRef,
  } = useStickToBottom({ messageCount: messages.length });

  // ─── Chat jank instrumentation (flag-gated) ─────────────────
  const jankMonitorEnabled = useAppFlag('CHAT_JANK_MONITOR');
  const designV1ChatEntitiesEnabled = useAppFlag('DESIGN_V1');
  const chatEntityPanel = useOptionalChatEntityPanel();
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

  const profileRailLabel = displayName ?? username ?? null;
  const railContextTargets = useMemo(
    () =>
      designV1ChatEntitiesEnabled
        ? deriveChatRailContextTargets({
            messages,
            profile: profileId
              ? {
                  id: profileId,
                  label: profileRailLabel,
                }
              : null,
          })
        : [],
    [designV1ChatEntitiesEnabled, messages, profileId, profileRailLabel]
  );

  useEffect(() => {
    if (!chatEntityPanel) {
      return;
    }

    if (railContextTargets.length === 0) {
      chatEntityPanel.clearContexts();
      return;
    }

    chatEntityPanel.upsertContexts(railContextTargets);
  }, [chatEntityPanel, railContextTargets]);

  // Populate known message IDs from hydrated conversation to skip entrance animations
  useEffect(() => {
    if (
      conversationId &&
      messages.length > 0 &&
      knownMessageIdsRef.current.size === 0
    ) {
      for (const m of messages) {
        knownMessageIdsRef.current.add(m.id);
      }
    }
  }, [conversationId, messages]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement: el => el.getBoundingClientRect().height,
  });
  const shouldVirtualizeMessages = messages.length > VIRTUALIZATION_THRESHOLD;

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (messages.length > 0) {
        if (shouldVirtualizeMessages) {
          virtualizer.scrollToIndex(messages.length - 1, {
            align: 'end',
            behavior,
          });
          if (behavior === 'auto') {
            const scrollContainer = scrollContainerRef.current;
            if (scrollContainer) {
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        } else {
          const scrollContainer = scrollContainerRef.current;
          if (scrollContainer) {
            if (typeof scrollContainer.scrollTo === 'function') {
              scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior,
              });
            } else {
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        }
        setStuckToBottom(true);
      }
    },
    [
      messages.length,
      scrollContainerRef,
      setStuckToBottom,
      shouldVirtualizeMessages,
      virtualizer,
    ]
  );

  useEffect(() => {
    const conversationKey = activeConversationId ?? conversationId ?? null;
    if (
      !conversationKey ||
      isLoadingConversation ||
      messages.length === 0 ||
      initialConversationScrollRef.current === conversationKey
    ) {
      return;
    }

    initialConversationScrollRef.current = conversationKey;
    setStuckToBottom(true);
    const frame = requestAnimationFrame(() => scrollToBottom('auto'));
    const settleTimer = window.setTimeout(() => scrollToBottom('auto'), 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [
    activeConversationId,
    conversationId,
    isLoadingConversation,
    messages.length,
    scrollToBottom,
    setStuckToBottom,
  ]);

  const lastAssistantIndex = findLastAssistantIndex(messages);

  const isStreaming = status === 'streaming';
  const showThreadView = hasMessages;
  const showBottomComposer = showThreadView;
  const shouldReservePickerClearance = showBottomComposer && composerPickerOpen;
  const messageViewportPaddingBottom = shouldReservePickerClearance
    ? CHAT_PICKER_THREAD_CLEARANCE
    : undefined;
  const virtualizedMessageViewportBaseHeight = Math.max(
    virtualizer.getTotalSize(),
    scrollContainerRef.current?.clientHeight ?? 0
  );
  const virtualizedMessageViewportHeight = messageViewportPaddingBottom
    ? `calc(${virtualizedMessageViewportBaseHeight}px + ${messageViewportPaddingBottom})`
    : virtualizedMessageViewportBaseHeight;

  useEffect(() => {
    if (!shouldReservePickerClearance || !isStuckToBottom) return;
    const frame = requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [isStuckToBottom, scrollContainerRef, shouldReservePickerClearance]);

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
    profileId,
    onPickerOpenChange: setComposerPickerOpen,
  } as const;

  const composerSurface = (
    <div className='mx-auto w-full max-w-[45rem]'>
      {/* Usage alert remains in the composer slot; message failures render in the transcript. */}
      <ChatUsageAlert />

      {isRateLimited && (
        <p className='mb-1.5 text-xs text-tertiary-token' aria-live='polite'>
          Sending too fast. Please wait a second before your next message.
        </p>
      )}

      <ChatInput
        {...chatInputProps}
        placeholder='Ask Jovie...'
        variant={showThreadView ? 'compact' : 'hero'}
      />
    </div>
  );

  const inlineChatError = chatError ? (
    <div
      className='mx-auto w-full max-w-[44rem] pb-4'
      data-testid='chat-inline-error-slot'
    >
      <ErrorDisplay
        chatError={chatError}
        onRetry={handleRetry}
        isLoading={isLoading}
        isSubmitting={isSubmitting}
      />
    </div>
  ) : null;

  return (
    <EntityResolutionProvider profileId={profileId}>
      <div
        ref={dropZoneRef}
        className='relative flex h-full flex-col bg-(--linear-app-content-surface)'
        data-testid='chat-content'
        data-picker-open={composerPickerOpen ? 'true' : undefined}
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
            Empty chat intentionally renders only the composer. Thread state
            owns the message viewport and the persistent bottom dock. */}
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div
            ref={scrollContainerRef}
            className='relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-5'
            onScroll={onScroll}
          >
            <AnimatePresence mode='popLayout' initial={false}>
              {!showThreadView ? (
                <div
                  key='joviechat-empty-upper'
                  className='relative min-h-full'
                >
                  <div
                    className='relative mx-auto flex min-h-full w-full max-w-[52rem] flex-col items-center justify-center px-1 py-8'
                    data-testid='chat-empty-state-composer-region'
                  >
                    <div
                      className='pointer-events-none absolute left-1/2 top-1/2 h-[min(46vw,28rem)] w-[min(46vw,28rem)] -translate-x-1/2 -translate-y-[60%] opacity-85 drop-shadow-[0_0_34px_rgba(68,188,255,0.18)] max-sm:h-[min(72vw,18rem)] max-sm:w-[min(72vw,18rem)]'
                      style={{
                        maskImage:
                          'radial-gradient(ellipse at center, black 54%, rgba(0,0,0,0.72) 68%, transparent 88%)',
                        WebkitMaskImage:
                          'radial-gradient(ellipse at center, black 54%, rgba(0,0,0,0.72) 68%, transparent 88%)',
                      }}
                      data-testid='chat-empty-state-logo'
                    >
                      <JovieMarkElectric className='h-full w-full' />
                    </div>
                    <div
                      className='relative z-10 w-full'
                      data-testid='chat-empty-state-centered-composer'
                    >
                      {composerSurface}
                      {inlineChatError ? (
                        <div className='mt-3 w-full'>{inlineChatError}</div>
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
                        height: virtualizedMessageViewportHeight,
                      }}
                    >
                      {virtualizer.getVirtualItems().map(virtualItem => {
                        const message = messages[virtualItem.index];
                        const index = virtualItem.index;
                        const isThinking =
                          message.role === 'assistant' &&
                          message.status === 'pending';
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
                      style={{
                        paddingBottom: messageViewportPaddingBottom,
                      }}
                    >
                      {messages.map((message, index) => {
                        const isThinking =
                          message.role === 'assistant' &&
                          message.status === 'pending';
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

                  {inlineChatError}

                  {/* Scroll to bottom button */}
                  <ScrollToBottom
                    visible={!isStuckToBottom}
                    onClick={() => scrollToBottom()}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/*
            Thread composer dock. Empty chat keeps the same composer surface centered
            above, while active threads pin it below the message viewport.
          */}
          {showBottomComposer ? (
            <div
              className={CHAT_COMPOSER_DOCK_CLASSNAME}
              data-testid='chat-composer-dock'
            >
              {composerSurface}
            </div>
          ) : null}
        </div>
      </div>
    </EntityResolutionProvider>
  );
}
