import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

const mockChatState = {
  input: '',
  setInput: vi.fn(),
  messages: [],
  chatError: null,
  isLoading: false,
  isSubmitting: false,
  hasMessages: false,
  isLoadingConversation: false,
  conversationTitle: null,
  status: 'ready',
  inputRef: { current: null },
  handleSubmit: vi.fn(),
  handleRetry: vi.fn(),
  handleSuggestedPrompt: vi.fn(),
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
  useStickToBottom: () => ({
    isStuckToBottom: true,
    setStuckToBottom: vi.fn(),
    onScroll: vi.fn(),
    totalSizeRef: vi.fn(),
    scrollContainerRef: { current: null },
  }),
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

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='chat-usage' />,
}));

describe('JovieChat empty state', () => {
  beforeEach(() => {
    mockChatState.messages = [];
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
  });

  it('renders the minimal welcome state with just heading and input', () => {
    const { getByTestId, getByText, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(getByText('Welcome Back')).toBeTruthy();
    expect(queryByText('Welcome to Jovie')).toBeNull();
    expect(queryByText('Jovie Assistant')).toBeNull();
    expect(queryByText('Ask anything or tell Jovie what you need')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByText('Preview profile')).toBeTruthy();
    expect(getByText('Change photo')).toBeTruthy();
    expect(getByText('Release link')).toBeTruthy();
  });

  it('renders first-session greeting for new users', () => {
    const { getByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' isFirstSession />
    );

    expect(getByText('Welcome to Jovie')).toBeTruthy();
  });

  it('renders chat messages after in-place message array updates', () => {
    const messages = mockChatState.messages;
    const { getAllByTestId, queryByText, rerender } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(queryByText('Welcome Back')).toBeTruthy();

    messages.push(
      {
        id: 'cmd-user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Preview my profile.' }],
        createdAt: new Date('2026-03-08T00:00:00.000Z'),
      },
      {
        id: 'cmd-assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Opening your profile in a new tab.' }],
        createdAt: new Date('2026-03-08T00:00:01.000Z'),
      }
    );
    mockChatState.hasMessages = true;

    rerender(<JovieChat profileId='profile-1' />);

    expect(queryByText('Welcome Back')).toBeNull();
    expect(getAllByTestId('chat-message')).toHaveLength(2);
  });
});
