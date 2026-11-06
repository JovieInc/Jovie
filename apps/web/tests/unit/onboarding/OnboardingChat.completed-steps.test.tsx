import { act, render, screen } from '@testing-library/react';
import { type FormEvent, forwardRef, type ReactNode, useEffect } from 'react';
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
  onHandleCandidateChange: undefined as
    | undefined
    | ((handle: string | null) => void),
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  status: 'ready' as 'ready' | 'submitted' | 'streaming',
  stop: vi.fn(),
  scrollContainerRef: { current: null as HTMLDivElement | null },
  setStuckToBottom: vi.fn(),
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
      readonly placeholder?: string;
    }
  >(function MockChatInput({ onChange, onSubmit, value, placeholder }, ref) {
    return (
      <form onSubmit={onSubmit}>
        <textarea
          ref={ref}
          aria-label='Chat Message Input'
          value={value}
          placeholder={placeholder}
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
    scrollContainerRef: chatMocks.scrollContainerRef,
    setStuckToBottom: chatMocks.setStuckToBottom,
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
    onHandleCandidateChange,
  }: {
    readonly output?: { action?: string; handle?: string } | null;
    readonly onHandleCandidateChange: (handle: string | null) => void;
  }) => {
    // Retain the real card's draft callback, including confirmed status cards.
    useEffect(() => {
      chatMocks.onHandleCandidateChange = onHandleCandidateChange;
      onHandleCandidateChange(output?.handle ?? null);
    }, [output?.handle, onHandleCandidateChange]);
    return <div data-testid='handle-card'>{output?.action}</div>;
  },
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

function handleMessage(
  id: string,
  action: 'check_handle' | 'handle_confirmed',
  handle: string
) {
  return {
    id,
    role: 'assistant' as const,
    parts: [
      {
        type: 'dynamic-tool' as const,
        toolName: 'checkHandle',
        toolCallId: id,
        state: 'output-available' as const,
        input: { handle },
        output: { action, handle },
      },
    ],
  };
}

function renderChat() {
  return render(
    <OnboardingChat turnstileToken='token' turnstileStatus='verified' />
  );
}

describe('OnboardingChat completed guarded steps (JOV-7078)', () => {
  beforeEach(() => {
    chatMocks.messages = [];
    chatMocks.status = 'ready';
    chatMocks.onHandleCandidateChange = undefined;
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

  it('advances composer intent only after server confirmation and preserves the confirmed preview', () => {
    const onProfileBuilderChange = vi.fn();
    chatMocks.messages = [
      handleMessage('proposal', 'check_handle', 'draftartist'),
    ];
    const view = render(
      <OnboardingChat
        turnstileToken='token'
        turnstileStatus='verified'
        onProfileBuilderChange={onProfileBuilderChange}
      />
    );
    const input = screen.getByRole('textbox', { name: 'Chat Message Input' });
    expect(input).toHaveAttribute(
      'placeholder',
      'Confirm handle or type a different one…'
    );

    chatMocks.messages = [
      ...chatMocks.messages,
      {
        id: 'confirm-request',
        role: 'user',
        parts: [{ type: 'text', text: 'Confirmed handle @draftartist' }],
        metadata: {
          onboardingEvent: 'handle_confirmed',
          handle: 'draftartist',
        },
      },
    ];
    view.rerender(
      <OnboardingChat
        turnstileToken='token'
        turnstileStatus='verified'
        onProfileBuilderChange={onProfileBuilderChange}
      />
    );
    // A submitted or rejected request must not invent server completion.
    expect(input).toHaveAttribute(
      'placeholder',
      'Confirm handle or type a different one…'
    );

    chatMocks.messages = [
      ...chatMocks.messages,
      handleMessage('confirmation', 'handle_confirmed', 'confirmedartist'),
    ];
    view.rerender(
      <OnboardingChat
        turnstileToken='token'
        turnstileStatus='verified'
        onProfileBuilderChange={onProfileBuilderChange}
      />
    );
    expect(input).toHaveAttribute('placeholder', 'Reply to Jovie…');
    act(() => chatMocks.onHandleCandidateChange?.('staleartist'));
    expect(input).toHaveAttribute('placeholder', 'Reply to Jovie…');
    expect(onProfileBuilderChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ handle: 'confirmedartist' })
    );
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

describe('OnboardingChat Pen transcript anatomy (R6As7U)', () => {
  beforeEach(() => {
    chatMocks.messages = [];
    chatMocks.status = 'ready';
  });

  it('opens each agent turn with one Jovie speaker row and aligns widgets to the text edge', () => {
    chatMocks.messages = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'I want to claim jov.ie/validartist' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'That name is open.' },
          {
            type: 'tool-checkHandle',
            toolCallId: 't-check',
            state: 'output-available',
            output: { action: 'check_handle', handle: 'validartist' },
          },
        ],
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'One more thing.' }],
      },
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'Sounds good' }],
      },
      {
        id: 'a3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Great.' }],
      },
    ];

    renderChat();

    const chat = screen.getByTestId('onboarding-chat');
    expect(chat).toHaveClass('system-b-onboarding-chat');
    // Two agent turns (a1+a2 run, a3) → two speaker rows, none for users.
    const speakerRows = screen.getAllByTestId('onboarding-speaker-row');
    expect(speakerRows).toHaveLength(2);
    expect(speakerRows[0]).toHaveTextContent('Jovie');
    // Widget column starts at the agent text edge (no avatar-gutter indent).
    const widgetColumn = screen.getByTestId('handle-card').parentElement;
    expect(widgetColumn?.className).not.toMatch(/\bpl-\d/);
  });
});

describe('OnboardingChat docked composer scroll (JOV-10131)', () => {
  beforeEach(() => {
    chatMocks.messages = [];
    chatMocks.status = 'ready';
    chatMocks.setStuckToBottom.mockClear();
  });

  it('re-pins the transcript to the bottom when the composer docks and on each user turn', () => {
    const writes: number[] = [];
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(900);
    const scrollTop = vi
      .spyOn(HTMLElement.prototype, 'scrollTop', 'set')
      .mockImplementation(value => {
        writes.push(value);
      });
    const userTurn = (id: string, text: string) => ({
      id,
      role: 'user' as const,
      parts: [{ type: 'text', text }],
    });
    chatMocks.messages = [
      userTurn('u1', 'I want to claim jov.ie/gpwoaiyp.'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Tell me your name.' }],
      },
      userTurn('u2', 'unmarkedpavement'),
      handleMessage('a2', 'check_handle', 'unmarkedpavement'),
    ];

    const { rerender } = renderChat();

    // Docked (two user turns): the thread was pinned to the top while
    // centered, so the dock must move it to the bottom and re-arm sticking.
    expect(writes.at(-1)).toBe(900);
    expect(chatMocks.setStuckToBottom).toHaveBeenLastCalledWith(true);

    chatMocks.setStuckToBottom.mockClear();
    chatMocks.messages = [
      ...chatMocks.messages,
      userTurn('u3', 'unmarkedpave'),
    ];
    rerender(
      <OnboardingChat turnstileToken='token' turnstileStatus='verified' />
    );
    expect(chatMocks.setStuckToBottom).toHaveBeenCalledExactlyOnceWith(true);

    scrollHeight.mockRestore();
    scrollTop.mockRestore();
  });
});
