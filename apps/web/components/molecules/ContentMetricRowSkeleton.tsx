import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { cn } from '@/lib/utils';

export interface ContentMetricRowSkeletonProps {
  readonly className?: string;
}

export function ContentMetricRowSkeleton({
  className,
}: Readonly<ContentMetricRowSkeletonProps>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg bg-surface-0 px-2.5 py-2',
        className
      )}
      aria-hidden='true'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <LoadingSkeleton height='h-4' width='w-4' rounded='full' />
        <LoadingSkeleton height='h-4' width='w-24' rounded='sm' />
      </div>
      <LoadingSkeleton height='h-4' width='w-12' rounded='sm' />
    </div>
  );
}
