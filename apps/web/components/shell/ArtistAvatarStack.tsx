'use client';

import { Avatar } from '@/components/molecules/Avatar';
import { cn } from '@/lib/utils';

export interface ArtistAvatarItem {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

interface ArtistAvatarStackProps {
  readonly artists: readonly ArtistAvatarItem[];
  readonly className?: string;
}

/**
 * ArtistAvatarStack — artist identity widget for the chat shell header.
 *
 * 1 artist  → single avatar
 * 2 artists → two overlapping avatars
 * 3+ artists → two overlapping avatars + "+N artists" count label
 *
 * The outer span has aria-label listing all artist names so screen readers
 * can identify the full set even when avatars overflow.
 */
export function ArtistAvatarStack({
  artists,
  className,
}: ArtistAvatarStackProps) {
  if (artists.length === 0) return null;

  const visibleArtists = artists.slice(0, 2);
  const overflowCount = artists.length - 2;
  const groupLabel = artists.map(a => a.displayName).join(', ');

  return (
    <span
      role='img'
      className={cn('inline-flex items-center', className)}
      aria-label={groupLabel}
    >
      {visibleArtists.map((artist, index) => (
        <Avatar
          key={artist.id}
          src={artist.avatarUrl}
          alt={artist.displayName}
          size='xs'
          className={cn(
            'size-5 shrink-0 rounded-full',
            'ring-2 ring-(--linear-bg-page)',
            index > 0 && '-ml-1.5'
          )}
        />
      ))}
      {overflowCount > 0 && (
        <span
          aria-hidden='true'
          className='ml-1 text-xs font-semibold text-secondary-token tabular-nums'
        >
          +{overflowCount} artists
        </span>
      )}
    </span>
  );
}
