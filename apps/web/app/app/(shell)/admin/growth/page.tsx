import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { CanonicalLifecycleFunnel } from '@/components/features/admin/contacts-table/CanonicalLifecycleFunnel';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { GtmCollapsibles } from '@/components/features/admin/leads/GtmCollapsibles';
import {
  GtmFunnel,
  GtmFunnelSkeleton,
} from '@/components/features/admin/leads/GtmFunnel';
import { getLeadFunnelCounts } from '@/components/features/admin/leads/LeadPipelineKpis';
import { LeadTable } from '@/components/features/admin/leads/LeadTable';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { getCanonicalContactMetrics } from '@/lib/admin/contacts';
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
  const [counts, lifecycleMetrics] = await Promise.all([
    getLeadFunnelCounts(),
    getCanonicalContactMetrics(),
  ]);

  return (
    <AdminPage
      title='Growth'
      description='Acquisition funnel, referral, outreach, and conversion.'
      testId='admin-growth-page'
      viewTestId='admin-growth-view-leads'
    >
      <CanonicalLifecycleFunnel metrics={lifecycleMetrics} />
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
