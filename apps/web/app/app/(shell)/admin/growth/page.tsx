import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { CanonicalLifecycleFunnel } from '@/components/features/admin/contacts-table/CanonicalLifecycleFunnel';
import { FounderFunnelBand } from '@/components/features/admin/hud/FounderFunnelBand';
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
import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { adminGrowthSearchParams } from '@/lib/nuqs';

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

  const params = await adminGrowthSearchParams.parse(searchParams);
  const [counts, lifecycleMetrics, funnel] = await Promise.all([
    getLeadFunnelCounts(),
    getCanonicalContactMetrics(),
    getFounderFunnelData('30d'),
  ]);

  return (
    <AdminPage
      title='Growth'
      description='Customer reality from first observed touch through paid, with every measured aggregate linked to people.'
      testId='admin-growth-page'
      viewTestId='admin-growth-view-leads'
    >
      <CanonicalLifecycleFunnel metrics={lifecycleMetrics} />
      <FounderFunnelBand initialFunnel={funnel} />
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
