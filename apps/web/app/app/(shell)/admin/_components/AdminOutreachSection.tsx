import { Skeleton } from '@jovie/ui';
import { OutreachPipelineCard } from '@/components/admin/OutreachPipelineCard';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

export async function AdminOutreachSection() {
  const metrics = await getAdminFunnelMetrics();

  return (
    <section data-testid='admin-outreach-section'>
      <OutreachPipelineCard metrics={metrics} />
    </section>
  );
}

export function AdminOutreachSectionSkeleton() {
  return (
    <section>
      <Skeleton className='h-full min-h-[180px] rounded-xl' />
    </section>
  );
}
