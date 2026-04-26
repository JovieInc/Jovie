import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaySelector } from '@/components/molecules/PaySelector';

describe('PaySelector', () => {
  it('uses primary foreground token for the Venmo CTA and icon', () => {
    const onContinue = vi.fn();

    render(<PaySelector onContinue={onContinue} paymentLabel='Venmo' />);

    const continueButton = screen.getByRole('button', {
      name: /Continue with Venmo for \$10/i,
    });

    expect(continueButton).toHaveClass('text-btn-primary-foreground');

    const venmoIcon = continueButton.querySelector('svg');
    expect(venmoIcon).toHaveAttribute('fill', 'currentColor');
  });

  it('continues with the selected amount', () => {
    const onContinue = vi.fn();

    render(<PaySelector onContinue={onContinue} paymentLabel='Venmo' />);

    fireEvent.click(
      screen.getByRole('button', { name: /Select \$20 tip amount/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Continue with Venmo for \$20/i })
    );

    expect(onContinue).toHaveBeenCalledWith(20);
  });

  it('starts with other payment options expanded in the drawer presentation', () => {
    const onContinue = vi.fn();

    render(
      <PaySelector
        onContinue={onContinue}
        paymentLabel='Venmo'
        presentation='drawer'
        showOtherPaymentOptions
      />
    );

    expect(
      screen.getByRole('button', { name: /Continue with Venmo for \$10/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Other payment options/i })
    );

    expect(
      screen.queryByRole('button', { name: /Continue with Venmo for \$10/i })
    ).not.toBeInTheDocument();
  });

  it('swaps preset amounts for a custom input without changing the reserved slot', () => {
    const onContinue = vi.fn();

    render(
      <PaySelector
        onContinue={onContinue}
        paymentLabel='Venmo'
        presentation='drawer'
        showOtherPaymentOptions
      />
    );

    const amountSlot = screen.getByTestId('pay-selector-amount-slot');
    expect(amountSlot).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Select \$5 payment amount/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Custom amount/i }));

    expect(amountSlot).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Select \$5 payment amount/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Custom amount')).toBeInTheDocument();
  });

  it('continues with a custom amount in the drawer presentation', () => {
    const onContinue = vi.fn();

    render(
      <PaySelector
        onContinue={onContinue}
        paymentLabel='Venmo'
        presentation='drawer'
        showOtherPaymentOptions
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Custom amount/i }));
    fireEvent.change(screen.getByLabelText('Custom amount'), {
      target: { value: '42.50' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Send payment for \$42.50/i })
    );

    expect(onContinue).toHaveBeenCalledWith(42.5);
  });
});
