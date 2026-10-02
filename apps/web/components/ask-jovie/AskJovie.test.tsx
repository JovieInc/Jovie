import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskJovieMark } from '@/components/ask-jovie/AskJovie';

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
});
