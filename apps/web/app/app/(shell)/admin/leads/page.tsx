import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { LeadPipelineKpis } from '@/features/admin/leads/LeadPipelineKpis';
import { LeadPipelineWorkspace } from '@/features/admin/leads/LeadPipelineWorkspace';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export const runtime = 'nodejs';

function KpisSkeleton() {
  return (
    <section className='overflow-hidden rounded-xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-1)'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-28'
        descriptionWidth='w-56'
        className='px-5 py-3'
      />
      <div className='grid gap-4 px-5 py-4 pt-3 sm:grid-cols-2 xl:grid-cols-4'>
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

          <LeadPipelineWorkspace />
        </div>
      </PageContent>
    </PageShell>
  );
}
