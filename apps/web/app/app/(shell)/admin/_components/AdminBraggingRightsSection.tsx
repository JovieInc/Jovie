import { Skeleton } from '@jovie/ui';
import { BraggingRightsStrip } from '@/components/admin/BraggingRightsStrip';
import { getAdminBraggingRights } from '@/lib/admin/bragging-rights';

export async function AdminBraggingRightsSection() {
  const data = await getAdminBraggingRights();

  return (
    <section
      id='bragging-rights'
      className='space-y-2'
      data-testid='admin-bragging-rights-section'
    >
      <h2 className='text-2xs font-medium tracking-wide text-tertiary-token'>
        Platform Reach
      </h2>
      <BraggingRightsStrip data={data} />
    </section>
  );
}

export function AdminBraggingRightsSectionSkeleton() {
  return (
    <section id='bragging-rights' className='space-y-2'>
      <Skeleton className='h-4 w-28 rounded' />
      <div className='grid gap-4 sm:grid-cols-2'>
        <Skeleton className='h-24 rounded-xl' />
        <Skeleton className='h-24 rounded-xl' />
      </div>
      <div className='grid gap-4 sm:grid-cols-3'>
        <Skeleton className='h-24 rounded-xl' />
        <Skeleton className='h-24 rounded-xl' />
        <Skeleton className='h-24 rounded-xl' />
      </div>
    </section>
  );
}
