import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FounderFunnelData } from '@/lib/admin/types';
import { FounderFunnelBand } from './FounderFunnelBand';

const funnel: FounderFunnelData = {
  timeRange: '30d',
  biggestDropOffKey: 'accounts_created',
  errors: [],
  definitionVersion: 'founder-funnel.v2',
  stages: [
    {
      key: 'onboarding_chats',
      label: 'Onboarding chats',
      description: 'Started onboarding',
      count: 100,
      conversionRate: null,
      dropOff: null,
      identifiable: false,
      drillDownHref: null,
    },
    {
      key: 'accounts_created',
      label: 'Accounts created',
      description: 'Created an account',
      count: 40,
      conversionRate: 0.4,
      dropOff: 60,
      identifiable: true,
      drillDownHref:
        '/app/ov/growth?view=leads&funnelStage=accounts_created&funnelRange=30d',
    },
  ],
};

describe('FounderFunnelBand', () => {
  it('links identifiable funnel stages to their entity drill-down', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FounderFunnelBand initialFunnel={funnel} />
      </QueryClientProvider>
    );

    expect(
      screen.getByRole('link', {
        name: '40 Accounts created; inspect underlying entities',
      })
    ).toHaveAttribute(
      'href',
      '/app/ov/growth?view=leads&funnelStage=accounts_created&funnelRange=30d'
    );
  });

  it('does not link anonymous aggregate-only stages', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <FounderFunnelBand initialFunnel={funnel} />
      </QueryClientProvider>
    );

    expect(
      screen.queryByRole('link', { name: /Onboarding chats/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Anonymous · aggregate only')).toBeInTheDocument();
  });
});
