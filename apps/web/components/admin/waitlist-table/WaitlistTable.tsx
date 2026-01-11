'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ClipboardList, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TableEmptyState, TableRow } from '@/components/admin/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { WaitlistMobileCard } from '../WaitlistMobileCard';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import { usePagination } from './usePagination';
import { useWaitlistColumns } from './WaitlistTableColumns';
import { WaitlistTablePagination } from './WaitlistTablePagination';

/** Estimated row height for virtualization (px) */
const ROW_HEIGHT = 52;
/** Number of extra rows to render above/below viewport */
const OVERSCAN = 5;

export function WaitlistTable({
  entries,
  page,
  pageSize,
  total,
}: WaitlistTableProps) {
  const [rows, setRows] = useState<WaitlistEntryRow[]>(entries);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const mobileContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRows(entries);
  }, [entries]);

  const handleRowUpdate = useCallback(
    (entryId: string, updates: Partial<WaitlistEntryRow>) => {
      setRows(prev =>
        prev.map(entry =>
          entry.id === entryId ? { ...entry, ...updates } : entry
        )
      );
    },
    []
  );

  const { approveStatuses, approveEntry } = useApproveEntry({
    onRowUpdate: handleRowUpdate,
  });

  const { totalPages, canPrev, canNext, from, to, prevHref, nextHref } =
    usePagination({ page, pageSize, total });

  const columns = useWaitlistColumns({
    approveStatuses,
    onApprove: approveEntry,
  });

  /**
   * Virtual scrolling for desktop table rows.
   * Dramatically improves performance for large datasets (500+ rows)
   * by only rendering rows visible in viewport plus a small buffer.
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  /**
   * Virtual scrolling for mobile card list.
   * Cards are taller (~120px) so we use a different estimate.
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const mobileVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => mobileContainerRef.current,
    estimateSize: () => 120,
    overscan: OVERSCAN,
  });

  return (
    <div className='overflow-hidden'>
      {/* Custom toolbar - sticky at top */}
      <div className='sticky top-0 z-30 flex h-12 sm:h-14 w-full items-center justify-between gap-3 px-3 sm:px-4 bg-surface-1/80 backdrop-blur border-b border-subtle'>
        <div className='text-xs text-secondary-token'>
          <span className='hidden sm:inline'>Showing </span>
          {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()}
          <span className='hidden sm:inline'> entries</span>
        </div>

        {/* Display button - top right */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='sm' className='gap-2'>
              <SlidersHorizontal className='h-4 w-4' />
              Display
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <div className='px-2 py-1.5 text-sm text-secondary-token'>
              Coming soon
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop Table - hidden on mobile, virtualized for performance */}
      <div
        ref={tableContainerRef}
        className='hidden md:block overflow-auto'
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        <table className='w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-[13px]'>
          <caption className='sr-only'>Waitlist entries table</caption>
          <thead>
            <tr>
              {columns.map(column => (
                <th
                  key={column.id}
                  className={`sticky top-0 z-20 px-4 py-3 border-b border-subtle text-[13px] bg-surface-1/80 backdrop-blur text-left ${column.width ?? ''} ${column.hideOnMobile ? 'hidden md:table-cell' : ''} ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
                >
                  <span className='text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
                    {column.header}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            style={{
              position: 'relative',
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rows.length === 0 ? (
              <TableEmptyState
                colSpan={columns.length}
                icon={<ClipboardList className='h-6 w-6' />}
                title='No waitlist entries'
                description='New waitlist signups will appear here.'
              />
            ) : (
              rowVirtualizer.getVirtualItems().map(virtualRow => {
                const row = rows[virtualRow.index];
                return (
                  <TableRow
                    key={row.id}
                    rowRef={rowVirtualizer.measureElement}
                    dataIndex={virtualRow.index}
                    virtualRow={virtualRow}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                    }}
                  >
                    {columns.map(column => (
                      <td
                        key={column.id}
                        className={`px-4 py-3 ${column.width ?? ''} ${column.hideOnMobile ? 'hidden md:table-cell' : ''} ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
                      >
                        {column.cell(row, virtualRow.index)}
                      </td>
                    ))}
                  </TableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List - shown only on mobile, virtualized for performance */}
      <div
        ref={mobileContainerRef}
        className='md:hidden overflow-auto p-3'
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        {rows.length === 0 ? (
          <TableEmptyState
            icon={<ClipboardList className='h-6 w-6' />}
            title='No waitlist entries'
            description='New waitlist signups will appear here.'
          />
        ) : (
          <div
            style={{
              position: 'relative',
              height: `${mobileVirtualizer.getTotalSize()}px`,
            }}
          >
            {mobileVirtualizer.getVirtualItems().map(virtualRow => {
              const entry = rows[virtualRow.index];
              return (
                <div
                  key={entry.id}
                  ref={mobileVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '12px',
                  }}
                >
                  <WaitlistMobileCard
                    entry={entry}
                    approveStatus={approveStatuses[entry.id] ?? 'idle'}
                    onApprove={() => void approveEntry(entry.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination footer */}
      <WaitlistTablePagination
        page={page}
        totalPages={totalPages}
        canPrev={canPrev}
        canNext={canNext}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </div>
  );
}
