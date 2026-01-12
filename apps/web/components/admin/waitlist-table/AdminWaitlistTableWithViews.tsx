'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import {
  DisplayMenuDropdown,
  type ViewMode,
} from '@/components/admin/table/molecules/DisplayMenuDropdown';
import {
  KanbanBoard,
  type KanbanColumn,
} from '@/components/admin/table/organisms/KanbanBoard';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { AdminWaitlistTableUnified } from './AdminWaitlistTableUnified';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import { usePagination } from './usePagination';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';
import { WaitlistTablePagination } from './WaitlistTablePagination';

const VIEW_MODE_STORAGE_KEY = 'waitlist-view-mode';

/**
 * AdminWaitlistTableWithViews - Enhanced waitlist table with view mode switching
 *
 * Features:
 * - List view (default table)
 * - Board view (Kanban grouped by status)
 * - Display menu for switching views
 * - LocalStorage persistence for view preference
 */
export function AdminWaitlistTableWithViews(props: WaitlistTableProps) {
  const { entries, page, pageSize, total } = props;

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === 'list' || stored === 'board') {
        return stored;
      }
    }
    return 'list';
  });

  // Persist view mode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  const { totalPages, canPrev, canNext, from, to, prevHref, nextHref } =
    usePagination({
      page,
      pageSize,
      total,
    });

  const { approveStatuses, approveEntry } = useApproveEntry({
    onRowUpdate: () => {
      // No-op for now since we're using server-side refresh
    },
  });

  // Group entries by status for Kanban board
  const kanbanColumns = useMemo<KanbanColumn<WaitlistEntryRow>[]>(() => {
    const newEntries = entries.filter(e => e.status === 'new');
    const invitedEntries = entries.filter(e => e.status === 'invited');
    const claimedEntries = entries.filter(e => e.status === 'claimed');

    return [
      {
        id: 'new',
        title: 'New',
        items: newEntries,
        count: newEntries.length,
        accent: '#3b82f6', // blue
      },
      {
        id: 'invited',
        title: 'Invited',
        items: invitedEntries,
        count: invitedEntries.length,
        accent: '#8b5cf6', // purple
      },
      {
        id: 'claimed',
        title: 'Claimed',
        items: claimedEntries,
        count: claimedEntries.length,
        accent: '#10b981', // green
      },
    ];
  }, [entries]);

  const renderKanbanCard = useCallback(
    (entry: WaitlistEntryRow) => (
      <WaitlistKanbanCard
        entry={entry}
        approveStatus={approveStatuses[entry.id]}
        onApprove={() => void approveEntry(entry.id)}
      />
    ),
    [approveStatuses, approveEntry]
  );

  const handleItemMove = useCallback(
    (itemId: string, fromColumnId: string, toColumnId: string) => {
      // TODO: Implement status update mutation
      console.log('Move item:', { itemId, fromColumnId, toColumnId });
      // Would call something like:
      // await updateWaitlistStatus(itemId, toColumnId as WaitlistStatus);
    },
    []
  );

  return (
    <AdminTableShell
      toolbar={
        <div className='flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 sm:py-3'>
          <div className='text-xs text-secondary-token'>
            <span className='hidden sm:inline'>Showing </span>
            {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()}
            <span className='hidden sm:inline'> entries</span>
          </div>
          <div className='flex items-center gap-2'>
            <DisplayMenuDropdown
              viewMode={viewMode}
              availableViewModes={['list', 'board']}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      }
      footer={
        viewMode === 'list' ? (
          <WaitlistTablePagination
            page={page}
            totalPages={totalPages}
            canPrev={canPrev}
            canNext={canNext}
            prevHref={prevHref}
            nextHref={nextHref}
          />
        ) : null
      }
    >
      {() =>
        viewMode === 'list' ? (
          <AdminWaitlistTableUnified {...props} />
        ) : (
          <KanbanBoard
            columns={kanbanColumns}
            renderCard={renderKanbanCard}
            getItemId={entry => entry.id}
            onItemMove={handleItemMove}
            cardHeight={200}
            emptyState={
              <div className='text-center text-secondary-token'>
                <p className='text-sm font-medium'>No waitlist entries</p>
                <p className='text-xs text-tertiary-token mt-1'>
                  Entries will appear here when added
                </p>
              </div>
            }
          />
        )
      }
    </AdminTableShell>
  );
}
