'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  BellRing,
  Copy,
  Download,
  Eye,
  Phone,
  UserMinus,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { memo, useMemo } from 'react';
import { toast } from 'sonner';
import { AudienceMobileCard } from '@/components/dashboard/audience/table/atoms/AudienceMobileCard';
import { EmptyState } from '@/components/organisms/EmptyState';
import {
  type ContextMenuItemType,
  TablePaginationFooter,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { AudienceTableProvider } from './AudienceTableContext';
import { AudienceTableSubheader } from './AudienceTableSubheader';
import type { DashboardAudienceTableProps } from './types';
import { useDashboardAudienceTable } from './useDashboardAudienceTable';
import { downloadVCard } from './utils';
import {
  LastSeenCell,
  MenuCell,
  QuickActionsCell,
  renderEmailCell,
  renderIntentScoreCell,
  renderLastActionCell,
  renderReturningCell,
  renderSourceCell,
  renderUserCell,
  SelectCell,
} from './utils/column-renderers';

const memberColumnHelper = createColumnHelper<AudienceMember>();

function getSrDescription(
  isEmpty: boolean,
  mode: 'members' | 'subscribers'
): string {
  if (isEmpty) {
    return mode === 'members'
      ? 'Track visitors and grow your fan base'
      : 'Build a subscriber base for notifications';
  }
  return mode === 'members'
    ? 'Every visitor, anonymous or identified, lives in this table.'
    : 'Notification signups from your notification modal.';
}

/**
 * Redesigned column definitions for members mode.
 *
 * Columns: Select | User | Intent Score | Returning | Source | Last Action | Quick Actions
 *
 * Cell renderers that need dynamic state (selection, menu, quick actions) read from
 * AudienceTableContext instead of closing over values, keeping these definitions fully stable.
 */
const MEMBER_COLUMNS: ColumnDef<AudienceMember, any>[] = [
  memberColumnHelper.display({
    id: 'select',
    header: () => null,
    cell: SelectCell,
    size: 56,
  }),
  memberColumnHelper.accessor('displayName', {
    id: 'user',
    header: 'Visitor',
    cell: renderUserCell,
    size: 220,
  }),
  memberColumnHelper.accessor('intentLevel', {
    id: 'intentScore',
    header: 'Intent',
    cell: renderIntentScoreCell,
    size: 110,
  }),
  memberColumnHelper.accessor('visits', {
    id: 'returning',
    header: 'Returning',
    cell: renderReturningCell,
    size: 100,
  }),
  memberColumnHelper.accessor('referrerHistory', {
    id: 'source',
    header: 'Source',
    cell: renderSourceCell,
    size: 140,
  }),
  memberColumnHelper.accessor('latestActions', {
    id: 'lastAction',
    header: 'Last Action',
    cell: renderLastActionCell,
    size: 160,
  }),
  memberColumnHelper.display({
    id: 'quickActions',
    header: '',
    cell: QuickActionsCell,
    size: 80,
  }),
];

/**
 * Stable column definitions for subscribers mode.
 */
const SUBSCRIBER_COLUMNS: ColumnDef<AudienceMember, any>[] = [
  memberColumnHelper.display({
    id: 'select',
    header: () => null,
    cell: SelectCell,
    size: 100,
  }),
  memberColumnHelper.accessor('displayName', {
    id: 'user',
    header: 'User',
    cell: renderUserCell,
    size: 300,
  }),
  memberColumnHelper.accessor('email', {
    id: 'email',
    header: 'Email',
    cell: renderEmailCell,
    size: 240,
  }),
  memberColumnHelper.accessor('lastSeenAt', {
    id: 'subscribedAt',
    header: 'Subscribed',
    cell: LastSeenCell,
    size: 180,
  }),
  memberColumnHelper.display({
    id: 'menu',
    header: '',
    cell: MenuCell,
    size: 48,
  }),
];

export const DashboardAudienceTableUnified = memo(
  function DashboardAudienceTableUnified({
    mode,
    view,
    rows,
    total,
    page,
    pageSize,
    sort,
    direction,
    onPageChange,
    onPageSizeChange,
    onSortChange,
    onFiltersChange,
    profileUrl,
    profileId,
    subscriberCount,
    filters,
    selectedMember,
    onSelectedMemberChange,
  }: DashboardAudienceTableProps) {
    const router = useRouter();
    const {
      openMenuRowId,
      setOpenMenuRowId,
      copiedProfileLink,
      selectedIds,
      selectedCount,
      toggleSelect,
      totalPages,
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
      selectedMember,
      onSelectedMemberChange,
    });

    const handleRemoveMember = React.useCallback(
      async (member: AudienceMember) => {
        if (!profileId) return;
        try {
          const res = await fetch('/api/dashboard/audience/members', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: member.id, profileId }),
          });
          if (!res.ok) {
            throw new Error('Failed to remove member');
          }
          toast.success('Member removed');
          if (selectedMember?.id === member.id) {
            onSelectedMemberChange(null);
          }
          router.refresh();
        } catch {
          toast.error('Failed to remove member');
        }
      },
      [profileId, selectedMember, onSelectedMemberChange, router]
    );

    // Quick action: export member as vCard
    const handleExportMember = React.useCallback((member: AudienceMember) => {
      downloadVCard(member);
      toast.success('Contact exported as vCard');
    }, []);

    // Quick action: block/remove member
    const handleBlockMember = React.useCallback(
      (member: AudienceMember) => {
        handleRemoveMember(member).catch(() => {});
      },
      [handleRemoveMember]
    );

    // Context menu items for right-click
    const getContextMenuItems = React.useCallback(
      (member: AudienceMember): ContextMenuItemType[] => {
        return [
          {
            id: 'view-details',
            label: 'View details',
            icon: <Eye className='h-3.5 w-3.5' />,
            onClick: () => onSelectedMemberChange(member),
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
              downloadVCard(member);
              toast.success('Contact exported as vCard');
            },
          },
          { type: 'separator' as const },
          {
            id: 'remove-member',
            label: 'Block',
            icon: <UserMinus className='h-3.5 w-3.5' />,
            onClick: () => {
              handleRemoveMember(member).catch(() => {});
            },
            disabled: !profileId,
            destructive: true,
          },
        ];
      },
      [onSelectedMemberChange, profileId, handleRemoveMember]
    );

    const columns = mode === 'members' ? MEMBER_COLUMNS : SUBSCRIBER_COLUMNS;

    // Context value for cell renderers — avoids putting dynamic state in column defs
    const contextValue = useMemo(
      () => ({
        selectedIds,
        toggleSelect,
        page,
        pageSize,
        openMenuRowId,
        setOpenMenuRowId,
        getContextMenuItems,
        onExportMember: handleExportMember,
        onBlockMember: handleBlockMember,
      }),
      [
        selectedIds,
        toggleSelect,
        page,
        pageSize,
        openMenuRowId,
        setOpenMenuRowId,
        getContextMenuItems,
        handleExportMember,
        handleBlockMember,
      ]
    );

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
          href: APP_ROUTES.PROFILE,
        };
    const emptyStateSecondaryAction = {
      label:
        mode === 'members' ? 'Learn about audience' : 'Learn about subscribers',
      href: '/support',
    };

    // Row className — high intent rows get bold styling for visual hierarchy
    const getRowClassName = React.useCallback(
      (row: AudienceMember) => {
        const isSelected = selectedMember?.id === row.id;
        const isHighIntent = row.intentLevel === 'high';
        return cn(
          isSelected ? 'bg-surface-2/70' : 'hover:bg-surface-2/50',
          isHighIntent && 'font-medium'
        );
      },
      [selectedMember]
    );

    return (
      <AudienceTableProvider value={contextValue}>
        <div
          className='flex h-full min-h-0 flex-col'
          data-testid='dashboard-audience-table'
        >
          <h1 className='sr-only'>
            {rows.length === 0 ? 'Audience' : 'Audience CRM'}
          </h1>
          <p className='sr-only'>{getSrDescription(rows.length === 0, mode)}</p>

          {/* Subheader with filter and export */}
          <AudienceTableSubheader
            view={view}
            filters={filters}
            onFiltersChange={onFiltersChange}
            rows={rows}
            selectedIds={selectedIds}
            subscriberCount={subscriberCount}
            total={total}
          />

          <div className='flex-1 min-h-0 flex flex-col bg-surface-1'>
            {/* Scrollable content area */}
            <div className='flex-1 min-h-0 overflow-auto'>
              {rows.length === 0 ? (
                <EmptyState
                  icon={emptyStateIcon}
                  heading={emptyStateHeading}
                  description={emptyStateDescription}
                  action={emptyStatePrimaryAction}
                  secondaryAction={emptyStateSecondaryAction}
                />
              ) : (
                <>
                  {/* Mobile card list */}
                  <div className='flex flex-col divide-y divide-subtle/60 md:hidden'>
                    {rows.map(member => (
                      <AudienceMobileCard
                        key={member.id}
                        member={member}
                        mode={mode}
                        isSelected={selectedMember?.id === member.id}
                        onTap={onSelectedMemberChange}
                      />
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className='hidden md:block h-full'>
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
                      enableKeyboardNavigation={true}
                      minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
                      className='text-[13px]'
                      getRowClassName={getRowClassName}
                      onRowClick={row => onSelectedMemberChange(row)}
                      getContextMenuItems={getContextMenuItems}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Pagination footer — uses the shared component for consistency */}
            <div className='shrink-0'>
              <TablePaginationFooter
                currentPage={page}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          </div>

          <div className='sr-only' aria-live='polite' aria-atomic='true'>
            {total > 0 &&
              `Showing ${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, total)} of ${total}`}
            {selectedCount > 0 &&
              `. ${selectedCount} ${selectedCount === 1 ? 'row' : 'rows'} selected`}
          </div>
        </div>
      </AudienceTableProvider>
    );
  }
);
