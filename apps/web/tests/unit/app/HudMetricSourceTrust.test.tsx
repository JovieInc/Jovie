import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HudMetricSourceTrust } from '@/app/app/(shell)/admin/ops/HudMetricSourceTrust';
import type { HudMetricSourceTrust as HudMetricSourceTrustType } from '@/types/hud';

const freshSource: HudMetricSourceTrustType = {
  key: 'stripe',
  label: 'Stripe',
  state: 'ok',
  fetchedAtIso: new Date().toISOString(),
  errorMessage: null,
  dashboardUrl: 'https://dashboard.stripe.com/',
  configureUrl: null,
  nextStep: null,
};

const failedSource: HudMetricSourceTrustType = {
  key: 'mercury',
  label: 'Mercury',
  state: 'unavailable',
  fetchedAtIso: new Date().toISOString(),
  errorMessage: 'Mercury API error: timeout',
  dashboardUrl: 'https://app.mercury.com/',
  configureUrl: null,
  nextStep: 'Check Mercury API credentials and retry.',
};

describe('HudMetricSourceTrust', () => {
  it('renders freshness and outbound link for healthy sources', () => {
    render(<HudMetricSourceTrust source={freshSource} />);

    expect(screen.getByText(/Updated just now/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Stripe/i })).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/'
    );
  });

  it('renders scoped failure state with retry and next step', () => {
    const onRetry = vi.fn();
    render(<HudMetricSourceTrust source={failedSource} onRetry={onRetry} />);

    expect(screen.getByText('Fetch failed')).toBeInTheDocument();
    expect(screen.getByText('Mercury API error: timeout')).toBeInTheDocument();
    expect(
      screen.getByText('Check Mercury API credentials and retry.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reserves footer height to avoid layout shift', () => {
    const { container } = render(<HudMetricSourceTrust source={freshSource} />);

    expect(
      container.querySelector('[data-testid="hud-source-trust-stripe"]')
    ).toHaveClass('min-h-9');
  });
});
