'use client';

import { Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AdminTableHeader,
  AdminTableSubheader,
} from '@/components/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import {
  KanbanBoard,
  type KanbanColumn,
} from '@/components/admin/table/organisms/KanbanBoard';
import { Icon } from '@/components/atoms/Icon';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import {
  DisplayMenuDropdown,
  ExportCSVButton,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
  PageToolbarActionButton,
  TableBulkActionsToolbar,
  useRowSelection,
  type ViewMode,
} from '@/components/organisms/table';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  WAITLIST_CSV_FILENAME_PREFIX,
  waitlistCSVColumns,
} from '@/lib/admin/csv-configs/waitlist';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { GLYPH_SHIFT } from '@/lib/keyboard-shortcuts';
import { useAdminWaitlistInfiniteQuery } from '@/lib/queries/admin-infinite';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { useUpdateWaitlistStatusMutation } from '@/lib/queries/useWaitlistMutations';
import { AdminWaitlistTableUnified } from './AdminWaitlistTableUnified';
import {
  persistGroupingPreference,
  persistViewModePreference,
  readGroupingPreference,
  readViewModePreference,
} from './storage';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

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
  const { entries: initialEntries, pageSize, total } = props;

  // View mode state with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(readViewModePreference);

  // Grouping state with localStorage persistence (only for list view)
  const [groupingEnabled, setGroupingEnabled] = useState<boolean>(
    readGroupingPreference
  );

  // Persist view mode to localStorage
  useEffect(() => {
    persistViewModePreference(viewMode);
  }, [viewMode]);

  // Persist grouping preference to localStorage
  useEffect(() => {
    persistGroupingPreference(groupingEnabled);
  }, [groupingEnabled]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminWaitlistInfiniteQuery({
      pageSize,
      initialData: { rows: initialEntries, total },
    });

  const entries = useMemo(
    () => data?.pages.flatMap(page => page.rows) ?? initialEntries,
    [data, initialEntries]
  );

  const from = entries.length > 0 ? 1 : 0;
  const to = entries.length;

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
        onClick: async () => {
          const emails = selectedEntries.map(e => e.email).filter(Boolean);
          if (emails.length === 0) return;
          const ok = await copyToClipboard(emails.join('\n'));
          if (ok) {
            toast.success(`Copied ${emails.length} email(s)`);
            clearSelection();
          } else {
            toast.error('Failed to copy emails');
          }
        },
      },
      {
        label: 'Copy Names',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: async () => {
          const names = selectedEntries.map(e => e.fullName).filter(Boolean);
          if (names.length === 0) return;
          const ok = await copyToClipboard(names.join('\n'));
          if (ok) {
            toast.success(`Copied ${names.length} name(s)`);
            clearSelection();
          } else {
            toast.error('Failed to copy names');
          }
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
        onApprove={() => approveEntry({ id: entry.id, status: entry.status })}
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
        testId='admin-waitlist-table'
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
            <AdminTableHeader
              title='Waitlist'
              subtitle='Track pipeline state and move prospects from new to claimed.'
            />
            <AdminTableSubheader
              start={
                <div className='text-xs text-secondary-token tabular-nums'>
                  Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
                  {total.toLocaleString()} entries
                </div>
              }
              end={
                <>
                  <ExportCSVButton<WaitlistEntryRow>
                    getData={() => entries}
                    columns={waitlistCSVColumns}
                    filename={WAITLIST_CSV_FILENAME_PREFIX}
                    disabled={entries.length === 0}
                    ariaLabel='Export waitlist to CSV file'
                    chrome='page-toolbar'
                    className='whitespace-nowrap'
                    label='Export'
                  />
                  <DisplayMenuDropdown
                    trigger={
                      <PageToolbarActionButton
                        label='Display'
                        icon={
                          <Icon
                            name='SlidersHorizontal'
                            className={PAGE_TOOLBAR_ICON_CLASS}
                            strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
                          />
                        }
                        active={viewMode !== 'list' || groupingEnabled}
                        tooltipLabel='Display'
                        tooltipShortcut={`${GLYPH_SHIFT}V`}
                      />
                    }
                    viewMode={viewMode}
                    availableViewModes={['list', 'board']}
                    onViewModeChange={setViewMode}
                    groupingEnabled={groupingEnabled}
                    onGroupingToggle={setGroupingEnabled}
                    groupingLabel='Group by status'
                  />
                </>
              }
            />
          </>
        }
      >
        {() =>
          viewMode === 'list' ? (
            <AdminWaitlistTableUnified
              entries={entries}
              page={1}
              pageSize={pageSize}
              total={total}
              groupingEnabled={groupingEnabled}
              externalSelection={{
                selectedIds,
                headerCheckboxState,
                toggleSelect,
                toggleSelectAll,
              }}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={() => {
                fetchNextPage().catch(() => {});
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
