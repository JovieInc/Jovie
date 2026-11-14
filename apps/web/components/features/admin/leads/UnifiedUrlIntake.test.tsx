import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UnifiedUrlIntake } from './UnifiedUrlIntake';

const mutateAsync = vi.fn();
let isPending = false;
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/lib/queries', () => ({
  useQueueLeadUrlsMutation: () => ({ mutateAsync, isPending }),
}));

vi.mock('@/components/feedback', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

describe('UnifiedUrlIntake', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    isPending = false;
  });

  it('starts empty with Queue URLs disabled, axe-clean', async () => {
    const { container } = render(<UnifiedUrlIntake />);

    expect(screen.getByLabelText('Lead URLs')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Queue URLs' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('queues the trimmed, non-blank URLs and clears the field', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    mutateAsync.mockResolvedValue({
      summary: { created: 1, duplicate: 1, invalid: 0 },
    });
    render(<UnifiedUrlIntake onSubmitted={onSubmitted} />);

    await user.type(
      screen.getByLabelText('Lead URLs'),
      '  https://linktr.ee/a  {enter}{enter}https://linktr.ee/b'
    );
    await user.click(screen.getByRole('button', { name: 'Queue URLs' }));

    expect(mutateAsync).toHaveBeenCalledWith([
      'https://linktr.ee/a',
      'https://linktr.ee/b',
    ]);
    await waitFor(() =>
      expect(screen.getByLabelText('Lead URLs')).toHaveValue('')
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      'Queued 1 URL (1 duplicates, 0 invalid)'
    );
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it('keeps the pasted URLs and shows the error when the queue fails', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    mutateAsync.mockRejectedValue(new Error('Failed to fetch'));
    const { container } = render(
      <UnifiedUrlIntake onSubmitted={onSubmitted} />
    );

    await user.type(screen.getByLabelText('Lead URLs'), 'https://linktr.ee/a');
    await user.click(screen.getByRole('button', { name: 'Queue URLs' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to fetch')
    );
    expect(screen.getByLabelText('Lead URLs')).toHaveValue(
      'https://linktr.ee/a'
    );
    expect(onSubmitted).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('falls back to a generic message for a non-Error failure', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue('boom');
    render(<UnifiedUrlIntake />);

    await user.type(screen.getByLabelText('Lead URLs'), 'https://linktr.ee/a');
    await user.click(screen.getByRole('button', { name: 'Queue URLs' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('URL intake failed')
    );
  });

  it('disables Queue URLs while a queue request is pending, axe-clean', async () => {
    isPending = true;
    const user = userEvent.setup();
    const { container } = render(<UnifiedUrlIntake />);

    await user.type(screen.getByLabelText('Lead URLs'), 'https://linktr.ee/a');

    expect(screen.getByRole('button', { name: 'Queue URLs' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps typed URLs and focus across a re-render and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<UnifiedUrlIntake />);
    const field = screen.getByLabelText('Lead URLs');

    await user.type(field, 'https://linktr.ee/a');
    rerender(<UnifiedUrlIntake onSubmitted={() => undefined} />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Lead URLs')).toHaveValue(
      'https://linktr.ee/a'
    );
    expect(screen.getByLabelText('Lead URLs')).toHaveFocus();
  });

  it('stays axe-clean inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <UnifiedUrlIntake />
      </div>
    );

    expect(screen.getByText('Unified URL intake')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
