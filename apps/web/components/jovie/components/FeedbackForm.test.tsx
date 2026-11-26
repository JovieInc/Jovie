import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FeedbackForm } from './FeedbackForm';

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isSuccess: false,
}));

vi.mock('@/lib/queries', () => ({
  useFeedbackMutation: () => mutation,
}));

beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.isPending = false;
  mutation.isSuccess = false;
});

describe('FeedbackForm', () => {
  it('focuses the textarea, counts characters and submits trimmed text', async () => {
    const user = userEvent.setup();
    const { container } = render(<FeedbackForm onClose={vi.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Your Feedback' });
    expect(field).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();

    await user.type(field, '  Needs dark mode  ');
    expect(screen.getByText('15/2000')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Needs dark mode', source: 'chat' }),
      expect.any(Object)
    );
    await expectNoA11yViolations(container);
  });

  it('keeps typed text and focus across a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender, container } = render(<FeedbackForm onClose={onClose} />);
    const field = screen.getByRole('textbox', { name: 'Your Feedback' });
    await user.type(field, 'Keep this draft');

    rerender(<FeedbackForm onClose={onClose} />);
    await user.keyboard('{Escape}');

    const after = screen.getByRole('textbox', { name: 'Your Feedback' });
    expect(after).toHaveValue('Keep this draft');
    expect(after).toHaveFocus();
    await user.tab();
    expect(after).toHaveValue('Keep this draft');
    await expectNoA11yViolations(container);
  });

  it('shows an error when the mutation fails', async () => {
    mutation.mutate.mockImplementationOnce(
      (_vars: unknown, opts: { onError?: () => void }) => opts.onError?.()
    );
    const user = userEvent.setup();
    const { container } = render(<FeedbackForm onClose={vi.fn()} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Your Feedback' }),
      'Something broke'
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      screen.getByText('Something went wrong. Please try again.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('disables the form while the submission is pending', async () => {
    mutation.isPending = true;
    const { container } = render(<FeedbackForm onClose={vi.fn()} />);
    expect(
      screen.getByRole('textbox', { name: 'Your Feedback' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows the thank-you state and closes from it', async () => {
    mutation.isSuccess = true;
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<FeedbackForm onClose={onClose} />);
    expect(screen.getByText('Thanks for the note.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back To Chat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('closes from Cancel', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackForm onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
