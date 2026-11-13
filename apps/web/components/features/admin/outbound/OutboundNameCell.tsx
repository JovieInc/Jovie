import { Avatar } from '@/components/molecules/Avatar';
import { OUTBOUND_FLAG_LABELS, type OutboundRow } from '@/lib/outbound/types';

export function OutboundNameCell({ row }: Readonly<{ row: OutboundRow }>) {
  const nonArtist = row.flags.includes('possible_non_artist');
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
        {nonArtist ? (
          <span
            className='block w-fit max-w-full rounded-sm border border-subtle px-1 text-2xs text-secondary-token'
            title={row.entityNote ?? undefined}
            data-testid='outbound-flag-non-artist'
          >
            {OUTBOUND_FLAG_LABELS.possible_non_artist}
          </span>
        ) : null}
      </span>
    </span>
  );
}
