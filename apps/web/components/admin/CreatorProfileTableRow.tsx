'use client';

import {
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@jovie/ui';
import Link from 'next/link';
import { type ReactNode, useCallback, useState } from 'react';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import { CreatorProfileSocialLinks } from '@/components/admin/CreatorProfileSocialLinks';
import { CreatorActionsMenu } from '@/components/admin/creator-actions-menu';
import { CreatorActionsMenuContent } from '@/components/admin/creator-actions-menu/CreatorActionsMenuContent';
import { copyTextToClipboard } from '@/components/admin/creator-actions-menu/utils';
import { TableRowActions } from '@/components/admin/table/TableRowActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  geistTableMenuContentClass,
  geistTableMenuDestructiveItemClass,
  geistTableMenuItemClass,
  geistTableMenuSeparatorClass,
} from '@/lib/ui/geist-table-menu';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

const getRowClassName = (isChecked: boolean, isSelected: boolean) =>
  cn(
    'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0',
    isChecked
      ? 'bg-[#ebebf6] dark:bg-[#1b1d38]'
      : isSelected
        ? 'bg-base dark:bg-surface-2'
        : 'hover:bg-base dark:hover:bg-surface-2'
  );

const renderContextMenuItem = ({
  onClick,
  href,
  disabled,
  destructive,
  children,
}: {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) => {
  if (href) {
    return (
      <ContextMenuItem asChild className={geistTableMenuItemClass}>
        <Link
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          onClick={e => e.stopPropagation()}
        >
          {children}
        </Link>
      </ContextMenuItem>
    );
  }

  return (
    <ContextMenuItem
      onClick={onClick}
      disabled={disabled}
      className={cn(
        geistTableMenuItemClass,
        destructive && geistTableMenuDestructiveItemClass
      )}
    >
      {children}
    </ContextMenuItem>
  );
};

export interface CreatorProfileTableRowProps {
  profile: AdminCreatorProfileRow;
  rowNumber: number;
  isSelected: boolean;
  isChecked: boolean;
  isMobile: boolean;
  verificationStatus: 'idle' | 'loading' | 'success' | 'error';
  refreshIngestStatus: 'idle' | 'loading' | 'success' | 'error';
  isMenuOpen: boolean;
  onRowClick: (id: string) => void;
  onContextMenu: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onMenuOpenChange: (open: boolean) => void;
  onRefreshIngest: () => void | Promise<void>;
  onToggleVerification: () => Promise<void>;
  onToggleFeatured: () => Promise<void>;
  onToggleMarketing: () => Promise<void>;
  onSendInvite?: () => void;
  onDelete: () => void | Promise<void>;
}

export function CreatorProfileTableRow({
  profile,
  rowNumber,
  isSelected,
  isChecked,
  isMobile,
  verificationStatus,
  refreshIngestStatus,
  isMenuOpen,
  onRowClick,
  onContextMenu,
  onToggleSelect,
  onMenuOpenChange,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onSendInvite,
  onDelete,
}: CreatorProfileTableRowProps) {
  const displayName =
    'displayName' in profile ? (profile.displayName ?? null) : null;

  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyClaimLink = useCallback(async () => {
    if (!profile.claimToken) return;

    const baseUrl = getBaseUrl();
    const claimUrl = `${baseUrl}/claim/${profile.claimToken}`;
    const success = await copyTextToClipboard(claimUrl);

    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [profile.claimToken]);

  const rowContent = (
    <tr
      className={getRowClassName(isChecked, isSelected)}
      onClick={() => onRowClick(profile.id)}
      aria-selected={isSelected}
    >
      <td className='w-14 px-4 py-3 align-middle'>
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive checkbox container */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click handler stops propagation only */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only */}
        <div
          className='relative flex h-5 w-5 items-center justify-center'
          onClick={event => event.stopPropagation()}
        >
          <span
            className={cn(
              'text-[11px] tabular-nums text-tertiary-token select-none transition-opacity',
              isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
            )}
            aria-hidden='true'
          >
            {rowNumber}
          </span>
          <div
            className={cn(
              'absolute inset-0 transition-opacity',
              isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <Checkbox
              aria-label={`Select ${profile.username}`}
              checked={isChecked}
              onCheckedChange={() => onToggleSelect(profile.id)}
              className='border-2 border-tertiary-token/50 data-[state=checked]:border-sidebar-accent data-[state=checked]:bg-sidebar-accent data-[state=checked]:text-sidebar-accent-foreground'
            />
          </div>
        </div>
      </td>
      <td
        className={cn(
          'px-4 py-3 align-middle',
          isChecked
            ? 'bg-[#ebebf6] dark:bg-[#1b1d38]'
            : isSelected && 'bg-base dark:bg-surface-2'
        )}
      >
        <div className='flex items-center gap-3'>
          <CreatorAvatarCell
            profileId={profile.id}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
            verified={profile.isVerified}
            isFeatured={profile.isFeatured}
          />
          <div className='min-w-0'>
            {displayName ? (
              <div className='font-medium text-primary-token line-clamp-1 overflow-hidden text-ellipsis'>
                {displayName}
              </div>
            ) : null}
            <Link
              href={`/${profile.username}`}
              className={cn(
                'text-secondary-token transition-colors hover:text-primary-token line-clamp-1 overflow-hidden text-ellipsis',
                displayName ? 'text-xs' : 'font-medium text-primary-token'
              )}
              onClick={event => event.stopPropagation()}
            >
              @{profile.username}
            </Link>
          </div>
        </div>
      </td>
      <td className='px-4 py-3 align-middle hidden lg:table-cell'>
        <div className='flex gap-1.5 overflow-hidden'>
          <CreatorProfileSocialLinks socialLinks={profile.socialLinks} />
        </div>
      </td>
      <td className='px-4 py-3 text-center align-middle text-xs text-tertiary-token whitespace-nowrap hidden md:table-cell'>
        {profile.createdAt
          ? new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }).format(profile.createdAt)
          : '—'}
      </td>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Click handler stops propagation only */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click handler stops propagation only */}
      <td
        className='px-4 py-3 align-middle text-right'
        onClick={e => e.stopPropagation()}
      >
        <div className='flex items-center justify-end gap-2'>
          {/* Icon action buttons - always visible on hover */}
          <div
            className={cn(
              'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
              isMenuOpen && 'opacity-100 pointer-events-auto'
            )}
          >
            <TableRowActions
              isVerified={profile.isVerified}
              isClaimed={profile.isClaimed}
              verificationStatus={verificationStatus}
              refreshIngestStatus={refreshIngestStatus}
              onToggleVerification={onToggleVerification}
              onRefreshIngest={onRefreshIngest}
            />
          </div>
          {/* Overflow menu - always visible on hover */}
          <div
            className={cn(
              'opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto',
              isMenuOpen && 'opacity-100 pointer-events-auto'
            )}
          >
            <CreatorActionsMenu
              profile={profile}
              isMobile={isMobile}
              status={verificationStatus}
              refreshIngestStatus={refreshIngestStatus}
              open={isMenuOpen}
              onOpenChange={onMenuOpenChange}
              onRefreshIngest={async () => {
                await onRefreshIngest();
              }}
              onToggleVerification={onToggleVerification}
              onToggleFeatured={onToggleFeatured}
              onToggleMarketing={onToggleMarketing}
              onSendInvite={onSendInvite}
              onDelete={onDelete}
            />
          </div>
        </div>
      </td>
    </tr>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent className={geistTableMenuContentClass}>
        <CreatorActionsMenuContent
          profile={profile}
          status={verificationStatus}
          refreshIngestStatus={refreshIngestStatus}
          onToggleVerification={onToggleVerification}
          onToggleFeatured={onToggleFeatured}
          onToggleMarketing={onToggleMarketing}
          onRefreshIngest={async () => {
            await onRefreshIngest();
          }}
          onSendInvite={onSendInvite}
          onDelete={onDelete}
          copySuccess={copySuccess}
          onCopyClaimLink={handleCopyClaimLink}
          renderItem={renderContextMenuItem}
          renderSeparator={() => (
            <ContextMenuSeparator className={geistTableMenuSeparatorClass} />
          )}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
