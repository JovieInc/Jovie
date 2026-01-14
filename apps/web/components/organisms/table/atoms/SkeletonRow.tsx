import { cn, layoutStability, presets } from '../table.styles';
import { SkeletonCell } from './SkeletonCell';

interface SkeletonRowProps {
  /**
   * Number of columns in the row
   */
  columns: number;

  /**
   * Column configuration for skeleton cells
   */
  columnConfig?: Array<{
    width?: string;
    variant?: 'text' | 'avatar' | 'badge' | 'button';
  }>;

  /**
   * Height of the skeleton row
   * Should match actual row height to prevent layout shift
   * @default '52px'
   */
  height?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * SkeletonRow - Loading skeleton for a table row
 *
 * CRITICAL: Fixed height prevents layout shift when data loads
 * Height must match the actual row height (default: 52px)
 */
export function SkeletonRow({
  columns,
  columnConfig,
  height = layoutStability.skeletonRowHeight,
  className,
}: SkeletonRowProps) {
  return (
    <tr
      className={cn(presets.tableRow, 'pointer-events-none', className)}
      style={{ height }}
    >
      {Array.from({ length: columns }).map((_, index) => {
        const config = columnConfig?.[index];
        return (
          <td key={index} className={presets.tableCell}>
            <SkeletonCell
              width={config?.width}
              variant={config?.variant || 'text'}
            />
          </td>
        );
      })}
    </tr>
  );
}
