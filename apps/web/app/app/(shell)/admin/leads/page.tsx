import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { LeadGtmInsights } from '@/features/admin/leads/LeadGtmInsights';
import { LeadPipelineKpis } from '@/features/admin/leads/LeadPipelineKpis';
import { LeadPipelineWorkspace } from '@/features/admin/leads/LeadPipelineWorkspace';

export const metadata: Metadata = {
  title: 'Leads | Admin',
};

export const runtime = 'nodejs';

function KpisSkeleton() {
  return (
    <section className='overflow-hidden rounded-xl border border-subtle bg-surface-1'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-28'
        descriptionWidth='w-56'
        className='px-(--linear-app-header-padding-x) py-3'
      />
      <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) pt-0 sm:grid-cols-2 xl:grid-cols-4'>
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
        <div className='flex flex-col gap-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <Suspense fallback={<KpisSkeleton />}>
            <LeadPipelineKpis />
          </Suspense>

          <Suspense fallback={<KpisSkeleton />}>
            <LeadGtmInsights />
          </Suspense>

          <LeadPipelineWorkspace />
        </div>
      </PageContent>
    </PageShell>
  );
}
