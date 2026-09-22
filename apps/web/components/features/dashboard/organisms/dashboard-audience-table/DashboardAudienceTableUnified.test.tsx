import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
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
  });
});
