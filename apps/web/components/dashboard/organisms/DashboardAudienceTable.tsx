'use client';

import { Button } from '@jovie/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { BellRing, Users } from 'lucide-react';
import * as React from 'react';
import { useTableMeta } from '@/app/app/dashboard/DashboardLayoutClient';
import { AdminPageSizeSelect } from '@/components/admin/table/AdminPageSizeSelect';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import {
  AudienceMemberRow,
  AudienceSubscriberRow,
  AudienceTableHeader,
} from '@/components/dashboard/audience/table';
import type { AudienceMode } from '@/components/dashboard/audience/table/types';
import {
  AUDIENCE_MEMBER_SIDEBAR_WIDTH,
  AudienceMemberSidebar,
} from '@/components/dashboard/organisms/AudienceMemberSidebar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { AudienceMember } from '@/types';

export type { AudienceMode };

type AudienceRow = AudienceMember;

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface DashboardAudienceTableProps {
  mode: AudienceMode;
  rows: AudienceRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sort: string) => void;
  profileUrl?: string;
}

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
  const notifications = useNotifications();
  const { setTableMeta } = useTableMeta();
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [headerElevated, setHeaderElevated] = React.useState(false);
  const [openMenuRowId, setOpenMenuRowId] = React.useState<string | null>(null);
  const [selectedMember, setSelectedMember] =
    React.useState<AudienceRow | null>(null);
  const [copiedProfileLink, setCopiedProfileLink] = React.useState(false);
  const copyTimeoutRef = React.useRef<number | null>(null);

  const rowIds = React.useMemo(() => rows.map(row => row.id), [rows]);
  const {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  } = useRowSelection(rowIds);

  React.useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setHeaderElevated(container.scrollTop > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  React.useEffect(() => {
    clearSelection();
    setSelectedMember(null);
  }, [mode, page, pageSize, sort, direction, clearSelection]);

  React.useEffect(() => {
    const toggle = () => {
      if (rows.length === 0) return;
      setSelectedMember(current => (current ? null : (rows[0] ?? null)));
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
      rightPanelWidth: selectedMember ? AUDIENCE_MEMBER_SIDEBAR_WIDTH : 0,
    });

    return () => {
      setTableMeta({ rowCount: null, toggle: null, rightPanelWidth: null });
    };
  }, [rows, selectedMember, setTableMeta]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /**
   * Virtual scrolling configuration for table rows.
   *
   * Virtualization dramatically improves performance for large datasets (500+ rows)
   * by only rendering rows that are visible in the viewport, plus a small buffer.
   * This reduces DOM node count from O(n) to O(viewport_height / row_height + overscan).
   *
   * Configuration choices:
   * - estimateSize: 60px - Based on the actual rendered row height with padding
   * - overscan: 5 - Renders 5 extra rows above and below for smoother scrolling
   *
   * @see https://tanstack.com/virtual/latest/docs/api/virtualizer
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const selectedRows = React.useMemo(
    () => rows.filter(row => selectedIds.has(row.id)),
    [rows, selectedIds]
  );

  const copySelectedEmails = async (): Promise<void> => {
    const emails = selectedRows
      .map(row => row.email)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (emails.length === 0) {
      notifications.error('No emails available for selected rows');
      return;
    }

    const success = await copyTextToClipboard(emails.join('\n'));
    if (success) {
      notifications.success(`Copied ${emails.length} email(s)`);
      return;
    }

    notifications.error('Failed to copy emails');
  };

  const copySelectedPhones = async (): Promise<void> => {
    const phones = selectedRows
      .map(row => row.phone)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0
      );

    if (phones.length === 0) {
      notifications.error('No phone numbers available for selected rows');
      return;
    }

    const success = await copyTextToClipboard(phones.join('\n'));
    if (success) {
      notifications.success(`Copied ${phones.length} phone number(s)`);
      return;
    }

    notifications.error('Failed to copy phone numbers');
  };

  const bulkActions = [
    {
      label: 'Copy emails',
      onClick: () => void copySelectedEmails(),
      disabled: selectedCount === 0,
    },
    {
      label: 'Copy phone numbers',
      onClick: () => void copySelectedPhones(),
      disabled: selectedCount === 0,
    },
    {
      label: 'Clear selection',
      onClick: () => clearSelection(),
      disabled: selectedCount === 0,
    },
  ];

  const paginationLabel = () => {
    if (total === 0) {
      return mode === 'members'
        ? 'No audience yet. Share your profile to invite visitors.'
        : 'No signups yet. Invite fans to tap the bell.';
    }

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `Showing ${start}–${end} of ${total} readers`;
  };

  const handleCopyProfileLink = React.useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      notifications.success('Profile link copied');
      setCopiedProfileLink(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedProfileLink(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy profile link', error);
      notifications.error('Unable to copy profile link');
    }
  }, [notifications, profileUrl]);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const emptyStateHeading =
    mode === 'members' ? 'No audience yet' : 'No signups yet';
  const emptyStateDescription =
    mode === 'members'
      ? 'Share your profile to invite visitors. They will appear here as soon as they stop by.'
      : 'Invite fans to tap the bell on your profile to receive notifications.';
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
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
              Audience CRM
            </h1>
            <p className='mt-1 text-sm leading-6 text-secondary-token'>
              {mode === 'members'
                ? 'Every visitor, anonymous or identified, lives in this table.'
                : 'Notification signups from your notification modal.'}
            </p>
          </div>
          <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-secondary-token'>
            {total} {total === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto' ref={tableContainerRef}>
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

          <div className='sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1/75 px-4 py-2 text-xs text-secondary-token backdrop-blur-md sm:px-6'>
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
