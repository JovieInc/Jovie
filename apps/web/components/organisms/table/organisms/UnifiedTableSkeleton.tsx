'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { UnifiedTable } from './UnifiedTable';

export interface UnifiedTableSkeletonProps<TData> {
  /**
   * Column definitions (TanStack Table format).
   *
   * Passing the SAME column definitions used by the loaded table guarantees
   * the skeleton header labels, column widths, min widths, and column count
   * match the loaded state exactly — preventing any layout shift when data
   * arrives via Suspense streaming.
   */
  readonly columns: ColumnDef<TData, unknown>[];

  /**
   * Number of skeleton rows to render.
   * Should match the expected initial page size.
   * @default 20
   */
  readonly skeletonRows?: number;

  /**
   * Optional per-column skeleton config to preserve final layout geometry.
   * Order and length must match `columns` for best results.
   */
  readonly skeletonColumnConfig?: Array<{
    readonly width?: string;
    readonly variant?:
      | 'text'
      | 'avatar'
      | 'badge'
      | 'button'
      | 'release'
      | 'meta';
  }>;

  /**
   * Row height in pixels. Must match the loaded table's rowHeight to avoid
   * layout shift on data arrival.
   * @default 32
   */
  readonly rowHeight?: number;

  /**
   * Min width for table (prevents column squishing).
   */
  readonly minWidth?: string;

  /**
   * Additional class applied to the `<table>` element.
   */
  readonly className?: string;

  /**
   * Additional class applied to the outer scroll container.
   */
  readonly containerClassName?: string;

  /**
   * Hide the header when rendering the skeleton.
   * @default false
   */
  readonly hideHeader?: boolean;
}

/**
 * UnifiedTableSkeleton — Zero-shift skeleton primitive for UnifiedTable.
 *
 * Delegates to `<UnifiedTable isLoading data={[]} />` so the skeleton shares
 * exactly the same table structure, header markup, column widths, and row
 * geometry as the loaded table. This eliminates layout shift the instant data
 * arrives — useful in Suspense-based `loading.tsx` files where the page streams
 * the loaded component in after the skeleton.
 *
 * Usage:
 * ```tsx
 * // Share columns between skeleton and loaded table:
 * export const ACTIVITY_COLUMNS: ColumnDef<Activity, any>[] = [ ... ];
 *
 * // loading.tsx
 * <UnifiedTableSkeleton columns={ACTIVITY_COLUMNS} skeletonRows={8} />
 *
 * // page.tsx (loaded)
 * <UnifiedTable columns={ACTIVITY_COLUMNS} data={items} />
 * ```
 */
export function UnifiedTableSkeleton<TData>({
  columns,
  skeletonRows = 20,
  skeletonColumnConfig,
  rowHeight,
  minWidth,
  className,
  containerClassName,
  hideHeader = false,
}: Readonly<UnifiedTableSkeletonProps<TData>>) {
  return (
    <UnifiedTable<TData>
      data={[]}
      columns={columns}
      isLoading={true}
      skeletonRows={skeletonRows}
      skeletonColumnConfig={skeletonColumnConfig}
      rowHeight={rowHeight}
      minWidth={minWidth}
      className={className}
      containerClassName={containerClassName}
      hideHeader={hideHeader}
    />
  );
}
