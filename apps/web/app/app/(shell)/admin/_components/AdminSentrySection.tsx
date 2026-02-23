import { SentryMetricsCard } from '@/components/admin/SentryMetricsCard';
import { getAdminSentryMetrics } from '@/lib/admin/sentry-metrics';

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
      <div className='h-44 rounded-xl skeleton' />
    </section>
  );
}
