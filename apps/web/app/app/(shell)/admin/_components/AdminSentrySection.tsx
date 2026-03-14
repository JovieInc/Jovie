import { SentryMetricsCard } from '@/components/admin/SentryMetricsCard';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getAdminSentryMetrics } from '@/lib/admin/sentry-metrics';

const SENTRY_CARD_SKELETON_KEYS = ['issues', 'events', 'users', 'critical'];

export async function AdminSentrySection() {
  const sentryMetrics = await getAdminSentryMetrics();

  return (
    <section id='sentry' data-testid='admin-sentry-section'>
      <SentryMetricsCard metrics={sentryMetrics} />
    </section>
  );
}

export function AdminSentrySectionSkeleton() {
  return (
    <section id='sentry'>
      <ContentSurfaceCard className='overflow-hidden' aria-hidden='true'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-16'
          descriptionWidth='w-52'
          className='px-5 py-3'
        />
        <div className='space-y-4 p-5 pt-4'>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            {SENTRY_CARD_SKELETON_KEYS.map(key => (
              <ContentMetricCardSkeleton key={key} className='p-3.5' />
            ))}
          </div>
          <ContentSurfaceCard className='p-3.5'>
            <div className='h-3 w-28 rounded skeleton' />
            <div className='mt-2 h-4 w-64 rounded skeleton' />
          </ContentSurfaceCard>
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
