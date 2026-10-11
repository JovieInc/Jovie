'use client';

// The chat transcript window policy (CHAT_TRANSCRIPT_WINDOW) is certified by the
// JovieChat.styling.test.tsx component render suite.
// @coverage-via apps/web/tests/unit/chat/JovieChat.styling.test.tsx

import { useVirtualizer } from '@tanstack/react-virtual';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useOptionalChatEntityPanel } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { ChatThreadNavigationRail } from '@/components/features/chat/navigation-rail';
import { AUDIO_FILE_ACCEPT } from '@/lib/audio/constants';
import {
  CHAT_TRANSCRIPT_ROW_ESTIMATE_PX,
  CHAT_TRANSCRIPT_WINDOW,
  measureChatTranscriptRow,
} from '@/lib/chat/transcript-window';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { useAppFlag } from '@/lib/flags/client';
import {
  useInsightsSummaryQuery,
  usePendingOpportunityCardsQuery,
  usePlanGate,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  getChatEmptyStateFirstName,
  resolveChatEmptyStateInsight,
} from './chat-empty-greeting';
import { DESKTOP_CONTENT_GRID_ANCHOR } from './chat-empty-starters';
import { CHAT_CONTENT_SHELL_CLASSNAME } from './chat-layout';
import { ChatDropZoneOverlay } from './components/ChatDropZoneOverlay';
import { ChatEmptyStateGreeting } from './components/ChatEmptyStateGreeting';
import { ChatPinnedOpportunityHeader } from './components/ChatPinnedOpportunityHeader';
import { ChatProvidersRegistrar } from './components/ChatProvidersRegistrar';
import { EntityResolutionProvider } from './components/EntityResolutionProvider';
import { OvieEditorialBriefing } from './components/OvieEditorialBriefing';
import {
  useChatFileAttachments,
  useChatJankMonitor,
  useJovieChatController,
  useStickToBottom,
} from './hooks';
import { useChatRailContextTargets } from './hooks/useChatRailContextTargets';
import { useComposerDraftIntent } from './hooks/useComposerDraft';
import {
  CHAT_COMPOSER_DOCK_CLASSNAME,
  CHAT_COMPOSER_SCROLL_FADE_CLASSNAME,
  CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME,
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
  ChatDraftComposerSurface,
  ChatDraftWorkState,
  ChatEmptyStateComposerRegion,
  ChatInlineError,
  ChatLoadingConversationSkeleton,
  ChatThreadMessages,
} from './JovieChatSections';
import type { JovieChatProps } from './types';

const VIRTUALIZATION_THRESHOLD =
  CHAT_TRANSCRIPT_WINDOW.virtualizeAfterMessageCount;
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
  isFirstSession = false,
  isProfileComplete = false,
  chatMode,
  ovieHomeBriefing,
  ambientOwnedByShell = false,
}: JovieChatProps) {
  // TanStack Virtual returns fresh rows from a stable `virtualizer` object. React
  // Compiler caches reads keyed on that object; compiled, ChatThreadMessages froze
  // on its first window and rendered blank once scrolled (JOV-6702). Keep this
  // owner uncompiled too so getTotalSize() and the row element stay live.
  'use no memo';
  const initialQuerySubmitted = useRef(false);
  const initialSkillApplied = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const [composerPickerOpen, setComposerPickerOpen] = useState(false);
  /**
   * Pinned opportunity card for empty-thread → card-open mode
   * (GH #13177 / #13174 / JOV-3933). Declared before useJovieChat so the
   * server receives card facts on every turn.
   */
  const [pinnedOpportunity, setPinnedOpportunity] =
    useState<OpportunityInboxCardViewModel | null>(null);
  // Track message IDs that were loaded from persistence to skip entrance animation
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const initialConversationScrollRef = useRef<string | null>(null);
  const {
    draft,
    setInput,
    messages,
    chatError,
    isLoading,
    isSubmitting,
    hasMessages,
    collapsedSummerFailureCount,
    showCollapsedSummerFailures,
    isLoadingConversation,
    conversationTitle,
    status,
    activeConversationId,
    inputRef,
    handleSubmit,
    handleRetry,
    handleSuggestedPrompt,
    handleInterruptAndSubmit,
    submitMessage,
    setChatError,
    isRateLimited,
    stop,
    chipTray,
  } = useJovieChatController({
    profileId,
    artistContext,
    conversationId,
    onConversationCreate,
    username,
    pinnedOpportunity,
    chatMode,
  });

  // ─── Sticky scroll via ResizeObserver ────────────────────────────
  const {
    isStuckToBottom,
    setStuckToBottom,
    totalSizeRef,
    scrollContainerRef,
    bottomSentinelRef,
  } = useStickToBottom(messages.length);
  const isStuckToBottomRef = useRef(isStuckToBottom);
  isStuckToBottomRef.current = isStuckToBottom;

  // ─── Chat jank instrumentation (flag-gated) ─────────────────
  const jankMonitorEnabled = useAppFlag('CHAT_JANK_MONITOR');
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

  const openAudioEntity = chatEntityPanel?.open;
  const upsertAudioContext = chatEntityPanel?.upsertContext;
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
      upsertAudioContext?.({
        kind: 'release',
        id: result.releaseId,
        label: result.releaseTitle,
        source: 'route-hint',
        focusKey,
      });
      openAudioEntity?.({
        kind: 'release',
        id: result.releaseId,
        label: result.releaseTitle,
        source: 'route-hint',
        focusKey,
      });
      // ponytail: populate composer for review instead of auto-submitting — identity-safety (#11950)
      // sending verbatim violates the identity-sacred / never-speak-for-the-artist guardrail
      setInput(result.prompt);
      inputRef.current?.focus();
    },
    [openAudioEntity, upsertAudioContext, setInput, inputRef]
  );

  const handleUploadError = useCallback(
    (message: string) => setChatError({ type: 'unknown', message }),
    [setChatError]
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
    onError: handleUploadError,
    onAudioUploaded: handleAudioUploaded,
    resetKey: activeConversationId ?? conversationId ?? null,
  });

  // Manifest collapse state: when uploading and user scrolls/types, show collapsed bar
  const [manifestCollapsed, setManifestCollapsed] = useState(false);
  const collapseManifest = useCallback(() => setManifestCollapsed(true), []);
  const expandManifest = useCallback(() => setManifestCollapsed(false), []);
  const showManifest =
    pendingFiles.length > 0 &&
    (isUploading ||
      aggregate.done < aggregate.total ||
      manifestCollapsed === false);
  const showChips = !isUploading && hasReadyFiles;

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openAudioPicker = useCallback(() => {
    audioFileInputRef.current?.click();
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
  const knownConversationKey = activeConversationId ?? conversationId ?? null;
  const railContextTargets = useChatRailContextTargets({
    conversationKey: knownConversationKey,
    messages,
    profile: profileId ? { id: profileId, label: profileRailLabel } : null,
  });
  const clearRailContexts = chatEntityPanel?.clearContexts;
  const upsertRailContexts = chatEntityPanel?.upsertContexts;

  useEffect(() => {
    if (railContextTargets.length === 0) {
      clearRailContexts?.();
      return;
    }

    upsertRailContexts?.(railContextTargets);
  }, [clearRailContexts, upsertRailContexts, railContextTargets]);

  const knownConversationSeedRef = useRef<string | null>(null);
  if (knownConversationSeedRef.current !== knownConversationKey) {
    knownConversationSeedRef.current = knownConversationKey;
    knownMessageIdsRef.current = new Set(messages.map(message => message.id));
  } else if (knownMessageIdsRef.current.size === 0 && messages.length > 0) {
    knownMessageIdsRef.current = new Set(messages.map(message => message.id));
  }

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => CHAT_TRANSCRIPT_ROW_ESTIMATE_PX,
    overscan: CHAT_TRANSCRIPT_WINDOW.overscanRowCount,
    // The scroll viewport mounts after history resolves; seed from the live
    // scrollTop so a scroll that landed before the offset observer attached
    // isn't replayed as offset 0 (JOV-6702).
    initialOffset: () => scrollContainerRef.current?.scrollTop ?? 0,
    measureElement: el =>
      measureChatTranscriptRow(el, scrollContainerRef.current),
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
  const searchParams = useSearchParams();
  const deepLinkOpportunityId = searchParams.get('opportunityId');

  // Pending opportunity cards load only to resolve an ?opportunityId= pin
  // deep link (JOV-3933). The empty-chat card stack is retired (JOV-7150):
  // the empty state is one sentence plus the composer, nothing else.
  const conversationExists = Boolean(
    hasMessages || conversationId || activeConversationId
  );
  const conversationInProgress = isLoading || isSubmitting || isStreaming;
  // Once a deep-linked pin is applied (or dismissed) it stays handled so
  // unpinning can't re-pin the same card while the param is still in the URL.
  // Reset for each URL change so returning to the same link can pin it again.
  const [handledDeepLinkId, setHandledDeepLinkId] = useState<string | null>(
    null
  );
  const deepLinkHandled =
    deepLinkOpportunityId !== null &&
    handledDeepLinkId === deepLinkOpportunityId;
  const shouldLoadOpportunityCards = Boolean(
    chatMode !== 'ov' &&
      deepLinkOpportunityId &&
      !pinnedOpportunity &&
      !deepLinkHandled
  );
  const { data: pendingOpportunityCards = [] } =
    usePendingOpportunityCardsQuery({
      enabled: shouldLoadOpportunityCards,
    });

  const handleUnpinOpportunity = useCallback(() => {
    setHandledDeepLinkId(deepLinkOpportunityId);
    setPinnedOpportunity(null);
  }, [deepLinkOpportunityId]);

  useEffect(() => {
    setHandledDeepLinkId(null);
  }, [deepLinkOpportunityId]);

  // Deep-link: /app/chat?opportunityId=<uuid> pins the matching card.
  useEffect(() => {
    if (!deepLinkOpportunityId || pinnedOpportunity || deepLinkHandled) {
      return;
    }
    const match = pendingOpportunityCards.find(
      card => card.id === deepLinkOpportunityId
    );
    if (match) {
      setHandledDeepLinkId(deepLinkOpportunityId);
      setPinnedOpportunity(match);
    }
  }, [
    deepLinkOpportunityId,
    deepLinkHandled,
    pendingOpportunityCards,
    pinnedOpportunity,
  ]);

  // Clear pin when navigating to a different conversation (not for new empty threads).
  useEffect(() => {
    if (conversationId && !deepLinkOpportunityId) {
      setPinnedOpportunity(null);
    }
  }, [conversationId, deepLinkOpportunityId]);

  // Pin mode uses the thread chrome (docked composer + header) so the card
  // stays above the transcript, matching inbox → pinned-card behavior.
  const showThreadView =
    conversationExists || conversationInProgress || pinnedOpportunity !== null;
  const showBottomComposer = showThreadView;
  const showOvieBriefing =
    chatMode === 'ov' && ovieHomeBriefing != null && !showThreadView;
  const hasDraftIntent = useComposerDraftIntent(
    draft,
    !showThreadView && !showOvieBriefing
  );
  const composerHasIntent =
    composerPickerOpen || hasDraftIntent || chipTray.chips.length > 0;
  // JOV-7150: the empty state is one sentence — a real insight when one
  // exists, otherwise a plain greeting — above the composer. No cards, no
  // chips, no demo exchange, no competing CTA surface. While the composer
  // carries intent (typing, picker open, chips) even the greeting steps
  // back so the composer owns attention.
  const chatEmptyStateFirstName = getChatEmptyStateFirstName(displayName);
  const showEmptyGreeting =
    !showThreadView && !showOvieBriefing && !composerHasIntent;
  const { data: insightsSummary } = useInsightsSummaryQuery({
    enabled: showEmptyGreeting,
  });
  const topActiveInsightTitle =
    insightsSummary?.insights.find(insight => insight.status === 'active')
      ?.title ?? null;
  const chatEmptyStateInsight = resolveChatEmptyStateInsight({
    topInsightTitle: topActiveInsightTitle,
    isProfileComplete,
    isFirstSession,
  });
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
    const applyMinHeight = () => {
      const nextMinHeight = container.clientHeight;
      setVirtualizedMinHeight(prev =>
        prev === nextMinHeight ? prev : nextMinHeight
      );
    };
    applyMinHeight();

    if (typeof ResizeObserver === 'undefined') return;
    let lastHeight = container.clientHeight;
    const observer = new ResizeObserver(() => {
      const nextHeight = container.clientHeight;
      // Zero-height mount (hidden workspace surface, pre-layout first paint)
      // can leave cached ~0px row heights and a stale scroll offset. Once the
      // viewport is real, drop the cache and re-anchor a pinned transcript to
      // the live tail (JOV-6702).
      if (lastHeight === 0 && nextHeight > 0) {
        virtualizer.measure();
        if (isStuckToBottomRef.current) {
          scrollToBottom('auto');
        }
      }
      lastHeight = nextHeight;
      applyMinHeight();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [
    showThreadView,
    shouldVirtualizeMessages,
    scrollContainerRef,
    messages.length,
    virtualizer,
    scrollToBottom,
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

  // A reserved/first-token conversation fetch must not unmount a live turn.
  // Electron hits this when the thread URL is reserved as the answer starts.
  const chatInputProps = useMemo(
    () => ({
      desktopConversationReady: !isLoadingConversation,
      ref: inputRef,
      onChange: setInput,
      onSubmit: handleSubmitWithFiles,
      onInterruptAndSend: handleInterruptAndSubmit,
      isLoading,
      isSubmitting,
      isStreaming,
      onStop: stop,
      onFileAttach: openFilePicker,
      onAudioAttach: openAudioPicker,
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
    }),
    [
      isLoadingConversation,
      inputRef,
      setInput,
      handleSubmitWithFiles,
      handleInterruptAndSubmit,
      isLoading,
      isSubmitting,
      isStreaming,
      stop,
      openFilePicker,
      openAudioPicker,
      isUploading,
      pendingFiles,
      removeFile,
      handlePaste,
      chipTray.chips,
      chipTray.removeAt,
      chipTray.removeLast,
      chipTray.addSkill,
      chipTray.addEntity,
      profileId,
    ]
  );

  const workStateReporter = (
    <ChatDraftWorkState
      draft={draft}
      hasAttachments={pendingFiles.length > 0}
      isUploading={isUploading}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      isLoadingConversation={isLoadingConversation}
      status={status}
      messages={messages}
    />
  );
  if (isLoadingConversation && !hasMessages && !conversationInProgress) {
    return (
      <>
        {workStateReporter}
        <ChatLoadingConversationSkeleton />
      </>
    );
  }

  const composerSurface = (
    <ChatDraftComposerSurface
      draft={draft}
      chatInputProps={chatInputProps}
      chatMode={chatMode}
      showThreadView={showThreadView}
      // one-chrome-layer-v1: the Ovie briefing owns the empty-state chrome
      // layer, so the usage banner yields to it.
      suppressUsageAlert={showOvieBriefing}
      isRateLimited={isRateLimited}
      showManifest={showManifest}
      manifestCollapsed={manifestCollapsed}
      showChips={showChips}
      pendingFiles={pendingFiles}
      aggregate={aggregate}
      isUploading={isUploading}
      isPro={isProUser}
      onRemoveFile={removeFile}
      onCollapseManifest={collapseManifest}
      onExpandManifest={expandManifest}
    />
  );

  const inlineChatError =
    chatError && !chatError.suppressComposerPause ? (
      <ChatInlineError
        chatError={chatError}
        onRetry={handleRetry}
        isLoading={isLoading}
        isSubmitting={isSubmitting}
        chatMode={chatMode}
      />
    ) : null;

  const content = (
    <EntityResolutionProvider profileId={profileId}>
      <div
        className={cn(
          'relative flex h-full flex-col',
          // On chat routes the shell frame paints the canvas fill + ambient
          // wash behind a transparent header (#13386); an opaque fill here
          // would occlude it below the header band.
          !ambientOwnedByShell && 'bg-(--app-shell-content-surface)'
        )}
        data-testid='chat-content'
        data-picker-open={composerPickerOpen ? 'true' : undefined}
      >
        {/* Ambient background wash — fills the full chat viewport so the
            gradient never clips to a content-sized region (#12135 / JOV-3614).
            Pure background: pointer-events-none, painted behind the positioned
            siblings below by DOM order; top-weighted so it fades out well
            above the opaque composer dock. No layout shift.
            On chat routes the shell frame owns this layer instead so the wash
            is full-bleed behind the header to the top of the panel (#13386). */}
        {ambientOwnedByShell ? null : (
          <div
            aria-hidden='true'
            data-testid='chat-ambient-gradient'
            className='pointer-events-none absolute inset-0 h-full w-full'
            style={{
              background:
                'radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--color-accent-blue) 6%, transparent), transparent 60%)',
            }}
          />
        )}
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
        <input
          ref={audioFileInputRef}
          type='file'
          accept={AUDIO_FILE_ACCEPT}
          onChange={handleFileChange}
          className='hidden'
          tabIndex={-1}
          data-testid='chat-audio-file-input'
        />

        {/* Persistent scroll viewport (flex-1) + morphing upper content.
            Empty chat docks the composer; the feature-intro card sits above
            it. Thread state owns the message viewport and the persistent
            bottom dock. The drop overlay is clipped to this workspace so it
            cannot cover the header, composer, sidebar, or entity rail. */}
        <div
          ref={dropZoneRef}
          className='relative flex flex-1 flex-col overflow-hidden'
          data-testid='chat-workspace'
          data-chat-drag-over={isDragOver ? 'true' : undefined}
        >
          <div
            ref={scrollContainerRef}
            data-testid='chat-message-scroll'
            className={cn(
              'absolute inset-0 overflow-y-auto',
              showThreadView
                ? 'px-4 py-5 sm:px-5'
                : CHAT_EMPTY_VIEWPORT_CLASSNAME,
              showBottomComposer &&
                CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME
            )}
          >
            {!showThreadView ? (
              <div
                className='flex min-h-0 flex-1 flex-col'
                data-empty-affordance={
                  showOvieBriefing
                    ? 'ovie-briefing'
                    : showEmptyGreeting
                      ? 'greeting'
                      : 'none'
                }
                data-grid-anchor={DESKTOP_CONTENT_GRID_ANCHOR}
                data-testid='chat-empty-state-viewport'
                data-top-spacing-owner={CHAT_EMPTY_TOP_SPACING_OWNER}
              >
                {showOvieBriefing ? (
                  <ChatEmptyStateComposerRegion
                    stableDocked
                    fullBleed
                    above={
                      <OvieEditorialBriefing
                        briefing={ovieHomeBriefing}
                        onSelectAction={handleSuggestedPrompt}
                      />
                    }
                  >
                    <div className={CHAT_CONTENT_SHELL_CLASSNAME}>
                      {composerSurface}
                      {inlineChatError ? (
                        <div className='mt-3 w-full'>{inlineChatError}</div>
                      ) : null}
                    </div>
                  </ChatEmptyStateComposerRegion>
                ) : (
                  <ChatEmptyStateComposerRegion
                    stableDocked
                    above={
                      showEmptyGreeting ? (
                        <ChatEmptyStateGreeting
                          firstName={chatEmptyStateFirstName}
                          insight={chatEmptyStateInsight}
                        />
                      ) : undefined
                    }
                  >
                    {composerSurface}
                    {inlineChatError ? (
                      <div className='mt-3 w-full'>{inlineChatError}</div>
                    ) : null}
                  </ChatEmptyStateComposerRegion>
                )}
              </div>
            ) : (
              <>
                {pinnedOpportunity ? (
                  <ChatPinnedOpportunityHeader
                    card={pinnedOpportunity}
                    onUnpin={handleUnpinOpportunity}
                  />
                ) : null}
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
                  conversationId={activeConversationId ?? conversationId}
                  collapsedFailureCount={collapsedSummerFailureCount}
                  onShowCollapsedFailures={showCollapsedSummerFailures}
                />
              </>
            )}
          </div>

          <ChatDropZoneOverlay
            isDragOver={isDragOver}
            pendingFiles={pendingFiles}
          />

          {/*
            Thread composer dock. Empty chat keeps the same composer surface centered
            in the scroll viewport; active threads float it over the transcript with
            a scroll-behind fade so the last message never hard-stops at the input.
          */}
          {showThreadView ? (
            <ChatThreadNavigationRail
              messages={messages}
              scopeKey={JSON.stringify([
                profileId ?? null,
                chatMode ?? null,
                knownConversationKey,
              ])}
              scrollContainerRef={scrollContainerRef}
              shouldVirtualizeMessages={shouldVirtualizeMessages}
              virtualizer={virtualizer}
            />
          ) : null}

          {showBottomComposer ? (
            <>
              <div
                aria-hidden='true'
                className={CHAT_COMPOSER_SCROLL_FADE_CLASSNAME}
              />
              <div
                className={CHAT_COMPOSER_DOCK_CLASSNAME}
                data-testid='chat-composer-dock'
              >
                {composerSurface}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </EntityResolutionProvider>
  );
  return (
    <>
      {workStateReporter}
      {content}
    </>
  );
}
