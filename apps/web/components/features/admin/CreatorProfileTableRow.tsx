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
import { toast } from 'sonner';
import { CreatorAvatarCell } from '@/features/admin/CreatorAvatarCell';
import { CreatorProfileSocialLinks } from '@/features/admin/CreatorProfileSocialLinks';
import { CreatorActionsMenu } from '@/features/admin/creator-actions-menu';
import { CreatorActionsMenuContent } from '@/features/admin/creator-actions-menu/CreatorActionsMenuContent';
import { TableRowActions } from '@/features/admin/table/TableRowActions';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import { getBaseUrl } from '@/lib/utils/platform-detection';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const getRowClassName = (isChecked: boolean, isSelected: boolean) => {
  const baseClasses =
    'group cursor-pointer border-b border-subtle transition-[background-color,box-shadow] duration-150 last:border-b-0';
  if (isChecked || isSelected) {
    return cn(
      baseClasses,
      'bg-[color-mix(in_srgb,var(--linear-row-selected)_68%,transparent)] shadow-[inset_1px_0_0_0_var(--linear-border-focus)] hover:bg-[color-mix(in_srgb,var(--linear-row-selected)_78%,transparent)]'
    );
  }
  return cn(baseClasses, 'bg-transparent hover:bg-(--linear-row-hover)');
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
  readonly profile: AdminCreatorProfileRow;
  readonly rowNumber: number;
  readonly isSelected: boolean;
  readonly isChecked: boolean;
  readonly isMobile: boolean;
  readonly verificationStatus: 'idle' | 'loading' | 'success' | 'error';
  readonly refreshIngestStatus: 'idle' | 'loading' | 'success' | 'error';
  readonly isMenuOpen: boolean;
  readonly onRowClick: (id: string) => void;
  readonly onContextMenu: (id: string) => void;
  readonly onToggleSelect: (id: string) => void;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onRefreshIngest: () => void | Promise<void>;
  readonly onToggleVerification: () => Promise<void>;
  readonly onToggleFeatured: () => Promise<void>;
  readonly onToggleMarketing: () => Promise<void>;
  readonly onSendInvite?: () => void;
  readonly onDelete: () => void | Promise<void>;
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
    const claimUrl = `${baseUrl}/${profile.username}/claim?token=${profile.claimToken}`;
    const success = await copyToClipboard(claimUrl);

    if (success) {
      setCopySuccess(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
    } else {
      toast.error('Failed to copy claim link');
    }
  }, [profile.claimToken, profile.username]);

  const rowContent = (
    <tr
      className={cn(
        getRowClassName(isChecked, isSelected),
        'focus-visible:outline-none focus-visible:bg-(--linear-row-hover) focus-visible:shadow-inset-ring-focus'
      )}
      onClick={() => onRowClick(profile.id)}
      onKeyDown={event =>
        handleActivationKeyDown(event, _e => onRowClick(profile.id))
      }
      tabIndex={0}
      aria-selected={isSelected}
    >
      <td
        className='w-14 px-4 py-3 align-middle'
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
      >
        <div className='relative flex h-5 w-5 items-center justify-center border-0 bg-transparent p-0'>
          <span
            className={cn(
              'select-none text-[11px] tabular-nums text-tertiary-token transition-opacity',
              isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
            )}
            aria-hidden='true'
          >
            {rowNumber}
          </span>
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center transition-opacity',
              isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <Checkbox
              aria-label={`Select ${profile.username}`}
              checked={isChecked}
              onCheckedChange={() => onToggleSelect(profile.id)}
            />
          </div>
        </div>
      </td>
      <td className='px-4 py-2.5 align-middle'>
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
              <div className='line-clamp-1 overflow-hidden text-ellipsis text-[13px] font-medium text-primary-token'>
                {displayName}
              </div>
            ) : null}
            <Link
              href={`/${profile.username}`}
              className={cn(
                'line-clamp-1 overflow-hidden text-ellipsis text-secondary-token transition-colors hover:text-primary-token',
                displayName
                  ? 'text-[12px]'
                  : 'text-[13px] font-medium text-primary-token'
              )}
              onClick={event => event.stopPropagation()}
            >
              @{profile.username}
            </Link>
          </div>
        </div>
      </td>
      <td className='px-4 py-2.5 align-middle max-lg:hidden lg:table-cell'>
        <div className='flex max-w-[230px] justify-start overflow-hidden'>
          <CreatorProfileSocialLinks socialLinks={profile.socialLinks} />
        </div>
      </td>
      <td className='max-md:hidden whitespace-nowrap px-4 py-2.5 text-center align-middle text-[12px] text-tertiary-token md:table-cell'>
        {profile.createdAt ? dateFormatter.format(profile.createdAt) : '—'}
      </td>
      <td
        className='px-4 py-2.5 align-middle text-right'
        onClick={e => e.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
      >
        <div className='flex items-center justify-end gap-1.5'>
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
