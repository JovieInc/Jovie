import { useMemo } from 'react';
import { SkeletonRow } from '../atoms/SkeletonRow';

interface LoadingTableBodyProps {
  /**
   * Number of skeleton rows to render
   * Should match the page size to prevent layout shift
   */
  rows: number;

  /**
   * Number of columns in each row
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
   * Height of each skeleton row
   * @default '52px'
   */
  rowHeight?: string;
}

/**
 * LoadingTableBody - Skeleton table body with N rows
 *
 * CRITICAL: Renders exact number of skeleton rows matching page size
 * to prevent layout shift when data loads
 *
 * Example:
 * ```tsx
 * <LoadingTableBody
 *   rows={20}
 *   columns={6}
 *   columnConfig={[
 *     { width: '56px', variant: 'text' }, // Checkbox
 *     { width: '320px', variant: 'avatar' }, // Avatar + name
 *     { width: '160px', variant: 'text' },
 *     { width: '160px', variant: 'badge' },
 *     { width: '160px', variant: 'text' },
 *     { width: '140px', variant: 'button' }, // Actions
 *   ]}
 * />
 * ```
 */
export function LoadingTableBody({
  rows,
  columns,
  columnConfig,
  rowHeight,
}: Readonly<LoadingTableBodyProps>) {
  const rowKeys = useMemo(
    () => Array.from({ length: rows }, (_, i) => `loading-row-${i}`),
    [rows]
  );

  return (
    <tbody>
      {rowKeys.map(key => (
        <SkeletonRow
          key={key}
          columns={columns}
          columnConfig={columnConfig}
          height={rowHeight}
        />
      ))}
    </tbody>
  );
}
