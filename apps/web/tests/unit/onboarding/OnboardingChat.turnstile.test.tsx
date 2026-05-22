import { act, fireEvent, render, screen } from '@testing-library/react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingChat } from '@/components/features/onboarding/OnboardingChat';

const chatMocks = vi.hoisted(() => ({
  messages: [] as Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{ type: 'text'; text: string }>;
  }>,
  onError: undefined as undefined | ((error: Error) => void),
  sendMessage: vi.fn(),
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

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { readonly onError?: (error: Error) => void }) => {
    chatMocks.onError = options.onError;
    return {
      messages: chatMocks.messages,
      sendMessage: chatMocks.sendMessage,
      status: chatMocks.status,
      stop: chatMocks.stop,
    };
  },
}));

vi.mock('@/components/jovie/components', () => ({
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
  ErrorDisplay: ({
    chatError,
    onRetry,
  }: {
    readonly chatError: { readonly message: string };
    readonly onRetry: () => void;
  }) => (
    <div role='alert'>
      <p>{chatError.message}</p>
      <button type='button' onClick={onRetry}>
        Retry message
      </button>
    </div>
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
  OnboardingArtistConfirmedCard: () => null,
  OnboardingHandleCheckCard: () => null,
  OnboardingSocialLinkCard: () => null,
  OnboardingSpotifyArtistPickerCard: () => null,
  useArtistSelectionMessage: () => () => 'artist selected',
}));

function TurnstileHarness({
  initialToken = null,
  onTurnstileRejected = vi.fn(),
  onTurnstileRequired = vi.fn(),
}: Readonly<{
  initialToken?: string | null;
  onTurnstileRejected?: () => void;
  onTurnstileRequired?: (message?: string) => void;
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
      onTurnstileRequired={message => {
        onTurnstileRequired(message);
        setInstruction(message ?? null);
      }}
      onTurnstileRejected={() => {
        onTurnstileRejected();
        setTurnstileToken(null);
        setInstruction('Verify you are human to send');
      }}
    />
  );
}

describe('OnboardingChat Turnstile gating', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'test');
    chatMocks.messages = [];
    chatMocks.onError = undefined;
    chatMocks.sendMessage.mockReset();
    chatMocks.status = 'ready';
    chatMocks.stop.mockReset();
    errorMocks.metadata = {};
  });

  it('centers the welcome composer before the first message and docks it after messages exist', () => {
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

    expect(screen.queryByTestId('onboarding-centered-composer')).toBeNull();
    expect(screen.getByTestId('onboarding-composer-dock')).toBeVisible();
  });

  it('keeps the first message local and shows verification guidance until a token exists', () => {
    const onTurnstileRequired = vi.fn();
    render(<TurnstileHarness onTurnstileRequired={onTurnstileRequired} />);

    const input = screen.getByLabelText('Chat message input');
    fireEvent.change(input, { target: { value: 'help me launch a song' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue('help me launch a song');
    expect(onTurnstileRequired).toHaveBeenCalledWith(
      'Verify you are human to send'
    );
    expect(screen.getByText('Verify you are human to send')).toBeVisible();
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
