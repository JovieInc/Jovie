import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseTaskEmptyState } from './ReleaseTaskEmptyState';

describe('ReleaseTaskEmptyState', () => {
  it('generates the release plan on request', async () => {
    const onSetUp = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskEmptyState onSetUp={onSetUp} isLoading={false} />
    );
    expect(screen.getByText('Your Release Playbook')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Generate Release Plan' })
    );
    expect(onSetUp).toHaveBeenCalledTimes(1);
  });

  it('disables the action while the plan generates', async () => {
    const onSetUp = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseTaskEmptyState onSetUp={onSetUp} isLoading />
    );
    const action = screen.getByRole('button', { name: 'Generating...' });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(onSetUp).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ReleaseTaskEmptyState onSetUp={vi.fn()} isLoading={false} />
      </div>
    );
    expect(
      screen.getByRole('button', { name: 'Generate Release Plan' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
