import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
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

vi.mock('@/components/jovie/hooks', () => ({
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
  useJovieChat: () => ({
    input: '',
    setInput: vi.fn(),
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    ],
    chatError: null,
    isLoading: true,
    isSubmitting: false,
    hasMessages: true,
    isLoadingConversation: false,
    conversationTitle: null,
    status: 'streaming',
    inputRef: { current: null },
    handleSubmit: vi.fn(),
    handleRetry: vi.fn(),
    handleSuggestedPrompt: vi.fn(),
    submitMessage: vi.fn(),
    setChatError: vi.fn(),
    isRateLimited: false,
  }),
  useChatImageAttachments: () => ({
    pendingImages: [],
    isDragOver: false,
    isProcessing: false,
    addFiles: vi.fn(),
    removeImage: vi.fn(),
    clearImages: vi.fn(),
    toFileUIParts: () => [],
    dropZoneRef: { current: null },
  }),
}));

vi.mock('@/components/jovie/components', () => ({
  ChatInput: () => <div data-testid='chat-input' />,
  ChatMessage: () => <div data-testid='chat-message' />,
  ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
  ErrorDisplay: () => <div data-testid='chat-error' />,
  ScrollToBottom: () => null,
  SuggestedProfilesCarousel: () => null,
  SuggestedPrompts: () => null,
}));

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='chat-usage' />,
}));

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

describe('JovieChat styling regressions', () => {
  it('removes extra loading borders and separator above compact chat input', () => {
    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    const loadingAvatar = container.querySelector(
      '[data-testid="chat-loading-avatar"]'
    );
    const loadingBubble = container.querySelector(
      '[data-testid="chat-loading-bubble"]'
    );

    expect(loadingAvatar).toBeTruthy();
    expect(loadingBubble).toBeTruthy();

    // Verify border classes were removed from loading avatar
    expect(loadingAvatar!.classList.contains('border')).toBe(false);
    expect(loadingAvatar!.classList.contains('border-subtle')).toBe(false);

    // Verify the loading avatar retains its non-border classes (including flex)
    expect(loadingAvatar!.classList.contains('flex')).toBe(true);
    expect(loadingAvatar!.classList.contains('items-center')).toBe(true);
    expect(loadingAvatar!.classList.contains('justify-center')).toBe(true);

    // Verify the loading bubble uses the same framed surface as assistant replies
    expect(loadingBubble!.classList.contains('border')).toBe(true);
    expect(loadingBubble!.classList.contains('border-subtle')).toBe(false);

    // Verify the loading bubble still has its expected non-border classes
    expect(loadingBubble!.className).toContain('rounded-[16px]');
    expect(loadingBubble!.className).toContain(
      'bg-(--linear-app-content-surface)'
    );
    expect(loadingBubble!.classList.contains('px-4')).toBe(true);

    // Verify no separator (border-t border-subtle) exists in the compact chat input area
    const separator = container.querySelector('.border-t.border-subtle');
    expect(separator).toBeNull();
  });
});
