import { cn, skeleton } from '../table.styles';

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
        <div className='mt-0.5 h-4 w-4 shrink-0 rounded skeleton' />
        <div className='min-w-0 flex-1 space-y-0.5'>
          <div className='h-3 w-[56%] rounded-sm skeleton' />
          <div className='h-2.5 w-[38%] rounded-sm skeleton' />
        </div>
      </div>
    );
  }

  if (variant === 'meta') {
    return (
      <div
        className={cn(
          'ml-auto grid min-w-[154px] grid-cols-[minmax(0,1fr)_12px_28px] items-center gap-x-1',
          className
        )}
        style={{ width }}
      >
        <div className='h-5 rounded-sm skeleton' />
        <div className='h-2.5 w-2.5 justify-self-center rounded-full skeleton' />
        <div className='h-3 w-7 justify-self-end rounded-sm skeleton' />
      </div>
    );
  }

  const variantClass = skeleton[variant];

  return (
    <div className={cn('flex items-center', className)} style={{ width }}>
      <div className={cn(skeleton.base, variantClass)} />
    </div>
  );
}
