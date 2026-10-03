/**
 * Regression test for GH-11950 / ponytail identity-safety fix:
 * When audio is uploaded, the inferred prompt must be placed in the
 * composer input for user review — NOT auto-submitted.
 *
 * Verifies:
 *  - setInput is called with the inferred prompt
 *  - submitMessage is NOT called
 *  - notifyJankSend is NOT called (no jank instrumentation for a non-send)
 */

import { act, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ChatEntityPanelProvider,
  useChatEntityPanel,
} from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { createComposerDraft } from '@/components/jovie/hooks/useComposerDraft';
import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

// ── Captured mock state (hoisted so vi.mock factories can close over it) ──────
const capturedCallbacks = vi.hoisted(() => ({
  onAudioUploaded: null as
    | ((result: {
        fileName: string;
        previewUrl: string;
        releaseId: string;
        releaseTitle: string;
        inference: import('@/lib/chat/infer-audio-entity').AudioEntityInference;
        prompt: string;
      }) => void)
    | null,
}));

const mockFns = vi.hoisted(() => ({
  setInput: vi.fn(),
  submitMessage: vi.fn(),
  notifyJankSend: vi.fn(),
}));

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => ({
    profileCompletion: {
      percentage: 100,
      completedCount: 4,
      totalCount: 4,
      steps: [],
      profileIsLive: true,
    },
  }),
}));

vi.mock('@/components/jovie/hooks', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/jovie/hooks')>();
  const { useRef, useState } = await import('react');
  return {
    ...actual,
    useSuggestedProfiles: () => ({
      isLoading: false,
      total: 0,
      suggestions: [],
      currentIndex: 0,
      next: vi.fn(),
      prev: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
      isActioning: false,
    }),
    useJovieChatController: () => ({
      draft: useState(() => createComposerDraft(''))[0],
      setInput: mockFns.setInput,
      messages: [],
      chatError: null,
      isLoading: false,
      isSubmitting: false,
      hasMessages: false,
      isLoadingConversation: false,
      conversationTitle: null,
      status: 'idle',
      activeConversationId: null,
      inputRef: useRef<HTMLTextAreaElement>(null),
      handleSubmit: vi.fn(),
      handleRetry: vi.fn(),
      handleSuggestedPrompt: vi.fn(),
      submitMessage: mockFns.submitMessage,
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
    }),
    useChatFileAttachments: (opts: {
      onAudioUploaded?: (result: unknown) => void;
    }) => {
      // Capture the callback so we can invoke it from tests
      capturedCallbacks.onAudioUploaded = opts.onAudioUploaded ?? null;
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
          speed: '—',
          eta: '—',
        },
      };
    },
    useChatJankMonitor: () => ({
      onSend: mockFns.notifyJankSend,
    }),
    useStickToBottom: () => ({
      isStuckToBottom: false,
      setStuckToBottom: vi.fn(),
      totalSizeRef: { current: 0 },
      scrollContainerRef: { current: null },
      bottomSentinelRef: { current: null },
    }),
  };
});

vi.mock('@/components/jovie/components', () => ({
  ChatInput: ({ ref }: { ref?: React.Ref<HTMLTextAreaElement> }) => (
    <textarea
      ref={ref}
      aria-label='Audio review draft'
      data-testid='chat-input'
    />
  ),
  ChatMessage: () => <div data-testid='chat-message' />,
  ChatConversationComposerSkeleton: () => (
    <div data-testid='chat-conversation-composer-skeleton' />
  ),
  ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
  ChatEmptyStateComposerRegion: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid='chat-empty-state'>{children}</div>,
  ChatFileChips: () => null,
  ChatUploadManifest: () => null,
  ErrorDisplay: () => <div data-testid='chat-error' />,
  ScrollToBottom: () => null,
  SuggestedProfilesCarousel: () => null,
  SuggestedPrompts: () => null,
}));

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='chat-usage' />,
}));

// ── DOM setup ─────────────────────────────────────────────────────────────────

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  globalThis.HTMLElement.prototype,
  'scrollIntoView'
);

beforeAll(() => {
  Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(
      globalThis.HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView
    );
  } else {
    delete (globalThis.HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  }
});

function AudioPanelProbe({
  capture,
}: {
  capture: (panel: ReturnType<typeof useChatEntityPanel>) => void;
}) {
  const panel = useChatEntityPanel();
  useLayoutEffect(() => capture(panel), [capture, panel]);
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JovieChat audio upload — review-before-send (GH-11950)', () => {
  it('populates the composer input with the inferred prompt when audio is uploaded', () => {
    renderWithQueryClient(<JovieChat profileId='profile-1' />);

    // Verify useChatFileAttachments received the callback
    expect(capturedCallbacks.onAudioUploaded).toBeTypeOf('function');

    const audioResult = {
      fileName: 'my-track.mp3',
      previewUrl: 'blob:http://localhost/abc',
      releaseId: 'rel-123',
      releaseTitle: 'My Track',
      inference: {
        kind: 'release' as const,
        releaseId: 'rel-123',
        artistId: 'artist-1',
        confidence: 0.9,
      },
      prompt: 'Tell me about My Track',
    };

    // Fire the audio-uploaded callback (simulates upload completing)
    capturedCallbacks.onAudioUploaded!(audioResult);

    // setInput must have been called with the prompt text
    expect(mockFns.setInput).toHaveBeenCalledWith('Tell me about My Track');
  });

  it('does NOT auto-submit the message when audio is uploaded', () => {
    renderWithQueryClient(<JovieChat profileId='profile-1' />);

    expect(capturedCallbacks.onAudioUploaded).toBeTypeOf('function');

    capturedCallbacks.onAudioUploaded!({
      fileName: 'song.mp3',
      previewUrl: 'blob:http://localhost/xyz',
      releaseId: 'rel-999',
      releaseTitle: 'Song',
      inference: {
        kind: 'release' as const,
        releaseId: 'rel-999',
        artistId: 'artist-2',
        confidence: 0.8,
      },
      prompt: 'What about Song?',
    });

    // submitMessage must NOT have been called — user reviews before sending
    expect(mockFns.submitMessage).not.toHaveBeenCalled();
  });

  it('does NOT trigger jank instrumentation when audio is uploaded (no send occurred)', () => {
    renderWithQueryClient(<JovieChat profileId='profile-1' />);

    expect(capturedCallbacks.onAudioUploaded).toBeTypeOf('function');

    capturedCallbacks.onAudioUploaded!({
      fileName: 'track.mp3',
      previewUrl: 'blob:http://localhost/123',
      releaseId: 'rel-777',
      releaseTitle: 'Track',
      inference: {
        kind: 'release' as const,
        releaseId: 'rel-777',
        artistId: 'artist-3',
        confidence: 0.95,
      },
      prompt: 'Describe Track',
    });

    expect(mockFns.notifyJankSend).not.toHaveBeenCalled();
  });

  it('keeps upload callbacks stable across panel updates but observes current context dismissal', () => {
    let panel: ReturnType<typeof useChatEntityPanel> | undefined;
    const view = renderWithQueryClient(
      <ChatEntityPanelProvider>
        <AudioPanelProbe
          capture={current => {
            panel = current;
          }}
        />
        <JovieChat profileId='profile-1' />
      </ChatEntityPanelProvider>
    );
    expect(panel).toBeDefined();
    const initialCallback = capturedCallbacks.onAudioUploaded;
    expect(initialCallback).toBeTypeOf('function');
    act(() =>
      panel?.upsertContext({
        kind: 'contact',
        id: 'unrelated',
        source: 'tool',
        focusKey: 'unrelated-context',
      })
    );
    expect(capturedCallbacks.onAudioUploaded).toBe(initialCallback);
    act(() =>
      panel?.open({
        kind: 'contact',
        id: 'manual',
        source: 'manual',
        focusKey: 'manual-panel',
      })
    );
    expect(capturedCallbacks.onAudioUploaded).toBe(initialCallback);

    const audioResult = {
      fileName: 'review.mp3',
      previewUrl: 'blob:http://localhost/review',
      releaseId: 'rel-review',
      releaseTitle: 'Review',
      inference: {
        kind: 'attach-to-existing',
        confidence: 'high',
        suggestedTitle: 'Review',
        releaseId: 'rel-review',
        releaseTitle: 'Review',
        matchScore: 1,
      },
      prompt: 'Review this recording',
    } satisfies Parameters<
      NonNullable<typeof capturedCallbacks.onAudioUploaded>
    >[0];
    act(() => capturedCallbacks.onAudioUploaded?.(audioResult));
    expect(panel?.target?.id).toBe('rel-review');
    expect(panel?.contextTargets).toContainEqual(
      expect.objectContaining({ focusKey: 'audio-upload:rel-review' })
    );
    expect(mockFns.setInput).toHaveBeenLastCalledWith('Review this recording');
    expect(
      screen.getByRole('textbox', { name: 'Audio review draft' })
    ).toHaveFocus();
    expect(capturedCallbacks.onAudioUploaded).toBe(initialCallback);

    act(() => panel?.dismissContext('audio-upload:rel-review'));
    expect(capturedCallbacks.onAudioUploaded).not.toBe(initialCallback);
    act(() => capturedCallbacks.onAudioUploaded?.(audioResult));
    expect(panel?.contextTargets).not.toContainEqual(
      expect.objectContaining({ focusKey: 'audio-upload:rel-review' })
    );
    expect(mockFns.setInput).toHaveBeenLastCalledWith('Review this recording');
    expect(
      screen.getByRole('textbox', { name: 'Audio review draft' })
    ).toHaveFocus();
    expect(mockFns.submitMessage).not.toHaveBeenCalled();
    expect(mockFns.notifyJankSend).not.toHaveBeenCalled();
    view.unmount();
  });
});
