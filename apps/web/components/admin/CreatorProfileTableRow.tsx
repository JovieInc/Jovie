'use client';

import { Badge, Checkbox } from '@jovie/ui';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import { CreatorActionsMenu } from '@/components/admin/creator-actions-menu';
import { VerificationStatusToggle } from '@/components/admin/VerificationStatusToggle';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';

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

  return (
    <tr
      className={cn(
        'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0 focus:outline-none',
        isSelected ? 'bg-surface-2' : 'hover:bg-surface-2'
      )}
      onClick={() => onRowClick(profile.id)}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(profile.id);
      }}
      aria-selected={isSelected}
    >
      <td className='w-14 px-4 py-3 align-middle'>
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive checkbox container */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click handler stops propagation only */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only */}
        <div
          className='relative flex h-7 w-7 items-center justify-center'
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
              className='border-sidebar-border data-[state=checked]:bg-sidebar-accent data-[state=checked]:text-sidebar-accent-foreground'
            />
          </div>
        </div>
      </td>
      <td
        className={cn('px-4 py-3 align-middle', isSelected && 'bg-surface-2')}
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
              <div className='truncate font-medium text-primary-token line-clamp-1'>
                {displayName}
              </div>
            ) : null}
            <Link
              href={`/${profile.username}`}
              className={cn(
                'truncate text-secondary-token transition-colors hover:text-primary-token line-clamp-1',
                displayName ? 'text-xs' : 'font-medium text-primary-token'
              )}
              onClick={event => event.stopPropagation()}
            >
              @{profile.username}
            </Link>
          </div>
        </div>
      </td>
      <td className='px-4 py-3 align-middle text-xs text-tertiary-token whitespace-nowrap hidden md:table-cell'>
        {profile.createdAt
          ? new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }).format(profile.createdAt)
          : '—'}
      </td>
      <td className='px-4 py-3 align-middle text-xs whitespace-nowrap hidden md:table-cell'>
        <Badge size='sm' variant={profile.isClaimed ? 'success' : 'secondary'}>
          {profile.isClaimed ? (
            <>
              <Star className='h-3 w-3 fill-current' aria-hidden='true' />
              <span>Claimed</span>
            </>
          ) : (
            <span>Unclaimed</span>
          )}
        </Badge>
      </td>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Click handler stops propagation only */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click handler stops propagation only */}
      <td
        className='px-4 py-3 align-middle text-xs whitespace-nowrap'
        onClick={e => e.stopPropagation()}
      >
        <VerificationStatusToggle
          isVerified={profile.isVerified}
          status={verificationStatus}
          onToggle={onToggleVerification}
        />
      </td>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: Click handler stops propagation only */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Click handler stops propagation only */}
      <td
        className='px-4 py-3 align-middle text-right'
        onClick={e => e.stopPropagation()}
      >
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
      </td>
    </tr>
  );
}
