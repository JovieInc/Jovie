import { cn, skeleton } from '../table.styles';

interface SkeletonCellProps {
  /**
   * Width of the skeleton (e.g., '120px', 'w-40')
   * Should match the actual cell width to prevent layout shift
   */
  width?: string;

  /**
   * Type of skeleton to render
   */
  variant?: 'text' | 'avatar' | 'badge' | 'button';

  /**
   * Additional CSS classes
   */
  className?: string;
}

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
  const variantClass = skeleton[variant];

  return (
    <div className={cn('flex items-center', className)} style={{ width }}>
      <div className={cn(skeleton.base, variantClass)} />
    </div>
  );
}
