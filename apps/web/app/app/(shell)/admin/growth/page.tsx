import type { Metadata } from 'next';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { GtmCollapsibles } from '@/components/features/admin/leads/GtmCollapsibles';
import {
  GtmFunnel,
  GtmFunnelSkeleton,
} from '@/components/features/admin/leads/GtmFunnel';
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
    <AdminPage
      title='Growth'
      description='Self-driving artist discovery and outreach pipeline.'
      tabs={{
        param: 'view',
        value: 'growth',
        options: [],
      }}
      testId='admin-growth-page'
      viewTestId='admin-growth-view-leads'
    >
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
