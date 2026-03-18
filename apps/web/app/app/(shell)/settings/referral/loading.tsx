import { Skeleton } from '@jovie/ui/atoms/skeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

export default function SettingsReferralLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6'>
          <div className='rounded-xl border border-subtle p-6'>
            <Skeleton className='h-5 w-40' />
            <Skeleton className='mt-2 h-4 w-64' />
            <Skeleton className='mt-6 h-12 w-full' />
            <Skeleton className='mt-4 h-32 w-full' />
          </div>
          <div className='rounded-xl border border-subtle p-6'>
            <Skeleton className='h-5 w-32' />
            <div className='mt-4 grid grid-cols-3 gap-4'>
              <Skeleton className='h-20' />
              <Skeleton className='h-20' />
              <Skeleton className='h-20' />
            </div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
