import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCanonicalContactMetrics: vi.fn(),
  getFounderFunnelData: vi.fn(),
  getFounderFunnelStageRows: vi.fn(),
  getLeadFunnelCounts: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock(
  '@/components/features/admin/contacts-table/CanonicalLifecycleFunnel',
  () => ({ CanonicalLifecycleFunnel: () => <div>Lifecycle funnel</div> })
);
vi.mock('./GrowthFounderFunnel', () => ({
  GrowthFounderFunnel: ({
    initialFunnel,
  }: {
    initialFunnel: { timeRange: string; count: number };
  }) => (
    <div>
      Founder funnel: {initialFunnel.timeRange} / {initialFunnel.count} people
    </div>
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
describe('AdminGrowthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue('user_admin');
    mocks.getLeadFunnelCounts.mockResolvedValue({});
    mocks.getFounderFunnelData.mockImplementation(async range => ({
      timeRange: range,
      count: range === '7d' ? 7 : 30,
    }));
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

  it.each([
    ['7d', '7d'],
    ['invalid', '30d'],
    [undefined, '30d'],
  ] as const)(
    'reloads %s with a shared validated aggregate and row cohort',
    async (rawRange, range) => {
      const count = range === '7d' ? 7 : 30;
      mocks.getFounderFunnelStageRows.mockImplementation(
        async (_stage, cohort) => ({
          stage: 'paid',
          stageLabel: 'Paid',
          stageDescription: 'Users with an active Stripe subscription',
          timeRange: cohort,
          total: cohort === '7d' ? 7 : 30,
          rows: [
            {
              id: cohort,
              displayName: `${cohort} customer`,
              email: null,
              enteredAt: null,
            },
          ],
          limit: 100,
          errors: [],
          definitionVersion: 'founder-funnel.v2',
        })
      );

      const { default: AdminGrowthPage } = await import('./page');

      render(
        await AdminGrowthPage({
          searchParams: Promise.resolve({
            funnelStage: 'paid',
            funnelRange: rawRange,
            q: 'Ada',
            tag: ['a', 'b'],
          }),
        })
      );

      expect(mocks.getFounderFunnelData).toHaveBeenCalledWith(range);
      expect(mocks.getFounderFunnelStageRows).toHaveBeenCalledWith(
        'paid',
        range
      );
      expect(
        screen.getByText(`Founder funnel: ${range} / ${count} people`)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: `Paid · ${count} people` })
      ).toBeInTheDocument();
      expect(screen.getByText(`${range} customer`)).toBeInTheDocument();
      const back = new URL(
        screen
          .getByRole('link', { name: 'Clear drill-down' })
          .getAttribute('href')!,
        'https://jov.ie'
      ).searchParams;
      expect(back.get('funnelRange')).toBe(range);
      expect(back.has('funnelStage')).toBe(false);
      expect(back.get('q')).toBe('Ada');
      expect(back.getAll('tag')).toEqual(['a', 'b']);
    }
  );
});
