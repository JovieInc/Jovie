import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeadPipelineKpis } from '@/components/admin/leads/LeadPipelineKpis';
import { LeadPipelineWorkspace } from '@/components/admin/leads/LeadPipelineWorkspace';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export const runtime = 'nodejs';

function KpisSkeleton() {
  return (
    <section className='space-y-3'>
      <LoadingSkeleton height='h-5' width='w-28' rounded='md' />
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => `kpi-${i}`).map(key => (
          <ContentMetricCardSkeleton key={key} className='min-h-[112px]' />
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

          <ContentSurfaceCard className='overflow-hidden p-0'>
            <LeadPipelineWorkspace />
          </ContentSurfaceCard>
        </div>
      </PageContent>
    </PageShell>
  );
}
