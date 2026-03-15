'use client';

/**
 * AudienceMemberReferrers Component
 *
 * Renders the referrer history section with URLs and timestamps
 */

import { Link2 } from 'lucide-react';
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
      <div className='text-sm text-secondary-token'>No referrer data yet.</div>
    );
  }

  return (
    <ul className='space-y-1.5'>
      {member.referrerHistory.slice(0, 6).map(ref => (
        <li
          key={`${member.id}-${ref.url}-${ref.timestamp ?? ''}`}
          className='rounded-md border border-transparent px-1.5 py-1.5 text-sm text-primary-token transition-colors hover:border-subtle hover:bg-surface-2/60'
        >
          <div className='flex items-start gap-2'>
            <Link2
              className='mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary-token'
              aria-hidden
            />
            <div className='min-w-0'>
              <div className='truncate'>{ref.url}</div>
              {ref.timestamp ? (
                <div className='mt-0.5 text-[11px] text-secondary-token'>
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
