'use client';

/**
 * AudienceMemberDetails Component
 *
 * Renders the main member details section (location, device, visits, etc.)
 */

import { AudienceDetailRow } from '@/components/dashboard/atoms/AudienceDetailRow';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import { formatLongDate } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { EMPTY_VALUE_FALLBACK, formatDeviceTypeLabel } from './utils';

interface AudienceMemberDetailsProps {
  member: AudienceMember;
}

export function AudienceMemberDetails({ member }: AudienceMemberDetailsProps) {
  return (
    <div className='space-y-3'>
      <AudienceDetailRow
        label='Location'
        value={
          member.locationLabel ? (
            member.locationLabel
          ) : (
            <span className='text-secondary-token'>Unknown</span>
          )
        }
      />
      <AudienceDetailRow
        label='Device'
        value={
          member.deviceType ? (
            formatDeviceTypeLabel(member.deviceType)
          ) : (
            <span className='text-secondary-token'>Unknown</span>
          )
        }
      />
      <AudienceDetailRow label='Visits' value={String(member.visits)} />
      <AudienceDetailRow
        label='Last seen'
        value={formatLongDate(member.lastSeenAt)}
      />
      <AudienceDetailRow
        label='Intent'
        value={<AudienceIntentBadge intentLevel={member.intentLevel} />}
      />
      <AudienceDetailRow
        label='Email'
        value={
          member.email ?? (
            <span className='text-secondary-token'>{EMPTY_VALUE_FALLBACK}</span>
          )
        }
      />
      <AudienceDetailRow
        label='Phone'
        value={
          member.phone ?? (
            <span className='text-secondary-token'>{EMPTY_VALUE_FALLBACK}</span>
          )
        }
      />
    </div>
  );
}
