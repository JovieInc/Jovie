'use client';

/**
 * AudienceMemberDetails Component
 *
 * Renders the main member details section (location, device, visits, etc.)
 */

import { MapPin, Monitor, Smartphone, Tablet } from 'lucide-react';
import { DrawerPropertyRow } from '@/components/molecules/drawer';
import { AudienceIntentBadge } from '@/features/dashboard/atoms/AudienceIntentBadge';
import { CopyableField } from '@/features/ui/CopyableField';
import { formatLongDate } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { EMPTY_VALUE_FALLBACK, formatDeviceTypeLabel } from './utils';

/** Returns the appropriate Lucide device icon for the given device type. */
function DeviceIcon({ deviceType }: { readonly deviceType: string }) {
  const normalized = deviceType.trim().toLowerCase();
  const cls = 'h-3.5 w-3.5 shrink-0 text-tertiary-token';
  if (normalized === 'mobile')
    return <Smartphone className={cls} aria-hidden />;
  if (normalized === 'tablet') return <Tablet className={cls} aria-hidden />;
  return <Monitor className={cls} aria-hidden />;
}

interface AudienceMemberDetailsProps {
  readonly member: AudienceMember;
}

export function AudienceMemberDetails({ member }: AudienceMemberDetailsProps) {
  const utm = member.utmParams;
  const hasUtm =
    utm &&
    (utm.source || utm.medium || utm.campaign || utm.content || utm.term);

  return (
    <div className='space-y-2'>
      <DrawerPropertyRow
        label='Location'
        value={
          member.locationLabel ? (
            <span className='inline-flex items-center gap-1.5'>
              <MapPin
                className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
                aria-hidden
              />
              {member.locationLabel}
            </span>
          ) : (
            <span className='text-secondary-token'>Unknown</span>
          )
        }
      />
      <DrawerPropertyRow
        label='Device'
        value={
          member.deviceType ? (
            <span className='inline-flex items-center gap-1.5'>
              <DeviceIcon deviceType={member.deviceType} />
              {formatDeviceTypeLabel(member.deviceType)}
            </span>
          ) : (
            <span className='text-secondary-token'>Unknown</span>
          )
        }
      />
      <DrawerPropertyRow label='Visits' value={String(member.visits)} />
      <DrawerPropertyRow
        label='Last seen'
        value={formatLongDate(member.lastSeenAt)}
      />
      <DrawerPropertyRow
        label='Intent'
        value={<AudienceIntentBadge intentLevel={member.intentLevel} />}
      />
      {hasUtm && (
        <>
          {utm.source && (
            <DrawerPropertyRow label='Source' value={utm.source} />
          )}
          {utm.medium && (
            <DrawerPropertyRow label='Medium' value={utm.medium} />
          )}
          {utm.campaign && (
            <DrawerPropertyRow label='Campaign' value={utm.campaign} />
          )}
          {utm.content && (
            <DrawerPropertyRow label='Content' value={utm.content} />
          )}
          {utm.term && <DrawerPropertyRow label='Term' value={utm.term} />}
        </>
      )}
      <DrawerPropertyRow
        label='Email'
        value={
          member.email ? (
            <CopyableField value={member.email} label='Email' />
          ) : (
            <span className='text-secondary-token'>{EMPTY_VALUE_FALLBACK}</span>
          )
        }
      />
      <DrawerPropertyRow
        label='Phone'
        value={
          member.phone ? (
            <CopyableField value={member.phone} label='Phone' />
          ) : (
            <span className='text-secondary-token'>{EMPTY_VALUE_FALLBACK}</span>
          )
        }
      />
    </div>
  );
}
