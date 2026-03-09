import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TipSelector } from '@/components/molecules/TipSelector';

describe('TipSelector', () => {
  it('uses primary foreground token for the Venmo CTA and icon', () => {
    const onContinue = vi.fn();

    render(<TipSelector onContinue={onContinue} paymentLabel='Venmo' />);

    const continueButton = screen.getByRole('button', {
      name: /Continue with Venmo for \$5 tip/i,
    });

    expect(continueButton).toHaveClass('text-btn-primary-foreground');

    const venmoIcon = continueButton.querySelector('svg');
    expect(venmoIcon).toHaveAttribute('fill', 'currentColor');
  });

  it('continues with the selected amount', () => {
    const onContinue = vi.fn();

    render(<TipSelector onContinue={onContinue} paymentLabel='Venmo' />);

    fireEvent.click(
      screen.getByRole('button', { name: /Select \$7 tip amount/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Continue with Venmo for \$7 tip/i })
    );

    expect(onContinue).toHaveBeenCalledWith(7);
  });
});
