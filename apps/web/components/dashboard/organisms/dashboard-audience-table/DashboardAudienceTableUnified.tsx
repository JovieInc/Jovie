'use client';

import { Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { BellRing, Copy, Download, Eye, Phone, Users } from 'lucide-react';
import * as React from 'react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  AudienceActionsCell,
  AudienceDeviceCell,
  AudienceLastSeenCell,
  AudienceLocationCell,
  AudienceRowSelectionCell,
  AudienceTypeBadge,
  AudienceUserCell,
  AudienceVisitsCell,
} from '@/components/dashboard/audience/table/atoms';
import { AudienceMemberSidebar } from '@/components/dashboard/organisms/audience-member-sidebar';
import { EmptyState } from '@/components/organisms/EmptyState';
import {
  AdminPageSizeSelect,
  type ContextMenuItemType,
  convertContextMenuItems,
  UnifiedTable,
} from '@/components/organisms/table';
import type { AudienceMember } from '@/types';
import type { DashboardAudienceTableProps } from './types';
import { useDashboardAudienceTable } from './useDashboardAudienceTable';

const memberColumnHelper = createColumnHelper<AudienceMember>();

export function DashboardAudienceTableUnified({
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
    openMenuRowId,
    setOpenMenuRowId,
    selectedMember,
    setSelectedMember,
    copiedProfileLink,
    selectedIds,
    selectedCount,
    toggleSelect,
    totalPages,
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

  // Context menu items for right-click
  const getContextMenuItems = React.useCallback(
    (member: AudienceMember): ContextMenuItemType[] => {
      return [
        {
          id: 'view-details',
          label: 'View details',
          icon: <Eye className='h-3.5 w-3.5' />,
          onClick: () => setSelectedMember(member),
        },
        {
          id: 'copy-email',
          label: 'Copy email',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            if (member.email) {
              void navigator.clipboard.writeText(member.email);
              toast.success('Email copied to clipboard');
            }
          },
          disabled: !member.email,
        },
        {
          id: 'copy-phone',
          label: 'Copy phone',
          icon: <Phone className='h-3.5 w-3.5' />,
          onClick: () => {
            if (member.phone) {
              void navigator.clipboard.writeText(member.phone);
              toast.success('Phone number copied to clipboard');
            }
          },
          disabled: !member.phone,
        },
        { type: 'separator' as const },
        {
          id: 'export-contact',
          label: 'Export as vCard',
          icon: <Download className='h-3.5 w-3.5' />,
          onClick: () => {
            // Generate vCard format
            const vcard = [
              'BEGIN:VCARD',
              'VERSION:3.0',
              `FN:${member.displayName}`,
              member.email ? `EMAIL:${member.email}` : '',
              member.phone ? `TEL:${member.phone}` : '',
              'END:VCARD',
            ]
              .filter(Boolean)
              .join('\n');

            // Create blob and download
            const blob = new Blob([vcard], { type: 'text/vcard' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${(member.displayName || 'contact').replaceAll(/[^a-z0-9]/gi, '_')}.vcf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            toast.success('Contact exported as vCard');
          },
        },
      ];
    },
    [setSelectedMember]
  );

  // Define columns for members mode
  const memberColumns = useMemo<ColumnDef<AudienceMember, any>[]>(
    () => [
      // Selection + Row Number column
      memberColumnHelper.display({
        id: 'select',
        header: () => null,
        cell: ({ row, table }) => {
          const rowIndex = row.index;
          const rowNumber = (page - 1) * pageSize + rowIndex + 1;
          return (
            <AudienceRowSelectionCell
              rowNumber={rowNumber}
              isChecked={selectedIds.has(row.original.id)}
              displayName={row.original.displayName}
              onToggle={() => toggleSelect(row.original.id)}
            />
          );
        },
        size: 100,
      }),

      // User column
      memberColumnHelper.accessor('displayName', {
        id: 'user',
        header: 'User',
        cell: ({ row }) => (
          <AudienceUserCell
            displayName={row.original.displayName}
            type={row.original.type}
            email={row.original.email}
            phone={row.original.phone}
          />
        ),
        size: 240,
      }),

      // Type column
      memberColumnHelper.accessor('type', {
        id: 'type',
        header: 'Type',
        cell: ({ getValue }) => <AudienceTypeBadge type={getValue()} />,
        size: 120,
      }),

      // Location column
      memberColumnHelper.accessor('locationLabel', {
        id: 'location',
        header: 'Location',
        cell: ({ getValue }) => (
          <AudienceLocationCell locationLabel={getValue()} />
        ),
        size: 160,
      }),

      // Device column
      memberColumnHelper.accessor('deviceType', {
        id: 'device',
        header: 'Device',
        cell: ({ getValue }) => <AudienceDeviceCell deviceType={getValue()} />,
        size: 140,
      }),

      // Visits column
      memberColumnHelper.accessor('visits', {
        id: 'visits',
        header: 'Visits',
        cell: ({ row }) => (
          <AudienceVisitsCell
            visits={row.original.visits}
            intentLevel={row.original.intentLevel}
          />
        ),
        size: 120,
      }),

      // Actions column
      memberColumnHelper.accessor('latestActions', {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <AudienceActionsCell
            rowId={row.original.id}
            actions={row.original.latestActions}
          />
        ),
        size: 180,
      }),

      // Last Seen column
      memberColumnHelper.accessor('lastSeenAt', {
        id: 'lastSeen',
        header: 'Last Seen',
        cell: ({ row }) => (
          <AudienceLastSeenCell
            row={row.original}
            lastSeenAt={row.original.lastSeenAt}
            isMenuOpen={openMenuRowId === row.original.id}
            onMenuOpenChange={open =>
              setOpenMenuRowId(open ? row.original.id : null)
            }
          />
        ),
        size: 160,
      }),

      // Ellipsis menu column
      memberColumnHelper.display({
        id: 'menu',
        header: '',
        cell: ({ row }) => {
          const contextMenuItems = getContextMenuItems(row.original);
          const actionMenuItems = convertContextMenuItems(contextMenuItems);

          return (
            <div className='flex items-center justify-end'>
              <TableActionMenu items={actionMenuItems} align='end' />
            </div>
          );
        },
        size: 48,
      }),
    ],
    [
      page,
      pageSize,
      selectedIds,
      toggleSelect,
      openMenuRowId,
      setOpenMenuRowId,
      getContextMenuItems,
    ]
  );

  // Define columns for subscribers mode (simplified)
  const subscriberColumns = useMemo<ColumnDef<AudienceMember, any>[]>(
    () => [
      // Selection + Row Number column
      memberColumnHelper.display({
        id: 'select',
        header: () => null,
        cell: ({ row, table }) => {
          const rowIndex = row.index;
          const rowNumber = (page - 1) * pageSize + rowIndex + 1;
          return (
            <AudienceRowSelectionCell
              rowNumber={rowNumber}
              isChecked={selectedIds.has(row.original.id)}
              displayName={row.original.displayName}
              onToggle={() => toggleSelect(row.original.id)}
            />
          );
        },
        size: 100,
      }),

      // User column
      memberColumnHelper.accessor('displayName', {
        id: 'user',
        header: 'User',
        cell: ({ row }) => (
          <AudienceUserCell
            displayName={row.original.displayName}
            type={row.original.type}
            email={row.original.email}
            phone={row.original.phone}
          />
        ),
        size: 300,
      }),

      // Email column
      memberColumnHelper.accessor('email', {
        id: 'email',
        header: 'Email',
        cell: ({ getValue }) => (
          <span className='text-secondary-token'>{getValue() ?? '—'}</span>
        ),
        size: 240,
      }),

      // Subscribed At column
      memberColumnHelper.accessor('lastSeenAt', {
        id: 'subscribedAt',
        header: 'Subscribed',
        cell: ({ row }) => (
          <AudienceLastSeenCell
            row={row.original}
            lastSeenAt={row.original.lastSeenAt}
            isMenuOpen={openMenuRowId === row.original.id}
            onMenuOpenChange={open =>
              setOpenMenuRowId(open ? row.original.id : null)
            }
          />
        ),
        size: 180,
      }),

      // Ellipsis menu column
      memberColumnHelper.display({
        id: 'menu',
        header: '',
        cell: ({ row }) => {
          const contextMenuItems = getContextMenuItems(row.original);
          const actionMenuItems = convertContextMenuItems(contextMenuItems);

          return (
            <div className='flex items-center justify-end'>
              <TableActionMenu items={actionMenuItems} align='end' />
            </div>
          );
        },
        size: 48,
      }),
    ],
    [
      page,
      pageSize,
      selectedIds,
      toggleSelect,
      openMenuRowId,
      setOpenMenuRowId,
      getContextMenuItems,
    ]
  );

  const columns = mode === 'members' ? memberColumns : subscriberColumns;

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

  const getRowClassName = React.useCallback(
    (row: AudienceMember) => {
      const isSelected = selectedMember?.id === row.id;
      return isSelected ? 'bg-surface-2' : 'hover:bg-surface-2';
    },
    [selectedMember]
  );

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
          {rows.length === 0 ? (
            <div className='flex-1 min-h-0 overflow-auto pb-14'>
              <EmptyState
                icon={emptyStateIcon}
                heading={emptyStateHeading}
                description={emptyStateDescription}
                action={emptyStatePrimaryAction}
                secondaryAction={emptyStateSecondaryAction}
              />
            </div>
          ) : (
            <div className='flex-1 min-h-0 overflow-hidden'>
              <UnifiedTable
                data={rows}
                columns={columns}
                isLoading={false}
                emptyState={
                  <EmptyState
                    icon={emptyStateIcon}
                    heading={emptyStateHeading}
                    description={emptyStateDescription}
                    action={emptyStatePrimaryAction}
                    secondaryAction={emptyStateSecondaryAction}
                  />
                }
                getRowId={row => row.id}
                enableVirtualization={true}
                rowHeight={44}
                minWidth='960px'
                className='text-[13px]'
                getRowClassName={getRowClassName}
                onRowClick={row => setSelectedMember(row)}
                getContextMenuItems={getContextMenuItems}
              />
            </div>
          )}

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
