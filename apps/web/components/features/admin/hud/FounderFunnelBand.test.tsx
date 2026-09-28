import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FounderFunnelData } from '@/lib/admin/types';
import { FounderFunnelBand } from './FounderFunnelBand';

const funnel: FounderFunnelData = {
  timeRange: '30d',
  biggestDropOffKey: 'accounts_created',
  errors: [],
  stages: [
    {
      key: 'onboarding_chats',
      label: 'Onboarding chats',
      description: 'Started onboarding',
      count: 100,
      conversionRate: null,
      dropOff: null,
      drillDownHref: '/app/ov/people?stage=onboarding_chats',
    },
    {
      key: 'accounts_created',
      label: 'Accounts created',
      description: 'Created an account',
      count: 40,
      conversionRate: 0.4,
      dropOff: 60,
      drillDownHref: '/app/ov/people?stage=accounts_created',
    },
  ],
};

describe('FounderFunnelBand', () => {
  it('links each funnel stage to its entity drill-down', () => {
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
    ).toHaveAttribute('href', '/app/ov/people?stage=accounts_created');
  });
});
