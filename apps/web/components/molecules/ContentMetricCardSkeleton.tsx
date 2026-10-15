import {
  type ContentMetricCardProps,
  contentMetricCardLabelVariants,
  contentMetricCardValueVariants,
  contentMetricCardVariants,
} from '@/components/molecules/ContentMetricCard';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { cn } from '@/lib/utils';

export interface ContentMetricCardSkeletonProps {
  readonly layout?: ContentMetricCardProps['layout'];
  readonly density?: ContentMetricCardProps['density'];
  readonly className?: string;
  readonly showIcon?: boolean;
  readonly showSubtitle?: boolean;
  readonly subtitleWidth?: string;
}

export function ContentMetricCardSkeleton({
  layout = 'default',
  density = 'default',
  className,
  showIcon = true,
  showSubtitle = true,
  subtitleWidth = 'w-24',
}: Readonly<ContentMetricCardSkeletonProps>) {
  if (layout !== 'default') {
    const inline = layout === 'icon-chip-inline';
    const compact = density === 'compact';
    const chip = showIcon ? (
      <LoadingSkeleton
        height={inline ? 'h-8' : 'h-7'}
        width={inline ? 'w-8' : 'w-7'}
        rounded={inline ? 'full' : compact ? 'md' : 'lg'}
        className='shrink-0'
      />
    ) : null;

    return (
      <ContentSurfaceCard
        className={cn(
          contentMetricCardVariants({ layout, density }),
          className
        )}
        aria-hidden='true'
      >
        {inline ? chip : null}
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            {inline ? null : chip}
            <div
              className={cn(
                'flex h-lh items-center',
                contentMetricCardLabelVariants({ layout })
              )}
            >
              <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
            </div>
          </div>
          <div
            className={cn(
              'h-lh',
              contentMetricCardValueVariants({ layout, density })
            )}
          >
            <LoadingSkeleton height='h-full' width='w-20' rounded='md' />
          </div>
          {showSubtitle ? (
            <LoadingSkeleton
              height='h-4'
              width={subtitleWidth}
              rounded='sm'
              className='mt-1.5'
            />
          ) : null}
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className={className} aria-hidden='true'>
      <div className={cn('p-4', showSubtitle ? 'space-y-1.5' : 'space-y-3')}>
        <div className='flex items-center gap-1.5'>
          {showIcon ? (
            <LoadingSkeleton height='h-3.5' width='w-3.5' rounded='full' />
          ) : null}
          <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
        </div>
        <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
        {showSubtitle ? (
          <LoadingSkeleton height='h-4' width={subtitleWidth} rounded='sm' />
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}
