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
    // No permanently disabled Connect Stripe button: the row explains the pause.
    expect(screen.queryByRole('button', { name: 'Connect Stripe' })).toBeNull();
    expect(
      screen.getByText(
        'Stripe payouts open once Jovie finishes platform setup. Your account is safe.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Payout setup is temporarily unavailable. Please try again later.'
      )
    ).toHaveClass('text-warning');
  });

  it('capitalizes payment brand names in the loading description', () => {
    // Never-resolving fetch keeps the section in its loading state.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    );

    render(<SettingsPaymentsSection />);

    expect(
      screen.getByText('Checking your Stripe connection and payout status.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Checking your stripe connection and payout status.')
    ).toBeNull();
  });

  it('capitalizes payment brand names in the disconnected description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          connected: false,
          onboardingComplete: false,
          payoutsEnabled: false,
          email: null,
          onboardingAvailable: true,
        })
      )
    );

    render(<SettingsPaymentsSection />);

    expect(
      await screen.findByText(
        'Connect Stripe to receive fan payments directly through Jovie. Stripe handles payment processing, payouts, and tax reporting.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Connect stripe to receive fan payments directly through jovie. Stripe handles payment processing, payouts, and tax reporting.'
      )
    ).toBeNull();
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
    expect(await screen.findByText('Stripe is down')).toHaveClass('text-error');
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
