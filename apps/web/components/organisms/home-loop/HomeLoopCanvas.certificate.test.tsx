import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HOME_LOOP_FIXTURE_ASKS } from './fixtures';
import { HomeLoopCanvas } from './HomeLoopCanvas';
import { props } from './HomeLoopCanvas.test-fixtures';

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  })
);
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

describe('HomeLoopCanvas certificate', () => {
  it('approves an ask in one click from the populated canvas', async () => {
    const user = userEvent.setup();
    const canvasProps = props();
    const { container } = render(<HomeLoopCanvas {...canvasProps} />);

    const approve = screen
      .getAllByTestId('home-loop-ask-approve')
      .find(button => !button.hasAttribute('disabled'));
    expect(approve).toBeDefined();
    await user.click(approve as HTMLElement);

    expect(canvasProps.onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String) })
    );
    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      '2 items are blocked'
    );
    await expectNoA11yViolations(container);
  });

  it('sends a typed reply for the ask it was typed against', async () => {
    const user = userEvent.setup();
    const canvasProps = props();
    render(<HomeLoopCanvas {...canvasProps} />);

    const ask = HOME_LOOP_FIXTURE_ASKS[0];
    const reply = screen.getByRole('textbox', { name: `Reply: ${ask.title}` });
    await user.type(reply, 'Only for staging');
    expect(reply).toHaveValue('Only for staging');
    const form = reply.closest('form') as HTMLFormElement;
    await user.click(within(form).getByRole('button', { name: 'Send Reply' }));

    expect(canvasProps.onReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: ask.id }),
      'Only for staging'
    );
  });

  it('retries each failed read from its own section', async () => {
    const user = userEvent.setup();
    const canvasProps = props({
      loopStatus: 'error',
      asksStatus: 'error',
      pulse: [],
    });
    const { container } = render(<HomeLoopCanvas {...canvasProps} />);

    const asks = screen.getByTestId('home-loop-asks-section');
    await user.click(within(asks).getByRole('button', { name: 'Try again' }));
    expect(canvasProps.onRetryAsks).toHaveBeenCalledOnce();

    const inFlight = screen.getByTestId('home-loop-in-flight-section');
    await user.click(
      within(inFlight).getByRole('button', { name: 'Try again' })
    );
    expect(canvasProps.onRetryLoop).toHaveBeenCalledOnce();
    // An error read never shows the all-clear.
    expect(screen.getByTestId('home-loop-constraint')).not.toHaveTextContent(
      'Nothing is blocking shipping'
    );
    await expectNoA11yViolations(container);
  });

  it('marks every section busy while loading, axe-clean', async () => {
    const { container } = render(
      <HomeLoopCanvas
        {...props({ loopStatus: 'loading', asksStatus: 'loading', pulse: [] })}
      />
    );

    for (const id of [
      'home-loop-asks-section',
      'home-loop-in-flight-section',
      'home-loop-done-section',
    ])
      expect(screen.getByTestId(id)).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('home-loop-constraint')).toHaveAttribute(
      'data-tone',
      'loading'
    );
    await expectNoA11yViolations(container);
  });
});
