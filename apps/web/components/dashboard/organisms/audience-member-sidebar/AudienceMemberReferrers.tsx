'use client';

/**
 * AudienceMemberReferrers Component
 *
 * Renders the referrer history section with URLs and timestamps
 */

import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

interface AudienceMemberReferrersProps
  extends Readonly<{
    member: AudienceMember;
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
    <ul className='space-y-2'>
      {member.referrerHistory.slice(0, 6).map(ref => (
        <li
          key={`${member.id}-${ref.url}-${ref.timestamp ?? ''}`}
          className='text-sm text-primary-token'
        >
          <div className='truncate'>{ref.url}</div>
          {ref.timestamp ? (
            <div className='text-xs text-secondary-token'>
              {formatTimeAgo(ref.timestamp)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
