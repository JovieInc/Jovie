import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

const { mockChatState, mockFileState, useChatFileAttachmentsSpy } = vi.hoisted(
  () => {
    const chatState = {
      input: '',
      setInput: vi.fn(),
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      ],
      chatError: null,
      isLoading: false,
      isSubmitting: false,
      hasMessages: true,
      isLoadingConversation: false,
      conversationTitle: null,
      status: 'ready' as 'ready' | 'streaming',
      activeConversationId: null as string | null,
      inputRef: { current: null },
      handleSubmit: vi.fn(),
      handleRetry: vi.fn(),
      handleSuggestedPrompt: vi.fn(),
      handleInterruptAndSubmit: vi.fn(),
      submitMessage: vi.fn(),
      setChatError: vi.fn(),
      isRateLimited: false,
      stop: vi.fn(),
      chipTray: {
        chips: [],
        addSkill: vi.fn(),
        addEntity: vi.fn(),
        removeAt: vi.fn(),
        removeLast: vi.fn(),
        clear: vi.fn(),
        serialized: '',
      },
    };

    const fileState = {
      pendingFiles: [],
      isDragOver: false,
      isUploading: false,
      hasReadyFiles: false,
      addFiles: vi.fn(),
      removeFile: vi.fn(),
      clearFiles: vi.fn(),
      toFileUIParts: () => [],
      dropZoneRef: { current: null },
      accept: 'image/*,audio/*,video/*',
      aggregate: {
        total: 0,
        done: 0,
        uploading: 0,
        queued: 0,
        errors: 0,
        duplicates: 0,
        locked: 0,
        totalBytes: 0,
        uploadedBytes: 0,
        overallPct: 0,
        speed: '-',
        eta: '-',
      },
    };

    return {
      mockChatState: chatState,
      mockFileState: fileState,
      useChatFileAttachmentsSpy: vi.fn(() => fileState),
    };
  }
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
  usePathname: () => '/app/chat',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { readonly count: number }) => ({
    getTotalSize: () => count * 80,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 80,
      })),
    measureElement: () => undefined,
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('@/app/app/(shell)/chat/ChatEntityPanelContext', () => ({
  useOptionalChatEntityPanel: () => null,
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    events: {
      list: (profileId: string) => ['events', 'list', profileId],
    },
    releases: {
      matrix: (profileId: string) => ['releases', 'matrix', profileId],
    },
  },
  useChatUsageQuery: () => ({
    data: null,
    isLoading: false,
  }),
  usePlanGate: () => ({
    isPro: true,
    chatFileUploadLimit: null,
    isLoading: false,
    isError: false,
  }),
  usePendingOpportunityCardsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/components/jovie/hooks', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/jovie/hooks')>();
  return {
    ...actual,
    useJovieChat: () => mockChatState,
    useChatFileAttachments: useChatFileAttachmentsSpy,
    useStickToBottom: () => ({
      isStuckToBottom: true,
      setStuckToBottom: vi.fn(),
      onScroll: vi.fn(),
      totalSizeRef: vi.fn(),
      scrollContainerRef: { current: null },
      bottomSentinelRef: vi.fn(),
    }),
    useChatJankMonitor: () => ({
      onSend: vi.fn(),
      getSummary: () => ({
        conversationId: null,
        jankEventCount: 0,
        messageDisappearCount: 0,
        duplicateCount: 0,
        reorderCount: 0,
        tokenRollbackCount: 0,
        streamStallCount: 0,
        unexpectedScrollJumpCount: 0,
        noVisibleFeedbackCount: 0,
        isJankFree: true,
      }),
    }),
  };
});

vi.mock('@/components/jovie/components', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/jovie/components')>();
  return {
    ...actual,
    ChatInput: () => <div data-testid='chat-input' />,
  };
});

describe('JovieChat transient surfaces (JOV-5413)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChatState.isLoading = false;
    mockChatState.isLoadingConversation = false;
    mockChatState.hasMessages = true;
    mockChatState.status = 'ready';
    mockChatState.activeConversationId = null;
    mockFileState.isDragOver = false;
  });

  afterEach(() => {
    mockFileState.isDragOver = false;
  });

  it('keeps the drop overlay inside the workspace and out of the composer dock', () => {
    mockFileState.isDragOver = true;

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' conversationId='thread-1' />
    );

    const workspace = container.querySelector(
      '[data-testid="chat-workspace"]'
    ) as HTMLElement;
    const overlay = container.querySelector(
      '[data-testid="chat-drop-zone-overlay"]'
    ) as HTMLElement;
    const composerDock = container.querySelector(
      '[data-testid="chat-composer-dock"]'
    ) as HTMLElement;

    expect(workspace).toBeTruthy();
    expect(overlay).toBeTruthy();
    expect(composerDock).toBeTruthy();
    expect(workspace).toContainElement(overlay);
    expect(workspace).toContainElement(composerDock);
    expect(overlay).not.toContainElement(composerDock);
    expect(workspace).toHaveAttribute('data-chat-drag-over', 'true');
    expect(
      composerDock.compareDocumentPosition(overlay) &
        Node.DOCUMENT_POSITION_PRECEDING
    ).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(useChatFileAttachmentsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resetKey: 'thread-1' })
    );
  });

  it('preserves composer dock geometry across idle, loading, and drag', () => {
    const idle = renderWithQueryClient(<JovieChat profileId='profile-1' />);
    const idleDock = idle.container.querySelector(
      '[data-testid="chat-composer-dock"]'
    );
    const idleClassName = idleDock?.className;
    idle.unmount();

    mockChatState.isLoading = true;
    mockChatState.status = 'streaming';
    const loading = renderWithQueryClient(<JovieChat profileId='profile-1' />);
    const loadingDock = loading.container.querySelector(
      '[data-testid="chat-composer-dock"]'
    );
    expect(loadingDock?.className).toBe(idleClassName);
    expect(
      loading.container.querySelector('[data-testid="chat-input"]')
    ).toBeTruthy();
    loading.unmount();

    mockFileState.isDragOver = true;
    const drag = renderWithQueryClient(<JovieChat profileId='profile-1' />);
    const dragDock = drag.container.querySelector(
      '[data-testid="chat-composer-dock"]'
    );
    expect(dragDock?.className).toBe(idleClassName);
    expect(
      drag.container.querySelector('[data-testid="chat-input"]')
    ).toBeTruthy();
    const dragOverlay = drag.container.querySelector(
      '[data-testid="chat-drop-zone-overlay"]'
    ) as HTMLElement;
    expect(dragOverlay).not.toContainElement(dragDock as HTMLElement);
  });
});
