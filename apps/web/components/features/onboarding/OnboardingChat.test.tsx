import { TooltipProvider } from '@jovie/ui/atoms/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ENTRY_TITLE } from '@/lib/onboarding/empty-state';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingChat } from './OnboardingChat';

const chat = vi.hoisted(() => ({
  messages: [] as UIMessage[],
  status: 'ready' as 'ready' | 'submitted' | 'streaming',
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  stop: vi.fn(),
  onError: undefined as undefined | ((error: Error) => void),
}));

// The chat transport is the only stand-in: the composer, message rows and
// recovery rows below are the real components.
vi.mock('next/dynamic', async () => {
  const { default: dynamic } = await import('next/dist/shared/lib/app-dynamic');
  return { default: dynamic };
});

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: {
    messages?: UIMessage[];
    onError?: (error: Error) => void;
  }) => {
    chat.onError = options.onError;
    return {
      messages: options.messages?.length ? options.messages : chat.messages,
      sendMessage: chat.sendMessage,
      setMessages: chat.setMessages,
      status: chat.status,
      stop: chat.stop,
    };
  },
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => false }));

// The composer reads releases and renders tooltips, as it does inside the app.
function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    ),
  });
}

const text = (id: string, role: 'user' | 'assistant', value: string) =>
  ({ id, role, parts: [{ type: 'text', text: value }] }) as UIMessage;

const verified = {
  turnstileToken: 'turnstile-token',
  turnstileStatus: 'verified',
} as const;

async function sendAndFail(error: Error) {
  const user = userEvent.setup();
  const view = render(<OnboardingChat {...verified} />);
  const composer = await screen.findByRole('textbox');
  await user.type(composer, 'I want to claim jov.ie/timwhite');
  await user.keyboard('{Enter}');
  await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledTimes(1));
  act(() => chat.onError?.(error));
  return view;
}

describe('OnboardingChat states', () => {
  beforeEach(() => {
    chat.messages = [];
    chat.status = 'ready';
    chat.sendMessage.mockClear();
    chat.setMessages.mockClear();
    chat.onError = undefined;
  });

  it('opens on the blank entry with the composer ready', async () => {
    const { container } = render(<OnboardingChat {...verified} />);

    expect(
      await screen.findByRole('heading', { name: ONBOARDING_ENTRY_TITLE })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  // The transcript scroll area is the scrollable region (axe
  // scrollable-region-focusable): it carries a region label and a keyboard
  // entry point.
  it('gives the transcript scroll region keyboard access', async () => {
    const { container } = render(<OnboardingChat {...verified} />);

    const scrollRegion = await screen.findByRole('region', {
      name: 'Onboarding Conversation',
    });
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    await expectNoA11yViolations(container);
  });

  it('shows the thinking row while the first reply is pending', async () => {
    chat.status = 'submitted';
    const { container } = render(
      <OnboardingChat
        {...verified}
        initialMessages={[text('u1', 'user', 'I want to claim jov.ie/tim')]}
      />
    );

    expect(
      await screen.findByText('I want to claim jov.ie/tim')
    ).toBeInTheDocument();
    // The thinking placeholder opens the pending agent turn.
    expect(screen.getByTestId('onboarding-speaker-row')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the failed message in the composer with a retry after a server error', async () => {
    const { container } = await sendAndFail(
      new Error('{"error":"boom","errorCode":"INTERNAL_ERROR"}')
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /temporarily unavailable/i
    );
    expect(screen.getByRole('textbox')).toHaveValue(
      'I want to claim jov.ie/timwhite'
    );
    await expectNoA11yViolations(container);

    await userEvent.click(
      screen.getByRole('button', { name: 'Retry message' })
    );
    expect(chat.sendMessage).toHaveBeenLastCalledWith({
      text: 'I want to claim jov.ie/timwhite',
    });
  });

  it('says the chat service is unreachable when the network drops', async () => {
    const { container } = await sendAndFail(new TypeError('Failed to fetch'));

    expect(
      await screen.findByText('Jovie could not reach the chat service.')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(
      'I want to claim jov.ie/timwhite'
    );
    await expectNoA11yViolations(container);
  });

  it('asks for the security check again when the server rejects the token', async () => {
    const { container } = await sendAndFail(
      new Error('{"error":"Forbidden","errorCode":"TURNSTILE_REQUIRED"}')
    );

    expect(await screen.findByText('One quick check')).toBeInTheDocument();
    expect(screen.getByText(/your draft is still here/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try Security Check Again' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a conversation that is partway through the claim', async () => {
    const { container } = render(
      <OnboardingChat
        {...verified}
        initialMessages={[
          text('u1', 'user', 'I want to claim jov.ie/timwhite'),
          text('a1', 'assistant', 'That name is open. What do you release?'),
        ]}
      />
    );

    // The thread remounts its rows once the initial messages settle, so read
    // the live container rather than holding the first node found.
    await waitFor(() =>
      expect(container).toHaveTextContent(
        'That name is open. What do you release?'
      )
    );
    expect(container).toHaveTextContent('I want to claim jov.ie/timwhite');
    await expectNoA11yViolations(container);
  });

  it('keeps every turn of a long conversation', async () => {
    const turns = Array.from({ length: 6 }, (_, i) => [
      text(
        `u${i}`,
        'user',
        `Question ${i + 1}: ${'about my release '.repeat(8)}`
      ),
      text(
        `a${i}`,
        'assistant',
        `Answer ${i + 1}: ${'here is the next step '.repeat(10)}`
      ),
    ]).flat();
    const { container } = render(
      <OnboardingChat {...verified} initialMessages={turns} />
    );

    await waitFor(() => expect(container).toHaveTextContent('Answer 6:'));
    expect(container).toHaveTextContent('Question 1:');
    // One speaker row per agent turn; the composer docks below the thread.
    expect(screen.getAllByTestId('onboarding-speaker-row')).toHaveLength(6);
    expect(screen.getByTestId('onboarding-composer-dock')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the entry inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OnboardingChat {...verified} />
      </div>
    );

    expect(
      await screen.findByRole('region', { name: 'Jovie Onboarding Chat' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
