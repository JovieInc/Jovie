import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VerificationModal } from './VerificationModal';

const copy = vi.fn();

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copy, isSuccess: false }),
}));

function setup(
  overrides: Partial<React.ComponentProps<typeof VerificationModal>> = {}
) {
  const onClose = vi.fn();
  const onVerify = vi.fn(async () => undefined);
  const view = render(
    <VerificationModal
      open
      onClose={onClose}
      hostname='novalane.com'
      verificationToken='jovie-verification=abc'
      onVerify={onVerify}
      verifying={false}
      verificationStatus='unverified'
      verificationError={null}
      {...overrides}
    />
  );
  return { ...view, onClose, onVerify };
}

describe('VerificationModal', () => {
  it('shows the token, copies it and checks verification', async () => {
    const user = userEvent.setup();
    const { onVerify } = setup();

    expect(await screen.findByTestId('verification-token')).toHaveTextContent(
      'jovie-verification=abc'
    );
    await user.click(screen.getByTestId('copy-token-button'));
    expect(copy).toHaveBeenCalledWith('jovie-verification=abc');
    await user.click(screen.getByTestId('check-verification-button'));
    expect(onVerify).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(document.body);
  });

  it('expands and collapses the DNS provider guides', async () => {
    const user = userEvent.setup();
    setup();

    const toggle = await screen.findByTestId('provider-tips-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('provider-links')).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
    await user.click(toggle);
    expect(screen.queryByTestId('provider-links')).not.toBeInTheDocument();
  });

  it('disables the check while verifying and shows a mapped error', async () => {
    setup({
      verifying: true,
      verificationStatus: 'pending',
      verificationError: { code: 'rate_limited', message: 'slow down' },
    });

    expect(
      await screen.findByTestId('check-verification-button')
    ).toBeDisabled();
    expect(screen.getByTestId('verification-error')).toHaveTextContent(
      /Too many verification attempts/
    );
    await expectNoA11yViolations(document.body);
  });

  it('shows only the success note once verified', async () => {
    setup({ verificationStatus: 'verified' });
    expect(await screen.findByTestId('verification-success')).toBeVisible();
    expect(
      screen.queryByTestId('check-verification-button')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });
});
