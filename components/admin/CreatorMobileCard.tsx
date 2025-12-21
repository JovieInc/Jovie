'use client';

import { Badge, Button } from '@jovie/ui';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Star,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CreatorActionsMenu } from '@/components/admin/CreatorActionsMenu';
import { CreatorAvatarCell } from '@/components/admin/CreatorAvatarCell';
import type { CreatorActionStatus } from '@/components/admin/useCreatorActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

export interface CreatorMobileCardProps {
  profile: AdminCreatorProfileRow;
  isSelected: boolean;
  verificationStatus: CreatorActionStatus;
  ingestRefreshStatus: CreatorActionStatus;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onCardClick: () => void;
  onRefreshIngest: () => Promise<void>;
  onToggleVerification: () => Promise<void>;
  onToggleFeatured: () => Promise<void>;
  onToggleMarketing: () => Promise<void>;
  onDelete: () => void;
}

export function CreatorMobileCard({
  profile,
  isSelected,
  verificationStatus,
  ingestRefreshStatus,
  menuOpen,
  onMenuOpenChange,
  onCardClick,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onDelete,
}: CreatorMobileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayName =
    'displayName' in profile ? (profile.displayName ?? null) : null;

  const formattedDate = profile.createdAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(profile.createdAt)
    : null;

  return (
    <div
      className={`bg-surface-0 border rounded-xl overflow-hidden transition-all ${
        isSelected ? 'border-accent ring-1 ring-accent/30' : 'border-subtle'
      }`}
      onClick={onCardClick}
      role='button'
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick();
        }
      }}
    >
      {/* Main card content - always visible */}
      <div className='p-4'>
        {/* Header: Avatar, Name, Badges */}
        <div className='flex items-start gap-3'>
          <CreatorAvatarCell
            profileId={profile.id}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
            verified={profile.isVerified}
            isFeatured={profile.isFeatured}
            size='lg'
          />
          <div className='flex-1 min-w-0'>
            {displayName ? (
              <h3 className='font-semibold text-primary-token truncate text-base'>
                {displayName}
              </h3>
            ) : null}
            <Link
              href={`/${profile.username}`}
              className={`text-secondary-token hover:text-accent transition-colors truncate block ${
                displayName
                  ? 'text-sm'
                  : 'font-semibold text-base text-primary-token'
              }`}
              onClick={e => e.stopPropagation()}
            >
              @{profile.username}
            </Link>
          </div>
        </div>

        {/* Status badges row */}
        <div className='flex flex-wrap items-center gap-2 mt-3'>
          <Badge
            size='sm'
            variant={profile.isClaimed ? 'success' : 'secondary'}
          >
            {profile.isClaimed ? (
              <>
                <Star className='h-3 w-3 fill-current' aria-hidden='true' />
                <span>Claimed</span>
              </>
            ) : (
              <span>Unclaimed</span>
            )}
          </Badge>
          <Badge
            size='sm'
            variant={profile.isVerified ? 'primary' : 'secondary'}
          >
            {profile.isVerified ? (
              <>
                <Check className='h-3 w-3' aria-hidden='true' />
                <span>Verified</span>
              </>
            ) : (
              <span>Not verified</span>
            )}
          </Badge>
          {profile.isFeatured && (
            <Badge size='sm' variant='warning'>
              <Star className='h-3 w-3 fill-current' aria-hidden='true' />
              <span>Featured</span>
            </Badge>
          )}
        </div>

        {/* Quick info row */}
        {formattedDate && (
          <div className='flex items-center gap-1.5 mt-2 text-xs text-tertiary-token'>
            <Calendar className='h-3 w-3' />
            <span>Created {formattedDate}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className='flex items-center gap-2 mt-4'>
          <Button
            size='sm'
            variant='secondary'
            className='flex-1'
            onClick={e => {
              e.stopPropagation();
              onCardClick();
            }}
          >
            <UserCheck className='h-4 w-4 mr-1.5' />
            View Details
          </Button>
          <div onClick={e => e.stopPropagation()}>
            <CreatorActionsMenu
              profile={profile}
              isMobile={true}
              status={verificationStatus}
              refreshIngestStatus={ingestRefreshStatus}
              open={menuOpen}
              onOpenChange={onMenuOpenChange}
              onRefreshIngest={onRefreshIngest}
              onToggleVerification={onToggleVerification}
              onToggleFeatured={onToggleFeatured}
              onToggleMarketing={onToggleMarketing}
              onDelete={onDelete}
            />
          </div>
          <Button
            size='sm'
            variant='ghost'
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className='flex-shrink-0 px-3'
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Show less details' : 'Show more details'}
          >
            {isExpanded ? (
              <ChevronUp className='h-4 w-4' />
            ) : (
              <ChevronDown className='h-4 w-4' />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className='border-t border-subtle bg-surface-1/50 px-4 py-3 space-y-3'
          onClick={e => e.stopPropagation()}
        >
          {/* Profile Link */}
          <div className='flex items-start gap-3'>
            <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
              Profile
            </div>
            <Link
              href={`/${profile.username}`}
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm text-accent hover:underline flex items-center gap-1.5 min-w-0'
            >
              <span className='truncate'>jov.ie/{profile.username}</span>
              <ExternalLink className='h-3.5 w-3.5 flex-shrink-0' />
            </Link>
          </div>

          {/* Claimed Status */}
          <div className='flex items-start gap-3'>
            <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
              Status
            </div>
            <span className='text-sm text-secondary-token'>
              {profile.isClaimed ? 'Claimed by user' : 'Unclaimed profile'}
            </span>
          </div>

          {/* Marketing Opt-out */}
          <div className='flex items-start gap-3'>
            <div className='w-20 flex-shrink-0 text-xs text-tertiary-token font-medium'>
              Marketing
            </div>
            <span className='text-sm text-secondary-token'>
              {profile.marketingOptOut ? 'Opted out' : 'Subscribed'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
