'use client';

/**
 * AudienceMemberReferrers Component
 *
 * Renders the referrer history section with URLs and timestamps
 */

import { Link2 } from 'lucide-react';
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
        className='min-h-[88px]'
        message='No referrer data yet.'
      />
    );
  }

  return (
    <ul className='space-y-1'>
      {member.referrerHistory.slice(0, 6).map(ref => (
        <li
          key={`${member.id}-${ref.url}-${ref.timestamp ?? ''}`}
          className='rounded-md border border-transparent px-1.5 py-1.5 text-[12px] text-primary-token transition-colors hover:bg-surface-0'
        >
          <div className='flex items-start gap-2'>
            <Link2
              className='mt-0.5 h-3 w-3 shrink-0 text-tertiary-token'
              aria-hidden
            />
            <div className='min-w-0'>
              <div className='truncate leading-4'>{ref.url}</div>
              {ref.timestamp ? (
                <div className='mt-0.5 text-[10.5px] text-secondary-token'>
                  {formatTimeAgo(ref.timestamp)}
                </div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
