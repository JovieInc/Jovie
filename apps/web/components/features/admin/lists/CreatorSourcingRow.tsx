'use client';

import { Button, IconButton } from '@jovie/ui';
import { Heart, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '@/components/molecules/Avatar';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import { cn } from '@/lib/utils';
import { StarRating } from './StarRating';

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact' });

export function creatorDisplayName(creator: ListCreator | undefined): string {
  if (!creator) return 'Unknown creator';
  return creator.displayName?.trim() || `@${creator.username}`;
}

/** One quiet line of ingestion facts: genres · followers · city. */
export function creatorFacts(creator: ListCreator | undefined): string {
  if (!creator) return 'Profile no longer available';
  const facts = [
    (creator.genres ?? []).slice(0, 2).join(', '),
    typeof creator.spotifyFollowers === 'number'
      ? `${COMPACT.format(creator.spotifyFollowers)} followers`
      : '',
    creator.location?.split(',')[0]?.trim() ?? '',
  ].filter(Boolean);
  return facts.join(' · ');
}

export interface CreatorSourcingRowProps {
  readonly creator: ListCreator | undefined;
  readonly member: ListMember;
  /** Optional context such as the owning list in a cross-list smart view. */
  readonly meta?: ReactNode;
  readonly busy?: boolean;
  readonly onRate: (rating: number | null) => void;
  readonly onFavorite: (favorite: boolean) => void;
  readonly onRemove?: () => void;
  readonly onAccept?: () => void;
  readonly onReject?: () => void;
}

/**
 * Narrow people row for creator sourcing. This is the one adapter onto the
 * shared people-row primitive owned by the table system; sourcing-specific
 * controls live in the trailing slot so the row itself is never forked.
 */
export function CreatorSourcingRow({
  creator,
  member,
  meta,
  busy = false,
  onRate,
  onFavorite,
  onRemove,
  onAccept,
  onReject,
}: CreatorSourcingRowProps) {
  const name = creatorDisplayName(creator);
  const suggested = member.state === 'suggested';
  return (
    <li
      className='flex min-h-12 items-center gap-3 border-b border-subtle px-4 py-2'
      data-testid='creator-sourcing-row'
      data-state={member.state}
    >
      <Avatar
        src={creator?.avatarUrl ?? null}
        alt=''
        name={name}
        size='sidebar'
        shape='person'
        verified={Boolean(creator?.isVerified)}
      />
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-baseline gap-2'>
          <span className='truncate text-app font-medium text-primary-token'>
            {name}
          </span>
          {meta ? (
            <span className='truncate text-xs text-tertiary-token'>{meta}</span>
          ) : null}
        </div>
        <p className='truncate text-xs text-tertiary-token'>
          {creatorFacts(creator)}
        </p>
        {suggested && member.suggestionReasons?.length ? (
          <ul
            aria-label={`Why ${name} was suggested`}
            className='mt-0.5 flex flex-wrap gap-x-3 text-xs text-secondary-token'
          >
            {member.suggestionReasons.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        {suggested ? (
          <>
            <Button
              size='sm'
              variant='ghost'
              disabled={busy}
              onClick={onReject}
              aria-label={`Skip ${name}`}
            >
              Skip
            </Button>
            <Button
              size='sm'
              variant='secondary'
              disabled={busy}
              onClick={onAccept}
              aria-label={`Add ${name} to the list`}
            >
              Add
            </Button>
          </>
        ) : (
          <>
            <StarRating
              value={member.rating}
              onChange={onRate}
              label={`Rating for ${name}`}
              disabled={busy}
            />
            <IconButton
              size='sm'
              variant='ghost'
              ariaLabel={
                member.favorite
                  ? `Remove ${name} from favorites`
                  : `Favorite ${name}`
              }
              aria-pressed={member.favorite}
              disabled={busy}
              onClick={() => onFavorite(!member.favorite)}
            >
              <Heart
                aria-hidden='true'
                className={cn(
                  member.favorite
                    ? 'fill-current text-primary-token'
                    : 'text-quaternary-token'
                )}
              />
            </IconButton>
            {onRemove ? (
              <IconButton
                size='sm'
                variant='ghost'
                ariaLabel={`Remove ${name} from the list`}
                disabled={busy}
                onClick={onRemove}
              >
                <X aria-hidden='true' className='text-tertiary-token' />
              </IconButton>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
