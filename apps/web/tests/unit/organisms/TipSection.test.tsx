import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaySection } from '@/components/organisms/PaySection';

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
  message: vi.fn(),
  promise: vi.fn(),
  custom: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
  Toaster: () => null,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/components/providers/ToastProvider', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe('TipSection', () => {
  const mockOnStripePayment = vi.fn();
  const mockOnVenmoPayment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.removeItem('jovie:pay:method');
  });

  it('starts Stripe checkout only after Pay and does not claim payment completed', async () => {
    mockOnStripePayment.mockResolvedValueOnce(undefined);

    render(
      <PaySection handle='artist123' onStripePayment={mockOnStripePayment} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select $5 payment amount' })
    );
    expect(mockOnStripePayment).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Pay $5 with Apple Pay / Card' })
    );

    await waitFor(() => {
      expect(mockOnStripePayment).toHaveBeenCalledWith(5);
      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });

  it('shows error toast when Stripe payment fails', async () => {
    mockOnStripePayment.mockRejectedValueOnce(new Error('Payment failed'));

    render(
      <PaySection handle='artist123' onStripePayment={mockOnStripePayment} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select $5 payment amount' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Pay $5 with Apple Pay / Card' })
    );

    await waitFor(() => {
      expect(mockOnStripePayment).toHaveBeenCalledWith(5);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Payment failed. Please try again.',
        expect.objectContaining({ duration: 7000 })
      );
    });
  });

  it('renders the shared dial when both Stripe and Venmo are available', () => {
    render(
      <PaySection
        handle='artist123'
        onStripePayment={mockOnStripePayment}
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    expect(
      screen.getByRole('group', { name: 'Choose a payment method' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pay $10 with Apple Pay / Card' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select Venmo' })
    ).toBeInTheDocument();
  });

  it('keeps the payment action neutral with provider color only on the logo', async () => {
    render(
      <PaySection
        handle='artist123'
        onStripePayment={mockOnStripePayment}
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Venmo' }));
    const venmoButton = await screen.findByRole('button', {
      name: 'Continue with Venmo',
    });
    const venmoLogoClass = venmoButton
      .querySelector('svg')
      ?.getAttribute('class');

    expect(venmoButton.className).toContain('bg-btn-primary');
    expect(venmoButton.className).not.toContain('bg-[#008CFF]');
    expect(venmoLogoClass).toContain('text-brand-venmo');
  });

  it('calls onVenmoPayment only after Pay is pressed with the chosen amount', async () => {
    const handle = 'artist123';
    const venmoBaseLink = 'https://venmo.com/user';

    render(
      <PaySection
        handle={handle}
        onStripePayment={mockOnStripePayment}
        venmoLink={venmoBaseLink}
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    const venmoMethodButton = screen.getByRole('button', {
      name: 'Select Venmo',
    });
    fireEvent.click(venmoMethodButton);
    expect(mockOnVenmoPayment).not.toHaveBeenCalled();

    const amountButton = screen.getByRole('button', {
      name: 'Select $5 payment amount',
    });
    fireEvent.click(amountButton);

    const continueButton = await screen.findByRole('button', {
      name: 'Continue with Venmo',
    });
    fireEvent.click(continueButton);

    expect(mockOnVenmoPayment).toHaveBeenCalledTimes(1);
    const urlArg = mockOnVenmoPayment.mock.calls[0][0];

    expect(urlArg).toContain(venmoBaseLink);
    expect(urlArg).toContain('utm_amount=5');
  });

  it('does not promise a payment method when none is available', () => {
    render(<PaySection handle='artist123' />);
    expect(
      screen.getByText('Payments are not available for this artist yet.')
    ).toBeInTheDocument();
  });

  it('can switch back to Stripe without leaving the amount and method view', async () => {
    render(
      <PaySection
        handle='artist123'
        onStripePayment={mockOnStripePayment}
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Venmo' }));
    await screen.findByRole('button', { name: 'Continue with Venmo' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Select Apple Pay / Card' })
    );
    expect(
      await screen.findByRole('button', {
        name: 'Pay $10 with Apple Pay / Card',
      })
    ).toBeInTheDocument();
    expect(mockOnStripePayment).not.toHaveBeenCalled();
  });

  it('remembers the chosen method on this device without starting a payment', async () => {
    render(
      <PaySection
        handle='artist123'
        onStripePayment={mockOnStripePayment}
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Venmo' }));
    await screen.findByRole('button', { name: 'Continue with Venmo' });
    await waitFor(() =>
      expect(globalThis.localStorage.getItem('jovie:pay:method')).toBe('venmo')
    );
    expect(mockOnVenmoPayment).not.toHaveBeenCalled();
    expect(mockOnStripePayment).not.toHaveBeenCalled();
  });

  it('renders Venmo payment flow directly when only Venmo is available', () => {
    render(
      <PaySection
        handle='artist123'
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    expect(
      screen.getByRole('group', { name: 'Choose a payment method' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Venmo' })
    ).toBeInTheDocument();
  });

  it('keeps custom amounts in the live dial without paying on edit', () => {
    render(
      <PaySection
        handle='artist123'
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Custom Amount' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom Amount' }), {
      target: { value: '12.50' },
    });
    expect(mockOnVenmoPayment).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Venmo' })
    );
    expect(mockOnVenmoPayment).toHaveBeenCalledWith(
      expect.stringContaining('utm_amount=12.5')
    );
  });
});
