import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskJovieMark } from '@/components/ask-jovie/AskJovie';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard',
}));

const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));

describe('AskJovieMark', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a faded resting mark labelled Ask Jovie', () => {
    render(<AskJovieMark />);
    const trigger = screen.getByTestId('ask-jovie-trigger');
    expect(trigger).toHaveAttribute('aria-label', 'Ask Jovie');
    expect(trigger.className).toContain('opacity-60');
    expect(trigger.querySelector('.ask-jovie-mark-icon')).not.toBeNull();
  });

  it('rests on the mark alone and reveals a clipped wordmark on hover or focus', () => {
    render(<AskJovieMark />);
    const trigger = screen.getByTestId('ask-jovie-trigger');
    const wordmark = trigger.querySelector('.ask-jovie-wordmark');
    expect(wordmark).toHaveClass('overflow-hidden');
    expect(wordmark).toHaveTextContent('Jovie');
    // No flex gap: a 0-width wordmark must not pad the resting ring.
    expect(trigger.className).not.toMatch(/(?:^|\s)gap-/);
    expect(trigger).toHaveClass('focus-ring-themed');
    expect(trigger.className).not.toContain('ring-white');
  });

  it('puts the mark on the sidebar icon column with no side padding', () => {
    render(<AskJovieMark />);
    const trigger = screen.getByTestId('ask-jovie-trigger');
    // Side padding pushed the mark 4px past the 12px column every nav icon
    // uses; a negative margin would off-centre it in the collapsed rail.
    expect(trigger.className).not.toMatch(/(?:^|\s)-?(?:px|pl|ml)-/);
  });

  it('opens the panel with suggested prompts on click', () => {
    render(<AskJovieMark />);
    fireEvent.click(screen.getByTestId('ask-jovie-trigger'));
    expect(screen.getByTestId('ask-jovie-panel')).toBeInTheDocument();
    const suggestions = screen.getByTestId('ask-jovie-suggestions');
    expect(suggestions).toHaveTextContent('Show me how to use Jovie');
    expect(suggestions).toHaveTextContent('Get help');
    expect(suggestions).toHaveTextContent('Send feedback');
    expect(suggestions).toHaveTextContent('Request a feature');
  });

  it('captures a suggested prompt as structured feedback with intent and page', async () => {
    render(<AskJovieMark />);
    fireEvent.click(screen.getByTestId('ask-jovie-trigger'));
    fireEvent.click(screen.getByText('Request a feature'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toBe('/api/feedback');
    expect(JSON.parse(init.body)).toEqual({
      message: 'Request a feature',
      source: 'ask-jovie',
      pathname: '/app/dashboard',
      intent: 'feature-request',
    });
    const messages = screen.getByTestId('ask-jovie-messages');
    expect(messages.querySelectorAll('[data-role="assistant"]')).toHaveLength(
      1
    );
  });

  it('classifies a free-text message and offers chat handoff for task intent', async () => {
    render(<AskJovieMark />);
    fireEvent.click(screen.getByTestId('ask-jovie-trigger'));
    fireEvent.change(screen.getByLabelText('Message Jovie'), {
      target: { value: 'Create a new smart link' },
    });
    fireEvent.click(screen.getByTestId('ask-jovie-send'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(init.body).intent).toBe('task');
    expect(screen.getByText('Open Jovie chat')).toBeInTheDocument();
  });

  it('keeps typed text and focus when the parent rerenders', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AskJovieMark />);
    await user.click(screen.getByTestId('ask-jovie-trigger'));
    const input = screen.getByLabelText('Message Jovie');
    await user.type(input, 'Why is my link slow');
    rerender(<AskJovieMark variant='jovie' />);
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Message Jovie')).toBeNull();
    await user.click(screen.getByTestId('ask-jovie-trigger'));
    expect(screen.getByLabelText('Message Jovie')).toBeInTheDocument();
  });

  it('sends a typed message with Enter, clears the field and uses token surfaces', async () => {
    const user = userEvent.setup();
    render(<AskJovieMark />);
    await user.click(screen.getByTestId('ask-jovie-trigger'));
    const input = screen.getByLabelText('Message Jovie');
    expect(screen.getByTestId('ask-jovie-send')).toBeDisabled();
    await user.type(input, 'I found a bug{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue('');
    const messages = screen.getByTestId('ask-jovie-messages');
    const user_ = messages.querySelector('[data-role="user"]');
    expect(user_?.className).toContain('bg-surface-2');
    expect(messages.innerHTML).not.toMatch(/white\//);
    expect(input).toHaveAttribute('data-host-drawn');
  });

  it('has no accessibility violations closed, open and after a reply', async () => {
    const user = userEvent.setup();
    const { container } = render(<AskJovieMark />);
    await expectNoA11yViolations(container);
    await user.click(screen.getByTestId('ask-jovie-trigger'));
    await expectNoA11yViolations(screen.getByTestId('ask-jovie-panel'));
    await user.click(screen.getByText('Get help'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await expectNoA11yViolations(screen.getByTestId('ask-jovie-panel'));
  });
});
