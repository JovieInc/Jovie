import { fireEvent, render, screen } from '@testing-library/react';
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

  it('keeps a connect failure destructive and a platform disconnect failure as a warning', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            connected: false,
            onboardingComplete: false,
            payoutsEnabled: false,
            email: null,
            onboardingAvailable: true,
          })
        )
        .mockResolvedValueOnce(jsonResponse({ error: 'Stripe is down' }, false))
    );

    const disconnected = render(<SettingsPaymentsSection />);
    expect(await screen.findByText('Stripe not connected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Stripe' }));
    expect(await screen.findByText('Stripe is down')).toHaveClass(
      'text-destructive'
    );
    disconnected.unmount();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            connected: true,
            onboardingComplete: true,
            payoutsEnabled: true,
            email: 'pay@example.com',
            onboardingAvailable: true,
          })
        )
        .mockResolvedValueOnce(
          jsonResponse(
            {
              error: 'Platform profile is incomplete',
              code: 'platform_profile_incomplete',
            },
            false
          )
        )
    );

    render(<SettingsPaymentsSection />);
    expect(await screen.findByText('Stripe connected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(
      await screen.findByText('Platform profile is incomplete')
    ).toHaveClass('text-warning');
  });
});
