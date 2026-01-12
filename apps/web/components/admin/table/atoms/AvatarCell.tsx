'use client';

import { Star } from 'lucide-react';
import Link from 'next/link';
import { AvatarUploadable } from '@/components/organisms/AvatarUploadable';
import { cn } from '../table.styles';

interface AvatarCellProps {
  /**
   * Profile ID
   */
  profileId: string;

  /**
   * Username for link and fallback
   */
  username: string;

  /**
   * Avatar image URL
   */
  avatarUrl: string | null;

  /**
   * Display name (optional)
   */
  displayName?: string | null;

  /**
   * Whether the profile is verified
   */
  verified?: boolean;

  /**
   * Whether the profile is featured
   */
  isFeatured?: boolean;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * AvatarCell - Avatar with badges for verified and featured status
 *
 * Features:
 * - Avatar image or fallback initials
 * - Verification badge (blue checkmark)
 * - Featured badge (star icon)
 * - Display name and username
 * - Username link to profile
 * - Perfect vertical alignment with other cells
 *
 * Example:
 * ```tsx
 * <AvatarCell
 *   profileId={profile.id}
 *   username={profile.username}
 *   avatarUrl={profile.avatarUrl}
 *   displayName={profile.displayName}
 *   verified={profile.isVerified}
 *   isFeatured={profile.isFeatured}
 * />
 * ```
 */
export function AvatarCell({
  profileId,
  username,
  avatarUrl,
  displayName,
  verified = false,
  isFeatured = false,
  className,
}: AvatarCellProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Avatar with badges */}
      <div className='relative'>
        <AvatarUploadable
          src={avatarUrl}
          alt={`Avatar for @${username}`}
          name={username}
          size='sm'
          uploadable={false}
          verified={verified}
        />

        {/* Featured badge - star icon */}
        {isFeatured && (
          <div className='absolute -top-1 -left-1'>
            <Star className='h-3 w-3 text-yellow-400 dark:text-yellow-300 fill-current' />
          </div>
        )}
      </div>

      {/* Name and username */}
      <div className='min-w-0 flex-1'>
        {displayName && (
          <div className='font-medium text-primary-token line-clamp-1 overflow-hidden text-ellipsis text-[13px]'>
            {displayName}
          </div>
        )}
        <Link
          href={`/${username}`}
          className={cn(
            'text-secondary-token transition-colors hover:text-primary-token line-clamp-1 overflow-hidden text-ellipsis',
            displayName
              ? 'text-xs'
              : 'font-medium text-primary-token text-[13px]'
          )}
          onClick={event => event.stopPropagation()}
        >
          @{username}
        </Link>
      </div>
    </div>
  );
}
