import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeLoopAnswerPanel } from './HomeLoopAnswerPanel';

function renderPanel(
  props: Partial<React.ComponentProps<typeof HomeLoopAnswerPanel>> = {}
) {
  const handlers = {
    onBack: vi.fn(),
    onForward: vi.fn(),
    onHome: vi.fn(),
    onOpenTranscript: vi.fn(),
  };
  const view = render(
    <HomeLoopAnswerPanel
      prompt='Status?'
      reply='All green.'
      pending={false}
      position={2}
      total={3}
      {...handlers}
      {...props}
    />
  );
  return { ...view, handlers };
}

describe('HomeLoopAnswerPanel certificate', () => {
  it('steps back and forward through history from the middle', async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Previous Answer' }));
    await user.click(screen.getByRole('button', { name: 'Next Answer' }));
    await user.click(screen.getByRole('button', { name: 'Open Conversation' }));
    await user.click(screen.getByRole('button', { name: 'Back To Home' }));

    expect(handlers.onBack).toHaveBeenCalledOnce();
    expect(handlers.onForward).toHaveBeenCalledOnce();
    expect(handlers.onOpenTranscript).toHaveBeenCalledOnce();
    expect(handlers.onHome).toHaveBeenCalledOnce();
    expect(screen.getByText('All green.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('disables Next on the latest answer', async () => {
    const user = userEvent.setup();
    const { handlers } = renderPanel({ position: 3, total: 3 });

    const next = screen.getByRole('button', { name: 'Next Answer' });
    expect(next).toBeDisabled();
    await user.click(next);
    expect(handlers.onForward).not.toHaveBeenCalled();
  });

  it('marks the panel busy and shows skeleton lines while the reply streams', async () => {
    const { container } = renderPanel({ reply: '', pending: true });

    const panel = screen.getByRole('region', { name: 'Generated Answer' });
    expect(panel).toHaveAttribute('aria-busy', 'true');
    expect(panel).toHaveAttribute('data-state', 'pending');
    expect(screen.getByTestId('home-loop-answer-pending')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps only the header for a finished turn with no reply, plus any cards', async () => {
    const { container } = renderPanel({
      reply: '',
      children: <article aria-label='Release Card'>Release card</article>,
    });

    expect(
      screen.queryByTestId('home-loop-answer-pending')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Release Card' })).toBeVisible();
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent('2 of 3');
    await expectNoA11yViolations(container);
  });
});
