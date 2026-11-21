import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PaySection } from './PaySection';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/components/feedback', () => ({
  toast: { error: toastError, success: vi.fn() },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

describe('PaySection', () => {
  beforeEach(() => {
    toastError.mockClear();
    try {
      globalThis.localStorage.clear();
    } catch {}
  });

  it('says payments are unavailable with no method and has no axe violations', async () => {
    const { container } = render(<PaySection handle='artist' />);

    expect(
      screen.getByText('Payments are not available for this artist yet.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the typed custom amount and focus through a rerender and blur', async () => {
    const user = userEvent.setup();
    const onStripePayment = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(
      <PaySection handle='artist' onStripePayment={onStripePayment} />
    );

    await user.click(screen.getByRole('button', { name: 'Custom Amount' }));
    const input = screen.getByRole('textbox', { name: 'Custom Amount' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '25');
    rerender(<PaySection handle='artist' onStripePayment={onStripePayment} />);
    expect(input).toHaveValue('25');
    expect(input).toHaveFocus();
    await user.tab();
    expect(input).toHaveValue('25');
    await expectNoA11yViolations(container);
  });

  it('asks for a valid custom amount before payment is possible', async () => {
    const user = userEvent.setup();
    render(
      <PaySection
        handle='artist'
        onStripePayment={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Custom Amount' }));
    const input = screen.getByRole('textbox', { name: 'Custom Amount' });
    await user.clear(input);
    await user.type(input, '900');
    expect(
      screen.getByText('Enter an amount from $1 to $500.')
    ).toBeInTheDocument();
  });

  it('selects an amount and has no axe violations with amount options', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PaySection
        handle='artist'
        amounts={[5, 10, 20]}
        onStripePayment={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const twenty = screen.getByRole('button', {
      name: 'Select $20 payment amount',
    });
    await user.click(twenty);
    expect(twenty).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });
});
