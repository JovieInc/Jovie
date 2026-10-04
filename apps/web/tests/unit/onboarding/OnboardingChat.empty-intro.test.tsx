import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChat } from '@/components/features/onboarding/OnboardingChat';
import { ONBOARDING_ENTRY_TITLE } from '@/lib/onboarding/empty-state';

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
  onError: undefined as undefined | ((error: Error) => void),
  errorMetadata: {} as Record<string, unknown>,
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onError?: (error: Error) => void }) => {
    chatMocks.onError = options.onError;
    return {
      messages: chatMocks.messages,
      sendMessage: chatMocks.sendMessage,
      setMessages: chatMocks.setMessages,
      status: chatMocks.status,
      stop: chatMocks.stop,
    };
  },
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
  extractErrorMetadata: () => chatMocks.errorMetadata,
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
    chatMocks.onError = undefined;
    chatMocks.errorMetadata = {};
    process.env.NODE_ENV = 'development';
  });

  it('shows welcome intro on a blank /start visit', () => {
    render(
      <OnboardingChat turnstileToken='token' turnstileStatus='verified' />
    );

    expect(screen.getByTestId('onboarding-empty-intro')).toBeTruthy();
    expect(screen.getByTestId('onboarding-start-ambient-mark')).toBeTruthy();
    expect(screen.getByText(ONBOARDING_ENTRY_TITLE)).toBeTruthy();
    expect(screen.queryByTestId('onboarding-sign-in-skip')).toBeNull();
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
  });

  it('shows a compact processing state for a validated starter handoff', () => {
    process.env.NODE_ENV = 'test';
    render(
      <OnboardingChat
        starterHandoff={{
          kind: 'prompt',
          prompt: 'Help me plan my next release.',
        }}
        turnstileToken={null}
        turnstileStatus='interactive'
      />
    );

    expect(screen.getByText('Getting this ready')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-start-ambient-mark')).toBeNull();
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
  });

  it('keeps a handle entry on its value screen and never auto-sends the claim draft (JOV-7753)', async () => {
    render(
      <OnboardingChat
        entryProfile={{ status: 'available', handle: 'newartist' }}
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Claim jov.ie/newartist')).toBeTruthy();
    });
    expect(screen.queryByTestId('onboarding-start-ambient-mark')).toBeNull();
    expect(screen.queryByText(ONBOARDING_ENTRY_TITLE)).toBeNull();
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to blank entry when a stored intent is missing', async () => {
    render(
      <OnboardingChat
        intentId='missing-intent'
        turnstileToken='token'
        turnstileStatus='verified'
      />
    );

    await waitFor(() => {
      expect(screen.getByText(ONBOARDING_ENTRY_TITLE)).toBeTruthy();
    });
    expect(screen.queryByTestId('onboarding-starter-suggestions')).toBeNull();
  });

  it.each([
    ['default', undefined, 'pt-5'],
    ['headerOverlay', true, 'pt-16'],
  ] as const)(
    'reserves %s top clearance in the scroll region (JOV-7192)',
    (_label, headerOverlay, expected) => {
      const { container } = render(
        <OnboardingChat
          headerOverlay={headerOverlay}
          turnstileToken='token'
          turnstileStatus='verified'
        />
      );

      const scrollRegion = container.querySelector(
        '[aria-live="polite"].overflow-y-auto'
      );
      expect(scrollRegion).not.toBeNull();
      expect(scrollRegion).toHaveClass(expected);
      // Content scrolled under the floating sign-in fades rather than
      // hard-clipping into a cut-off bubble; at rest, content below the 4rem
      // clearance stays fully opaque.
      expect(
        scrollRegion?.className.includes('system-b-chat-thread-top-fade')
      ).toBe(headerOverlay === true);
    }
  );

  it('surfaces a turnstile recovery row instead of swallowing the error (JOV-7294)', async () => {
    chatMocks.errorMetadata = { errorCode: 'TURNSTILE_REQUIRED' };
    render(
      <OnboardingChat turnstileToken='token' turnstileStatus='verified' />
    );

    act(() => {
      chatMocks.onError?.(new Error('Forbidden'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('onboarding-message-recovery')
      ).toHaveTextContent('Complete the security check to send your message.');
    });
  });
});
