import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaySelector } from '@/components/molecules/PaySelector';

describe('PaySelector', () => {
  it('uses the selected amount in the Venmo CTA and icon', () => {
    const onContinue = vi.fn();

    render(<PaySelector onContinue={onContinue} paymentLabel='Venmo' />);

    const continueButton = screen.getByRole('button', {
      name: /Pay \$10 with Venmo/i,
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
      screen.getByRole('button', { name: /Pay \$20 with Venmo/i })
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
      screen.getByRole('button', { name: /Pay \$10 with Venmo/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Other payment methods/i })
    );

    expect(
      screen.queryByRole('button', { name: /Continue with Venmo for \$10/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pay \$10 with Venmo/i })
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Custom Amount/i }));

    expect(amountSlot).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Select \$5 payment amount/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Custom Amount')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Custom Amount/i }));
    fireEvent.change(screen.getByLabelText('Custom Amount'), {
      target: { value: '42.50' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Pay \$42.50 with Venmo/i })
    );

    expect(onContinue).toHaveBeenCalledWith(42.5);
  });

  it('keeps the selected preset visibly and semantically selected', () => {
    render(
      <PaySelector
        onContinue={vi.fn()}
        paymentLabel='Venmo'
        presentation='drawer'
      />
    );

    const selected = screen.getByRole('button', {
      name: /Select \$10 payment amount/i,
    });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveAttribute('data-selected', 'true');
    expect(selected).toHaveTextContent('$10');
  });

  it('only enables a provider when its capability is available', () => {
    render(
      <PaySelector
        onContinue={vi.fn()}
        paymentMethod={{
          id: 'apple-pay',
          label: 'Apple Pay',
          availability: 'unavailable',
        }}
        presentation='drawer'
      />
    );

    expect(
      screen.getByRole('button', { name: /Pay \$10 with Apple Pay/i })
    ).toBeDisabled();
  });
});
