import { ActivityTableUnified } from '@/components/admin/ActivityTableUnified';
import { getAdminActivityFeed } from '@/lib/admin/overview';

export async function AdminActivitySection() {
  const activityItems = await getAdminActivityFeed(20);

  return (
    <section id='activity'>
      <ActivityTableUnified items={activityItems} />
    </section>
  );
}

export function AdminActivitySectionSkeleton() {
  return (
    <section id='activity'>
      <div className='space-y-2'>
        <div className='h-8 w-32 rounded skeleton' />
        <div className='h-64 rounded-xl skeleton' />
      </div>
    </section>
  );
}
