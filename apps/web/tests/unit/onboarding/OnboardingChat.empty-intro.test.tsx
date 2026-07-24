import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChat } from '@/components/features/onboarding/OnboardingChat';
import { ONBOARDING_WELCOME_MESSAGE } from '@/lib/onboarding/empty-state';

const chatMocks = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: 'text'; text: string }>;
  }>,
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  status: 'ready' as 'ready' | 'submitted' | 'streaming',
  stop: vi.fn(),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: chatMocks.messages,
    sendMessage: chatMocks.sendMessage,
    setMessages: chatMocks.setMessages,
    status: chatMocks.status,
    stop: chatMocks.stop,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/components/jovie/hooks', () => ({
  useChatJankMonitor: () => ({ onSend: vi.fn() }),
  useStickToBottom: () => ({
    isStuckToBottom: true,
    onScroll: vi.fn(),
    scrollContainerRef: { current: null },
    totalSizeRef: { current: null },
  }),
}));

vi.mock('@/components/jovie/hooks/useChipTray', () => ({
  composeMessage: (_chips: readonly unknown[], rawText: string) => rawText,
  useChipTray: () => ({
    addEntity: vi.fn(),
    addSkill: vi.fn(),
    chips: [],
    clear: vi.fn(),
    removeAt: vi.fn(),
    removeLast: vi.fn(),
  }),
}));

vi.mock('@/components/jovie/tool-ui', () => ({
  ToolPartsRenderer: () => null,
}));

vi.mock('@/components/jovie/utils', () => ({
  extractErrorMetadata: () => ({}),
  getErrorType: () => 'server',
  getPreferredErrorMessage: (error: Error) => error.message,
}));

vi.mock('@/components/features/onboarding/OnboardingToolArtifacts', () => ({
  OnboardingArtistConfirmedCard: () => null,
  OnboardingHandleCheckCard: () => null,
  OnboardingSocialLinkCard: () => null,
  OnboardingSpotifyArtistPickerCard: () => null,
  useArtistSelectionMessage: () => () => 'artist selected',
}));

vi.mock('@/components/jovie/components', () => ({
  ChatEmptyStateComposerRegion: ({
    above,
    children,
  }: {
    readonly above?: React.ReactNode;
    readonly children: React.ReactNode;
  }) => (
    <div data-testid='chat-empty-state-composer-region'>
      {above}
      {children}
    </div>
  ),
  ChatInput: () => <div data-testid='chat-input' />,
  ChatMessage: ({
    parts,
  }: {
    readonly parts: Array<{ type: 'text'; text: string }>;
  }) => <div data-testid='chat-message'>{parts[0]?.text}</div>,
}));

describe('OnboardingChat empty intro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatMocks.messages = [];
    chatMocks.status = 'ready';
    process.env.NODE_ENV = 'development';
  });

  it('shows welcome intro on a blank /start visit', () => {
    render(
      <OnboardingChat turnstileToken='token' turnstileStatus='verified' />
    );

    expect(screen.getByTestId('onboarding-empty-intro')).toBeTruthy();
    expect(screen.getByText(ONBOARDING_WELCOME_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId('onboarding-sign-in-skip')).toHaveAttribute(
      'href',
      '/signin'
    );
  });

  it('hides welcome intro when a starter prompt deep link is provided', () => {
    render(
      <OnboardingChat
        starterPrompt='Help me plan my next release.'
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );

    expect(screen.queryByTestId('onboarding-empty-intro')).toBeNull();
  });
});
