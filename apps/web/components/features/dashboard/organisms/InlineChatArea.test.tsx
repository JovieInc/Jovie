import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatError } from '@/components/jovie/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InlineChatArea, type InlineChatAreaRef } from './InlineChatArea';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 60,
        size: 60,
        key: i,
      })),
    getTotalSize: () => count * 60,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => <span data-testid='brand-logo' />,
}));

vi.mock('@/components/jovie/components/ChatMessage', () => ({
  ChatMessage: ({ id }: { readonly id: string }) => (
    <p data-testid='chat-message'>{id}</p>
  ),
}));

vi.mock('@/components/jovie/components/ErrorDisplay', () => ({
  ErrorDisplay: ({
    chatError,
    onRetry,
  }: {
    readonly chatError: ChatError;
    readonly onRetry: () => void;
  }) => (
    <div role='alert'>
      {chatError.message}
      <button type='button' onClick={onRetry}>
        Retry
      </button>
    </div>
  ),
}));

const chat = {
  messages: [] as Array<{ id: string; role: string; parts: unknown[] }>,
  chatError: null as ChatError | null,
  isLoading: false,
  isSubmitting: false,
  hasMessages: false,
  submitMessage: vi.fn(),
  handleRetry: vi.fn(),
};

vi.mock('@/components/jovie/hooks', () => ({
  useJovieChat: () => chat,
}));

function setMessages(count: number) {
  chat.messages = Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    parts: [],
  }));
  chat.hasMessages = count > 0;
}

describe('InlineChatArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMessages(0);
    chat.chatError = null;
    chat.isLoading = false;
    chat.isSubmitting = false;
  });

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<InlineChatArea profileId='p1' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles from its header and auto-expands when messages arrive', async () => {
    const user = userEvent.setup();
    setMessages(2);
    const onExpandedChange = vi.fn();
    const { container } = render(
      <InlineChatArea
        profileId='p1'
        expanded
        onExpandedChange={onExpandedChange}
      />
    );

    const header = screen.getByRole('button', { name: /Jovie/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('chat-message')).toHaveLength(2);
    await user.click(header);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    await expectNoA11yViolations(container);
  });

  it('asks to expand when messages arrive while collapsed', () => {
    setMessages(1);
    const onExpandedChange = vi.fn();
    render(
      <InlineChatArea profileId='p1' onExpandedChange={onExpandedChange} />
    );
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('chat-message')).not.toBeInTheDocument();
  });

  it('virtualizes long transcripts', () => {
    setMessages(14);
    render(<InlineChatArea profileId='p1' expanded />);
    expect(screen.getAllByTestId('chat-message')).toHaveLength(14);
  });

  it('shows the thinking bubble while a reply is loading', async () => {
    setMessages(1);
    chat.isLoading = true;
    const { container } = render(<InlineChatArea profileId='p1' expanded />);
    expect(screen.getByText('inline-chat-loading')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows a chat error and retries it', async () => {
    const user = userEvent.setup();
    chat.chatError = { type: 'network', message: 'You are offline.' };
    const { container } = render(<InlineChatArea profileId='p1' expanded />);
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(chat.handleRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('exposes submitMessage and loading state through its ref', () => {
    setMessages(1);
    chat.isSubmitting = true;
    const ref = createRef<InlineChatAreaRef>();
    render(<InlineChatArea ref={ref} profileId='p1' expanded />);
    ref.current?.submitMessage('hello');
    expect(chat.submitMessage).toHaveBeenCalledWith('hello');
    expect(ref.current?.isLoading).toBe(true);
  });
});
