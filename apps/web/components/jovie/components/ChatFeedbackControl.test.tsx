import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatFeedbackControl } from './ChatFeedbackControl';

vi.mock('@/lib/sentry/client-lite', () => ({
  addBreadcrumb: vi.fn(),
}));

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ChatFeedbackControl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders thumbs up and thumbs down controls', () => {
    renderWithProvider(<ChatFeedbackControl messageId='msg-1' />);

    expect(screen.getByTestId('chat-feedback-control')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Good response' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Bad response' })
    ).toBeInTheDocument();
  });

  it('posts an up vote with full attribution payload', async () => {
    const fetchMock = mockFetchOk();

    renderWithProvider(
      <ChatFeedbackControl
        messageId='msg-1'
        turnId='123e4567-e89b-42d3-a456-426614174000'
        conversationId='123e4567-e89b-42d3-a456-426614174001'
        toolCallId='call-9'
        toolName='createMerch'
        excerpt='Generated a band tee'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat/feedback');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      messageId: 'msg-1',
      vote: 'up',
      turnId: '123e4567-e89b-42d3-a456-426614174000',
      conversationId: '123e4567-e89b-42d3-a456-426614174001',
      toolCallId: 'call-9',
      toolName: 'createMerch',
      messageExcerpt: 'Generated a band tee',
    });

    expect(screen.getByTestId('chat-feedback-control')).toHaveAttribute(
      'data-vote',
      'up'
    );
  });

  it('undoes the vote when the active vote is clicked again', async () => {
    const fetchMock = mockFetchOk();

    renderWithProvider(<ChatFeedbackControl messageId='msg-2' />);

    const downButton = screen.getByRole('button', { name: 'Bad response' });
    fireEvent.click(downButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(downButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    );
    expect(secondBody.vote).toBeNull();
    expect(screen.getByTestId('chat-feedback-control')).not.toHaveAttribute(
      'data-vote'
    );
  });

  it('switches the vote when the other thumb is clicked', async () => {
    const fetchMock = mockFetchOk();

    renderWithProvider(<ChatFeedbackControl messageId='msg-3' />);

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Bad response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string
    );
    expect(secondBody.vote).toBe('down');
    expect(screen.getByTestId('chat-feedback-control')).toHaveAttribute(
      'data-vote',
      'down'
    );
  });

  it('rolls the vote back when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProvider(<ChatFeedbackControl messageId='msg-4' />);

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));

    await waitFor(() =>
      expect(screen.getByTestId('chat-feedback-control')).not.toHaveAttribute(
        'data-vote'
      )
    );
  });
});

describe('ChatFeedbackControl certificate states', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('has no axe violations before any vote', async () => {
    mockFetchOk();
    const { container } = renderWithProvider(
      <ChatFeedbackControl messageId='msg-a11y-empty' />
    );
    expect(
      screen.getByRole('button', { name: 'Good response' })
    ).toHaveAttribute('aria-pressed', 'false');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations once a vote is recorded', async () => {
    const fetchMock = mockFetchOk();
    const { container } = renderWithProvider(
      <ChatFeedbackControl messageId='msg-a11y-voted' />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: 'Good response' })
    ).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('returns to an unpressed, axe-clean pair when the vote fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const { container } = renderWithProvider(
      <ChatFeedbackControl messageId='msg-a11y-error' conversationId='c-1' />
    );
    const down = screen.getByRole('button', { name: 'Bad response' });
    fireEvent.click(down);
    await waitFor(() => expect(down).toHaveAttribute('aria-pressed', 'false'));
    await expectNoA11yViolations(container);
  });

  it('treats a network failure like a refusal and rolls back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    renderWithProvider(<ChatFeedbackControl messageId='msg-offline' />);
    const up = screen.getByRole('button', { name: 'Good response' });
    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(up).toHaveAttribute('aria-pressed', 'false'));
  });

  it('never renders the excerpt and sends at most 500 characters of it', async () => {
    const fetchMock = mockFetchOk();
    const excerpt = 'x'.repeat(620);
    renderWithProvider(
      <ChatFeedbackControl messageId='msg-long' excerpt={excerpt} />
    );
    expect(screen.queryByText(excerpt)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.messageExcerpt).toHaveLength(500);
  });

  it('keeps both labelled thumbs in a right-to-left row and stays axe-clean', async () => {
    mockFetchOk();
    const { container } = renderWithProvider(
      <div dir='rtl' lang='ar'>
        <ChatFeedbackControl messageId='msg-rtl' />
      </div>
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByTestId('chat-feedback-control').closest('[dir]')
    ).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(container);
  });
});
