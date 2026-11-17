import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseSaveStatusRow } from './ReleaseSaveStatusRow';

describe('ReleaseSaveStatusRow', () => {
  it('reserves its height with no live region while idle', async () => {
    const { container } = render(
      <ReleaseSaveStatusRow status='idle' minHeightClassName='min-h-8' />
    );

    expect(container.firstElementChild).toHaveClass('min-h-8');
    expect(screen.queryByRole('status')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('announces saving and then saved', async () => {
    const { container, rerender } = render(
      <ReleaseSaveStatusRow status='saving' />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    await expectNoA11yViolations(container);

    rerender(<ReleaseSaveStatusRow status='saved' />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    await expectNoA11yViolations(container);
  });

  it('shows the failure with a retry that calls back', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <ReleaseSaveStatusRow
        status='error'
        feedback={{
          message: "Couldn't save changes.",
          actionLabel: 'Retry',
          onRetry,
        }}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't save changes."
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('prefers feedback over the saved tick when both are present', () => {
    render(
      <ReleaseSaveStatusRow
        status='saved'
        feedback={{
          message: 'Saved locally only.',
          actionLabel: 'Sync',
          onRetry: vi.fn(),
        }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved locally only.');
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
  });
});
