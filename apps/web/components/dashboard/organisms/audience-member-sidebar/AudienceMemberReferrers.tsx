'use client';

/**
 * AudienceMemberReferrers Component
 *
 * Renders the referrer history section with URLs and timestamps
 */

import { DrawerEmptyState } from '@/components/molecules/drawer';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

interface AudienceMemberReferrersProps
  extends Readonly<{
    readonly member: AudienceMember;
  }> {}

export function AudienceMemberReferrers({
  member,
}: AudienceMemberReferrersProps) {
  if (member.referrerHistory.length === 0) {
    return (
      <DrawerEmptyState
        className='min-h-[96px]'
        message='No referrer data yet.'
      />
    );
  }

  return (
    <ul className='space-y-1'>
      {member.referrerHistory.slice(0, 6).map(ref => (
        <li
          key={`${member.id}-${ref.url}-${ref.timestamp ?? ''}`}
          className='rounded-[8px] border border-transparent px-2.5 py-2 text-sm text-(--linear-text-primary) transition-[background-color,border-color] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1)'
        >
          <div className='truncate'>{ref.url}</div>
          {ref.timestamp ? (
            <div className='text-xs text-(--linear-text-tertiary)'>
              {formatTimeAgo(ref.timestamp)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
