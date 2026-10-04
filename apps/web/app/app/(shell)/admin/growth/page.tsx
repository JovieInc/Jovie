import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { CanonicalLifecycleFunnel } from '@/components/features/admin/contacts-table/CanonicalLifecycleFunnel';
import { FounderFunnelDrilldown } from '@/components/features/admin/hud/FounderFunnelDrilldown';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { GtmCollapsibles } from '@/components/features/admin/leads/GtmCollapsibles';
import {
  GtmFunnel,
  GtmFunnelSkeleton,
} from '@/components/features/admin/leads/GtmFunnel';
import { getLeadFunnelCounts } from '@/components/features/admin/leads/LeadPipelineKpis';
import { LeadTable } from '@/components/features/admin/leads/LeadTable';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { getCanonicalContactMetrics } from '@/lib/admin/contacts';
import {
  getFounderFunnelData,
  getFounderFunnelStageRows,
  isFounderFunnelDrilldownStage,
} from '@/lib/admin/founder-funnel';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { adminGrowthSearchParams } from '@/lib/nuqs';
import { GrowthFounderFunnel } from './GrowthFounderFunnel';

interface AdminGrowthPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin Growth',
  description: 'Acquisition funnel, referral, outreach, and conversion.',
};

export const runtime = 'nodejs';

export default async function AdminGrowthPage({
  searchParams,
}: Readonly<AdminGrowthPageProps>) {
  await requireCurrentAdminPageAccess();

  const rawParams = await searchParams;
  const params = await adminGrowthSearchParams.parse(rawParams);
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      urlParams.append(key, item);
    }
  }
  urlParams.set('funnelRange', params.funnelRange);
  const urlSearchParams = urlParams.toString();
  const drilldownStage = isFounderFunnelDrilldownStage(params.funnelStage)
    ? params.funnelStage
    : null;
  const [counts, funnel, lifecycleMetrics, drilldown] = await Promise.all([
    getLeadFunnelCounts(),
    getFounderFunnelData(params.funnelRange),
    getCanonicalContactMetrics(),
    drilldownStage
      ? getFounderFunnelStageRows(drilldownStage, params.funnelRange)
      : Promise.resolve(null),
  ]);

  return (
    <AdminPage
      title='Growth'
      description='Customer reality from first observed touch through paid, with every measured aggregate linked to people.'
      testId='admin-growth-page'
      viewTestId='admin-growth-view-leads'
    >
      <GrowthFounderFunnel
        initialFunnel={funnel}
        urlSearchParams={urlSearchParams}
      />
      {drilldown ? (
        <FounderFunnelDrilldown
          result={drilldown}
          urlSearchParams={urlSearchParams}
        />
      ) : null}
      <CanonicalLifecycleFunnel metrics={lifecycleMetrics} />
      <ContentSurfaceCard surface='details'>
        <div className='p-3'>
          <h2 className='line-clamp-2 text-app font-semibold text-primary-token'>
            Lifecycle Coverage
          </h2>
          <p className='mt-1 text-app text-secondary-token'>
            Visited, qualified, retained, and expanded are not yet backed by a
            complete authoritative cohort series. Ovie leaves those stages
            unmeasured instead of inferring them from signups or subscriptions.
          </p>
        </div>
      </ContentSurfaceCard>
      <Suspense fallback={<GtmFunnelSkeleton />}>
        <GtmFunnel counts={counts} />
      </Suspense>
      <LeadTable
        funnelCounts={counts}
        initialSearch={params.q ?? ''}
        basePath={buildAdminGrowthHref('leads')}
      />
      <GtmCollapsibles initialOpen={params.view} />
    </AdminPage>
  );
}
