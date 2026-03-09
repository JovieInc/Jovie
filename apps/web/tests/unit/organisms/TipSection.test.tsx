import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TipSection } from '@/components/organisms/TipSection';

// Mock Sonner toast with vi.hoisted for proper setup
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

// Mock the ToastProvider from providers
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
  });

  it('shows success toast when Stripe payment succeeds', async () => {
    mockOnStripePayment.mockResolvedValueOnce(undefined);

    render(
      <TipSection handle='artist123' onStripePayment={mockOnStripePayment} />
    );

    // Find and click the $2 tip button
    const tipButton = screen.getByText('$2 Tip');
    fireEvent.click(tipButton);

    // Wait for the payment to complete and toast to be called
    await waitFor(() => {
      expect(mockOnStripePayment).toHaveBeenCalledWith(2);
      expect(mockToast.success).toHaveBeenCalledWith(
        'Thanks for the $2 tip!',
        expect.objectContaining({ duration: 5000 })
      );
    });
  });

  it('shows error toast when Stripe payment fails', async () => {
    mockOnStripePayment.mockRejectedValueOnce(new Error('Payment failed'));

    render(
      <TipSection handle='artist123' onStripePayment={mockOnStripePayment} />
    );

    // Find and click the $2 tip button
    const tipButton = screen.getByText('$2 Tip');
    fireEvent.click(tipButton);

    // Wait for the payment to fail and error toast to be called
    await waitFor(() => {
      expect(mockOnStripePayment).toHaveBeenCalledWith(2);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Payment failed. Please try again.',
        expect.objectContaining({ duration: 7000 })
      );
    });
  });

  it('renders payment method selection when both Stripe and Venmo are available', () => {
    render(
      <TipSection
        handle='artist123'
        onStripePayment={mockOnStripePayment}
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    expect(screen.getByText('Choose payment method')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pay with Apple Pay or Card' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pay with Venmo' })
    ).toBeInTheDocument();
  });

  it('calls onVenmoPayment with a properly constructed URL when Venmo is used', () => {
    const handle = 'artist123';
    const venmoBaseLink = 'https://venmo.com/user';

    render(
      <TipSection
        handle={handle}
        onStripePayment={mockOnStripePayment}
        venmoLink={venmoBaseLink}
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    // First, select the Venmo payment method
    const venmoMethodButton = screen.getByRole('button', {
      name: 'Pay with Venmo',
    });
    fireEvent.click(venmoMethodButton);

    // Select the $2 tip amount in the TipSelector
    const amountButton = screen.getByRole('button', {
      name: 'Select $2 tip amount',
    });
    fireEvent.click(amountButton);

    // Click the continue button to trigger payment
    const continueButton = screen.getByRole('button', {
      name: /Continue with Venmo for \$2 tip/i,
    });
    fireEvent.click(continueButton);

    expect(mockOnVenmoPayment).toHaveBeenCalledTimes(1);
    const urlArg = mockOnVenmoPayment.mock.calls[0][0];

    // Basic checks on URL construction: base link and amount
    expect(urlArg).toContain(venmoBaseLink);
    expect(urlArg).toContain('utm_amount=2');
  });

  it('renders QR code fallback when no Stripe or Venmo payment methods are available', () => {
    render(<TipSection handle='artist123' />);

    // QRCodeCard renders with the 'Scan to tip via Apple Pay' title
    expect(screen.getByText('Scan to tip via Apple Pay')).toBeInTheDocument();
  });

  it('returns to payment method selection when back button is clicked after choosing a payment method', () => {
    render(
      <TipSection
        handle='artist123'
        onStripePayment={mockOnStripePayment}
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    // Enter a specific payment method flow (Stripe)
    const stripeMethodButton = screen.getByRole('button', {
      name: 'Pay with Apple Pay or Card',
    });
    fireEvent.click(stripeMethodButton);

    // After selecting a method, the generic payment method selection screen should no longer be visible
    expect(screen.queryByText('Choose payment method')).not.toBeInTheDocument();

    // Click the back button to return to the payment method selection screen
    const backButton = screen.getByRole('button', { name: /back/i });
    fireEvent.click(backButton);

    // Verify that the payment method selection screen is shown again
    expect(screen.getByText('Choose payment method')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pay with Apple Pay or Card' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pay with Venmo' })
    ).toBeInTheDocument();
  });

  it('renders Venmo payment flow directly when only Venmo is available', () => {
    render(
      <TipSection
        handle='artist123'
        venmoLink='https://venmo.com/user'
        onVenmoPayment={mockOnVenmoPayment}
      />
    );

    // When Stripe is not available, the payment method selection should not be shown
    expect(screen.queryByText('Choose payment method')).toBeNull();

    // Venmo payment flow should be available directly via the TipSelector continue button
    expect(
      screen.getByRole('button', { name: /Continue with Venmo/i })
    ).toBeInTheDocument();
  });
});
