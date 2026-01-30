'use client';

import { useMemo } from 'react';
import { cn, layoutStability, presets } from '../table.styles';
import { SkeletonCell } from './SkeletonCell';

interface SkeletonRowProps {
  /**
   * Number of columns in the row
   */
  readonly columns: number;

  /**
   * Column configuration for skeleton cells
   */
  readonly columnConfig?: Array<{
    readonly width?: string;
    readonly variant?: 'text' | 'avatar' | 'badge' | 'button';
  }>;

  /**
   * Height of the skeleton row
   * Should match actual row height to prevent layout shift
   * @default '52px'
   */
  readonly height?: string;

  /**
   * Additional CSS classes
   */
  readonly className?: string;
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
}: Readonly<SkeletonRowProps>) {
  const columnKeys = useMemo(
    () => Array.from({ length: columns }, (_, i) => `skeleton-col-${i}`),
    [columns]
  );

  return (
    <tr
      className={cn(presets.tableRow, 'pointer-events-none', className)}
      style={{ height }}
    >
      {columnKeys.map((key, index) => {
        const config = columnConfig?.[index];
        return (
          <td key={key} className={presets.tableCell}>
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
