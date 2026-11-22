import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardAudienceWorkspace } from './DashboardAudienceWorkspace';
import { DEFAULT_AUDIENCE_FILTERS } from './dashboard-audience-table/types';

function Providers({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <HeaderActionsProvider>
          <RightPanelProvider>
            <AudiencePanelProvider>
              <TableMetaProvider>{children}</TableMetaProvider>
            </AudiencePanelProvider>
          </RightPanelProvider>
        </HeaderActionsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe('DashboardAudienceWorkspace', () => {
  it('renders the audience table with an accessible empty state', async () => {
    const { container } = render(
      <Providers>
        <DashboardAudienceWorkspace
          mode='members'
          view='all'
          rows={[]}
          total={0}
          sort='lastSeen'
          direction='desc'
          onSortChange={() => undefined}
          onViewChange={() => undefined}
          onFiltersChange={() => undefined}
          filters={DEFAULT_AUDIENCE_FILTERS}
          subscriberCount={0}
        />
      </Providers>
    );

    expect(screen.getByTestId('dashboard-audience-table')).toBeInTheDocument();
    expect(screen.getAllByText('Grow Your Audience').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('selects a focused member row with the x shortcut', () => {
    render(
      <Providers>
        <DashboardAudienceWorkspace
          mode='members'
          view='all'
          rows={[
            {
              id: 'ws-1',
              type: 'email',
              displayName: 'Maya Okafor',
              locationLabel: '',
              geoCity: null,
              geoCountry: null,
              visits: 1,
              engagementScore: 50,
              intentLevel: 'medium',
              latestActions: [],
              referrerHistory: [],
              utmParams: {},
              email: 'maya@example.com',
              emailVisibleToArtist: true,
              phone: null,
              spotifyConnected: false,
              purchaseCount: 0,
              tipAmountTotalCents: 0,
              tipCount: 0,
              tags: [],
              deviceType: null,
              lastSeenAt: null,
            },
          ]}
          total={1}
          sort='lastSeen'
          direction='desc'
          onSortChange={() => undefined}
          onViewChange={() => undefined}
          onFiltersChange={() => undefined}
          filters={DEFAULT_AUDIENCE_FILTERS}
          subscriberCount={0}
        />
      </Providers>
    );
    const row = document
      .querySelector('table [data-table-person-cell]')
      ?.closest('tr') as HTMLElement;
    fireEvent.keyDown(row, { key: 'x' });
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
});
