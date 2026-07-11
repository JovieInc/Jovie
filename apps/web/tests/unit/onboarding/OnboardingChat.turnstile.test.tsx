import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChat } from '@/components/features/onboarding/OnboardingChat';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';

const chatMocks = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: 'text'; text: string }>;
  }>,
  onError: undefined as undefined | ((error: Error) => void),
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  status: 'ready' as 'ready' | 'submitted' | 'streaming',
  stop: vi.fn(),
}));

const errorMocks = vi.hoisted(() => ({
  metadata: {} as {
    errorCode?: string;
    message?: string;
    requestId?: string;
    retryAfter?: number;
  },
}));

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: analyticsMocks.track,
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
  gateway: vi.fn((model: string) => model),
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { readonly onError?: (error: Error) => void }) => {
    chatMocks.onError = options.onError;
    chatMocks.setMessages.mockImplementation(
      (
        updater:
          | typeof chatMocks.messages
          | ((current: typeof chatMocks.messages) => typeof chatMocks.messages)
      ) => {
        chatMocks.messages =
          typeof updater === 'function' ? updater(chatMocks.messages) : updater;
      }
    );
    return {
      messages: chatMocks.messages,
      sendMessage: chatMocks.sendMessage,
      setMessages: chatMocks.setMessages,
      status: chatMocks.status,
      stop: chatMocks.stop,
    };
  },
}));

vi.mock('@/components/jovie/components', () => ({
  ChatEmptyStateComposerRegion: ({
    children,
  }: {
    readonly children: ReactNode;
  }) => <div data-testid='chat-empty-state-composer-region'>{children}</div>,
  ChatInput: ({
    isSubmitting,
    onChange,
    onSubmit,
    statusBanner,
    value,
  }: {
    readonly isSubmitting: boolean;
    readonly onChange: (value: string) => void;
    readonly onSubmit: (event?: FormEvent) => void;
    readonly statusBanner?: ReactNode;
    readonly value: string;
  }) => (
    <form onSubmit={onSubmit}>
      <textarea
        aria-label='Chat message input'
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
      />
      {statusBanner}
      <button type='submit' aria-label='Send message' disabled={isSubmitting}>
        Send
      </button>
    </form>
  ),
  ChatMessage: ({ id }: { readonly id: string }) => (
    <div data-testid='chat-message'>{id}</div>
  ),
}));

vi.mock('@/components/jovie/hooks', () => ({
  useChatJankMonitor: () => ({
    onSend: vi.fn(),
  }),
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
  extractErrorMetadata: () => errorMocks.metadata,
  getErrorType: () => 'server',
  getPreferredErrorMessage: (error: Error) =>
    errorMocks.metadata.message ?? error.message,
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/components/features/onboarding/OnboardingToolArtifacts', () => ({
  formatCompactCount: (value: number | null | undefined) =>
    typeof value === 'number' ? String(value) : null,
  formatExactCount: (value: number | null | undefined) =>
    typeof value === 'number' ? String(value) : null,
  formatGenreLabel: (value: string) => value,
  getSafeSpotifyArtistUrl: (value: string | null | undefined) => value ?? null,
  OnboardingArtistConfirmedCard: () => null,
  OnboardingHandleCheckCard: () => null,
  OnboardingSocialLinkCard: () => null,
  OnboardingSpotifyArtistPickerCard: () => null,
  useArtistSelectionMessage: () => () => 'artist selected',
}));

function TurnstileHarness({
  initialToken = null,
  onConversationActivity,
  resetTokenOnRejected = true,
  onTurnstileRejected = vi.fn(),
  onTurnstileRequired = vi.fn(),
  starterPrompt,
}: Readonly<{
  initialToken?: string | null;
  onConversationActivity?: () => void;
  resetTokenOnRejected?: boolean;
  onTurnstileRejected?: () => void;
  onTurnstileRequired?: (message?: string) => void;
  starterPrompt?: string;
}>) {
  const [turnstileToken, setTurnstileToken] = useState(initialToken);
  const [instruction, setInstruction] = useState<string | null>(null);

  return (
    <OnboardingChat
      turnstileToken={turnstileToken}
      turnstileStatus={turnstileToken ? 'verified' : 'interactive'}
      turnstilePanel={
        instruction ? (
          <div data-testid='test-turnstile-panel'>{instruction}</div>
        ) : null
      }
      turnstilePanelVisible={Boolean(instruction)}
      onTurnstileRequired={message => {
        onTurnstileRequired(message);
        setInstruction(message ?? null);
      }}
      onTurnstileRejected={() => {
        onTurnstileRejected();
        if (resetTokenOnRejected) {
          setTurnstileToken(null);
        }
        setInstruction('Verify you are human to send');
      }}
      onConversationActivity={onConversationActivity}
      starterPrompt={starterPrompt}
    />
  );
}

function ControlledStarterHarness({
  onTurnstileRequired = vi.fn(),
  starterPrompt,
  turnstileToken,
}: Readonly<{
  onTurnstileRequired?: (message?: string) => void;
  starterPrompt: string;
  turnstileToken: string | null;
}>) {
  return (
    <OnboardingChat
      turnstileToken={turnstileToken}
      turnstileStatus={turnstileToken ? 'verified' : 'interactive'}
      onTurnstileRequired={onTurnstileRequired}
      starterPrompt={starterPrompt}
    />
  );
}

describe('OnboardingChat Turnstile gating', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'test');
    delete document.documentElement.dataset.e2eMode;
    chatMocks.messages = [];
    chatMocks.onError = undefined;
    chatMocks.sendMessage.mockReset();
    chatMocks.setMessages.mockReset();
    chatMocks.status = 'ready';
    chatMocks.stop.mockReset();
    analyticsMocks.track.mockReset();
    errorMocks.metadata = {};
  });

  it('keeps the first turn stable before docking follow-up turns', () => {
    const { rerender } = render(<TurnstileHarness />);

    expect(screen.getByTestId('onboarding-centered-composer')).toBeVisible();
    expect(screen.queryByTestId('onboarding-composer-dock')).toBeNull();

    chatMocks.messages = [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'help me launch' }],
      },
    ];
    rerender(<TurnstileHarness />);

    expect(screen.getByTestId('onboarding-centered-composer')).toBeVisible();
    expect(screen.queryByTestId('onboarding-composer-dock')).toBeNull();

    chatMocks.messages = [
      ...chatMocks.messages,
      {
        id: 'message-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'got it' }],
      },
      {
        id: 'message-3',
        role: 'user',
        parts: [{ type: 'text', text: 'artist selected' }],
      },
    ];
    rerender(<TurnstileHarness />);

    expect(screen.queryByTestId('onboarding-centered-composer')).toBeNull();
    expect(screen.getByTestId('onboarding-composer-dock')).toBeVisible();
  });

  it('renders a starter prompt and reserves verification space before effects run', () => {
    render(
      <OnboardingChat
        starterPrompt='  Hey, I want to get access to Jovie.  '
        turnstilePanel={<div data-testid='test-turnstile-panel' />}
        turnstilePanelVisible={false}
        turnstileStatus='interactive'
        turnstileToken={null}
      />
    );

    expect(screen.getByLabelText('Chat message input')).toHaveValue(
      'Hey, I want to get access to Jovie.'
    );
    expect(screen.getByTestId('onboarding-turnstile-slot')).toHaveClass(
      'min-h-[10rem]'
    );
    expect(screen.getByTestId('test-turnstile-panel')).toBeInTheDocument();
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps send disabled until runtime interaction policy resolves', async () => {
    const serverMarkup = renderToString(
      <OnboardingChat turnstileStatus='interactive' turnstileToken={null} />
    );
    expect(serverMarkup).toContain('data-interaction-ready="false"');
    expect(serverMarkup).toMatch(
      /<button[^>]*aria-label="Send message"[^>]*disabled=""/
    );

    render(
      <OnboardingChat turnstileStatus='interactive' turnstileToken={null} />
    );
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-chat')).toHaveAttribute(
        'data-interaction-ready',
        'true'
      )
    );
    expect(screen.getByTestId('onboarding-chat')).toHaveAttribute(
      'data-automation-bypass',
      'false'
    );
  });

  it('keeps the first message local and shows verification guidance until a token exists', () => {
    const onTurnstileRequired = vi.fn();
    render(
      <OnboardingChat
        turnstilePanel={<div data-testid='test-turnstile-panel' />}
        turnstilePanelVisible={false}
        turnstileStatus='loading'
        turnstileToken={null}
        onTurnstileRequired={onTurnstileRequired}
      />
    );

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'help me launch a song' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue('help me launch a song');
    expect(onTurnstileRequired).toHaveBeenCalledWith(
      'Verify you are human to send'
    );
    expect(screen.getByTestId('onboarding-turnstile-slot')).toBeInTheDocument();
    expect(screen.getByTestId('test-turnstile-panel')).toBeInTheDocument();
  });

  it('auto-submits a starter prompt once when verification is ready', async () => {
    render(
      <TurnstileHarness
        initialToken='token-1'
        starterPrompt='Hey, I want to get access to Jovie.'
      />
    );

    await waitFor(() => expect(chatMocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(chatMocks.sendMessage).toHaveBeenCalledWith({
      text: 'Hey, I want to get access to Jovie.',
    });
    expect(screen.getByLabelText('Chat message input')).toHaveValue('');
  });

  it('waits for runtime automation bypass before starter auto-submit', async () => {
    document.documentElement.dataset.e2eMode = '1';
    const onTurnstileRequired = vi.fn();

    render(
      <TurnstileHarness
        onTurnstileRequired={onTurnstileRequired}
        starterPrompt='Hey, I want to get access to Jovie.'
      />
    );

    await waitFor(() => expect(chatMocks.sendMessage).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('onboarding-chat')).toHaveAttribute(
      'data-automation-bypass',
      'true'
    );
    expect(chatMocks.sendMessage).toHaveBeenCalledWith({
      text: 'Hey, I want to get access to Jovie.',
    });
    expect(onTurnstileRequired).not.toHaveBeenCalled();
  });

  it('auto-submits the edited starter prompt after verification', async () => {
    const onTurnstileRequired = vi.fn();
    const starterPrompt = 'Hey, I want to get access to Jovie.';
    const { rerender } = render(
      <ControlledStarterHarness
        onTurnstileRequired={onTurnstileRequired}
        starterPrompt={starterPrompt}
        turnstileToken={null}
      />
    );

    await waitFor(() => {
      expect(onTurnstileRequired).toHaveBeenCalledWith(
        'Verify you are human to send'
      );
    });

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'Edited access request' } });

    rerender(
      <ControlledStarterHarness
        onTurnstileRequired={onTurnstileRequired}
        starterPrompt={starterPrompt}
        turnstileToken='token-1'
      />
    );

    await waitFor(() => {
      expect(chatMocks.sendMessage).toHaveBeenCalledWith({
        text: 'Edited access request',
      });
    });
  });

  it('tracks chat completion once while reporting each completed user turn', () => {
    const onConversationActivity = vi.fn();
    const { rerender } = render(
      <TurnstileHarness onConversationActivity={onConversationActivity} />
    );

    expect(analyticsMocks.track).not.toHaveBeenCalled();

    chatMocks.messages = [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'help me launch' }],
      },
      {
        id: 'message-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'got it' }],
      },
    ];
    rerender(
      <TurnstileHarness onConversationActivity={onConversationActivity} />
    );

    expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      ONBOARDING_FUNNEL_EVENTS.CHAT_COMPLETED,
      { surface: 'start_chat' }
    );
    expect(onConversationActivity).toHaveBeenCalledTimes(1);

    chatMocks.messages = [
      ...chatMocks.messages,
      {
        id: 'message-3',
        role: 'user',
        parts: [{ type: 'text', text: 'artist selected' }],
      },
      {
        id: 'message-4',
        role: 'assistant',
        parts: [{ type: 'text', text: 'artist confirmed' }],
      },
    ];
    rerender(
      <TurnstileHarness onConversationActivity={onConversationActivity} />
    );

    expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
    expect(onConversationActivity).toHaveBeenCalledTimes(2);

    chatMocks.messages = [];
    rerender(
      <TurnstileHarness onConversationActivity={onConversationActivity} />
    );
    chatMocks.messages = [
      {
        id: 'message-5',
        role: 'user',
        parts: [{ type: 'text', text: 'new chat' }],
      },
      {
        id: 'message-6',
        role: 'assistant',
        parts: [{ type: 'text', text: 'new chat ready' }],
      },
    ];
    rerender(
      <TurnstileHarness onConversationActivity={onConversationActivity} />
    );

    expect(analyticsMocks.track).toHaveBeenCalledTimes(2);
    expect(onConversationActivity).toHaveBeenCalledTimes(3);
  });

  it('tracks chat start once when a rejected first turn is retried', () => {
    render(
      <TurnstileHarness initialToken='token-1' resetTokenOnRejected={false} />
    );

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'I am Test Artist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(chatMocks.sendMessage).toHaveBeenCalledWith({
      text: 'I am Test Artist',
    });
    expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.track).toHaveBeenCalledWith(
      ONBOARDING_FUNNEL_EVENTS.CHAT_STARTED,
      { surface: 'start_chat' }
    );

    errorMocks.metadata = {
      errorCode: 'TURNSTILE_REQUIRED',
      message: 'Bot challenge failed',
      requestId: 'req-1',
    };
    act(() => {
      chatMocks.onError?.(new Error('Bot challenge failed'));
    });

    chatMocks.sendMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));

    expect(chatMocks.sendMessage).toHaveBeenCalledWith({
      text: 'I am Test Artist',
    });
    expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
  });

  it('rolls back the optimistic user turn when Turnstile rejects the first message', () => {
    const onTurnstileRejected = vi.fn();
    render(
      <TurnstileHarness
        initialToken='stale-token'
        onTurnstileRejected={onTurnstileRejected}
      />
    );

    chatMocks.messages = [
      {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', text: 'I am Test Artist' }],
      },
    ];

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'I am Test Artist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    errorMocks.metadata = {
      errorCode: 'TURNSTILE_REQUIRED',
      message: 'Bot challenge failed',
      requestId: 'req-1',
    };
    act(() => {
      chatMocks.onError?.(new Error('Bot challenge failed'));
    });

    expect(chatMocks.setMessages).toHaveBeenCalled();
    expect(chatMocks.messages).toEqual([]);
    expect(onTurnstileRejected).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Chat message input')).toHaveValue(
      'I am Test Artist'
    );
  });

  it('auto-retries a rejected first turn after fresh Turnstile verification', async () => {
    const onTurnstileRejected = vi.fn();
    function TokenRefreshHarness() {
      const [turnstileToken, setTurnstileToken] = useState<string | null>(
        'stale-token'
      );
      const [instruction, setInstruction] = useState<string | null>(null);

      return (
        <>
          <button
            type='button'
            onClick={() => setTurnstileToken('fresh-token')}
          >
            Refresh token
          </button>
          <OnboardingChat
            turnstileToken={turnstileToken}
            turnstileStatus={turnstileToken ? 'verified' : 'interactive'}
            turnstilePanel={
              instruction ? (
                <div data-testid='test-turnstile-panel'>{instruction}</div>
              ) : null
            }
            turnstilePanelVisible={Boolean(instruction)}
            onTurnstileRequired={message => {
              setInstruction(message ?? null);
            }}
            onTurnstileRejected={() => {
              onTurnstileRejected();
              setTurnstileToken(null);
              setInstruction('Verify you are human to send');
            }}
          />
        </>
      );
    }

    render(<TokenRefreshHarness />);

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'I am Test Artist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    errorMocks.metadata = {
      errorCode: 'TURNSTILE_REQUIRED',
      message: 'Bot challenge failed',
      requestId: 'req-1',
    };
    act(() => {
      chatMocks.onError?.(new Error('Bot challenge failed'));
    });

    chatMocks.sendMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh token' }));

    await waitFor(() => {
      expect(chatMocks.sendMessage).toHaveBeenCalledWith({
        text: 'I am Test Artist',
      });
    });
    expect(chatMocks.messages).toEqual([]);
  });

  it('resets rejected Turnstile tokens, preserves the failed message, and blocks retry until fresh verification', () => {
    const onTurnstileRejected = vi.fn();
    const onTurnstileRequired = vi.fn();
    render(
      <TurnstileHarness
        initialToken='stale-token'
        onTurnstileRejected={onTurnstileRejected}
        onTurnstileRequired={onTurnstileRequired}
      />
    );

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'I am Test Artist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(chatMocks.sendMessage).toHaveBeenCalledWith({
      text: 'I am Test Artist',
    });
    expect(screen.getByLabelText('Chat message input')).toHaveValue('');

    errorMocks.metadata = {
      errorCode: 'TURNSTILE_REQUIRED',
      message: 'Bot challenge failed',
      requestId: 'req-1',
    };
    act(() => {
      chatMocks.onError?.(new Error('Bot challenge failed'));
    });

    expect(onTurnstileRejected).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Chat message input')).toHaveValue(
      'I am Test Artist'
    );
    expect(screen.getByText('Verify you are human to send')).toBeVisible();

    chatMocks.sendMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));

    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Chat message input')).toHaveValue(
      'I am Test Artist'
    );
    expect(onTurnstileRequired).toHaveBeenCalledWith(
      'Verify you are human to send'
    );
  });
});
