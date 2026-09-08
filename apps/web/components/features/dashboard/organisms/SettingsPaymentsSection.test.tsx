import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPaymentsSection } from './SettingsPaymentsSection';

function jsonResponse(data: Record<string, unknown>, ok = true) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status: ok ? 200 : 500,
  });
}

describe('SettingsPaymentsSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders platform-unavailable payout setup as a disabled action state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          connected: false,
          onboardingComplete: false,
          payoutsEnabled: false,
          email: null,
          onboardingAvailable: false,
        })
      )
    );

    render(<SettingsPaymentsSection />);

    expect(
      await screen.findByText('Payout setup temporarily unavailable')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Stripe' })
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Payout setup is temporarily unavailable. Please try again later.'
      )
    ).toHaveClass('text-warning');
  });
});
