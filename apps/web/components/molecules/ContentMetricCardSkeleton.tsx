import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { cn } from '@/lib/utils';

export interface ContentMetricCardSkeletonProps {
  readonly className?: string;
  readonly showIcon?: boolean;
  readonly subtitleWidth?: string;
}

export function ContentMetricCardSkeleton({
  className,
  showIcon = true,
  subtitleWidth = 'w-24',
}: Readonly<ContentMetricCardSkeletonProps>) {
  return (
    <ContentSurfaceCard className={cn('p-4', className)} aria-hidden='true'>
      <div className='space-y-1.5'>
        <div className='flex items-center gap-1.5'>
          {showIcon ? (
            <LoadingSkeleton height='h-3.5' width='w-3.5' rounded='full' />
          ) : null}
          <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
        </div>
        <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
        <LoadingSkeleton height='h-4' width={subtitleWidth} rounded='sm' />
      </div>
    </ContentSurfaceCard>
  );
}
