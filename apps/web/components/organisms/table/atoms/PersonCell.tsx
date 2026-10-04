'use client';

import React from 'react';
import { Avatar } from '@/components/molecules/Avatar';
import { cn } from '../table.styles';

export interface PersonCellProps {
  /** Name shown in the row; also seeds the fallback initials. */
  readonly name: string;
  /** One quiet fact after the name (handle, email, company, role). */
  readonly secondary?: string | null;
  /** Photo URL. Missing or broken photos fall back to initials. */
  readonly avatarUrl?: string | null;
  readonly verified?: boolean;
  /** Small trailing slot for a status glyph or badge. */
  readonly trailing?: React.ReactNode;
  readonly className?: string;
}

/**
 * The one identity cell for people tables (audience, contacts, creators,
 * users, investors). A 20px face, the name, and one secondary fact on a single
 * line, so it fits the 32px `dense` row mode without wrapping.
 */
export const PersonCell = React.memo(function PersonCell({
  name,
  secondary,
  avatarUrl,
  verified = false,
  trailing,
  className,
}: PersonCellProps) {
  return (
    <div
      className={cn('flex min-w-0 items-center gap-2', className)}
      data-table-person-cell=''
    >
      <Avatar
        src={avatarUrl}
        alt=''
        name={name}
        size='sm'
        verified={verified}
      />
      <span className='min-w-0 truncate'>
        <span className='font-medium text-primary-token'>{name}</span>
        {secondary ? (
          <span className='ml-1.5 text-tertiary-token'>{secondary}</span>
        ) : null}
      </span>
      {trailing ? <span className='ml-auto shrink-0'>{trailing}</span> : null}
    </div>
  );
});

/**
 * Loading geometry for PersonCell: the same 20px face and one name line.
 * Uses the canonical `.skeleton` shimmer directly, as Avatar does, because the
 * shared Skeleton owns no size variants for these slots.
 */
export function PersonCellSkeleton({ width }: Readonly<{ width?: string }>) {
  return (
    <div className='flex items-center gap-2' style={{ width }} aria-hidden>
      <span className='skeleton system-b-table-skeleton-person-face shrink-0 rounded-full motion-reduce:animate-none' />
      <span className='skeleton system-b-table-skeleton-person-name rounded-sm motion-reduce:animate-none' />
    </div>
  );
}
