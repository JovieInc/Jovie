import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

const ROW_KEYS = Array.from({ length: 8 }, (_, i) => `feedback-row-${i + 1}`);

/**
 * Admin feedback loading skeleton.
 * Matches the AdminFeedbackTable layout.
 */
export default function AdminFeedbackLoading() {
  return (
    <PageShell>
      <PageContent noPadding>
        <div className='p-6 h-full' aria-busy='true'>
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <LoadingSkeleton height='h-6' width='w-32' rounded='md' />
              <LoadingSkeleton height='h-8' width='w-24' rounded='md' />
            </div>
            <div className='divide-y divide-subtle'>
              {ROW_KEYS.map(key => (
                <div key={key} className='flex items-center gap-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-3/4' rounded='sm' />
                  <LoadingSkeleton height='h-4' width='w-20' rounded='sm' />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
