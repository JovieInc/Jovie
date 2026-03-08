import { Skeleton } from '@jovie/ui';
import { ReliabilityCard } from '@/components/admin/ReliabilityCard';
import { getAdminReliabilitySummary } from '@/lib/admin/overview';

export async function AdminUsageSection() {
  const reliabilitySummary = await getAdminReliabilitySummary();

  return (
    <section id='errors' data-testid='admin-usage-section'>
      <ReliabilityCard summary={reliabilitySummary} />
    </section>
  );
}

export function AdminUsageSectionSkeleton() {
  return (
    <section id='errors'>
      <Skeleton className='h-full min-h-[180px] rounded-xl' />
    </section>
  );
}
