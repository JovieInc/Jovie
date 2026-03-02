'use client';

/**
 * AudienceMemberDetails Component
 *
 * Renders the main member details section (location, device, visits, etc.)
 */

import { Check, Copy, MapPin, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AudienceIntentBadge } from '@/components/dashboard/atoms/AudienceIntentBadge';
import { DrawerPropertyRow } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';
import { formatLongDate } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { EMPTY_VALUE_FALLBACK, formatDeviceTypeLabel } from './utils';

interface CopyableValueProps {
  readonly value: string;
  readonly label: string;
}

function CopyableValue({ value, label }: CopyableValueProps) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
      setIsCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [value, label]);

  return (
    <button
      type='button'
      onClick={handleCopy}
      className={cn(
        'group inline-flex items-center gap-1.5 text-left transition-colors',
        isCopied ? 'text-success' : 'hover:text-interactive'
      )}
    >
      <span className='break-all'>{value}</span>
      {isCopied ? (
        <Check className='h-3 w-3 shrink-0' />
      ) : (
        <Copy className='h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100' />
      )}
    </button>
  );
}

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
    <div className='space-y-3'>
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
      {member.ltvCents > 0 && (
        <DrawerPropertyRow
          label='Lifetime Value'
          value={
            <span className='text-emerald-600 dark:text-emerald-400 font-medium tabular-nums'>
              {`$${(member.ltvCents / 100).toFixed(2)}`}
            </span>
          }
        />
      )}
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
            <CopyableValue value={member.email} label='Email' />
          ) : (
            <span className='text-secondary-token'>{EMPTY_VALUE_FALLBACK}</span>
          )
        }
      />
      <DrawerPropertyRow
        label='Phone'
        value={
          member.phone ? (
            <CopyableValue value={member.phone} label='Phone' />
          ) : (
            <span className='text-secondary-token'>{EMPTY_VALUE_FALLBACK}</span>
          )
        }
      />
    </div>
  );
}
