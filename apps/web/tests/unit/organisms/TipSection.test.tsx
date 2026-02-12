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
    expect(screen.getByText('Apple Pay / Card')).toBeInTheDocument();
    expect(screen.getByText('Venmo')).toBeInTheDocument();
  });
});
