import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';

interface ReleaseTablePendingShellProps {
  readonly showHeader?: boolean;
  readonly testId?: string;
}

const RELEASES_LOADING_ROW_KEYS = Array.from(
  { length: SKELETON_ROW_COUNT.TABLE },
  (_, i) => `loading-row-${i + 1}`
);

export function ReleaseTablePendingShell({
  showHeader = true,
  testId = 'releases-loading',
}: Readonly<ReleaseTablePendingShellProps>) {
  return (
    <div
      className='flex h-full min-h-0 flex-col gap-4 px-3 py-3 lg:px-4'
      data-testid={testId}
      aria-busy='true'
    >
      {showHeader ? (
        <div className='flex items-center justify-between rounded-[18px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 py-4'>
          <div className='space-y-1.5'>
            <p className='text-[12px] font-medium text-secondary-token'>
              Releases
            </p>
            <h2 className='text-[22px] font-[590] tracking-[-0.03em] text-primary-token'>
              Loading your release catalog
            </h2>
            <p className='max-w-[28rem] text-[13px] leading-[20px] text-secondary-token'>
              Preparing smart links, provider status, and release details.
            </p>
          </div>
          <LoadingSkeleton height='h-10' width='w-24' rounded='full' />
        </div>
      ) : null}

      <div className='overflow-hidden rounded-[20px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) flex-1 min-h-0'>
        <div className='border-b border-(--linear-app-frame-seam) px-4 py-3'>
          <div className='grid grid-cols-[minmax(0,2.3fr)_repeat(4,minmax(84px,1fr))] gap-3'>
            <LoadingSkeleton height='h-3' width='w-full' rounded='full' />
            <LoadingSkeleton height='h-3' width='w-full' rounded='full' />
            <LoadingSkeleton height='h-3' width='w-full' rounded='full' />
            <LoadingSkeleton height='h-3' width='w-full' rounded='full' />
            <LoadingSkeleton height='h-3' width='w-full' rounded='full' />
          </div>
        </div>

        <div className='divide-y divide-(--linear-app-frame-seam) overflow-hidden'>
          {RELEASES_LOADING_ROW_KEYS.map(rowKey => (
            <div
              key={rowKey}
              className='grid grid-cols-[minmax(0,2.3fr)_repeat(4,minmax(84px,1fr))] gap-3 px-4 py-4'
            >
              <div className='space-y-2'>
                <LoadingSkeleton height='h-4' width='w-[68%]' rounded='full' />
                <LoadingSkeleton height='h-3' width='w-[44%]' rounded='full' />
              </div>
              <LoadingSkeleton height='h-9' width='w-full' rounded='lg' />
              <LoadingSkeleton height='h-9' width='w-full' rounded='lg' />
              <LoadingSkeleton height='h-9' width='w-full' rounded='lg' />
              <div className='flex items-center justify-end gap-2'>
                <LoadingSkeleton height='h-8' width='w-16' rounded='full' />
                <LoadingSkeleton height='h-8' width='w-8' rounded='full' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
