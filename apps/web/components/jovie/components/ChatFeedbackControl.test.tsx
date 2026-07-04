import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFeedbackControl } from './ChatFeedbackControl';

vi.mock('@/lib/sentry/client-lite', () => ({
  addBreadcrumb: vi.fn(),
}));

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
    render(<ChatFeedbackControl messageId='msg-1' />);

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

    render(
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

    render(<ChatFeedbackControl messageId='msg-2' />);

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

    render(<ChatFeedbackControl messageId='msg-3' />);

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

    render(<ChatFeedbackControl messageId='msg-4' />);

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));

    await waitFor(() =>
      expect(screen.getByTestId('chat-feedback-control')).not.toHaveAttribute(
        'data-vote'
      )
    );
  });
});
