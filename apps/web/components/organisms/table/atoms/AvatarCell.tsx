'use client';

import { Star } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { PersonCell } from './PersonCell';

interface AvatarCellProps {
  /**
   * Profile ID
   */
  readonly profileId: string;

  /**
   * Username for link and fallback
   */
  readonly username: string;

  /**
   * Avatar image URL
   */
  readonly avatarUrl: string | null;

  /**
   * Display name (optional)
   */
  readonly displayName?: string | null;

  /**
   * Whether the profile is verified
   */
  readonly verified?: boolean;

  /**
   * Whether the profile is featured
   */
  readonly isFeatured?: boolean;

  /**
   * Additional CSS classes
   */
  readonly className?: string;

  /**
   * Disable username navigation link rendering
   */
  readonly disableUsernameLink?: boolean;

  /**
   * Optional actions rendered next to username
   */
  readonly usernameActions?: React.ReactNode;
}

/**
 * AvatarCell - a creator on the shared one-line people row (PersonCell):
 * a 20px face with the verified badge, the display name, and the @username as
 * the secondary fact (a profile link unless disabled). Featured profiles carry
 * a star after the name; row actions sit in the trailing slot.
 *
 * Memoized: rendered for every visible row of large virtualized tables.
 */
export const AvatarCell = React.memo(function AvatarCell({
  username,
  avatarUrl,
  displayName,
  verified = false,
  isFeatured = false,
  className,
  disableUsernameLink = false,
  usernameActions,
}: AvatarCellProps) {
  const handle = disableUsernameLink ? (
    `@${username}`
  ) : (
    <Link
      href={`/${username}`}
      className='transition-colors hover:text-primary-token'
      onClick={event => event.stopPropagation()}
    >
      @{username}
    </Link>
  );

  return (
    <PersonCell
      name={displayName || `@${username}`}
      nameHref={
        !displayName && !disableUsernameLink ? `/${username}` : undefined
      }
      secondary={displayName ? handle : null}
      avatarUrl={avatarUrl}
      verified={verified}
      className={className ? `group ${className}` : 'group'}
      trailing={
        isFeatured || usernameActions ? (
          <span className='flex items-center gap-1.5'>
            {isFeatured ? (
              <Star
                aria-label='Featured'
                className='h-3 w-3 fill-current text-yellow-400 dark:text-yellow-300'
              />
            ) : null}
            {usernameActions}
          </span>
        ) : null
      }
    />
  );
});
