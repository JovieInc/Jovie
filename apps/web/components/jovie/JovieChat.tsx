'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOptionalChatEntityPanel } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { useAppFlag } from '@/lib/flags/client';
import { usePlanGate } from '@/lib/queries';

import { deriveChatRailContextTargets } from './chat-context-rail';
import { ChatDropZoneOverlay } from './components/ChatDropZoneOverlay';
import { ChatProvidersRegistrar } from './components/ChatProvidersRegistrar';
import { EntityResolutionProvider } from './components/EntityResolutionProvider';
import {
  useChatFileAttachments,
  useChatJankMonitor,
  useJovieChat,
  useStickToBottom,
} from './hooks';
import {
  CHAT_COMPOSER_DOCK_CLASSNAME,
  ChatComposerSurface,
  ChatEmptyStateComposerRegion,
  ChatInlineError,
  ChatLoadingConversationSkeleton,
  ChatThreadMessages,
} from './JovieChatSections';
import type { JovieChatProps } from './types';

const VIRTUALIZATION_THRESHOLD = 12;
const CHAT_PICKER_THREAD_CLEARANCE = 'min(620px, calc(100vh - 8rem))';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // ─── Sticky scroll via ResizeObserver ────────────────────────────
  const {
    isStuckToBottom,
    setStuckToBottom,
    totalSizeRef,
    scrollContainerRef,
    bottomSentinelRef,
  } = useStickToBottom({ messageCount: messages.length });

  // ─── Chat jank instrumentation (flag-gated) ─────────────────
  const jankMonitorEnabled = useAppFlag('CHAT_JANK_MONITOR');
  const designV1ChatEntitiesEnabled = useAppFlag('DESIGN_V1');
  const { chatFileUploadLimit, isPro: isProUser } = usePlanGate();
  const chatEntityPanel = useOptionalChatEntityPanel();
  const { onSend: notifyJankSend } = useChatJankMonitor({
    conversationId: activeConversationId,
    messages,
    status,
    isStuckToBottom,
    scrollContainerRef,
    enabled: jankMonitorEnabled,
  });

  const handleAudioUploaded = useCallback(
    (result: {
      fileName: string;
      previewUrl: string;
      releaseId: string;
      releaseTitle: string;
      inference: import('@/lib/chat/infer-audio-entity').AudioEntityInference;
      prompt: string;
    }) => {
      const focusKey = `audio-upload:${result.releaseId}`;
      chatEntityPanel?.upsertContext({
        kind: 'release',
        id: result.releaseId,
        label: result.releaseTitle,
        source: 'route-hint',
        focusKey,
      });
      chatEntityPanel?.open({
        kind: 'release',
        id: result.releaseId,
        label: result.releaseTitle,
        source: 'route-hint',
        focusKey,
      });
      notifyJankSend();
      void submitMessage(result.prompt);
    },
    [chatEntityPanel, notifyJankSend, submitMessage]
  );

  const {
    pendingFiles,
    isDragOver,
    isUploading,
    hasReadyFiles,
    addFiles,
    removeFile,
    clearFiles,
    toFileUIParts,
    dropZoneRef,
    accept: fileAccept,
    aggregate,
  } = useChatFileAttachments({
    fileUploadLimit: chatFileUploadLimit,
    onError: error => setChatError({ type: 'unknown', message: error }),
    onAudioUploaded: handleAudioUploaded,
    disabled: isLoading || isSubmitting,
  });

  // Manifest collapse state: when uploading and user scrolls/types, show collapsed bar
  const [manifestCollapsed, setManifestCollapsed] = useState(false);
  const showManifest =
    pendingFiles.length > 0 &&
    (isUploading ||
      aggregate.done < aggregate.total ||
      manifestCollapsed === false);
  const showChips = !isUploading && hasReadyFiles;

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.items)
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  const handleSubmitWithFiles = useCallback(
    (e?: React.FormEvent) => {
      if (isLoading || isSubmitting) return;
      const files = toFileUIParts();
      notifyJankSend();
      handleSubmit(e, files.length > 0 ? files : undefined);
      clearFiles();
      setManifestCollapsed(false);
    },
    [
      handleSubmit,
      toFileUIParts,
      clearFiles,
      setManifestCollapsed,
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
  const [virtualizedMinHeight, setVirtualizedMinHeight] = useState(0);
  const scrollThreadToBottom = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [scrollContainerRef]);

  useLayoutEffect(() => {
    if (!showThreadView || !shouldVirtualizeMessages) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const nextMinHeight = container.clientHeight;
    setVirtualizedMinHeight(prev =>
      prev === nextMinHeight ? prev : nextMinHeight
    );
  }, [
    showThreadView,
    shouldVirtualizeMessages,
    scrollContainerRef,
    messages.length,
  ]);

  const virtualizedMessageViewportBaseHeight = Math.max(
    virtualizer.getTotalSize(),
    scrollContainerRef.current?.clientHeight ?? 0,
    virtualizedMinHeight
  );
  const virtualizedMessageViewportHeight = messageViewportPaddingBottom
    ? `calc(${virtualizedMessageViewportBaseHeight}px + ${messageViewportPaddingBottom})`
    : virtualizedMessageViewportBaseHeight;

  useLayoutEffect(() => {
    if (!shouldReservePickerClearance) return;
    let frame: number | null = null;
    let settleFrame: number | null = null;
    const scheduleScroll = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (settleFrame !== null) {
        cancelAnimationFrame(settleFrame);
      }
      frame = requestAnimationFrame(() => {
        scrollThreadToBottom();
        settleFrame = requestAnimationFrame(scrollThreadToBottom);
      });
    };

    scheduleScroll();
    window.addEventListener('resize', scheduleScroll);
    window.visualViewport?.addEventListener('resize', scheduleScroll);

    const scrollContainer = scrollContainerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    if (scrollContainer && typeof ResizeObserver !== 'undefined') {
      try {
        resizeObserver = new ResizeObserver(scheduleScroll);
        resizeObserver.observe(scrollContainer);
      } catch {
        resizeObserver = null;
      }
    }

    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (settleFrame !== null) {
        cancelAnimationFrame(settleFrame);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleScroll);
      window.visualViewport?.removeEventListener('resize', scheduleScroll);
    };
  }, [scrollContainerRef, scrollThreadToBottom, shouldReservePickerClearance]);

  if (isLoadingConversation) {
    return <ChatLoadingConversationSkeleton />;
  }

  const chatInputProps = {
    ref: inputRef,
    value: input,
    onChange: setInput,
    onSubmit: handleSubmitWithFiles,
    isLoading,
    isSubmitting,
    isStreaming,
    onStop: stop,
    onFileAttach: openFilePicker,
    isFileProcessing: isUploading,
    pendingFiles,
    onRemoveFile: removeFile,
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
    <ChatComposerSurface
      chatInputProps={chatInputProps}
      showThreadView={showThreadView}
      isRateLimited={isRateLimited}
      showManifest={showManifest}
      manifestCollapsed={manifestCollapsed}
      showChips={showChips}
      pendingFiles={pendingFiles}
      aggregate={aggregate}
      isUploading={isUploading}
      isPro={isProUser}
      onRemoveFile={removeFile}
      onCollapseManifest={() => setManifestCollapsed(true)}
      onExpandManifest={() => setManifestCollapsed(false)}
    />
  );

  const inlineChatError = chatError ? (
    <ChatInlineError
      chatError={chatError}
      onRetry={handleRetry}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
    />
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

        {/* Hidden file input for composer attachments */}
        <input
          ref={fileInputRef}
          type='file'
          accept={fileAccept}
          onChange={handleFileChange}
          multiple
          className='hidden'
          tabIndex={-1}
        />

        {/* Drag-and-drop overlay */}
        <ChatDropZoneOverlay
          isDragOver={isDragOver}
          pendingFiles={pendingFiles}
        />

        {/* Persistent scroll viewport (flex-1) + morphing upper content.
            Empty chat intentionally renders only the composer. Thread state
            owns the message viewport and the persistent bottom dock. */}
        <div className='flex flex-1 flex-col overflow-hidden'>
          <div
            ref={scrollContainerRef}
            className='relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-5'
          >
            {!showThreadView ? (
              <div className='relative min-h-full'>
                <ChatEmptyStateComposerRegion>
                  {composerSurface}
                  {inlineChatError ? (
                    <div className='mt-3 w-full'>{inlineChatError}</div>
                  ) : null}
                </ChatEmptyStateComposerRegion>
              </div>
            ) : (
              <ChatThreadMessages
                messages={messages}
                shouldVirtualizeMessages={shouldVirtualizeMessages}
                virtualizer={virtualizer}
                virtualizedMessageViewportHeight={
                  virtualizedMessageViewportHeight
                }
                virtualizedMinHeight={virtualizedMinHeight}
                messageViewportPaddingBottom={messageViewportPaddingBottom}
                totalSizeRef={totalSizeRef}
                bottomSentinelRef={bottomSentinelRef}
                isStreaming={isStreaming}
                lastAssistantIndex={lastAssistantIndex}
                avatarUrl={avatarUrl}
                profileId={profileId}
                knownMessageIds={knownMessageIdsRef.current}
                inlineChatError={inlineChatError}
                isStuckToBottom={isStuckToBottom}
                onScrollToBottom={() => scrollToBottom()}
              />
            )}
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
