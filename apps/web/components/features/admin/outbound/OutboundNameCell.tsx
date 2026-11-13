import { Avatar } from '@/components/molecules/Avatar';
import { OUTBOUND_FLAG_LABELS, type OutboundRow } from '@/lib/outbound/types';

/**
 * The person column of the outbound queue: avatar, name, handle, then the
 * tags Tim must see before acting on the row (an existing-relationship hold,
 * relationship notes on an eligible artist, a possible non-artist).
 */
export function OutboundNameCell({ row }: Readonly<{ row: OutboundRow }>) {
  const nonArtist = row.flags.includes('possible_non_artist');
  const hasNotes =
    row.relationshipHold || row.relationshipNotes.length || nonArtist;
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <Avatar src={row.avatarUrl} alt='' name={row.name} size='md' />
      <span className='min-w-0 flex-1'>
        <span className='flex min-w-0 items-center gap-2'>
          <span
            title={row.name}
            className='max-w-44 truncate text-app font-medium text-primary-token'
          >
            {row.name}
          </span>
          <span
            title={`@${row.handle}`}
            className='max-w-28 truncate text-xs text-tertiary-token'
          >
            @{row.handle}
          </span>
        </span>
        {hasNotes ? (
          <span className='flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide'>
            {row.relationshipHold ? (
              <span
                className='shrink-0 whitespace-nowrap rounded-sm border border-subtle px-1 text-2xs leading-none text-secondary-token'
                title={row.relationshipHold}
                data-testid='outbound-flag-existing-relationship'
              >
                {OUTBOUND_FLAG_LABELS.existing_relationship}
              </span>
            ) : null}
            {nonArtist ? (
              <span
                className='shrink-0 whitespace-nowrap rounded-sm border border-subtle px-1 text-2xs leading-none text-secondary-token'
                title={row.entityNote ?? undefined}
                data-testid='outbound-flag-non-artist'
              >
                {OUTBOUND_FLAG_LABELS.possible_non_artist}
              </span>
            ) : null}
            {row.relationshipNotes.map(note => (
              <span
                key={note}
                className='max-w-56 shrink-0 truncate rounded-sm border border-subtle px-1 text-2xs leading-none text-secondary-token'
                title={note}
                data-testid='outbound-relationship-note'
              >
                {note}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}
