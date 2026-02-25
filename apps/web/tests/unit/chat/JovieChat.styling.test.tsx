import { beforeAll, describe, expect, it, vi } from 'vitest';
import { JovieChat } from '@/components/jovie/JovieChat';
import { fastRender } from '@/tests/utils/fast-render';

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

beforeAll(() => {
  Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
describe('JovieChat styling regressions', () => {
  it('removes extra loading borders and separator above compact chat input', () => {
    const { container } = fastRender(<JovieChat profileId='profile-1' />);

    expect(container.innerHTML).not.toContain(
      'rounded-2xl border border-subtle bg-surface-1 px-5 py-3.5'
    );
    expect(container.innerHTML).not.toContain(
      'h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-subtle bg-surface-1'
    );
    expect(container.innerHTML).not.toContain(
      'border-t border-subtle px-4 py-4'
    );
    expect(container.innerHTML).toContain(
      'rounded-2xl bg-surface-1 px-5 py-3.5'
    );
  });
});
