import { Skeleton } from '@jovie/ui';

import { PlatformStatsStrip } from '@/components/admin/PlatformStatsStrip';
import { getAdminPlatformStats } from '@/lib/admin/platform-stats';

export async function AdminPlatformStatsSection() {
  const stats = await getAdminPlatformStats();

  return (
    <section id='platform-stats' data-testid='admin-platform-stats-section'>
      <PlatformStatsStrip stats={stats} />
    </section>
  );
}

export function AdminPlatformStatsSectionSkeleton() {
  return (
    <section id='platform-stats'>
      <Skeleton className='h-[240px] rounded-xl' />
    </section>
  );
}
