import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPaymentsSection } from '@/components/features/dashboard/organisms/SettingsPaymentsSection';

const fetchMock = vi.fn();

function jsonResponse(
  data: Record<string, unknown>,
  options: { ok?: boolean } = {}
) {
  return Promise.resolve({
    ok: options.ok ?? true,
    json: () => Promise.resolve(data),
  });
}

describe('SettingsPaymentsSection', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('moves from canonical loading anatomy to the disconnected action', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        connected: false,
        onboardingComplete: false,
        payoutsEnabled: false,
        email: null,
        onboardingAvailable: true,
      })
    );

    render(<SettingsPaymentsSection />);

    expect(screen.getByText('Loading payments')).toBeInTheDocument();
    expect(await screen.findByText('Stripe not connected')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stripe-connect/status',
      undefined
    );
    const connectButton = screen.getByRole('button', {
      name: 'Connect Stripe',
    });
    expect(connectButton).toBeEnabled();
    expect(connectButton.closest('.px-4')).toHaveClass('py-4', 'sm:px-5');
  });

  it('keeps the load error recoverable through the same panel action', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({ error: 'Payment status unavailable' }, { ok: false })
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          connected: false,
          onboardingComplete: false,
          payoutsEnabled: false,
          email: null,
          onboardingAvailable: true,
        })
      );

    render(<SettingsPaymentsSection />);

    expect(
      await screen.findByText('Unable to load payments')
    ).toBeInTheDocument();
    expect(screen.getByText('Payment status unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    await waitFor(() => {
      expect(screen.getByText('Stripe not connected')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders platform profile unavailability with a working retry', async () => {
    const unavailableStatus = () =>
      jsonResponse({
        connected: false,
        onboardingComplete: false,
        payoutsEnabled: false,
        email: null,
        onboardingAvailable: false,
      });
    fetchMock.mockImplementationOnce(unavailableStatus);

    render(<SettingsPaymentsSection />);

    await screen.findByText('Payout setup temporarily unavailable');
    // No dead disabled Connect Stripe button (JOV-INV-046).
    expect(
      screen.queryByRole('button', { name: 'Connect Stripe' })
    ).not.toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toBeEnabled();

    fetchMock.mockImplementationOnce(unavailableStatus);
    fireEvent.click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
