import { Skeleton } from '@jovie/ui';

import { cn } from '../table.styles';

interface SkeletonCellProps
  extends Readonly<{
    /**
     * Width of the skeleton (e.g., '120px', 'w-40')
     * Should match the actual cell width to prevent layout shift
     */
    readonly width?: string;

    /**
     * Type of skeleton to render
     */
    readonly variant?:
      | 'text'
      | 'avatar'
      | 'badge'
      | 'button'
      | 'release'
      | 'meta';

    /**
     * Additional CSS classes
     */
    readonly className?: string;
  }> {}

const variantDimensions: Record<
  Exclude<SkeletonCellProps['variant'], 'release' | 'meta' | undefined>,
  string
> = {
  text: 'h-4 w-24',
  avatar: 'h-8 w-8',
  badge: 'h-5 w-16',
  button: 'h-8 w-20',
};

const variantRounded: Record<
  Exclude<SkeletonCellProps['variant'], 'release' | 'meta' | undefined>,
  'sm' | 'md' | 'full'
> = {
  text: 'sm',
  avatar: 'full',
  badge: 'full',
  button: 'md',
};

/**
 * SkeletonCell - Loading skeleton for table cells
 *
 * Fixed dimensions prevent layout shift when data loads
 */
export function SkeletonCell({
  width,
  variant = 'text',
  className,
}: SkeletonCellProps) {
  if (variant === 'release') {
    return (
      <div
        className={cn('flex items-start gap-2', className)}
        style={{ width }}
      >
        <Skeleton className='mt-0.5 h-4 w-4 shrink-0' />
        <div className='min-w-0 flex-1 space-y-0.5'>
          <Skeleton className='system-b-table-skeleton-release-title' />
          <Skeleton className='system-b-table-skeleton-release-meta' />
        </div>
      </div>
    );
  }

  if (variant === 'meta') {
    return (
      <div
        className={cn(
          'system-b-table-skeleton-meta-grid ml-auto grid items-center gap-x-1',
          className
        )}
        style={{ width }}
      >
        <Skeleton className='h-5' />
        <Skeleton className='h-2.5 w-2.5 justify-self-center' rounded='full' />
        <Skeleton className='h-3 w-7 justify-self-end' />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center', className)} style={{ width }}>
      <Skeleton
        className={variantDimensions[variant]}
        rounded={variantRounded[variant]}
      />
    </div>
  );
}
