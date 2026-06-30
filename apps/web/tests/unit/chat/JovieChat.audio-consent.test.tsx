/**
 * Regression test: audio inference prompt must NOT be auto-submitted.
 *
 * When an audio file is uploaded and processed, the server returns an inferred
 * first-person prompt. This prompt must be placed in the composer for the user
 * to review/edit before sending — never auto-submitted verbatim.
 *
 * Acceptance criteria from #11950: "An inferred audio prompt is shown to the
 * user for review/edit before submission; nothing is sent verbatim without an
 * explicit action."
 */

import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

// ── Shared mock state ────────────────────────────────────────────────────────

const mockSetInput = vi.fn();
const mockSubmitMessage = vi.fn();
const mockInputRef = {
  current: { focus: vi.fn() } as unknown as HTMLTextAreaElement,
};

const mockChatState = {
  input: '',
  setInput: mockSetInput,
  messages: [],
  chatError: null,
  isLoading: false,
  isSubmitting: false,
  hasMessages: false,
  isLoadingConversation: false,
  conversationTitle: null,
  status: 'ready',
  activeConversationId: null,
  inputRef: mockInputRef,
  handleSubmit: vi.fn(),
  handleRetry: vi.fn(),
  submitMessage: mockSubmitMessage,
  setChatError: vi.fn(),
  isRateLimited: false,
  stop: vi.fn(),
  chipTray: {
    chips: [] as Array<{ type: 'skill'; id: string; uid: string }>,
    addSkill: vi.fn(),
    addEntity: vi.fn(),
    removeAt: vi.fn(),
    removeLast: vi.fn(),
    clear: vi.fn(),
    serialized: '',
  },
};

// Capture the onAudioUploaded callback so tests can fire it directly
let capturedOnAudioUploaded:
  | ((result: {
      fileName: string;
      previewUrl: string;
      releaseId: string;
      releaseTitle: string;
      inference: { match: 'exact'; releaseId: string; confidence: number };
      prompt: string;
    }) => void)
  | undefined;

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
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

vi.mock('@/components/jovie/hooks', () => ({
  useJovieChat: () => mockChatState,
  useChatFileAttachments: (opts: {
    onAudioUploaded?: (result: unknown) => void;
    [key: string]: unknown;
  }) => {
    capturedOnAudioUploaded =
      opts.onAudioUploaded as typeof capturedOnAudioUploaded;
    return {
      pendingFiles: [],
      isDragOver: false,
      isUploading: false,
      hasReadyFiles: false,
      addFiles: vi.fn(),
      removeFile: vi.fn(),
      clearFiles: vi.fn(),
      toFileUIParts: () => [],
      dropZoneRef: { current: null },
      accept: 'image/*,audio/*',
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
        speed: '—',
        eta: '—',
      },
    };
  },
  useStickToBottom: () => ({
    isStuckToBottom: true,
    setStuckToBottom: vi.fn(),
    totalSizeRef: { current: null },
    scrollContainerRef: { current: null },
    bottomSentinelRef: { current: null },
  }),
  useChatJankMonitor: () => ({ onSend: vi.fn() }),
}));

vi.mock('@/lib/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    usePlanGate: () => ({
      isPro: true,
      chatFileUploadLimit: null,
      isLoading: false,
      isError: false,
    }),
    useChatUsageQuery: () => ({ data: null, isLoading: false }),
  };
});

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/app/app/(shell)/chat/ChatEntityPanelContext', () => ({
  useOptionalChatEntityPanel: () => null,
}));

vi.mock('@/components/features/chat/navigation-rail', () => ({
  ChatThreadNavigationRail: () => null,
}));

vi.mock('@/components/jovie/components/ChatProvidersRegistrar', () => ({
  ChatProvidersRegistrar: () => null,
}));

vi.mock('@/components/jovie/components/EntityResolutionProvider', () => ({
  EntityResolutionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => null,
}));

vi.mock('@/components/jovie/components', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/jovie/components')
  >('@/components/jovie/components');
  return {
    ...actual,
    ChatInput: () => <div data-testid='chat-input' />,
    ChatMessage: () => <div data-testid='chat-message' />,
    ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
    ErrorDisplay: () => <div data-testid='chat-error' />,
    ScrollToBottom: () => null,
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JovieChat audio-consent (identity-safety #11950)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnAudioUploaded = undefined;
  });

  it('populates the composer input with the inferred prompt instead of auto-submitting', async () => {
    renderWithQueryClient(<JovieChat profileId='p1' />);

    // The hook should have registered the callback
    expect(capturedOnAudioUploaded).toBeDefined();

    const inferredPrompt =
      'What do you think of my new track "Midnight Drive"?';

    act(() => {
      capturedOnAudioUploaded?.({
        fileName: 'midnight-drive.mp3',
        previewUrl: 'https://cdn.example.com/audio/midnight-drive.mp3',
        releaseId: 'rel-123',
        releaseTitle: 'Midnight Drive',
        inference: { match: 'exact', releaseId: 'rel-123', confidence: 0.95 },
        prompt: inferredPrompt,
      });
    });

    // Must NOT auto-submit — this is the identity-safety invariant
    expect(mockSubmitMessage).not.toHaveBeenCalled();

    // Must populate the composer so the user can review/edit
    expect(mockSetInput).toHaveBeenCalledWith(inferredPrompt);
    expect(mockSetInput).toHaveBeenCalledTimes(1);
  });

  it('focuses the composer after populating the prompt', async () => {
    renderWithQueryClient(<JovieChat profileId='p1' />);

    act(() => {
      capturedOnAudioUploaded?.({
        fileName: 'demo.mp3',
        previewUrl: 'https://cdn.example.com/audio/demo.mp3',
        releaseId: 'rel-456',
        releaseTitle: 'Demo',
        inference: { match: 'exact', releaseId: 'rel-456', confidence: 0.9 },
        prompt: 'Can you review my demo?',
      });
    });

    expect(mockInputRef.current.focus).toHaveBeenCalled();
  });
});
