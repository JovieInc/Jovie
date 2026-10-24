import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
import type { AudienceMember } from '@/types';
import { DashboardAudienceTableUnified } from './DashboardAudienceTableUnified';
import { DEFAULT_AUDIENCE_FILTERS } from './types';

// Analytics has its own query contract; this test exercises table/export binding.
vi.mock(
  '@/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard',
  () => ({ AiCrawlerIntelligenceCard: () => null })
);

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
  afterEach(() => vi.unstubAllGlobals());

  it('binds subscriber export to the table immutable profile instead of local member export', async () => {
    const profileId = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <DashboardAudienceTableUnified
        mode='subscribers'
        profileId={profileId}
        view='all'
        rows={[]}
        total={1}
        subscriberCount={1}
        sort='createdAt'
        direction='desc'
        onSortChange={() => undefined}
        onViewChange={() => undefined}
        onFiltersChange={() => undefined}
        filters={DEFAULT_AUDIENCE_FILTERS}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Export data to CSV file' })
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dashboard/audience/subscribers',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ profileId }),
        })
      )
    );
  });
  it('renders the workspace empty state as the shared focal card', () => {
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

    const card = document.querySelector('[data-empty-state-card]');
    expect(card).not.toBeNull();
    expect(card).toHaveClass('rounded-md');
    expect(card).toHaveClass('border-subtle');
    expect(card).toHaveClass('bg-surface-0');
    expect(card).toHaveClass('text-left');
  });

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
    expect(screen.getAllByText('Grow Your Audience').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: 'Open Profile Settings' })[0]
    ).toHaveAttribute('href', '/app/settings/profile');
    const headerLabels = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    expect(headerLabels).toEqual(
      expect.arrayContaining([
        'Fan',
        'State',
        'Alerts',
        'Engagement',
        'Last Seen',
        'Action',
      ])
    );
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
    // x selects the focused row and raises the bulk bar over the toolbar.
    const bulkBar = () =>
      document.querySelector('[data-state][aria-hidden]') as HTMLElement;
    expect(bulkBar()).toHaveAttribute('data-state', 'hidden');
    const row = person?.closest('tr') as HTMLElement;
    fireEvent.keyDown(row, { key: 'x' });
    expect(bulkBar()).toHaveAttribute('data-state', 'visible');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
});
