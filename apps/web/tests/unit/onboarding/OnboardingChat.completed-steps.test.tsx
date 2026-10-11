import { render, screen } from '@testing-library/react';
import { type FormEvent, forwardRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChat } from '@/components/features/onboarding/OnboardingChat';

interface MockPart {
  readonly type: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly state?: string;
  readonly output?: Record<string, unknown>;
}

interface MockMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly parts: readonly MockPart[];
  readonly metadata?: Record<string, unknown>;
}

const chatMocks = vi.hoisted(() => ({
  messages: [] as MockMessage[],
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  status: 'ready' as 'ready' | 'submitted' | 'streaming',
  stop: vi.fn(),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
  gateway: vi.fn((model: string) => model),
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

vi.mock('@/components/jovie/components', () => ({
  ChatEmptyStateComposerRegion: ({
    above,
    children,
  }: {
    readonly above?: ReactNode;
    readonly children: ReactNode;
  }) => (
    <div data-testid='chat-empty-state-composer-region'>
      {above}
      {children}
    </div>
  ),
  ChatInput: forwardRef<
    HTMLTextAreaElement,
    {
      readonly onChange?: (value: string) => void;
      readonly onSubmit?: (event?: FormEvent) => void;
      readonly value?: string;
    }
  >(function MockChatInput({ onChange, onSubmit, value }, ref) {
    return (
      <form onSubmit={onSubmit}>
        <textarea
          ref={ref}
          aria-label='Chat Message Input'
          value={value}
          onChange={event => onChange?.(event.currentTarget.value)}
        />
      </form>
    );
  }),
  ChatMessage: ({ id }: { readonly id: string }) => (
    <div data-testid='chat-message'>{id}</div>
  ),
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

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

// Render each card as a marker carrying its tool-output action so the test
// asserts which parts survive once a guarded step is complete.
vi.mock('@/components/features/onboarding/OnboardingToolArtifacts', () => ({
  formatCompactCount: () => null,
  formatExactCount: () => null,
  formatGenreLabel: (value: string) => value,
  getSafeSpotifyArtistUrl: () => null,
  OnboardingArtistConfirmedCard: () => null,
  OnboardingHandleCheckCard: ({
    output,
  }: {
    readonly output?: { action?: string; handle?: string } | null;
  }) => <div data-testid='handle-card'>{output?.action}</div>,
  OnboardingSocialLinkCard: ({
    output,
  }: {
    readonly output?: { action?: string; url?: string | null } | null;
  }) => <div data-testid='social-card'>{output?.action}</div>,
  OnboardingSpotifyArtistPickerCard: () => null,
  useArtistSelectionMessage: () => () => 'artist selected',
}));

vi.mock('@/components/features/onboarding/OnboardingProfileRail', () => ({
  OnboardingProfileRail: () => null,
}));

function renderChat() {
  return render(
    <OnboardingChat turnstileToken='token' turnstileStatus='verified' />
  );
}

describe('OnboardingChat completed guarded steps (JOV-7078)', () => {
  beforeEach(() => {
    chatMocks.messages = [];
    chatMocks.status = 'ready';
    chatMocks.sendMessage.mockClear();
  });

  it('collapses stale check_handle parts once the handle is confirmed', () => {
    chatMocks.messages = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-checkHandle',
            toolCallId: 't-check',
            state: 'output-available',
            output: { action: 'check_handle', handle: 'validartist' },
          },
        ],
      },
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'Confirmed handle @validartist' }],
        metadata: {
          onboardingEvent: 'handle_confirmed',
          handle: 'validartist',
        },
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'How big is the audience?' },
          {
            type: 'tool-checkHandle',
            toolCallId: 't-confirm',
            state: 'output-available',
            output: { action: 'handle_confirmed', handle: 'validartist' },
          },
          {
            type: 'tool-proposeSocialLink',
            toolCallId: 't-social',
            state: 'output-available',
            output: { action: 'propose_social_link', url: null },
          },
        ],
      },
    ];

    renderChat();

    const handleCards = screen.getAllByTestId('handle-card');
    expect(handleCards).toHaveLength(1);
    expect(handleCards[0]?.textContent).toBe('handle_confirmed');
    // Social step is not complete yet — its card stays interactive.
    expect(screen.getAllByTestId('social-card')).toHaveLength(1);
  });

  it('collapses stale propose_social_link parts once social is attached', () => {
    chatMocks.messages = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-checkHandle',
            toolCallId: 't-confirm',
            state: 'output-available',
            output: { action: 'handle_confirmed', handle: 'validartist' },
          },
          {
            type: 'tool-proposeSocialLink',
            toolCallId: 't-social',
            state: 'output-available',
            output: { action: 'propose_social_link', url: null },
          },
        ],
      },
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Attached https://instagram.com/artist' },
        ],
        metadata: {
          onboardingEvent: 'social_attached',
          url: 'https://instagram.com/artist',
        },
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'How big is the audience?' },
          {
            type: 'tool-proposeSocialLink',
            toolCallId: 't-social-done',
            state: 'output-available',
            output: {
              action: 'social_attached',
              url: 'https://instagram.com/artist',
            },
          },
        ],
      },
    ];

    renderChat();

    const socialCards = screen.getAllByTestId('social-card');
    expect(socialCards).toHaveLength(1);
    expect(socialCards[0]?.textContent).toBe('social_attached');
    expect(screen.getAllByTestId('handle-card')).toHaveLength(1);
  });
});
