import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanonicalContactMetrics: vi.fn(),
  getFounderFunnelData: vi.fn(),
  getLeadFunnelCounts: vi.fn(),
  parseSearchParams: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock(
  '@/components/features/admin/contacts-table/CanonicalLifecycleFunnel',
  () => ({ CanonicalLifecycleFunnel: () => <div>Lifecycle funnel</div> })
);
vi.mock('@/components/features/admin/hud/FounderFunnelBand', () => ({
  FounderFunnelBand: () => <div>Founder funnel</div>,
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { readonly children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock('@/components/features/admin/leads/GtmCollapsibles', () => ({
  GtmCollapsibles: () => <div>Growth details</div>,
}));
vi.mock('@/components/features/admin/leads/GtmFunnel', () => ({
  GtmFunnel: () => <div>GTM funnel</div>,
  GtmFunnelSkeleton: () => <div>Loading funnel</div>,
}));
vi.mock('@/components/features/admin/leads/LeadPipelineKpis', () => ({
  getLeadFunnelCounts: mocks.getLeadFunnelCounts,
}));
vi.mock('@/components/features/admin/leads/LeadTable', () => ({
  LeadTable: () => <div>Lead table</div>,
}));
vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { readonly children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('@/lib/admin/contacts', () => ({
  getCanonicalContactMetrics: mocks.getCanonicalContactMetrics,
}));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: mocks.getFounderFunnelData,
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireAccess,
}));
vi.mock('@/lib/nuqs', () => ({
  adminGrowthSearchParams: { parse: mocks.parseSearchParams },
}));

describe('AdminGrowthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue('user_admin');
    mocks.parseSearchParams.mockResolvedValue({});
    mocks.getLeadFunnelCounts.mockResolvedValue({});
    mocks.getFounderFunnelData.mockResolvedValue({});
    mocks.getCanonicalContactMetrics.mockResolvedValue({});
  });

  it('discloses lifecycle stages that do not have authoritative cohort data', async () => {
    const { default: AdminGrowthPage } = await import('./page');

    render(
      await AdminGrowthPage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(mocks.requireAccess).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('heading', { name: 'Lifecycle Coverage' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Ovie leaves those stages unmeasured instead of inferring them/i
      )
    ).toBeInTheDocument();
  });
});
