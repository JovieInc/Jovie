import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { GtmCollapsibles } from '@/components/features/admin/leads/GtmCollapsibles';
import {
  GtmFunnel,
  GtmFunnelSkeleton,
} from '@/components/features/admin/leads/GtmFunnel';
import {
  GtmSpeedDial,
  GtmSpeedDialSkeleton,
} from '@/components/features/admin/leads/GtmSpeedDial';
import { getLeadFunnelCounts } from '@/components/features/admin/leads/LeadPipelineKpis';
import { LeadTable } from '@/components/features/admin/leads/LeadTable';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { adminGrowthSearchParams } from '@/lib/nuqs';

interface AdminGrowthPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Admin growth',
};

export const runtime = 'nodejs';

export default async function AdminGrowthPage({
  searchParams,
}: Readonly<AdminGrowthPageProps>) {
  const params = await adminGrowthSearchParams.parse(searchParams);
  const counts = await getLeadFunnelCounts();

  return (
    <AdminWorkspacePage
      title='Growth'
      description='Self-driving artist discovery and outreach pipeline.'
      primaryParam='view'
      primaryValue='growth'
      primaryOptions={[]}
      testId='admin-growth-page'
      viewTestId='admin-growth-view-leads'
    >
      <Suspense fallback={<GtmSpeedDialSkeleton />}>
        <GtmSpeedDial />
      </Suspense>
      <Suspense fallback={<GtmFunnelSkeleton />}>
        <GtmFunnel counts={counts} />
      </Suspense>
      <LeadTable
        funnelCounts={counts}
        initialSearch={params.q ?? ''}
        basePath={buildAdminGrowthHref('leads')}
      />
      <GtmCollapsibles initialOpen={params.view} />
    </AdminWorkspacePage>
  );
}
