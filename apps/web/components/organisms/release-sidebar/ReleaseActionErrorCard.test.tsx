import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { expectFlatState } from '@/tests/utils/flat-state';
import { ReleaseActionErrorCard } from './ReleaseActionErrorCard';

describe('ReleaseActionErrorCard', () => {
  it('retries and dismisses from the card', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <ReleaseActionErrorCard
        title='Publish failed'
        message="Couldn't publish this release."
        actionLabel='Retry'
        onRetry={onRetry}
        onDismiss={onDismiss}
        testId='publish-error'
      />
    );

    expect(screen.getByTestId('publish-error')).toBeInTheDocument();
    expectFlatState(container);
    expect(screen.getByText('Publish failed')).toBeInTheDocument();
    expect(screen.getByText("Couldn't publish this release.")).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('renders inline with only the retry when no title or dismiss is given', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <ReleaseActionErrorCard
        variant='inline'
        message='Could not save.'
        actionLabel='Try Again'
        onRetry={onRetry}
        testId='inline-error'
      />
    );

    const card = screen.getByTestId('inline-error');
    expect(card).toHaveClass('flex', 'items-start');
    expectFlatState(container);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
