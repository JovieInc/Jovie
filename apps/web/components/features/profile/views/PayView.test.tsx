import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayView } from './PayView';

vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const profileId = '123e4567-e89b-12d3-a456-426614174000';
const props = {
  profileId,
  artistHandle: 'artist',
  venmoLink: 'https://venmo.com/artist',
};

describe('PayView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.removeItem('jovie:pay:method');
  });

  it('shows the Pay dial with Venmo while Stripe checkout is unavailable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: false }),
    });
    render(<PayView {...props} />);
    expect(
      await screen.findByRole('button', { name: 'Pay $10 with Venmo' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Choose a payment method' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Apple Pay / Card')).not.toBeInTheDocument();
  });

  it('offers eligible Stripe checkout without creating a session on selection', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/tips/create-checkout?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ available: true, profileId }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Checkout unavailable' }),
      });
    });
    globalThis.fetch = fetchMock;
    render(<PayView {...props} profileId={undefined} />);
    await screen.findByRole('button', { name: 'Select Venmo' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tips/create-checkout?handle=artist',
      expect.objectContaining({ cache: 'no-store' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Venmo' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Select Apple Pay / Card' })
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Pay $10 with Apple Pay / Card',
      })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/tips/create-checkout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          profileId,
          handle: 'artist',
          amountCents: 1000,
        }),
      })
    );
  });
});
