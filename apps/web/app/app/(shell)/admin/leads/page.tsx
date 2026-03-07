import { Skeleton } from '@jovie/ui';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeadKeywordsManager } from '@/components/admin/leads/LeadKeywordsManager';
import { LeadPipelineControls } from '@/components/admin/leads/LeadPipelineControls';
import { LeadPipelineKpis } from '@/components/admin/leads/LeadPipelineKpis';
import { LeadTable } from '@/components/admin/leads/LeadTable';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export const runtime = 'nodejs';

function KpisSkeleton() {
  return (
    <section className='space-y-3'>
      <Skeleton className='h-5 w-28 rounded' />
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => `kpi-${i}`).map(key => (
          <Skeleton key={key} className='h-28 rounded-xl' />
        ))}
      </div>
    </section>
  );
}

export default function AdminLeadsPage() {
  return (
    <PageShell>
      <PageContent noPadding>
        <div className='flex flex-col gap-6 p-4 sm:p-6'>
          <Suspense fallback={<KpisSkeleton />}>
            <LeadPipelineKpis />
          </Suspense>

          <LeadPipelineControls />

          <LeadKeywordsManager />

          <LeadTable />
        </div>
      </PageContent>
    </PageShell>
  );
}
