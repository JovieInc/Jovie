import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
import type { AudienceMember } from '@/types';
import { DashboardAudienceTableUnified } from './DashboardAudienceTableUnified';
import { DEFAULT_AUDIENCE_FILTERS } from './types';

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
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
  return render(ui, { wrapper });
}

describe('DashboardAudienceTableUnified', () => {
  it('renders the empty members view', () => {
    renderWithProviders(
      <DashboardAudienceTableUnified
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
    );

    expect(screen.getByTestId('dashboard-audience-table')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Audience', hidden: true })
    ).toBeInTheDocument();
    expect(screen.getByText('Grow Your Audience')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Profile Settings' })
    ).toHaveAttribute('href', '/app/settings/profile');
  });

  it('renders members on the 32px dense people row with a face', () => {
    const member: AudienceMember = {
      id: 'm1',
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
    };
    renderWithProviders(
      <DashboardAudienceTableUnified
        mode='members'
        view='all'
        rows={[member]}
        total={1}
        sort='lastSeen'
        direction='desc'
        onSortChange={() => undefined}
        onViewChange={() => undefined}
        onFiltersChange={() => undefined}
        filters={DEFAULT_AUDIENCE_FILTERS}
        subscriberCount={0}
      />
    );

    expect(
      document.querySelector('table[data-table-row-mode="dense"]')
    ).not.toBeNull();
    const person = document.querySelector('table [data-table-person-cell]');
    expect(person).toHaveTextContent('Maya Okaformaya@example.com');
    expect(
      person?.querySelector('[data-slot="app-avatar-frame"]')
    ).toHaveAttribute('data-size', 'sm');
  });
});
