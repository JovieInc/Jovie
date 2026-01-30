'use client';

import { cn } from '@/lib/utils';
import {
  TablePaginationFooter,
  type TablePaginationFooterProps,
} from './TablePaginationFooter';

export interface TableStandardFooterProps extends TablePaginationFooterProps {
  /** Whether the footer should be sticky at the bottom */
  readonly sticky?: boolean;
}

/**
 * Standard table footer with pagination, page size selector, and sticky support.
 *
 * This is a wrapper around TablePaginationFooter that adds sticky positioning.
 *
 * @example
 * // Basic usage
 * <TableStandardFooter
 *   currentPage={page}
 *   totalPages={totalPages}
 *   pageSize={pageSize}
 *   totalItems={totalItems}
 *   onPageChange={setPage}
 *   onPageSizeChange={setPageSize}
 * />
 *
 * @example
 * // With sticky positioning
 * <TableStandardFooter
 *   sticky
 *   currentPage={page}
 *   totalPages={totalPages}
 *   pageSize={pageSize}
 *   totalItems={totalItems}
 *   onPageChange={setPage}
 *   onPageSizeChange={setPageSize}
 * />
 */
export function TableStandardFooter({
  sticky = false,
  className,
  ...props
}: TableStandardFooterProps) {
  return (
    <TablePaginationFooter
      {...props}
      className={cn(sticky && 'sticky bottom-0 z-10', className)}
    />
  );
}
