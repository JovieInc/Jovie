'use client';

import { Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import {
  KanbanBoard,
  type KanbanColumn,
} from '@/components/admin/table/organisms/KanbanBoard';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import {
  DisplayMenuDropdown,
  ExportCSVButton,
  TableBulkActionsToolbar,
  useRowSelection,
  type ViewMode,
} from '@/components/organisms/table';
import {
  WAITLIST_CSV_FILENAME_PREFIX,
  waitlistCSVColumns,
} from '@/lib/admin/csv-configs/waitlist';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { useUpdateWaitlistStatusMutation } from '@/lib/queries/useWaitlistMutations';
import { AdminTablePagination } from '../table/AdminTablePagination';
import { AdminWaitlistTableUnified } from './AdminWaitlistTableUnified';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import { usePagination } from './usePagination';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

const VIEW_MODE_STORAGE_KEY = 'waitlist-view-mode';
const GROUPING_STORAGE_KEY = 'waitlist-grouping-enabled';

/**
 * AdminWaitlistTableWithViews - Enhanced waitlist table with view mode switching
 *
 * Features:
 * - List view (default table)
 * - Board view (Kanban grouped by status)
 * - Grouping mode with sticky headers (New/Invited/Claimed groups)
 * - Display menu for switching views and toggling grouping
 * - LocalStorage persistence for view and grouping preferences
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

  // Grouping state with localStorage persistence (only for list view)
  const [groupingEnabled, setGroupingEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(GROUPING_STORAGE_KEY);
      return stored === 'true';
    }
    return false;
  });

  // Persist view mode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  // Persist grouping preference to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(GROUPING_STORAGE_KEY, String(groupingEnabled));
    }
  }, [groupingEnabled]);

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

  // TanStack Query mutation for updating waitlist status
  const updateStatusMutation = useUpdateWaitlistStatusMutation();

  // Row selection
  const rowIds = useMemo(() => entries.map(entry => entry.id), [entries]);
  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

  // Bulk actions
  const bulkActions = useMemo(() => {
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));

    return [
      {
        label: 'Copy Emails',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          const emails = selectedEntries.map(e => e.email).join('\n');
          navigator.clipboard.writeText(emails);
          clearSelection();
        },
      },
      {
        label: 'Copy Names',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          const names = selectedEntries.map(e => e.fullName).join('\n');
          navigator.clipboard.writeText(names);
          clearSelection();
        },
      },
    ];
  }, [entries, selectedIds, clearSelection]);

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
    async (itemId: string, _fromColumnId: string, toColumnId: string) => {
      try {
        await updateStatusMutation.mutateAsync({
          entryId: itemId,
          status: toColumnId as 'new' | 'invited' | 'claimed',
        });

        // The UI will update optimistically via the KanbanBoard component
        // Cache invalidation is handled by the mutation
      } catch (error) {
        console.error('Failed to update waitlist status:', error);
        toast.error('Failed to update status', {
          description:
            error instanceof Error ? error.message : 'Please try again',
        });
      }
    },
    [updateStatusMutation]
  );

  return (
    <QueryErrorBoundary fallback={TableErrorFallback}>
      <AdminTableShell
        toolbar={
          <>
            {/* Bulk actions toolbar (shows when rows selected) */}
            {viewMode === 'list' && (
              <TableBulkActionsToolbar
                selectedCount={selectedCount}
                onClearSelection={clearSelection}
                actions={bulkActions}
              />
            )}

            {/* Main toolbar (always visible) */}
            <div className='flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 sm:py-3'>
              <div className='text-xs text-secondary-token'>
                <span className='hidden sm:inline'>Showing </span>
                {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                {total.toLocaleString()}
                <span className='hidden sm:inline'> entries</span>
              </div>
              <div className='flex items-center gap-2'>
                <ExportCSVButton<WaitlistEntryRow>
                  getData={() => entries}
                  columns={waitlistCSVColumns}
                  filename={WAITLIST_CSV_FILENAME_PREFIX}
                  disabled={entries.length === 0}
                  ariaLabel='Export waitlist to CSV file'
                />
                <DisplayMenuDropdown
                  viewMode={viewMode}
                  availableViewModes={['list', 'board']}
                  onViewModeChange={setViewMode}
                  groupingEnabled={groupingEnabled}
                  onGroupingToggle={setGroupingEnabled}
                  groupingLabel='Group by status'
                />
              </div>
            </div>
          </>
        }
        footer={
          viewMode === 'list' ? (
            <AdminTablePagination
              page={page}
              totalPages={totalPages}
              from={from}
              to={to}
              total={total}
              canPrev={canPrev}
              canNext={canNext}
              prevHref={prevHref}
              nextHref={nextHref}
              entityLabel='entries'
            />
          ) : null
        }
      >
        {() =>
          viewMode === 'list' ? (
            <AdminWaitlistTableUnified
              {...props}
              groupingEnabled={groupingEnabled}
              externalSelection={{
                selectedIds,
                headerCheckboxState,
                toggleSelect,
                toggleSelectAll,
              }}
            />
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
    </QueryErrorBoundary>
  );
}
