import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskPastReleaseState } from './ReleaseTaskPastReleaseState';

describe('ReleaseTaskPastReleaseState', () => {
  it('explains the release is out and generates a plan on request', async () => {
    const user = userEvent.setup();
    const onSetUpAnyway = vi.fn();
    const { container } = render(
      <ReleaseTaskPastReleaseState
        onSetUpAnyway={onSetUpAnyway}
        isLoading={false}
      />
    );

    expect(screen.getByText('This release is already out')).toBeVisible();
    const action = screen.getByRole('button', {
      name: 'Generate Release Plan Anyway',
    });
    expect(action).toHaveAttribute('type', 'button');
    expect(action).toBeEnabled();
    expect(action).toHaveAttribute('aria-busy', 'false');

    await user.click(action);
    expect(onSetUpAnyway).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows a busy, disabled action while the plan is generating', async () => {
    const user = userEvent.setup();
    const onSetUpAnyway = vi.fn();
    const { container } = render(
      <ReleaseTaskPastReleaseState onSetUpAnyway={onSetUpAnyway} isLoading />
    );

    const action = screen.getByRole('button', { name: 'Generating...' });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-busy', 'true');

    await user.click(action);
    expect(onSetUpAnyway).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseTaskPastReleaseState
          onSetUpAnyway={vi.fn()}
          isLoading={false}
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Generate Release Plan Anyway' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
