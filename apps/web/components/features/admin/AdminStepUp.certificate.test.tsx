import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminStepUp } from './AdminStepUp';

vi.mock('@/lib/workspace-lock/unlock-with-passkey', () => ({
  unlockWithPasskey: vi.fn(),
}));

describe('AdminStepUp certificate', () => {
  it('keeps the idle unlock button axe-clean and unlocks from the keyboard', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    const { container } = render(
      <AdminStepUp status='idle' onUnlock={onUnlock} />
    );

    await expectNoA11yViolations(container);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Unlock' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onUnlock).toHaveBeenCalledOnce();
  });

  it('keeps the working state axe-clean and ignores clicks', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    const { container } = render(
      <AdminStepUp status='working' onUnlock={onUnlock} />
    );

    const button = screen.getByRole('button', {
      name: 'Waiting for passkey…',
    });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onUnlock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('keeps the error retry axe-clean', async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn();
    const { container } = render(
      <AdminStepUp status='error' onUnlock={onUnlock} />
    );

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onUnlock).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
