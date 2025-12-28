'use client';

import { ClipboardList } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { TableEmptyState } from '@/components/admin/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { WaitlistMobileCard } from '../WaitlistMobileCard';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import { usePagination } from './usePagination';
import { useWaitlistColumns } from './WaitlistTableColumns';
import { WaitlistTablePagination } from './WaitlistTablePagination';

export function WaitlistTable({
  entries,
  page,
  pageSize,
  total,
}: WaitlistTableProps) {
  const [rows, setRows] = useState<WaitlistEntryRow[]>(entries);

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

  return (
    <div className='overflow-hidden rounded-lg border border-subtle bg-surface-1'>
      {/* Custom toolbar - sticky at top */}
      <div className='sticky top-0 z-30 flex h-12 sm:h-14 w-full items-center gap-3 px-3 sm:px-4 bg-surface-1/80 backdrop-blur border-b border-subtle'>
        <div className='text-xs text-secondary-token'>
          <span className='hidden sm:inline'>Showing </span>
          {from.toLocaleString()}–{to.toLocaleString()} of{' '}
          {total.toLocaleString()}
          <span className='hidden sm:inline'> entries</span>
        </div>
      </div>

      {/* Desktop Table - hidden on mobile */}
      <div className='hidden md:block overflow-x-auto'>
        <table className='w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-[13px]'>
          <caption className='sr-only'>Waitlist entries table</caption>
          <thead>
            <tr>
              {columns.map(column => (
                <th
                  key={column.id}
                  className={`sticky top-12 sm:top-14 z-20 px-4 py-3 border-b border-subtle text-[13px] bg-surface-1/80 backdrop-blur text-left ${column.width ?? ''} ${column.hideOnMobile ? 'hidden md:table-cell' : ''} ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
                >
                  <span className='text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
                    {column.header}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmptyState
                colSpan={columns.length}
                icon={<ClipboardList className='h-6 w-6' />}
                title='No waitlist entries'
                description='New waitlist signups will appear here.'
              />
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.id}
                  className='border-b border-subtle last:border-b-0 hover:bg-surface-2/50 transition-colors'
                >
                  {columns.map(column => (
                    <td
                      key={column.id}
                      className={`px-4 py-3 ${column.width ?? ''} ${column.hideOnMobile ? 'hidden md:table-cell' : ''} ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List - shown only on mobile */}
      <div className='md:hidden p-3 space-y-3'>
        {rows.length === 0 ? (
          <TableEmptyState
            icon={<ClipboardList className='h-6 w-6' />}
            title='No waitlist entries'
            description='New waitlist signups will appear here.'
          />
        ) : (
          rows.map(entry => (
            <WaitlistMobileCard
              key={entry.id}
              entry={entry}
              approveStatus={approveStatuses[entry.id] ?? 'idle'}
              onApprove={() => void approveEntry(entry.id)}
            />
          ))
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
