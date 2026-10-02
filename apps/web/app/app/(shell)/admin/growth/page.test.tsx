import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanonicalContactMetrics: vi.fn(),
  getFounderFunnelData: vi.fn(),
  getFounderFunnelStageRows: vi.fn(),
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
vi.mock('@/components/features/admin/hud/FounderFunnelDrilldown', () => ({
  FounderFunnelDrilldown: ({ result }: { result: { stageLabel: string } }) => (
    <div>Funnel drill-down: {result.stageLabel}</div>
  ),
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
  getFounderFunnelStageRows: mocks.getFounderFunnelStageRows,
  isFounderFunnelDrilldownStage: (value: unknown) =>
    [
      'accounts_created',
      'profile_claimed',
      'onboarding_complete',
      'paid',
    ].includes(value as string),
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
    expect(mocks.getFounderFunnelStageRows).not.toHaveBeenCalled();
  });

  it('renders a stage drill-down from URL cohort params', async () => {
    mocks.parseSearchParams.mockResolvedValue({
      funnelStage: 'paid',
      funnelRange: '7d',
    });
    mocks.getFounderFunnelStageRows.mockResolvedValue({
      stage: 'paid',
      stageLabel: 'Paid',
      stageDescription: 'Users with an active Stripe subscription',
      timeRange: '7d',
      total: 1,
      rows: [],
      limit: 100,
      errors: [],
      definitionVersion: 'founder-funnel.v2',
    });

    const { default: AdminGrowthPage } = await import('./page');

    render(
      await AdminGrowthPage({
        searchParams: Promise.resolve({ funnelStage: 'paid' }),
      })
    );

    expect(mocks.getFounderFunnelStageRows).toHaveBeenCalledWith('paid', '7d');
    expect(screen.getByText('Funnel drill-down: Paid')).toBeInTheDocument();
  });
});
