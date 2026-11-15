import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminVerificationRequired } from './AdminVerificationRequired';

const unlockWithPasskey = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workspace-lock/unlock-with-passkey', () => ({
  unlockWithPasskey,
}));

describe('AdminVerificationRequired certificate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the step-up-required notice axe-clean', async () => {
    const { container } = render(<AdminVerificationRequired />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Admin verification required to load this data.'
    );
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('runs the passkey step-up and shows its failure with a retry', async () => {
    const user = userEvent.setup();
    unlockWithPasskey.mockRejectedValueOnce(
      new Error('The passkey prompt was canceled. Try again to unlock.')
    );
    const { container } = render(<AdminVerificationRequired />);

    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(unlockWithPasskey).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The passkey prompt was canceled. Try again to unlock.'
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('falls back to a generic failure message when the error has none', async () => {
    const user = userEvent.setup();
    unlockWithPasskey.mockRejectedValueOnce('aborted');
    render(<AdminVerificationRequired />);

    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passkey check did not complete.'
    );
  });

  it('keeps long and RTL messages axe-clean', async () => {
    const long =
      'Admin verification required to load pipeline settings, distributor credentials, payout destinations and every scheduled outreach batch.';
    const { container, rerender } = render(
      <AdminVerificationRequired message={long} />
    );
    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <AdminVerificationRequired message='يلزم تحقق المسؤول لتحميل هذه البيانات.' />
      </div>
    );
    expect(
      screen.getByText('يلزم تحقق المسؤول لتحميل هذه البيانات.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
