'use client';

import {
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  MENU_ITEM_DESTRUCTIVE,
} from '@jovie/ui';
import Link from 'next/link';
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import { CreatorProfileSocialLinks } from '@/components/admin/CreatorProfileSocialLinks';
import { CreatorActionsMenu } from '@/components/admin/creator-actions-menu';
import { CreatorActionsMenuContent } from '@/components/admin/creator-actions-menu/CreatorActionsMenuContent';
import { copyTextToClipboard } from '@/components/admin/creator-actions-menu/utils';
import { TableRowActions } from '@/components/admin/table/TableRowActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import { getBaseUrl } from '@/lib/utils/platform-detection';

const getRowClassName = (isChecked: boolean, isSelected: boolean) => {
  const baseClasses =
    'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0';
  if (isChecked) return cn(baseClasses, 'bg-[#ebebf6] dark:bg-[#1b1d38]');
  if (isSelected) return cn(baseClasses, 'bg-base dark:bg-surface-2');
  return cn(baseClasses, 'hover:bg-base dark:hover:bg-surface-2');
};

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
      <ContextMenuItem asChild>
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
      className={cn(destructive && MENU_ITEM_DESTRUCTIVE)}
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

/**
 * Compares primitive props that affect rendering.
 */
function arePrimitivePropsEqual(
  prev: CreatorProfileTableRowProps,
  next: CreatorProfileTableRowProps
): boolean {
  return (
    prev.rowNumber === next.rowNumber &&
    prev.isSelected === next.isSelected &&
    prev.isChecked === next.isChecked &&
    prev.isMobile === next.isMobile &&
    prev.verificationStatus === next.verificationStatus &&
    prev.refreshIngestStatus === next.refreshIngestStatus &&
    prev.isMenuOpen === next.isMenuOpen
  );
}

/**
 * Compares profile data that affects rendering.
 */
function areProfilesEqual(
  prevProfile: AdminCreatorProfileRow,
  nextProfile: AdminCreatorProfileRow
): boolean {
  // Compare basic profile fields
  if (prevProfile.id !== nextProfile.id) return false;
  if (prevProfile.username !== nextProfile.username) return false;
  if (prevProfile.displayName !== nextProfile.displayName) return false;
  if (prevProfile.avatarUrl !== nextProfile.avatarUrl) return false;
  if (prevProfile.isVerified !== nextProfile.isVerified) return false;
  if (prevProfile.isFeatured !== nextProfile.isFeatured) return false;
  if (prevProfile.isClaimed !== nextProfile.isClaimed) return false;
  if (prevProfile.marketingOptOut !== nextProfile.marketingOptOut) return false;
  if (prevProfile.claimToken !== nextProfile.claimToken) return false;

  // Compare dates (need special handling)
  const prevDate = prevProfile.createdAt?.getTime?.() ?? null;
  const nextDate = nextProfile.createdAt?.getTime?.() ?? null;
  if (prevDate !== nextDate) return false;

  // Compare social links array (shallow comparison of length)
  const prevLinks = prevProfile.socialLinks ?? [];
  const nextLinks = nextProfile.socialLinks ?? [];
  if (prevLinks.length !== nextLinks.length) return false;

  return true;
}

/**
 * Custom comparison function for React.memo.
 * Only rerenders when data or status actually changed.
 * Ignores handler function identity changes (they're recreated every render but do the same thing).
 */
function arePropsEqual(
  prev: CreatorProfileTableRowProps,
  next: CreatorProfileTableRowProps
): boolean {
  // Handlers are intentionally not compared - they're stable via useCallback in parent
  // or we accept new instances since the component is already memoized on data changes
  return (
    arePrimitivePropsEqual(prev, next) &&
    areProfilesEqual(prev.profile, next.profile)
  );
}

function CreatorProfileTableRowComponent({
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
}: Readonly<CreatorProfileTableRowProps>) {
  const displayName =
    'displayName' in profile ? (profile.displayName ?? null) : null;

  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyClaimLink = useCallback(async () => {
    if (!profile.claimToken) return;

    const baseUrl = getBaseUrl();
    const claimUrl = `${baseUrl}/claim/${profile.claimToken}`;
    const success = await copyTextToClipboard(claimUrl);

    if (success) {
      setCopySuccess(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [profile.claimToken]);

  const rowContent = (
    <tr
      className={getRowClassName(isChecked, isSelected)}
      onClick={() => onRowClick(profile.id)}
      onKeyDown={event =>
        handleActivationKeyDown(event, _e => onRowClick(profile.id))
      }
      tabIndex={0}
      aria-selected={isSelected}
    >
      <td className='w-14 px-4 py-3 align-middle'>
        {/* NOSONAR S6819: role="presentation" correctly hides wrapper; checkbox inside is the interactive element */}
        <div
          className='relative flex h-5 w-5 items-center justify-center'
          onClick={event => event.stopPropagation()}
          onKeyDown={event =>
            handleActivationKeyDown(event, e => e.stopPropagation())
          }
          role='presentation'
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
      <td
        className='px-4 py-3 align-middle text-right'
        onClick={e => e.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
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
      <ContextMenuContent>
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
          renderSeparator={() => <ContextMenuSeparator />}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Memoized table row component to prevent unnecessary rerenders.
 * Uses custom comparison to ignore handler function identity changes.
 */
export const CreatorProfileTableRow = memo(
  CreatorProfileTableRowComponent,
  arePropsEqual
);
