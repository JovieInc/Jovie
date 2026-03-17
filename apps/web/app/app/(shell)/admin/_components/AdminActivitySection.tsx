import { Skeleton } from '@jovie/ui';
import { ActivityTableUnified } from '@/features/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';

export async function AdminActivitySection() {
  const activityItems = await getAdminActivityFeed(20);

  return (
    <section id='activity' data-testid='admin-activity-section'>
      <ActivityTableUnified items={activityItems} />
    </section>
  );
}

export function AdminActivitySectionSkeleton() {
  return (
    <section id='activity'>
      <div className='space-y-2'>
        <Skeleton className='h-8 w-32 rounded' />
        <Skeleton className='h-64 rounded-xl' />
      </div>
    </section>
  );
}
