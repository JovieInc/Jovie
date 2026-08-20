import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FounderFunnelBand } from '@/components/features/admin/hud/FounderFunnelBand';
import type { FounderFunnelData } from '@/lib/admin/types';

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

function stage(
  key: string,
  label: string,
  count: number,
  conversionRate: number | null,
  dropOff: number | null
) {
  return { key, label, description: label, count, conversionRate, dropOff };
}

function makeFunnel(
  overrides: Partial<FounderFunnelData> = {}
): FounderFunnelData {
  return {
    timeRange: '30d',
    biggestDropOffKey: 'accounts_created',
    errors: [],
    stages: [
      stage('onboarding_chats', 'Onboarding chats', 100, null, null),
      stage('accounts_created', 'Accounts created', 40, 0.4, 60),
      stage('profile_claimed', 'Profile claimed', 20, 0.5, 20),
      stage('onboarding_complete', 'Onboarding complete', 10, 0.5, 10),
      stage('paid', 'Paid', 2, 0.2, 8),
    ],
    ...overrides,
  };
}

function makeEmptyFunnel(): FounderFunnelData {
  return makeFunnel({
    biggestDropOffKey: null,
    stages: makeFunnel().stages.map(entry => ({
      ...entry,
      count: 0,
      conversionRate: null,
      dropOff: null,
    })),
  });
}

describe('FounderFunnelBand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the death-step funnel without MRR or velocity tiles', () => {
    renderWithQuery(<FounderFunnelBand initialFunnel={makeFunnel()} />);

    expect(
      screen.getByTestId('founder-funnel-stage-onboarding_chats')
    ).toBeInTheDocument();
    expect(screen.getByText('Biggest drop-off · −60')).toBeInTheDocument();
    expect(screen.queryByTestId('founder-hud-mrr')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('founder-hud-shipping-velocity')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Monthly recurring revenue')
    ).not.toBeInTheDocument();
  });

  it('shows empty after a successful all-zero observation', () => {
    renderWithQuery(<FounderFunnelBand initialFunnel={makeEmptyFunnel()} />);

    expect(screen.getByTestId('hud-bottleneck-observation')).toHaveAttribute(
      'data-state',
      'empty'
    );
    expect(
      screen.getByText(
        'No funnel data yet. Zero is shown only after a successful observation.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('shows unavailable with retry when the funnel fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream failed', { status: 503 })
    );

    renderWithQuery(<FounderFunnelBand />);

    await waitFor(() => {
      expect(screen.getByTestId('hud-bottleneck-observation')).toHaveAttribute(
        'data-state',
        'unavailable'
      );
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByTestId('founder-hud-mrr')).not.toBeInTheDocument();
  });
});
