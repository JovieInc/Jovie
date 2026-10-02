import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaySelector } from './PaySelector';

describe('PaySelector', () => {
  it('renders preset amounts and continues with the middle default', () => {
    const onContinue = vi.fn();
    render(<PaySelector amounts={[5, 10, 20]} onContinue={onContinue} />);

    expect(
      screen.getByRole('button', { name: 'Select $5 tip amount' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with $10' }));
    expect(onContinue).toHaveBeenCalledWith(10);
  });

  it('continues with a newly selected preset amount', () => {
    const onContinue = vi.fn();
    render(<PaySelector amounts={[5, 10, 20]} onContinue={onContinue} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Select $20 tip amount' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue with $20' }));
    expect(onContinue).toHaveBeenCalledWith(20);
  });

  it('normalizes a custom amount to the USD contract precision', () => {
    const onContinue = vi.fn();
    render(
      <PaySelector
        amounts={[5, 10, 20]}
        onContinue={onContinue}
        presentation='drawer'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom Amount' }));
    const input = screen.getByLabelText('Custom Amount');
    fireEvent.change(input, { target: { value: '12.3456' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with $12.34' })
    );
    expect(onContinue).toHaveBeenCalledWith(12.34);
  });

  it('disables continue when the payment method is unavailable', () => {
    const onContinue = vi.fn();
    render(
      <PaySelector
        amounts={[5, 10, 20]}
        onContinue={onContinue}
        paymentMethod={{
          id: 'apple-pay',
          label: 'Apple Pay',
          availability: 'unavailable',
        }}
      />
    );

    const cta = screen.getByRole('button', {
      name: 'Pay $10 with Apple Pay',
    });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('labels the CTA with the resolved payment method', () => {
    render(
      <PaySelector
        amounts={[5, 10, 20]}
        onContinue={vi.fn()}
        paymentMethod={{
          id: 'venmo',
          label: 'Venmo',
          availability: 'eligible',
        }}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Pay $10 with Venmo' })
    ).toBeEnabled();
  });

  it('sanitizes custom currency input to digits and two fraction digits', () => {
    const onContinue = vi.fn();
    render(
      <PaySelector
        amounts={[5, 10, 20]}
        onContinue={onContinue}
        presentation='drawer'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom Amount' }));
    const input = screen.getByLabelText('Custom Amount');
    fireEvent.change(input, { target: { value: 'ab$7.5x9' } });

    expect(input).toHaveValue('7.59');
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with $7.59' })
    );
    expect(onContinue).toHaveBeenCalledWith(7.59);
  });
});
