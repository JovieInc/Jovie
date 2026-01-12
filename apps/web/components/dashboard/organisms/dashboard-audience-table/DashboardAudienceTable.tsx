'use client';

import { Button } from '@jovie/ui';
import { BellRing, Users } from 'lucide-react';
import * as React from 'react';
import { AdminPageSizeSelect } from '@/components/admin/table/AdminPageSizeSelect';
import {
  AudienceMemberRow,
  AudienceSubscriberRow,
  AudienceTableHeader,
} from '@/components/dashboard/audience/table';
import { AudienceMemberSidebar } from '@/components/dashboard/organisms/audience-member-sidebar';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DashboardAudienceTableProps } from './types';
import { useDashboardAudienceTable } from './useDashboardAudienceTable';

export function DashboardAudienceTable({
  mode,
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  profileUrl,
}: DashboardAudienceTableProps) {
  const {
    tableContainerRef,
    headerElevated,
    openMenuRowId,
    setOpenMenuRowId,
    selectedMember,
    setSelectedMember,
    copiedProfileLink,
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    rowVirtualizer,
    totalPages,
    bulkActions,
    paginationLabel,
    handleCopyProfileLink,
  } = useDashboardAudienceTable({
    mode,
    rows,
    total,
    page,
    pageSize,
    sort,
    direction,
    profileUrl,
  });

  const emptyStateHeading =
    mode === 'members' ? 'Grow Your Audience' : 'Get Your First Subscriber';
  const emptyStateDescription =
    mode === 'members'
      ? 'Share your profile link on social media to invite visitors. Most creators get their first audience member by sharing on X or IG bio.'
      : 'Encourage fans to tap the bell icon on your profile to get notified when you post new content or updates.';
  const emptyStateIcon =
    mode === 'members' ? (
      <Users className='h-6 w-6' aria-hidden='true' />
    ) : (
      <BellRing className='h-6 w-6' aria-hidden='true' />
    );
  const emptyStatePrimaryAction = profileUrl
    ? {
        label: copiedProfileLink ? 'Link copied' : 'Copy profile link',
        onClick: () => {
          void handleCopyProfileLink();
        },
      }
    : {
        label: 'Open profile settings',
        href: '/app/dashboard/profile',
      };
  const emptyStateSecondaryAction = {
    label:
      mode === 'members' ? 'Learn about audience' : 'Learn about subscribers',
    href: '/support',
  };

  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='dashboard-audience-table'
    >
      <h1 className='sr-only'>
        {rows.length === 0 ? 'Audience' : 'Audience CRM'}
      </h1>
      <p className='sr-only'>
        {rows.length === 0
          ? mode === 'members'
            ? 'Track visitors and grow your fan base'
            : 'Build a subscriber base for notifications'
          : mode === 'members'
            ? 'Every visitor, anonymous or identified, lives in this table.'
            : 'Notification signups from your notification modal.'}
      </p>

      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div
            className='flex-1 min-h-0 overflow-auto pb-14'
            ref={tableContainerRef}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={emptyStateIcon}
                heading={emptyStateHeading}
                description={emptyStateDescription}
                action={emptyStatePrimaryAction}
                secondaryAction={emptyStateSecondaryAction}
              />
            ) : (
              <table
                className='w-full min-w-[960px] border-separate border-spacing-0 text-[13px]'
                aria-label={
                  mode === 'members'
                    ? 'Audience members table'
                    : 'Subscribers table'
                }
              >
                <caption className='sr-only'>
                  {mode === 'members'
                    ? 'Table showing all audience members with their visit history, location, and engagement data'
                    : 'Table showing all subscribers with their contact information and signup dates'}
                </caption>

                <AudienceTableHeader
                  mode={mode}
                  sort={sort}
                  direction={direction}
                  headerCheckboxState={headerCheckboxState}
                  selectedCount={selectedCount}
                  headerElevated={headerElevated}
                  totalCount={total}
                  onSortChange={onSortChange}
                  onToggleSelectAll={toggleSelectAll}
                  bulkActions={bulkActions}
                />

                <tbody
                  style={{
                    position: 'relative',
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map(virtualRow => {
                    const row = rows[virtualRow.index];
                    const isChecked = selectedIds.has(row.id);
                    const rowNumber =
                      (page - 1) * pageSize + virtualRow.index + 1;

                    const commonProps = {
                      row,
                      rowNumber,
                      isSelected: selectedMember?.id === row.id,
                      isChecked,
                      isMenuOpen: openMenuRowId === row.id,
                      virtualRowStart: virtualRow.start,
                      measureRef: rowVirtualizer.measureElement,
                      dataIndex: virtualRow.index,
                      onRowClick: () => setSelectedMember(row),
                      onRowContextMenu: (event: React.MouseEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMenuRowId(row.id);
                      },
                      onToggleSelect: () => toggleSelect(row.id),
                      onMenuOpenChange: (open: boolean) =>
                        setOpenMenuRowId(open ? row.id : null),
                    };

                    return mode === 'members' ? (
                      <AudienceMemberRow key={row.id} {...commonProps} />
                    ) : (
                      <AudienceSubscriberRow key={row.id} {...commonProps} />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Always render pagination, even when empty */}
          <div className='sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1/90 px-4 py-2 text-xs text-secondary-token backdrop-blur-md sm:px-6'>
            <span className='tracking-wide'>{paginationLabel()}</span>
            <div className='flex items-center gap-3'>
              <AdminPageSizeSelect
                initialPageSize={pageSize}
                onPageSizeChange={onPageSizeChange}
              />
              <div className='flex gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page <= 1 || total === 0}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={page >= totalPages || total === 0}
                  className='rounded-md border border-subtle bg-transparent text-secondary-token hover:bg-surface-2 hover:text-primary-token'
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AudienceMemberSidebar
        member={selectedMember}
        isOpen={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
      />
      <div className='sr-only' aria-live='polite' aria-atomic='true'>
        {paginationLabel()}
        {selectedCount > 0 &&
          `${selectedCount} ${selectedCount === 1 ? 'row' : 'rows'} selected`}
      </div>
    </div>
  );
}
